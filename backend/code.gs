/**
 * Link Home — Google Apps Script backend (Google Sheet as database).
 *
 * ใช้คู่กับเว็บ PWA: เก็บลิงก์ + รูปไอคอน (base64) ไว้ในชีต เพื่อซิงก์ข้ามเครื่อง
 *
 * ---- วิธีติดตั้ง ----
 * 1) สร้าง Google Sheet ใหม่ 1 ไฟล์ (ปล่อยว่างได้ สคริปต์จะสร้างชีต "links" ให้เอง)
 * 2) เมนู Extensions → Apps Script → วางไฟล์นี้แทนของเดิมทั้งหมด
 * 3) แก้ TOKEN ด้านล่างเป็นรหัสลับของคุณเอง (อะไรก็ได้ที่เดายาก) — ต้องใส่ให้ตรงกับในเว็บ
 * 4) กด Deploy → New deployment → เลือก type "Web app"
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    แล้ว Authorize/อนุญาตสิทธิ์
 * 5) คัดลอก "Web app URL" (ลงท้าย /exec) ไปวางในเว็บ ที่เมนู → ตั้งค่าซิงก์
 *
 * หมายเหตุ: ทุกครั้งที่แก้โค้ดนี้ ต้อง Deploy → Manage deployments → แก้ version เป็น New
 *           หรือสร้าง deployment ใหม่ URL ถึงจะอัปเดต
 */

const TOKEN = 'CHANGE_ME_ตั้งรหัสลับของคุณ';   // <<< แก้เป็นรหัสลับของคุณ
const SHEET_NAME = 'links';
const HEADERS = ['id', 'name', 'url', 'icon', 'sort'];

function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    const params = (e && e.parameter) || {};
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (_) {}
    }
    const token = body.token || params.token || '';
    if (TOKEN && token !== TOKEN) return json(out, { ok: false, error: 'unauthorized' });

    const action = body.action || params.action || 'list';

    if (action === 'list') {
      return json(out, { ok: true, items: readAll() });
    }
    if (action === 'replaceAll') {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        writeAll(Array.isArray(body.items) ? body.items : []);
      } finally {
        lock.releaseLock();
      }
      return json(out, { ok: true, count: (body.items || []).length });
    }
    if (action === 'ping') {
      return json(out, { ok: true, pong: true });
    }
    return json(out, { ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json(out, { ok: false, error: String(err) });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

function readAll() {
  const sh = getSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return values
    .filter(function (r) { return r[0] || r[1] || r[2]; })
    .map(function (r) {
      return { id: String(r[0]), name: String(r[1]), url: String(r[2]), icon: String(r[3] || '') };
    });
}

function writeAll(items) {
  const sh = getSheet();
  // clear existing data rows
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  if (!items.length) return;
  const rows = items.map(function (it, i) {
    return [String(it.id || ''), String(it.name || ''), String(it.url || ''), String(it.icon || ''), i];
  });
  sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function json(out, obj) {
  return out.setContent(JSON.stringify(obj));
}
