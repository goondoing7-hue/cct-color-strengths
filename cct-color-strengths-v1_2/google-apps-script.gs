/**
 * CCT 컬러성격강점검사 — 결과 로깅용 Google Apps Script
 * ------------------------------------------------------------
 * 이 코드를 Google Sheets의 [확장 프로그램 > Apps Script]에 붙여넣고
 * "웹 앱"으로 배포하면, 검사 완료 시마다:
 *   1) 이 스프레드시트에 결과가 한 줄씩 자동으로 쌓이고
 *   2) 상세 결과 PDF가 내 구글 드라이브의 "CCT 검사 결과 PDF" 폴더에
 *      자동으로 저장되어, 그 파일 링크도 같은 줄에 함께 기록됩니다.
 *
 * ★ 2단계 기록 방식 (중요)
 * 앱은 결과 화면이 뜨는 즉시 1차로 "결과 줄"을 먼저 보냅니다(PDF 없음).
 * 그 다음 백그라운드에서 8페이지 PDF를 만들어 2차로 보내고, 스크립트가
 * 같은 줄의 "상세 PDF" 칸을 채웁니다. 그래서 PDF 생성이 느리거나 실패하거나
 * 사용자가 화면을 닫아도, 검사 기록 자체는 절대 사라지지 않습니다.
 * PDF 쪽만 실패하면 "상세 PDF" 칸에 실패 사유가 남습니다.
 *
 * v1(자가 다운로드) / v2(센터 방문 안내) 앱 어느 쪽이든 동일하게 동작하며,
 * 어느 버전에서 제출됐는지는 "버전" 열에 표시됩니다.
 *
 * ※ 코드를 수정한 뒤에는 반드시 [배포 > 배포 관리 > (기존 배포) 수정 >
 *    버전: 새 버전 > 배포]로 "같은 배포"를 업데이트하세요. "새 배포"를
 *    만들면 URL이 바뀌어 앱이 옛 버전을 계속 호출합니다.
 */

var SHEET_NAME = "응답";
var FOLDER_NAME = "CCT 검사 결과 PDF";
var ID_HEADER = "결과ID";
var PDF_HEADER = "상세 PDF";

var COLOR_ORDER = [
  "RED", "ORANGE", "YELLOW", "LIME", "GREEN", "BLUE",
  "BLUE_GREEN", "INDIGO", "PURPLE", "PINK", "CORAL", "GOLD", "TURQUOISE"
];
var COLOR_LABELS = [
  "빨강", "주황", "노랑", "라임", "초록", "파랑",
  "청록", "인디고", "보라", "핑크", "코랄", "골드", "터콰이즈"
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (err) {
    // 잠금 실패해도 기록은 시도한다 (최악의 경우 줄 순서만 흔들림).
  }
  try {
    var data = JSON.parse(e.postData.contents);
    var phase = data.phase || (data.pdfBase64 ? "full" : "meta");
    var sheet = getSheet_();
    ensureHeader_(sheet);

    if (phase === "pdf") return handlePdf_(sheet, data);
    return handleMeta_(sheet, data, phase === "full");
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (err2) {}
  }
}

/* ---------- 1차: 결과 줄 기록 ---------- */
function handleMeta_(sheet, data, alsoSavePdf) {
  // 같은 resultId가 이미 있으면 재전송이므로 새 줄을 만들지 않는다.
  var existing = findRowByResultId_(sheet, data.resultId);
  if (existing > 0) return json_({ ok: true, phase: "meta", duplicate: true, row: existing });

  var pdfCell = "생성 중…";
  if (alsoSavePdf && data.pdfBase64) pdfCell = savePdf_(data); // 구버전 앱 호환

  var scoreRow = COLOR_ORDER.map(function (key) {
    return data.scores && data.scores[key] != null ? data.scores[key] : "";
  });

  var row = [
    data.completedAt ? new Date(data.completedAt) : new Date(),
    data.name || "",
    data.appVariant || "",
    data.top1 || "",
    data.top2 || "",
    data.top3 || "",
    data.complement || "",
    pdfCell
  ].concat(scoreRow).concat([data.resultId || ""]);

  sheet.appendRow(row);
  return json_({ ok: true, phase: "meta", resultId: data.resultId || "" });
}

/* ---------- 2차: PDF 저장 후 같은 줄 채우기 ---------- */
function handlePdf_(sheet, data) {
  var rowNo = findRowByResultId_(sheet, data.resultId);
  var headers = headerRow_(sheet);
  var pdfCol = headers.indexOf(PDF_HEADER) + 1;

  // 이미 Drive에 저장된 줄이면 다시 저장하지 않는다 (재전송 시 파일 중복 방지).
  if (rowNo > 0 && pdfCol > 0) {
    var current = String(sheet.getRange(rowNo, pdfCol).getValue());
    if (current.indexOf("http") === 0) {
      return json_({ ok: true, phase: "pdf", duplicate: true, row: rowNo, value: current });
    }
  }

  var cell = data.pdfError ? ("PDF 실패: " + data.pdfError) : savePdf_(data);

  if (rowNo > 0 && pdfCol > 0) {
    sheet.getRange(rowNo, pdfCol).setValue(cell);
    return json_({ ok: true, phase: "pdf", row: rowNo, value: cell });
  }

  // 1차 요청이 유실된 경우: 그래도 잃지 않도록 새 줄을 만든다.
  var row = [new Date(), data.name || "", "", "", "", "", "", cell];
  while (row.length < 8 + COLOR_ORDER.length) row.push("");
  row.push(data.resultId || "");
  sheet.appendRow(row);
  return json_({ ok: true, phase: "pdf", row: "appended", value: cell });
}

/* ---------- Drive 저장 ---------- */
function savePdf_(data) {
  try {
    var folder = getOrCreateFolder_(FOLDER_NAME);
    var base64 = String(data.pdfBase64).split(",")[1] || data.pdfBase64;
    var bytes = Utilities.base64Decode(base64);
    var safeName = (data.name || "무명").replace(/[\\/:*?"<>|]/g, "_");
    var fileName = "CCT_" + safeName + "_" +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + ".pdf";
    var file = folder.createFile(Utilities.newBlob(bytes, "application/pdf", fileName));
    return file.getUrl();
  } catch (err) {
    return "PDF 저장 실패: " + err;
  }
}

/* ---------- 시트 유틸 ---------- */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function headerRow_(sheet) {
  if (sheet.getLastRow() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}

// 기존 시트에도 "결과ID" 열을 자동으로 덧붙인다 (기존 데이터는 그대로).
function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(
      ["제출시각", "이름", "버전", "TOP1", "TOP2", "TOP3", "보완 컬러", PDF_HEADER]
        .concat(COLOR_LABELS).concat([ID_HEADER])
    );
    return;
  }
  var headers = headerRow_(sheet);
  if (headers.indexOf(ID_HEADER) === -1) {
    sheet.getRange(1, headers.length + 1).setValue(ID_HEADER);
  }
}

function findRowByResultId_(sheet, resultId) {
  if (!resultId) return -1;
  var headers = headerRow_(sheet);
  var idCol = headers.indexOf(ID_HEADER) + 1;
  if (idCol < 1) return -1;
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, idCol, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {       // 최근 줄부터
    if (String(ids[i][0]) === String(resultId)) return i + 2;
  }
  return -1;
}

function getOrCreateFolder_(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 브라우저로 이 /exec 주소를 그냥 열면 자기진단 결과가 보입니다.
 * 시트 접근·Drive 폴더 접근 권한이 살아 있는지 한눈에 확인하는 용도.
 */
function doGet(e) {
  var out = { ok: true, endpoint: "CCT logging endpoint is running." };
  try {
    var sheet = getSheet_();
    ensureHeader_(sheet);
    out.sheet = sheet.getName();
    out.rows = Math.max(0, sheet.getLastRow() - 1);
  } catch (err) {
    out.ok = false;
    out.sheetError = String(err);
  }
  try {
    out.driveFolder = getOrCreateFolder_(FOLDER_NAME).getName();
  } catch (err) {
    out.ok = false;
    out.driveError = String(err);
  }
  return json_(out);
}
