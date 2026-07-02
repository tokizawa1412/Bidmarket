# BidMarket Complete Core System

เวอร์ชันนี้ใช้ ZIP ล่าสุดเป็นฐานและรวมระบบหลักตามข้อมูลล่าสุด:

- PostgreSQL ผ่าน `DATABASE_URL` และ fallback เป็น `data/db.json`
- Google Login ผ่าน `/auth/google` และ `/auth/google/callback`
- VIP System + VIP Points + ระดับ Member ถึง Elite
- เติม Credit: กรอกจำนวน Credit ขั้นต่ำ 10 Credit, 1 Credit = 6 บาท
- แลก Coin: 1 Credit = 100 Coin และไม่สามารถแลก Coin กลับ Credit
- Fee Engine: ค่าธรรมเนียมประมูลสำเร็จ, ระบบซื้อขายปลอดภัย ขั้นบันได, Activity Fee, Pin Fee, Username Change Fee
- ระบบซื้อขายปลอดภัย พร้อม Audit / Transaction / Timeline
- Reward Ads พร้อมซ่อนอัตโนมัติและ คิวรอตรวจสอบ หากตอบคำถามผิดเกิน 30% หลัง 23:30
- Activity System: เมนู “กิจกรรม”, สร้างกิจกรรม, หมวด ประมูล / เว็บไซต์ / เติมเงินสะสม
- Reward Code Engine: โค้ด A-Z a-z 0-9 เท่านั้น, สุ่มโค้ด 16 ตัวอักษร, จำกัดจำนวน, กันรับซ้ำ
- ปุ่มแชร์หน้าประมูล: กดแชร์แล้วรับโค้ดทันทีถ้ามีกิจกรรมผูกไว้
- คิวรอตรวจสอบของระบบ สำหรับตรวจสอบกิจกรรม/โฆษณาที่ถูกรายงานหรือซ่อนอัตโนมัติ
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

## Auction Method Lock V2

เพิ่มกฎวิธีประมูล 3 แบบ:

1. เสนอราคา (English Auction)
- ผู้ลงสินค้ากำหนดเวลาเริ่มล่วงหน้าได้ไม่เกิน 30 วัน
- ระยะเวลาประมูล 30 นาที - 6 ชั่วโมง
- ต้องมีผู้เข้าร่วมอย่างน้อย 3 คนก่อนเสนอราคา
- ผู้เสนอราคาสูงสุดเป็นผู้ชนะ
- ผู้ลงสินค้ากดสิ้นสุดได้หลังผู้ประมูลล่าสุดผ่านไป 5 นาที หรือเมื่อหมดเวลา
- ใช้ได้ทั้งทั่วไปและ VIP
- VIP English Auction: ผู้เสนอราคาสูงสุดอันดับ 2 ถูกหัก 7% ให้ระบบ และ 3% ให้ผู้ลงสินค้า จากราคาสูงสุดที่เคยเสนอ

2. เคาะราคา (Bidding Fee Auction)
- ราคาเริ่มต้นเป็น 0
- ผู้ลงสินค้ากำหนดราคาเคาะต่อครั้ง
- ทุกครั้งที่เคาะ ระบบหักเงินทันที
- ผู้เคาะคนสุดท้ายเมื่อหมดเวลานับถอยหลังเป็นผู้ชนะ
- ตั้งเวลานับถอยหลังได้ 15-60 วินาที และรีเซ็ตทุกครั้งที่มีการเคาะ
- ใช้ได้ทั้งทั่วไปและ VIP

3. ปิดซอง (Sealed Bid Auction)
- ใช้ได้เฉพาะ VIP
- ใช้ Credit เท่านั้น
- ระยะเวลา 1-30 วัน
- ผู้เสนอราคาถูกหักเงินและพักไว้ทันที
- ผู้แพ้ได้รับเงินคืนหลังปิดประมูล

กฎสกุลเงิน:
- ทุกแบบใช้ได้เฉพาะ Credit หรือ Coin
- หากใช้ Coin ต้องขั้นต่ำ 100 Coin และต้องเป็นจำนวนเต็มร้อยเท่านั้น

## Realtime V1 Update

เพิ่มระบบ Realtime ด้วย Socket.io สำหรับส่วนหลักของเว็บ:

- ห้องประมูล `auction:{auctionId}`
- ห้องผู้ใช้ `user:{userId}`
- ห้อง ระบบจัดการ `admin`
- ห้อง ระบบซื้อขายปลอดภัย `escrow:{orderId}`

Event ที่เพิ่ม:

- `auction:created`
- `auction:joined`
- `auction:bid`
- `auction:closed`
- `auction:timer`
- `auction:list:update`
- `wallet:update`
- `order:update`
- `escrow:update`
- `chat:message`
- `notification:new`
- `admin:notification`

ระบบจะอัปเดตราคา/ผู้เข้าร่วม/เวลานับถอยหลัง/สถานะ ระบบซื้อขายปลอดภัย/ยอด Coin-Credit/ข้อความแชท และแจ้งเตือนโดยไม่ต้องรีเฟรชหน้าเว็บ

## Realtime Notification Sounds

เพิ่มเสียงแจ้งเตือนใน Realtime V1:
- มีคนเสนอราคาสูงกว่าคุณ: `public/assets/sounds/outbid.wav`
- เหลือเวลาประมูลต่ำกว่า 10 วินาที: ใช้ไฟล์ที่ผู้ใช้อัปโหลด `public/assets/sounds/timer-warning.mp3`
- ชนะประมูล: `public/assets/sounds/hammer-close.wav`
- ได้รับข้อความใหม่: `public/assets/sounds/chat-new.wav`
- ระบบซื้อขายปลอดภัย เปลี่ยนสถานะ: `public/assets/sounds/escrow-update.wav`
- VIP เลื่อนระดับ: `public/assets/sounds/vip-levelup.wav`

ผู้ใช้สามารถเปิด/ปิดเสียงแจ้งเตือนได้ในหน้า “บัญชีผู้ใช้” ระบบจะบันทึกค่าไว้ใน `localStorage` ของ Browser

## Production Storage & Backup
ดูรายละเอียดเพิ่มเติมใน `PRODUCTION_STORAGE_README.md`

เพิ่มระบบแล้ว:
- อัปโหลดรูป/วิดีโอไป Cloudflare R2 ได้ถาวร
- fallback เป็น local uploads ถ้ายังไม่ตั้งค่า R2
- ระบบจัดการ export backup JSON ได้
- ระบบจัดการ backup ไป R2 ได้
- API ตรวจสุขภาพฐานข้อมูลและ storage


# BidMarket VIP + Collection/R System Locked Spec

This build applies the latest locked requirements:
- VIP levels: Member, Silver, Gold, Sapphire, Platinum, Diamond, Ruby, Elite.
- Emerald is migrated to Ruby automatically.
- VIP level and points are retained even if VIP status expires.
- VIP point earning: spending 3 Credit grants 1 VIP Point while VIP is active.
- VIP point purchase: 1 Credit = 1 VIP Point.
- Member -> Silver requires 100,000 Coin spent plus 100 VIP Points.
- Level thresholds after Silver: Gold 2,000, Sapphire 15,000, Platinum 50,000, Diamond 300,000, Ruby 600,000, Elite 1,000,000.
- VIP points carry over after level-up.
- Fee rounding: >= 0.5 rounds up, <= 0.4 rounds down.
- Coin fees round down to full 100 Coin and Coin transactions receive no fee cashback.
- ระบบซื้อขายปลอดภัย step fee table is kept unchanged.
- VIP benefits text is exposed in the สมัคร VIP help popup.
- Silver+ displays VIP card/badge data in API.
- Profile showcase items use R value and realtime +100 R boosts.
- R-Coin wallet and exchange from daily boost rights added.
- Collection auction page uses R-Coin and is restricted to Silver+.
- Collection vault/capacity rules are tied to VIP level.

Notes:
This project stores its state in app_state JSONB when DATABASE_URL is configured.
