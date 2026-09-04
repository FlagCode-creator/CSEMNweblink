# Link Home — หน้าจอรวมลิงก์ (PWA)

เว็บแอพหน้าจอโฮมส่วนตัว รวมลิงก์ที่คุณพัฒนาหรืออยากแปะไว้ กดไอคอนเปิดลิงก์ได้เหมือนกดแอพ
เพิ่ม/แก้/ลบ/จัดเรียงไอคอนได้เองในหน้าเว็บ และติดตั้งลงหน้าจอโฮมมือถือได้ (Add to Home Screen)

## ฟีเจอร์
- 🧩 ไอคอนแบบหน้าจอแอพ — กดเปิดลิงก์ในแท็บใหม่
- ➕ เพิ่ม/แก้/ลบลิงก์ในหน้าเว็บ (กดปุ่ม **แก้ไข** เพื่อลบ/แก้/ลากจัดเรียง)
- 🖼️ อัปโหลด / ลากวาง / วาง (Ctrl+V) รูปไอคอนเอง — ไม่ใส่รูปจะใช้ตัวอักษรแรกของชื่อให้อัตโนมัติ
- 🔎 ค้นหาลิงก์
- 💾 ข้อมูลเก็บในเครื่อง (localStorage) + สำรอง/นำเข้าไฟล์ JSON
- 📱 PWA เต็มรูปแบบ — ติดตั้งลงหน้าจอโฮม + ใช้งานออฟไลน์ได้

## โครงสร้างไฟล์
```
index.html            หน้าเว็บหลัก
styles.css            สไตล์ (มีธีมสว่าง/มืดอัตโนมัติ)
app.js                ตรรกะทั้งหมด (รวมโหมดซิงก์)
manifest.webmanifest  ข้อมูลแอพสำหรับ PWA
sw.js                 service worker (ออฟไลน์)
icons/                ไอคอนแอพ (192/512/maskable/apple-touch)
backend/code.gs       Google Apps Script (Google Sheet เป็นฐานข้อมูล) — ออปชัน
```

## การเก็บข้อมูล 2 โหมด
- **โหมดในเครื่อง (ค่าเริ่มต้น):** ลิงก์และรูปเก็บใน `localStorage` ของเบราว์เซอร์เครื่องนั้น ๆ
  ทำงานออฟไลน์ได้ ย้าย/สำรองด้วยปุ่ม Export/Import (ไฟล์ JSON)
- **โหมดซิงก์ (ออปชัน):** เก็บส่วนกลางใน Google Sheet ผ่าน Apps Script → เพิ่มที่เครื่องไหนก็เห็นทุกเครื่อง
  (`localStorage` กลายเป็น cache สำหรับออฟไลน์)

### ตั้งค่าซิงก์ด้วย Google Sheet
1. สร้าง Google Sheet ใหม่ 1 ไฟล์ → เมนู **Extensions → Apps Script**
2. วางเนื้อหาไฟล์ [`backend/code.gs`](backend/code.gs) แทนของเดิมทั้งหมด
3. แก้ค่า `TOKEN` ในโค้ดเป็นรหัสลับของคุณเอง
4. **Deploy → New deployment → Web app** → *Execute as: Me*, *Who has access: Anyone* → Authorize
5. คัดลอก **Web app URL** (ลงท้าย `/exec`)
6. ในเว็บ → เมนู (⋮) → **ตั้งค่าซิงก์** → วาง URL + รหัสลับ (ให้ตรงกับ `TOKEN`) → **ทดสอบ** → **บันทึก & ซิงก์**
7. ทำขั้นตอน 6 ซ้ำในทุกอุปกรณ์ที่อยากให้ซิงก์กัน

> รูปไอคอนถูกย่อเป็น ≤256px แล้วเก็บเป็น base64 ในเซลล์ของชีต (จำกัด ~50,000 ตัวอักษร/เซลล์ ซึ่งเพียงพอ)

## ทดสอบในเครื่อง
เปิด `index.html` ตรง ๆ ก็ใช้งานส่วนใหญ่ได้ แต่ **PWA/service worker ต้องเสิร์ฟผ่าน http** เช่น:
```bash
python -m http.server 8000
# แล้วเปิด http://localhost:8000
```

## เผยแพร่ด้วย GitHub Pages
1. สร้าง repo ใหม่บน GitHub (เช่น `link-home`)
2. ในโฟลเดอร์นี้:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Link Home PWA"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```
3. ที่ GitHub → **Settings → Pages** → Source เลือก `Deploy from a branch` → Branch `main` / `/root` → Save
4. รอสักครู่ เว็บจะอยู่ที่ `https://<username>.github.io/<repo>/`
5. เปิดบนมือถือ → เมนูเบราว์เซอร์ → **Add to Home Screen**

> โค้ดใช้ path แบบ relative (`./`) ทั้งหมด จึงทำงานได้ทั้งบน root และ subpath ของ GitHub Pages
