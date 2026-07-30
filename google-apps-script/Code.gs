const SPREADSHEET_ID = "1ahyY64u9uYmcEDFi1XAJRFmnZ_gX_6VQHUnWvswkvmg";

function doPost(event) {
  const payload = JSON.parse(event.postData.contents);
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Payouts");
  if (payload.action === "add") {
    sheet.appendRow([payload.payee, payload.date, payload.method, Number(payload.amount), payload.role, String(payload.id)]);
  } else if (payload.action === "delete") {
    const ids = sheet.getRange(2, 6, Math.max(sheet.getLastRow() - 1, 1), 1).getDisplayValues();
    const index = ids.findIndex(row => row[0] === String(payload.id));
    if (index >= 0) sheet.deleteRow(index + 2);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
