/**
 * CCT 컬러성격강점검사 — 결과 로깅용 Google Apps Script
 * ------------------------------------------------------------
 * 이 코드를 Google Sheets의 [확장 프로그램 > Apps Script]에 붙여넣고
 * "웹 앱"으로 배포하면, 검사 완료 시마다:
 *   1) 이 스프레드시트에 결과가 한 줄씩 자동으로 쌓이고
 *   2) 상세 결과 PDF가 내 구글 드라이브의 "CCT 검사 결과 PDF" 폴더에
 *      자동으로 저장되어, 그 파일 링크도 같은 줄에 함께 기록됩니다.
 *
 * v1(자가 다운로드) / v2(센터 방문 안내) 앱 어느 쪽이든 동일하게 동작하며,
 * 어느 버전에서 제출됐는지는 "버전" 열에 표시됩니다.
 *
 * 설치 방법은 함께 전달된 "구글시트 연동 설정 가이드"를 참고하세요.
 */

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("응답") || ss.insertSheet("응답");

  var data = JSON.parse(e.postData.contents);

  var colorOrder = [
    "RED", "ORANGE", "YELLOW", "LIME", "GREEN", "BLUE",
    "BLUE_GREEN", "INDIGO", "PURPLE", "PINK", "CORAL", "GOLD", "TURQUOISE"
  ];
  var colorLabels = [
    "빨강", "주황", "노랑", "라임", "초록", "파랑",
    "청록", "인디고", "보라", "핑크", "코랄", "골드", "터콰이즈"
  ];

  if (sheet.getLastRow() === 0) {
    var header = ["제출시각", "이름", "버전", "TOP1", "TOP2", "TOP3", "보완 컬러", "상세 PDF"].concat(colorLabels);
    sheet.appendRow(header);
  }

  // 상세 PDF가 함께 전달된 경우, 내 드라이브에 저장하고 파일 링크를 받아온다.
  // (이 스크립트는 시트 소유자 권한으로 실행되므로, 저장된 파일은 기본적으로
  // 나만 볼 수 있는 비공개 상태입니다. 링크를 열면 로그인 후 바로 확인 가능.)
  var pdfLink = "";
  if (data.pdfBase64) {
    try {
      var folder = getOrCreateFolder_("CCT 검사 결과 PDF");
      var base64 = String(data.pdfBase64).split(",")[1] || data.pdfBase64; // "data:application/pdf;base64,...." 접두어 제거
      var bytes = Utilities.base64Decode(base64);
      var safeName = (data.name || "무명").replace(/[\\/:*?"<>|]/g, "_");
      var fileName = "CCT_" + safeName + "_" +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + ".pdf";
      var blob = Utilities.newBlob(bytes, "application/pdf", fileName);
      var file = folder.createFile(blob);
      pdfLink = file.getUrl();
    } catch (err) {
      pdfLink = "PDF 저장 실패: " + err;
    }
  }

  var scoreRow = colorOrder.map(function (key) {
    return data.scores && data.scores[key] != null ? data.scores[key] : "";
  });

  var row = [
    new Date(),
    data.name || "",
    data.appVariant || "",
    data.top1 || "",
    data.top2 || "",
    data.top3 || "",
    data.complement || "",
    pdfLink,
  ].concat(scoreRow);

  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, pdfLink: pdfLink }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder_(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function doGet(e) {
  return ContentService.createTextOutput("CCT logging endpoint is running.");
}
