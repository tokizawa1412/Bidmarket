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

## Google Login + PostgreSQL

เวอร์ชันนี้รองรับ Login ด้วย Gmail จริงผ่าน Google OAuth และเก็บข้อมูลถาวรใน PostgreSQL ผ่าน `DATABASE_URL`

### Environment Variables ที่ต้องตั้งใน Render

```text
DATABASE_URL=ได้จาก Render PostgreSQL
NODE_ENV=production
SESSION_SECRET=ข้อความสุ่มยาวๆ
GOOGLE_CLIENT_ID=Client ID จาก Google Cloud
GOOGLE_CLIENT_SECRET=Client Secret จาก Google Cloud
GOOGLE_CALLBACK_URL=https://bidmarket-lxou.onrender.com/auth/google/callback
ADMIN_EMAILS=Gmail ที่ให้เป็น Admin เช่น tokizawa1412@gmail.com
```

### Google Cloud OAuth

Authorized JavaScript origins:

```text
https://bidmarket-lxou.onrender.com
```

Authorized redirect URIs:

```text
https://bidmarket-lxou.onrender.com/auth/google/callback
```

### การทำงาน

- กดปุ่ม “เข้าสู่ระบบด้วย Gmail”
- ระบบพาไป Google Login
- Login สำเร็จแล้วกลับมาที่ `/auth/google/callback`
- ถ้า Gmail ยังไม่เคยมีบัญชี ระบบจะสร้างบัญชีใหม่อัตโนมัติ
- ถ้า Gmail อยู่ใน `ADMIN_EMAILS` ระบบจะตั้ง role เป็น `admin`
- ข้อมูลผู้ใช้ถูกบันทึกถาวรใน PostgreSQL
