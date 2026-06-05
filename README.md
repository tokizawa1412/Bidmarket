# BidMarket Complete Core System

เวอร์ชันนี้ใช้ ZIP ล่าสุดเป็นฐานและรวมระบบหลักตามข้อมูลล่าสุด:

- PostgreSQL ผ่าน `DATABASE_URL` และ fallback เป็น `data/db.json`
- Google Login ผ่าน `/auth/google` และ `/auth/google/callback`
- VIP System + VIP Points + ระดับ Member ถึง Elite
- เติม Credit: กรอกจำนวน Credit ขั้นต่ำ 10 Credit, 1 Credit = 6 บาท
- แลก Coin: 1 Credit = 100 Coin และไม่สามารถแลก Coin กลับ Credit
- Fee Engine: ค่าธรรมเนียมประมูลสำเร็จ, Escrow ขั้นบันได, Activity Fee, Pin Fee, Username Change Fee
- Escrow V2 พร้อม Audit / Transaction / Timeline
- Reward Ads พร้อมซ่อนอัตโนมัติและ Review Queue หากตอบคำถามผิดเกิน 30% หลัง 23:30
- Activity System: เมนู “กิจกรรม”, สร้างกิจกรรม, หมวด ประมูล / เว็บไซต์ / เติมเงินสะสม
- Reward Code Engine: โค้ด A-Z a-z 0-9 เท่านั้น, สุ่มโค้ด 16 ตัวอักษร, จำกัดจำนวน, กันรับซ้ำ
- ปุ่มแชร์หน้าประมูล: กดแชร์แล้วรับโค้ดทันทีถ้ามีกิจกรรมผูกไว้
- Admin Review Queue สำหรับตรวจสอบกิจกรรม/โฆษณาที่ถูกรายงานหรือซ่อนอัตโนมัติ
- กิจกรรมระบบ “สะสม Credit 2026” พร้อมตารางรางวัล

## Render Environment Variables

ตั้งค่าใน Render:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=your-long-secret
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://your-app.onrender.com/auth/google/callback
ADMIN_EMAILS=your-email@gmail.com
```

## Commands

```bash
npm install
npm start
```

## หมายเหตุสำคัญ

- ไฟล์อัปโหลดบน Render Free อาจไม่ถาวร แนะนำใช้ Cloudinary/S3 สำหรับรูปสินค้า สลิป และหลักฐานข้อพิพาท
- ระบบนี้ยังเป็น single-file Express + JSONB state เพื่อให้ Deploy ง่าย หากจะใช้งานปริมาณมากควรแยกเป็นตาราง PostgreSQL/migrations ภายหลัง
