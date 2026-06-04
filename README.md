# BidMarket - Persistent Database Version

เวอร์ชันนี้แก้ให้เว็บไซต์เชื่อมฐานข้อมูลถาวรจริงด้วย PostgreSQL แล้ว

## สิ่งที่เปลี่ยน

- เพิ่มการเชื่อมต่อ PostgreSQL ผ่าน `DATABASE_URL`
- เก็บข้อมูลหลักของเว็บลงตาราง `app_state` ใน PostgreSQL
- เก็บ session login ลง PostgreSQL เมื่อมี `DATABASE_URL`
- ถ้าไม่ได้ตั้งค่า `DATABASE_URL` จะ fallback ไปใช้ `data/db.json` สำหรับทดสอบบนเครื่อง

## Environment Variables บน Render

ต้องมีอย่างน้อย:

```text
NODE_ENV=production
SESSION_SECRET=สุ่มข้อความยาวๆ
DATABASE_URL=postgresql://...
PGSSLMODE=require
```

ถ้าใช้ Blueprint จาก `render.yaml` ระบบจะสร้าง PostgreSQL และผูก `DATABASE_URL` ให้อัตโนมัติ

## Deploy บน Render แบบ Manual

1. สร้าง PostgreSQL ใน Render
2. คัดลอก Internal Database URL
3. ไปที่ Web Service > Environment
4. เพิ่ม `DATABASE_URL`
5. เพิ่ม `SESSION_SECRET`
6. Redeploy

## หมายเหตุสำคัญเรื่องรูป/สลิป

ข้อมูลธุรกรรม เครดิต ผู้ใช้ แชท รีวิว และรายการประมูลจะอยู่ใน PostgreSQL แล้ว

แต่ไฟล์อัปโหลด เช่น รูปสินค้าและสลิป ถูกเก็บใน `public/uploads` ซึ่งบน Render Free อาจหายเมื่อ service restart หรือ redeploy ได้ หากต้องการถาวรจริงสำหรับไฟล์ด้วย ให้ใช้ Render Persistent Disk หรือ S3/Cloudinary เพิ่มเติม

## รันบนเครื่อง

```bash
npm install
npm start
```

เปิดที่:

```text
http://localhost:3000
```

บัญชีเริ่มต้น:

```text
admin: demo / 1234
user: seller / 1234
```


## Google Login / Gmail OAuth

เวอร์ชันนี้รองรับการเข้าสู่ระบบด้วย Gmail จริงโดยไม่ต้องติดตั้ง package เพิ่มเติม

ตั้งค่าใน Render > Environment Variables:

```text
GOOGLE_CLIENT_ID=Client ID จาก Google Cloud
GOOGLE_CLIENT_SECRET=Client Secret จาก Google Cloud
GOOGLE_CALLBACK_URL=https://ชื่อเว็บ.onrender.com/auth/google/callback
ADMIN_EMAILS=อีเมลแอดมิน@gmail.com
SESSION_SECRET=ข้อความสุ่มยาวๆ
DATABASE_URL=ได้จาก Render PostgreSQL
```

ใน Google Cloud OAuth Client ต้องตั้งค่า:

```text
Authorized JavaScript origins:
https://ชื่อเว็บ.onrender.com

Authorized redirect URIs:
https://ชื่อเว็บ.onrender.com/auth/google/callback
```

สำคัญ: ไฟล์นี้ลบ package-lock.json ออกเพื่อให้ Render ดาวน์โหลด dependency จาก registry.npmjs.org โดยตรง และไม่อ้างอิง registry ภายในที่ทำให้ ETIMEDOUT

## Escrow V1 ที่เพิ่มในเวอร์ชันนี้

ระบบ Escrow ทำงานแบบ Manual + Admin ตัดสิน:

1. ผู้ใช้เสนอราคา ระบบหัก/พักเงินผู้เสนอราคาสูงสุดไว้ก่อน
2. หากมีผู้เสนอราคาสูงกว่า ระบบคืนเงินให้ผู้เสนอราคาคนก่อน
3. เมื่อปิดประมูล ระบบสร้างคำสั่งซื้อและล็อกเงินไว้ใน Escrow
4. ผู้ขายเข้าเมนูบัญชีผู้ใช้ > คำสั่งซื้อของฉัน / Escrow แล้วแจ้งจัดส่งหรือส่งมอบ
5. ผู้ซื้อกดยืนยันรับสินค้า และผู้ขายยืนยันซื้อขายสำเร็จ
6. เมื่อทั้งสองฝ่ายยืนยันครบ ระบบปล่อยเงินให้ผู้ขายโดยหักค่าบริการ
7. หากมีปัญหา ผู้ซื้อ/ผู้ขายเปิดข้อพิพาทพร้อมแนบหลักฐานได้
8. Admin เข้าเมนู Admin > จัดการคำสั่งซื้อ / Escrow เพื่อเลือกปล่อยเงินให้ผู้ขายหรือคืนเงินผู้ซื้อ

สถานะหลัก:

```text
WAIT_SHIPPING = รอผู้ขายจัดส่ง
SHIPPED = ผู้ขายแจ้งจัดส่งแล้ว
DELIVERED = รอยืนยันครบสองฝ่าย
DISPUTE = ข้อพิพาท
COMPLETED = สำเร็จ / ปล่อยเงินแล้ว
REFUNDED = คืนเงินแล้ว
```

## Escrow V2 - Production Readiness Layer

เวอร์ชันนี้เพิ่มระบบ Escrow V2 ต่อจาก V1 โดยเน้นการใช้งานจริงมากขึ้น:

- บันทึก `transactions` พร้อมยอดก่อน/หลังรายการ
- บันทึก `audit_logs` สำหรับการพักเงิน ปล่อยเงิน คืนเงิน และเปิดข้อพิพาท
- บันทึก `escrow_events` / timeline ต่อคำสั่งซื้อ
- ป้องกันการปล่อยเงินหรือคืนเงินซ้ำด้วยสถานะ `escrow_status`
- ตรวจสอบยอดผู้ใช้ก่อนหัก/คืน/จ่าย Credit ทุกครั้ง
- Admin ต้องใส่เหตุผลการตัดสินเมื่อปล่อยเงินหรือคืนเงินได้จากหน้า Admin
- เพิ่ม API ตรวจสุขภาพ Escrow: `/api/admin/escrow/health`
- เพิ่ม API audit: `/api/admin/audit-logs`

สถานะหลัก:

- `WAIT_SHIPPING` รอผู้ขายส่งมอบ
- `SHIPPED` ผู้ขายแจ้งส่งมอบแล้ว
- `DELIVERED` รอยืนยันครบสองฝ่าย
- `DISPUTE` มีข้อพิพาท รอ Admin ตัดสิน
- `COMPLETED` ปล่อยเงินให้ผู้ขายแล้ว
- `REFUNDED` คืนเงินให้ผู้ซื้อแล้ว

ข้อควรทำก่อนเปิดเงินจริงเต็มรูปแบบ:

- ตั้งค่า `DATABASE_URL` เป็น PostgreSQL จริงบน Render
- ตั้งค่า `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `ADMIN_EMAILS`
- ใช้ Cloudinary/S3 หรือ Render Persistent Disk สำหรับไฟล์สลิปและหลักฐานข้อพิพาท
- สำรองฐานข้อมูล PostgreSQL เป็นประจำ
