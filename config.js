/* ⚙️ ตั้งค่าซิงก์อัตโนมัติ (Auto-sync)
 *
 * ใส่ค่าจาก Google Apps Script ที่ Deploy แล้วตรงนี้ครั้งเดียว
 * → ทุกเครื่องที่เปิดเว็บนี้จะ "ซิงก์ให้อัตโนมัติ" โดยไม่ต้องกดตั้งค่า/เชื่อมเอง
 *
 * ถ้าปล่อยว่างไว้ เว็บจะทำงานแบบเก็บข้อมูลในเครื่อง (localStorage) ตามปกติ
 *
 * ⚠️ หมายเหตุความปลอดภัย: ไฟล์นี้ถูกเผยแพร่พร้อมเว็บ (เห็นได้จากสาธารณะถ้า repo เป็น public)
 *    ใครที่เห็น URL + TOKEN นี้ สามารถอ่าน/แก้รายการลิงก์ของคุณได้
 *    สำหรับ "หน้ารวมลิงก์ส่วนตัว" ความเสี่ยงต่ำ แต่อย่าใส่ข้อมูลลับในลิงก์
 */
window.LINKHOME_CONFIG = {
  syncUrl: "https://script.google.com/macros/s/AKfycbxAk7lXbEtnd71ED6jA0vsng5U9dKzhNMNGo24q5G2fYYRK8u3vRjowkVU9y7DiY3XgOA/exec",
  syncToken: "2809"  // ต้องตรงกับค่า TOKEN ใน backend/code.gs
};
