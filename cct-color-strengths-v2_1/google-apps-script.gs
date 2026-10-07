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
 * v1(자가 다운로드) / v2(센터 방문 안내) / v3(강의용: 컬러리딩+CCT) 앱 어느 쪽이든
 * 동일하게 동작하며, 어느 버전에서 제출됐는지는 "버전" 열에 표시됩니다.
 * v3는 "컬러리딩 선택" 열이 추가로 채워지고, PDF에도 컬러리딩이 함께 담깁니다.
 * (2026-10 개정) 모든 버전에서 "순위(점수)"·"동점·보완 처리" 열이 함께 채워집니다.
 *   점수 열은 원점수 그대로 — 동점이어도 점수는 바꾸지 않고 순위만 따로 기록합니다.
 * (2026-10 개정) PDF는 "CCT 검사 결과 PDF" 폴더 안의 버전별 하위 폴더에 저장됩니다.
 *   version1_기본 (v1) / version2_센터용 (v2) / version3_강의용 (v3) — 폴더는 처음 저장할 때 자동 생성.
 *   (예전 이름 기본_version1 등의 폴더가 있으면 새로 만들지 않고 그 폴더의 이름만 바꿔서 씁니다.)
 *   예전에 쌓인 PDF는 sortExistingPdfs() 를 한 번 실행하면 같은 규칙으로 옮겨집니다.
 * (2026-10 개정) v3 컬러리딩: 고른 컬러를 "컬러리딩 1번"~"컬러리딩 5번" 열에 순서대로 한 칸씩 저장.
 *   예전 줄은 splitExistingColorReadings() 를 한 번 실행하면 나눠 채워집니다.
 *
 * ※ 코드를 수정한 뒤에는 반드시 [배포 > 배포 관리 > (기존 배포) 수정 >
 *    버전: 새 버전 > 배포]로 "같은 배포"를 업데이트하세요. "새 배포"를
 *    만들면 URL이 바뀌어 앱이 옛 버전을 계속 호출합니다.
 */

var SHEET_NAME = "응답";
var FOLDER_NAME = "CCT 검사 결과 PDF";
// 버전별 하위 폴더 (위 폴더 안에 자동으로 만들어집니다). "버전" 열 값의 앞부분으로 구분합니다.
//   v1 → version1_기본 / v2 → version2_센터용 / v3·컬러리딩·v3·CCT·v3·통합 → version3_강의용
//   old: 예전 폴더 이름 — 남아 있으면 새 이름으로 바꿔서 그대로 씁니다 (PDF·링크 유지).
var VERSION_FOLDERS = [
  { prefix: "v1", name: "version1_기본", old: "기본_version1" },
  { prefix: "v2", name: "version2_센터용", old: "센터용_version2" },
  { prefix: "v3", name: "version3_강의용", old: "강의용_version3" }
];
var VERSION_HEADER = "버전";
var ID_HEADER = "결과ID";
var CR_HEADER = "컬러리딩 선택";   // 강의용(v3)만 채워집니다. 예) 1.레드 2.코랄 3.블루 4.그린 / 5.퍼플
// 고른 컬러를 순서대로 한 칸씩 (정렬·필터·집계용). 위 "컬러리딩 선택" 열과 같은 내용을 나눠 담습니다.
var CR_PICK_HEADERS = ["컬러리딩 1번", "컬러리딩 2번", "컬러리딩 3번", "컬러리딩 4번", "컬러리딩 5번"];
var PDF_HEADER = "상세 PDF";
var RANK_HEADER = "순위(점수)";        // 예) 1.골드 5.0 · 2.빨강 5.0 · 3.주황 4.0 … — 점수는 원점수 그대로, 순위만 별도
var TIE_HEADER = "동점·보완 처리";     // 동점 순위를 정한 기준, 보완컬러를 고른 근거

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
  if (alsoSavePdf && data.pdfBase64) pdfCell = savePdf_(data, data.appVariant); // 구버전 앱 호환

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

  // 강의용(v3): 컬러리딩 선택을 이름으로 찾은 열에 기록 (열이 없으면 맨 뒤에 추가).
  // v1/v2는 이 값을 보내지 않으므로 기존 시트 구조에 영향이 없습니다.
  if (data.colorReading) {
    var crCol = ensureColumn_(sheet, CR_HEADER);
    sheet.getRange(sheet.getLastRow(), crCol).setValue(data.colorReading);
    writeCrPicks_(sheet, sheet.getLastRow(), data.colorReading);
  }
  // 순위·동점 처리 (2026-10 CCT 개정). 점수 열(빨강~터콰이즈)은 원점수 그대로 두고,
  // 순위와 그 근거는 별도 열에 남긴다. 열이 없으면 맨 뒤에 자동으로 추가된다.
  if (data.rankText) {
    var rankCol = ensureColumn_(sheet, RANK_HEADER);
    sheet.getRange(sheet.getLastRow(), rankCol).setValue(data.rankText);
  }
  if (data.tieNote) {
    var tieCol = ensureColumn_(sheet, TIE_HEADER);
    sheet.getRange(sheet.getLastRow(), tieCol).setValue(data.tieNote);
  }
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

  // 이 결과가 어느 버전에서 왔는지는 1차로 기록된 줄의 "버전" 열에서 읽는다.
  var variant = data.appVariant || "";
  var verCol = headers.indexOf(VERSION_HEADER) + 1;
  if (!variant && rowNo > 0 && verCol > 0) variant = String(sheet.getRange(rowNo, verCol).getValue());
  var cell = data.pdfError ? ("PDF 실패: " + data.pdfError) : savePdf_(data, variant);

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
function savePdf_(data, variant) {
  try {
    var folder = folderForVariant_(variant);
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

// "1.레드 2.코랄 3.오렌지 4.골드 / 5.인디고" → ["레드","코랄","오렌지","골드","인디고"]
function parseCrPicks_(text) {
  var out = [];
  var re = /([1-5])\.\s*([^\s\/]+)/g, m;
  while ((m = re.exec(String(text || ""))) !== null) out[Number(m[1]) - 1] = m[2];
  return out;
}

function writeCrPicks_(sheet, rowNo, text) {
  var picks = parseCrPicks_(text);
  if (!picks.length) return;
  for (var i = 0; i < CR_PICK_HEADERS.length; i++) {
    var col = ensureColumn_(sheet, CR_PICK_HEADERS[i]);
    sheet.getRange(rowNo, col).setValue(picks[i] || "");
  }
}

/**
 * (한 번만 실행) 이미 쌓인 줄의 "컬러리딩 선택"을 컬러리딩 1번~5번 열로 나눠 채웁니다.
 * Apps Script 편집기에서 함수 "splitExistingColorReadings"를 고르고 [실행].
 */
function splitExistingColorReadings() {
  var sheet = getSheet_();
  var headers = headerRow_(sheet);
  var crIdx = headers.indexOf(CR_HEADER);
  if (crIdx < 0 || sheet.getLastRow() < 2) return;
  var vals = sheet.getRange(2, crIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  var n = 0;
  for (var r = 0; r < vals.length; r++) {
    if (String(vals[r][0]).trim()) { writeCrPicks_(sheet, r + 2, vals[r][0]); n++; }
  }
  Logger.log("나눠 채운 줄: " + n + "개");
}

function ensureColumn_(sheet, header) {
  var headers = headerRow_(sheet);
  var idx = headers.indexOf(header);
  if (idx !== -1) return idx + 1;
  var col = headers.length + 1;
  sheet.getRange(1, col).setValue(header);
  return col;
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

// 버전에 맞는 하위 폴더. 버전을 알 수 없으면 상위 폴더("CCT 검사 결과 PDF")에 그대로 저장.
function folderForVariant_(variant) {
  var root = getOrCreateFolder_(FOLDER_NAME);
  var v = String(variant || "").trim();
  for (var i = 0; i < VERSION_FOLDERS.length; i++) {
    if (v.indexOf(VERSION_FOLDERS[i].prefix) === 0) return getOrCreateSubfolder_(root, VERSION_FOLDERS[i].name, VERSION_FOLDERS[i].old);
  }
  return root;
}

function getOrCreateSubfolder_(parent, name, oldName) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  if (oldName) {
    var old = parent.getFoldersByName(oldName);
    if (old.hasNext()) { var f = old.next(); f.setName(name); return f; }
  }
  return parent.createFolder(name);
}

/**
 * (한 번만 실행) 지금까지 쌓인 PDF를 버전별 폴더로 옮깁니다.
 * Apps Script 편집기 위쪽에서 함수 "sortExistingPdfs"를 고르고 [실행]을 누르세요.
 * 시트의 "버전" 열과 "상세 PDF" 링크를 보고 옮기며, 링크는 바뀌지 않습니다.
 */
function sortExistingPdfs() {
  var sheet = getSheet_();
  var headers = headerRow_(sheet);
  var verCol = headers.indexOf(VERSION_HEADER);
  var pdfCol = headers.indexOf(PDF_HEADER);
  if (verCol < 0 || pdfCol < 0 || sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var nameCol = headers.indexOf("이름");
  var moved = 0, skipped = 0;
  rows.forEach(function (r, i) {
    var url = String(r[pdfCol]);
    var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (!m) { skipped++; return; }
    // 예전 스크립트는 PDF를 "버전" 칸이 빈 별도 줄로 남겼다 → 바로 위쪽의 같은 이름 줄에서 버전을 가져온다.
    var ver = String(r[verCol] || "");
    for (var b = i - 1; !ver && b >= 0 && b >= i - 5; b--) {
      if (nameCol < 0 || String(rows[b][nameCol]) === String(r[nameCol])) ver = String(rows[b][verCol] || "");
    }
    try {
      var target = folderForVariant_(ver);
      var file = DriveApp.getFileById(m[1]);
      var parents = file.getParents();
      var already = false;
      while (parents.hasNext()) { if (parents.next().getId() === target.getId()) already = true; }
      if (!already) { file.moveTo(target); moved++; }
    } catch (err) { skipped++; }
  });
  Logger.log("옮긴 PDF: " + moved + "개 / 건너뜀: " + skipped + "개");
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
