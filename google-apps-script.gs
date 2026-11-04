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
 * (2026-10-18 개정) 저장 안정화
 *   - 앱이 2차(PDF) 전송에도 이름·버전·점수를 함께 보냅니다. 1차 줄이 유실돼도
 *     PDF는 올바른 버전 폴더에 저장되고, 시트 줄도 빠짐없이 채워집니다.
 *   - 앱이 1차 전송을 두 번 보내도(유실 대비) 결과ID가 같으면 한 줄만 남습니다.
 *   - fillMissingVersions_20261018() : 10/8·10/12에 버전 없이 남은 5줄의 "버전" 칸을 채웁니다(한 번만 실행).
 *
 * (2026-10-31 개정) 누락 대비 2차
 *   - 앱이 "결과 링크"(?r=…)를 함께 보냅니다 → 시트 "결과 링크" 열. PDF가 빠져도 이 링크를 열면 같은 결과지를 다시 만들 수 있습니다.
 *   - 앱이 서버의 답을 확인할 때까지 다시 보내고(휴대폰에 보관), 동시에 몰리면 잠깐 기다렸다 보냅니다.
 *     그래서 잠금을 30초 안에 얻지 못한 1차 기록은 "잠시 후 다시"(busy)라고 답하고 쓰지 않습니다(줄 겹침 방지).
 *   - 매일 자동 점검: installDailyCheck() 를 한 번 실행하면 매일 밤 9시에 dailyCheck()가 돌아
 *     최근 48시간 기록을 점검하고(PDF 미도착·PDF 실패·버전 빈 줄·시트에 없는 PDF·버전 폴더 밖 PDF),
 *     문제가 있으면 이 스프레드시트 주인에게 메일을 보냅니다. 결과는 "점검 기록" 시트에도 하루 한 줄 남습니다.
 *     지금 바로 점검해 보려면 dailyCheck 를 골라 [실행].
 *
 * (2026-11-04 개정) 문항별 응답 저장
 *   - 앱이 문항별 응답을 함께 보냅니다 → "문항응답" 탭(한 사람 한 줄, 문항 01~65).
 *   - analyzeItems() 를 실행하면 "문항분석" 탭에 컬러별 신뢰도와 문항별 통계가 계산됩니다.
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
  { prefix: "v3test", name: "version3_테스트용" },   // (2026-10-18) 개선 테스트 버전 — 운영 폴더와 섞이지 않게 먼저 검사
  { prefix: "v3s", name: "version3_단축형" },        // (2026-11-03) 강의 단축형(39문항) — v3보다 먼저 검사
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
var URL_HEADER = "결과 링크";           // (2026-10-31) 결과 화면을 다시 여는 링크 — PDF가 빠져도 결과지를 다시 만들 수 있음
var CHECK_SHEET = "점검 기록";          // (2026-10-31) 매일 자동 점검 결과
var CHECK_HOURS = 48;                   // 점검 범위: 최근 48시간
var CHECK_PENDING_MIN = 30;             // "생성 중…"이 이만큼(분) 지나도 그대로면 PDF 미도착으로 봄
var CHECK_HOUR = 21;                    // 매일 점검 시각 (스크립트 시간대 기준, 21 = 밤 9시)
var CHECK_MAIL_WHEN_OK = false;         // true면 문제가 없어도 매일 요약 메일을 보냄

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
  var locked = false;
  try {
    lock.waitLock(30000);
    locked = true;
  } catch (err) {
    // (2026-10-31) 1차 기록은 앱이 다시 보내므로 '잠시 후 다시'라고 답하고 쓰지 않는다(줄 겹침 방지).
    // PDF(2차)는 다시 보내기 무거우므로 예전처럼 잠금 없이라도 기록을 시도한다.
  }
  try {
    var data = JSON.parse(e.postData.contents);
    var phase = data.phase || (data.pdfBase64 ? "full" : "meta");
    if (!locked && phase === "meta") return json_({ ok: false, busy: true });
    var sheet = getSheet_();
    ensureHeader_(sheet);
    if (data.items) { try { writeItems_(data); } catch (errItems) {} } // (2026-11-04) 문항별 응답 — 실패해도 결과 기록은 계속

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
  if (existing > 0) {
    if (data.resultUrl) fillIfEmpty_(sheet, existing, URL_HEADER, data.resultUrl);
    return json_({ ok: true, phase: "meta", duplicate: true, row: existing });
  }

  var pdfCell = "생성 중…";
  if (alsoSavePdf && data.pdfBase64) pdfCell = savePdf_(data, data.appVariant); // 구버전 앱 호환
  appendResultRow_(sheet, data, pdfCell);
  return json_({ ok: true, phase: "meta", resultId: data.resultId || "" });
}

// 결과 한 줄 + 컬러리딩·순위·동점 열. 1차 기록과 "1차 유실 후 2차 도착" 양쪽에서 같이 쓴다.
function appendResultRow_(sheet, data, pdfCell) {
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
  var rowNo = sheet.getLastRow();

  // 강의용(v3): 컬러리딩 선택을 이름으로 찾은 열에 기록 (열이 없으면 맨 뒤에 추가).
  if (data.colorReading) {
    var crCol = ensureColumn_(sheet, CR_HEADER);
    sheet.getRange(rowNo, crCol).setValue(data.colorReading);
    writeCrPicks_(sheet, rowNo, data.colorReading);
  }
  // 순위·동점 처리. 점수 열은 원점수 그대로, 순위와 근거는 별도 열.
  if (data.rankText) {
    var rankCol = ensureColumn_(sheet, RANK_HEADER);
    sheet.getRange(rowNo, rankCol).setValue(data.rankText);
  }
  if (data.tieNote) {
    var tieCol = ensureColumn_(sheet, TIE_HEADER);
    sheet.getRange(rowNo, tieCol).setValue(data.tieNote);
  }
  if (data.resultUrl) {
    var urlCol = ensureColumn_(sheet, URL_HEADER);
    sheet.getRange(rowNo, urlCol).setValue(data.resultUrl);
  }
  return rowNo;
}

// 비어 있을 때만 채운다 (재전송·2차 도착 때 결과 링크 보충용)
function fillIfEmpty_(sheet, rowNo, header, value) {
  var col = ensureColumn_(sheet, header);
  var cell = sheet.getRange(rowNo, col);
  if (!String(cell.getValue())) cell.setValue(value);
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

  // 버전: 2차 전송에 들어 있는 값을 먼저 쓰고(2026-10-18 앱부터), 없으면 1차 줄의 "버전" 열에서 읽는다.
  var variant = data.appVariant || "";
  var verCol = headers.indexOf(VERSION_HEADER) + 1;
  if (!variant && rowNo > 0 && verCol > 0) variant = String(sheet.getRange(rowNo, verCol).getValue());
  var cell = data.pdfError ? ("PDF 실패: " + data.pdfError) : savePdf_(data, variant);

  if (rowNo > 0 && pdfCol > 0) {
    sheet.getRange(rowNo, pdfCol).setValue(cell);
    if (data.resultUrl) fillIfEmpty_(sheet, rowNo, URL_HEADER, data.resultUrl);
    // 1차 줄의 버전 칸이 비어 있으면 함께 채운다.
    if (verCol > 0 && data.appVariant && !String(sheet.getRange(rowNo, verCol).getValue())) {
      sheet.getRange(rowNo, verCol).setValue(data.appVariant);
    }
    return json_({ ok: true, phase: "pdf", row: rowNo, value: cell });
  }

  // 1차 요청이 유실된 경우: 2차에 함께 온 이름·버전·점수로 온전한 줄을 만든다.
  var newRow = appendResultRow_(sheet, data, cell);
  return json_({ ok: true, phase: "pdf", row: newRow, appended: true, value: cell });
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
    out.dailyCheck = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "dailyCheck"; }) ? "on" : "off";
  } catch (err) {
    out.dailyCheck = "unknown";
  }
  try {
    var itemSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ITEM_SHEET);
    out.itemRows = itemSh ? Math.max(0, itemSh.getLastRow() - 1) : 0;
  } catch (err) {
    out.itemRows = "unknown";
  }
  try {
    out.driveFolder = getOrCreateFolder_(FOLDER_NAME).getName();
  } catch (err) {
    out.ok = false;
    out.driveError = String(err);
  }
  return json_(out);
}


/**
 * (한 번만 실행, 2026-10-18) 1차 기록이 유실돼 "버전" 칸이 빈 채로 남은 5줄을 채웁니다.
 * PDF 파일은 이미 버전 폴더로 옮겨 두었습니다. 점수·TOP 칸은 원래 기록이 없어 비어 있습니다
 * (값은 각 PDF 결과지에서 확인할 수 있습니다).
 * Apps Script 편집기 위쪽에서 함수 "fillMissingVersions_20261018"을 고르고 [실행].
 */
function fillMissingVersions_20261018() {
  var fixes = {
    "Rmuysw0672w1l4s": "v1 (추정: 같은 시간대 v1 응답)",  // 김수연 10/8 9:31 · CCT 9쪽
    "Rmv4srd6fnotg6b": "v3·컬러리딩",                     // 호매실알밤 10/12 · 컬러리딩 3쪽
    "Rmv4t4rhnssc1if": "v3·통합",                         // 심호수 10/12 · 11쪽
    "Rmv4t5ivpn6u0ri": "v3·통합",                         // 양일동 10/12 2:25 · 11쪽
    "Rmv4tdn6uzel2c6": "v3·통합"                          // 양일동 10/12 2:31 · 11쪽
  };
  var sheet = getSheet_();
  var headers = headerRow_(sheet);
  var verCol = headers.indexOf(VERSION_HEADER) + 1;
  var n = 0;
  Object.keys(fixes).forEach(function (id) {
    var r = findRowByResultId_(sheet, id);
    if (r > 0 && verCol > 0 && !String(sheet.getRange(r, verCol).getValue())) {
      sheet.getRange(r, verCol).setValue(fixes[id]);
      n++;
    }
  });
  Logger.log("버전을 채운 줄: " + n + "개");
}


/* =====================================================================
 * (2026-10-31) 매일 자동 점검
 * ---------------------------------------------------------------------
 * 처음 한 번: 편집기 위쪽에서 함수 "installDailyCheck"를 고르고 [실행] → 권한 허용(메일 보내기 포함).
 * 그다음부터는 매일 밤 9시(CHECK_HOUR)에 dailyCheck()가 저절로 돕니다.
 * 지금 바로 점검: 함수 "dailyCheck"를 고르고 [실행]. (점검을 끄려면 removeDailyCheck 실행)
 * ===================================================================== */
function installDailyCheck() {
  removeDailyCheck();
  ScriptApp.newTrigger("dailyCheck").timeBased().everyDays(1).atHour(CHECK_HOUR).create();
  Logger.log("매일 " + CHECK_HOUR + "시 자동 점검을 켰습니다. 바로 한 번 점검합니다.");
  dailyCheck();
}

function removeDailyCheck() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "dailyCheck") ScriptApp.deleteTrigger(t);
  });
}

function dailyCheck() {
  var now = new Date();
  var since = new Date(now.getTime() - CHECK_HOURS * 3600 * 1000);
  var sheet = getSheet_();
  var headers = headerRow_(sheet);
  var col = function (h) { return headers.indexOf(h); };
  var cTime = 0, cName = col("이름"), cVer = col(VERSION_HEADER), cPdf = col(PDF_HEADER), cUrl = col(URL_HEADER);
  var problems = [];
  var counts = {};
  var sheetPdfIds = {};
  var total = 0;

  if (sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    rows.forEach(function (r, i) {
      var url = cPdf >= 0 ? String(r[cPdf]) : "";
      var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (m) sheetPdfIds[m[1]] = true;
      var t = r[cTime] instanceof Date ? r[cTime] : new Date(r[cTime]);
      if (!(t instanceof Date) || isNaN(t) || t < since) return;
      total++;
      var rowNo = i + 2;
      var name = cName >= 0 ? String(r[cName]) : "";
      var ver = cVer >= 0 ? String(r[cVer]) : "";
      var link = cUrl >= 0 ? String(r[cUrl]) : "";
      var key = (ver.split(" ")[0] || "버전 없음");
      counts[key] = (counts[key] || 0) + 1;
      var who = rowNo + "행 " + (name || "(이름 없음)") + " · " + fmt_(t);
      if (!ver) problems.push({ kind: "버전 빈 줄", who: who, note: "1차 기록이 빠지고 PDF로만 만들어진 줄일 수 있어요.", link: link });
      if (url === "생성 중…" && (now - t) > CHECK_PENDING_MIN * 60000) problems.push({ kind: "PDF 미도착", who: who, note: "결과지를 만들기 전에 창을 닫았거나 전송이 끊겼어요.", link: link });
      else if (url.indexOf("PDF") === 0 || (url && url.indexOf("http") !== 0 && url !== "생성 중…")) problems.push({ kind: "PDF 실패", who: who, note: url.slice(0, 120), link: link });
    });
  }

  // 드라이브: 최근 PDF 가운데 시트에 없는 것, 버전 폴더 밖에 저장된 것
  try {
    var root = getOrCreateFolder_(FOLDER_NAME);
    var looseIt = root.getFiles();
    while (looseIt.hasNext()) {
      var f = looseIt.next();
      if (f.getDateCreated() >= since) problems.push({ kind: "버전 폴더 밖 PDF", who: f.getName(), note: "버전을 알 수 없어 상위 폴더에 저장됐어요.", link: f.getUrl() });
    }
    VERSION_FOLDERS.forEach(function (vf) {
      var it = root.getFoldersByName(vf.name);
      if (!it.hasNext()) return;
      var files = it.next().getFiles();
      while (files.hasNext()) {
        var g = files.next();
        if (g.getDateCreated() >= since && !sheetPdfIds[g.getId()]) problems.push({ kind: "시트에 없는 PDF", who: g.getName() + " (" + vf.name + ")", note: "PDF는 있는데 시트 줄이 없어요.", link: g.getUrl() });
      }
    });
  } catch (err) {
    problems.push({ kind: "드라이브 점검 실패", who: "-", note: String(err), link: "" });
  }

  // 점검 기록 시트에 하루 한 줄
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(CHECK_SHEET) || ss.insertSheet(CHECK_SHEET);
  if (log.getLastRow() === 0) log.appendRow(["점검 시각", "점검 범위(시간)", "기록 수", "버전별", "문제 수", "문제 내용"]);
  var countText = Object.keys(counts).map(function (k) { return k + " " + counts[k]; }).join(" · ");
  log.appendRow([now, CHECK_HOURS, total, countText, problems.length,
    problems.map(function (p) { return "[" + p.kind + "] " + p.who; }).join("\n")]);

  if (problems.length || CHECK_MAIL_WHEN_OK) {
    var to = Session.getEffectiveUser().getEmail() || ss.getOwner().getEmail();
    var lines = [];
    lines.push("CCT 검사 결과 자동 점검 (" + fmt_(now) + ")");
    lines.push("최근 " + CHECK_HOURS + "시간 기록 " + total + "건 (" + (countText || "없음") + ")");
    lines.push(problems.length ? ("확인이 필요한 항목 " + problems.length + "건") : "문제 없음");
    lines.push("");
    problems.forEach(function (p, i) {
      lines.push((i + 1) + ". [" + p.kind + "] " + p.who);
      lines.push("   " + p.note);
      if (p.link) lines.push("   " + p.link);
    });
    lines.push("");
    lines.push("시트: " + ss.getUrl());
    lines.push("※ \"결과 링크\"가 있는 줄은 그 링크를 열어 PDF를 다시 받을 수 있어요.");
    MailApp.sendEmail(to, "[CCT 점검] " + (problems.length ? "확인 필요 " + problems.length + "건" : "문제 없음") + " · " + fmt_(now), lines.join("\n"));
  }
  Logger.log("점검 완료 — 기록 " + total + "건, 문제 " + problems.length + "건");
  return { total: total, problems: problems };
}

function fmt_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
}

/* =====================================================================
 * (2026-11-04) 문항별 응답 저장 + 문항 분석
 * ---------------------------------------------------------------------
 * - 앱(v1_17 / v2_16 / v3_58 / v3test_06 / v3s_2부터)이 문항별 응답을 함께 보냅니다.
 *   "문항응답" 탭에 한 사람 한 줄로 쌓입니다(문항 01~65 = data.js 순서, 묻지 않은 문항은 빈칸).
 * - analyzeItems() 를 실행하면 "문항분석" 탭에 컬러별 신뢰도(α)·문항별 평균·문항-총점 상관 등을
 *   새로 계산해 씁니다. 응답이 쌓일 때마다 다시 실행하면 됩니다.
 * ===================================================================== */
var ITEM_SHEET = "문항응답";
var ANALYSIS_SHEET = "문항분석";
var ITEM_MIN_N = 30;                       // 이보다 적으면 통계를 내지 않음
var ITEM_EXCLUDE_NAME = /테스트|test|시험|개발/i;   // 분석에서 뺄 이름(시험 응답)
// 강의 단축형(v3s) 39문항 — 컬러 안 순서 번호(0~4). 앱 data.js의 CCT_SHORT_PICK과 같아야 합니다.
var SHORT_PICK = {
  RED: [0, 1, 4], ORANGE: [0, 1, 4], YELLOW: [0, 1, 2], LIME: [1, 2, 3], GREEN: [1, 2, 3],
  BLUE: [0, 1, 2], BLUE_GREEN: [0, 2, 4], INDIGO: [0, 1, 3], PURPLE: [0, 1, 2], PINK: [0, 1, 2],
  CORAL: [0, 1, 3], GOLD: [0, 1, 3], TURQUOISE: [1, 2, 3]
};
var ITEM_TEXT = [
  "할 일이 생기면 오래 생각하기보다 먼저 움직이기 시작한다.",   // RED
  "목표가 정해지면 망설임 없이 바로 실행에 옮긴다.",
  "일이 정체되어 있을 때 내가 먼저 움직여서 흐름을 바꾸는 편이다.",
  "새로운 프로젝트에서 첫 행동을 빨리 정하는 편이다.",
  "압박이 있는 상황에서도 행동력을 잃지 않는다.",
  "내 생각이나 감정을 말로 자연스럽게 표현하는 편이다.",   // ORANGE
  "복잡한 생각도 다른 사람이 이해하기 쉽도록 말로 풀어 설명하는 편이다.",
  "아이디어가 떠오르면 혼자 담아두기보다 바로 이야기한다.",
  "전하고 싶은 생각이나 아이디어를 상황에 맞는 방식으로 표현하는 편이다.",
  "좋거나 불편한 감정을 비교적 솔직하게 말로 표현한다.",
  "새로운 정보나 경험에 호기심이 먼저 생긴다.",   // YELLOW
  "낯선 방식이나 다른 의견도 일단 들어보려고 한다.",
  "익숙한 방법보다 다른 가능성을 시도해보는 편이다.",
  "나와 다른 관점이라도 그 안에 배울 점이 있는지 살펴보는 편이다.",
  "새로운 분야를 배우는 것에 흥미를 느낀다.",
  "혼자 결정하기보다 다른 사람과 역할을 나누는 편이다.",   // LIME
  "의견이 다를 때 갈등보다 조율할 방법을 먼저 찾는다.",
  "팀에서 전체 흐름을 고려해 내 역할을 조정한다.",
  "다른 사람의 의견을 확인한 뒤 함께 결정하려고 한다.",
  "공동의 목표를 위해 내 방식을 유연하게 바꿀 수 있다.",
  "사람이나 상황을 판단할 때 개인적 호불호보다 기준을 먼저 본다.",   // GREEN
  "결정 전에 여러 사람의 입장을 확인하려고 한다.",
  "친한 사이라도 같은 기준을 적용하려고 한다.",
  "갈등 상황에서 한쪽 편을 들기보다 공통 기준을 찾으려 한다.",
  "역할과 보상의 기준을 명확히 하는 것을 중요하게 생각한다.",
  "맡은 일은 끝까지 마무리하려고 한다.",   // BLUE
  "약속한 일정과 기한을 지키기 위해 노력한다.",
  "해야 할 일을 계획하고 순서대로 처리하는 편이다.",
  "예상치 못한 문제가 생겨도 맡은 일을 마무리할 방법을 찾아 끝까지 책임지려 한다.",
  "한번 맡은 역할은 중간에 쉽게 포기하지 않는다.",
  "감정이 강해져도 바로 반응하기 전에 한 번 생각한다.",   // BLUE_GREEN
  "화나거나 불안할 때 즉각 답하기보다 잠시 시간을 둔다.",
  "충동적으로 하고 싶은 것이 생겨도 스스로 속도를 조절할 수 있다.",
  "스트레스를 받을 때 감정대로 바로 행동하기보다 내 반응을 스스로 조절하려고 한다.",
  "장기적인 목표를 위해 지금의 행동을 조절할 수 있다.",
  "겉으로 드러난 현상보다 그 원인을 먼저 생각한다.",   // INDIGO
  "서로 다른 정보 사이에서 연결점을 찾는 편이다.",
  "반복되는 문제를 볼 때 패턴을 파악하려고 한다.",
  "복잡한 상황을 전체 흐름으로 정리하는 것을 잘한다.",
  "어떤 일이 왜 일어났는지 돌아보고 이해하려 한다.",
  "경험한 일이 나에게 어떤 의미가 있는지 생각해보는 편이다.",   // PURPLE
  "선택을 할 때 눈앞의 이익보다 내 가치관을 먼저 고려한다.",
  "힘든 일을 겪은 뒤에도 그 안에서 배운 점을 찾으려 한다.",
  "내가 어떤 삶을 원하는지 자주 생각한다.",
  "중요한 결정 앞에서 나에게 중요한 것이 무엇인지 확인한다.",
  "상대방의 표정이나 말투 변화를 비교적 잘 알아차린다.",   // PINK
  "누군가 힘들어 보이면 먼저 관심을 기울이는 편이다.",
  "상대의 말을 판단하기보다 먼저 이해하려고 한다.",
  "다른 사람에게 필요한 도움이 무엇인지 살피는 편이다.",
  "관계에서 상대가 편안함을 느끼도록 신경 쓴다.",
  "가까운 사람에게 내 감정을 비교적 잘 표현하는 편이다.",   // CORAL
  "고마움이나 애정을 말이나 행동으로 자주 표현한다.",
  "관계에서 서로의 마음을 확인하는 시간을 중요하게 생각한다.",
  "갈등이 있어도 관계를 회복하기 위한 대화를 먼저 시도한다.",
  "가까운 사람과 서로의 속마음과 감정을 나누며 관계를 깊게 만드는 편이다.",
  "결정을 내려야 할 때 내 판단을 믿고 선택하는 편이다.",   // GOLD
  "필요한 순간에는 내 의견을 분명하게 말한다.",
  "새로운 역할이나 도전 앞에서 “해볼 수 있다”는 태도를 가진다.",
  "다른 사람의 평가에 쉽게 흔들리지 않는 편이다.",
  "내가 잘하는 부분과 기여할 수 있는 영역을 알고 있다.",
  "정해진 방식보다 나만의 방법을 만들어보고 싶어한다.",   // TURQUOISE
  "기존 방식에서 불편한 점을 발견하면 다르게 시도해본다.",
  "자율적으로 선택할 수 있을 때 아이디어가 더 잘 떠오른다.",
  "정답이 없는 문제에서 나만의 해결책을 만드는 편이다.",
  "정해진 답이 없어도 스스로 기준을 세우고 나만의 방식으로 문제를 해결하는 편이다."
];
var ITEM_FIXED_HEADERS = ["제출시각", "이름", "버전", "응답 문항 수", ID_HEADER];

function itemHeaders_() {
  var h = ITEM_FIXED_HEADERS.slice();
  for (var i = 0; i < 65; i++) {
    h.push(("0" + (i + 1)).slice(-2) + " " + COLOR_LABELS[Math.floor(i / 5)] + (i % 5 + 1));
  }
  return h;
}

function getItemSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ITEM_SHEET);
  if (!sh) {
    sh = ss.insertSheet(ITEM_SHEET);
    sh.appendRow(itemHeaders_());
    sh.setFrozenRows(1);
  }
  return sh;
}

// 문항별 응답 한 줄. 같은 결과ID가 이미 있으면 쓰지 않음(재전송·2차 전송 대비).
function writeItems_(data) {
  var s = String(data.items || "");
  if (!/^[1-5\-]{65}$/.test(s)) return false;
  var sh = getItemSheet_();
  var last = sh.getLastRow();
  if (data.resultId && last >= 2) {
    var ids = sh.getRange(2, 5, last - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(data.resultId)) return false;
    }
  }
  var vals = s.split("").map(function (c) { return c === "-" ? "" : Number(c); });
  var asked = vals.filter(function (v) { return v !== ""; }).length;
  sh.appendRow([
    data.completedAt ? new Date(data.completedAt) : new Date(),
    data.name || "", data.appVariant || "", asked, data.resultId || ""
  ].concat(vals));
  return true;
}

/* ---------- 통계 도우미 ---------- */
function mean_(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
function var_(a) {
  if (a.length < 2) return 0;
  var m = mean_(a), s = 0;
  for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
  return s / (a.length - 1);
}
function corr_(x, y) {
  var mx = mean_(x), my = mean_(y), sxy = 0, sxx = 0, syy = 0;
  for (var i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my);
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
// rows: [[문항1, 문항2, …], …] (모두 응답한 사람만)
function alpha_(rows) {
  var k = rows.length ? rows[0].length : 0;
  if (k < 2 || rows.length < 2) return null;
  var sumVar = 0;
  for (var j = 0; j < k; j++) sumVar += var_(rows.map(function (r) { return r[j]; }));
  var tv = var_(rows.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); }));
  return tv > 0 ? (k / (k - 1)) * (1 - sumVar / tv) : null;
}
function pickCols_(rows, cols) { return rows.map(function (r) { return cols.map(function (c) { return r[c]; }); }); }
function r2_(v) { return v == null ? "" : Math.round(v * 100) / 100; }

/**
 * 문항 분석 — Apps Script 편집기에서 함수 "analyzeItems"를 고르고 [실행].
 * "문항분석" 탭을 새로 씁니다(기존 내용은 지워짐). 시험 응답(이름에 테스트·test 등)과
 * 모든 문항을 같은 번호로만 답한 응답은 뺍니다. 같은 결과ID는 한 번만 셉니다.
 */
function analyzeItems() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(ITEM_SHEET);
  if (!src || src.getLastRow() < 2) { Logger.log("문항응답 탭에 자료가 없습니다."); return; }
  var all = src.getRange(2, 1, src.getLastRow() - 1, 5 + 65).getValues();

  var seen = {}, data = [], exName = 0, exFlat = 0, dup = 0;
  all.forEach(function (row) {
    var id = String(row[4] || "");
    if (id && seen[id]) { dup++; return; }
    if (id) seen[id] = true;
    if (ITEM_EXCLUDE_NAME.test(String(row[1] || ""))) { exName++; return; }
    var v = row.slice(5).map(function (x) { return x === "" || x == null ? null : Number(x); });
    var got = v.filter(function (x) { return x != null; });
    var flat = got.length >= 13 && got.every(function (x) { return x === got[0]; });
    if (flat) { exFlat++; return; }
    data.push(v);
  });

  var out = [];
  out.push(["문항 분석", "계산: " + fmt_(new Date()), "분석 인원 " + data.length + "명",
    "제외: 시험 이름 " + exName + " · 한 번호만 응답 " + exFlat + " · 중복 " + dup, "", "", "", "", "", ""]);
  out.push(["읽는 법", "α(신뢰도) .70 이상 양호 · .60~.70 보통 · .60 미만 낮음", "문항-총점 상관 .30 미만은 그 컬러를 잘 대표하지 못하는 문항",
    "뺐을 때 α가 지금 α보다 높으면 그 문항이 신뢰도를 낮추는 쪽", "응답 " + ITEM_MIN_N + "명 미만이면 계산하지 않음", "가장 높은 3문항은 참고용: 같은 뜻 문항끼리 모이면 α가 높아지므로 내용이 고루 담겼는지 함께 보세요", "", "", "", ""]);
  out.push(["", "", "", "", "", "", "", "", "", ""]);
  out.push(["[컬러별 요약]", "정식 5문항 α", "정식 응답 수", "단축 3문항 α", "단축 응답 수", "자료상 가장 높은 3문항", "그 3문항 α", "", "", ""]);

  var detail = [["[문항별]", "번호", "문항", "단축형", "응답 수", "평균", "표준편차", "문항-총점 상관", "뺐을 때 α", "판정"]];

  COLOR_ORDER.forEach(function (key, c) {
    var cols = [0, 1, 2, 3, 4].map(function (j) { return c * 5 + j; });
    var full = data.filter(function (r) { return cols.every(function (k) { return r[k] != null; }); });
    var fullRows = pickCols_(full, cols);
    var sp = SHORT_PICK[key] || [0, 1, 2];
    var sCols = sp.map(function (j) { return c * 5 + j; });
    var shortRows = pickCols_(data.filter(function (r) { return sCols.every(function (k) { return r[k] != null; }); }), sCols);

    var aFull = fullRows.length >= ITEM_MIN_N ? alpha_(fullRows) : null;
    var aShort = shortRows.length >= ITEM_MIN_N ? alpha_(shortRows) : null;

    // 5문항 중 3문항 조합 10가지 가운데 α가 가장 높은 것 (정식 응답자 기준)
    var best = "", bestA = null;
    if (fullRows.length >= ITEM_MIN_N) {
      for (var a = 0; a < 5; a++) for (var b = a + 1; b < 5; b++) for (var d = b + 1; d < 5; d++) {
        var al = alpha_(pickCols_(fullRows, [a, b, d]));
        if (al != null && (bestA == null || al > bestA)) { bestA = al; best = [a + 1, b + 1, d + 1].join("·"); }
      }
    }
    out.push([COLOR_LABELS[c], r2_(aFull), fullRows.length, r2_(aShort), shortRows.length,
      best ? COLOR_LABELS[c] + " " + best + (best === sp.map(function (j) { return j + 1; }).join("·") ? " (단축형과 같음)" : "") : "", r2_(bestA), "", "", ""]);

    cols.forEach(function (k, j) {
      var vals = data.map(function (r) { return r[k]; }).filter(function (x) { return x != null; });
      var citc = null, aDel = null;
      if (fullRows.length >= ITEM_MIN_N) {
        var item = fullRows.map(function (r) { return r[j]; });
        var rest = fullRows.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0) - r[j]; });
        citc = corr_(item, rest);
        aDel = alpha_(fullRows.map(function (r) { return r.filter(function (_, t) { return t !== j; }); }));
      }
      var verdict = "";
      if (citc != null) {
        if (citc < 0.3) verdict = "약함";
        if (aFull != null && aDel != null && aDel > aFull + 0.01) verdict = verdict ? verdict + " · 빼면 α 상승" : "빼면 α 상승";
      } else if (vals.length < ITEM_MIN_N) verdict = "응답 부족";
      detail.push([COLOR_LABELS[c] + (j + 1), k + 1, ITEM_TEXT[k] || "", sp.indexOf(j) >= 0 ? "○" : "",
        vals.length, vals.length ? r2_(mean_(vals)) : "", vals.length > 1 ? r2_(Math.sqrt(var_(vals))) : "",
        r2_(citc), r2_(aDel), verdict]);
    });
  });

  out.push(["", "", "", "", "", "", "", "", "", ""]);
  out = out.concat(detail);

  var sh = ss.getSheetByName(ANALYSIS_SHEET) || ss.insertSheet(ANALYSIS_SHEET);
  sh.clear();
  sh.getRange(1, 1, out.length, 10).setValues(out);
  sh.getRange(1, 1).setFontWeight("bold");
  sh.getRange(4, 1, 1, 7).setFontWeight("bold");
  sh.getRange(4 + 13 + 2, 1, 1, 10).setFontWeight("bold");
  sh.setColumnWidth(3, 420);
  Logger.log("문항분석 완료: 분석 인원 " + data.length + "명");
}
