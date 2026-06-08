# BidMarket Production Storage Add-on

เพิ่มระบบที่ควรมีสำหรับใช้งานจริง:

## 1) เก็บรูป/วิดีโอถาวรด้วย Cloudflare R2
ระบบอัปโหลดทั้งหมดจะใช้ R2 อัตโนมัติเมื่อใส่ Environment Variables ครบ ถ้ายังไม่ครบจะ fallback ไปเก็บใน `/public/uploads` แบบเดิม

ตั้งค่าใน Render > Environment:

```
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET=bidmarket-files
R2_PUBLIC_URL=https://cdn.your-domain.com
MAX_UPLOAD_MB=300
```

ไฟล์ที่ถูกย้ายให้รองรับ R2 แล้ว:
- รูป/ไฟล์ทั่วไป `/api/upload`
- สลิปเติมเงิน
- หลักฐานข้อพิพาท Escrow
- รูปวิเคราะห์ราคา AI
- รูปปก/วิดีโอโฆษณา
- backup JSON

## 2) Backup ฐานข้อมูล app_state
Admin สามารถดาวน์โหลด backup ได้ที่:

```
GET /api/admin/backup/export
```

ถ้าตั้งค่า R2 แล้ว สามารถบันทึก backup เข้า R2 ได้ที่:

```
POST /api/admin/backup/r2
```

## 3) ตรวจสุขภาพระบบ
สำหรับ Admin:

```
GET /api/admin/db/health
GET /api/system/storage
```

## หมายเหตุสำคัญ
PostgreSQL ตอนนี้เก็บข้อมูลหลักทั้งเว็บในตาราง `app_state` เป็น JSONB ส่วน `user_sessions` เก็บ Session Login ระบบนี้ใช้ได้ดีในช่วงเริ่มต้น แต่ถ้าผู้ใช้เยอะมากควรแยกเป็นตาราง `users`, `auctions`, `orders`, `transactions` ในอนาคต
