# BidMarket Advanced Auction Update

เพิ่มตามคำขอ:
- ลบเมนู ผู้ชนะ/ประวัติ ด้านบน
- เปลี่ยน กติกา เป็น กฏ/เงื่อนไข
- แสดงประวัติการประมูลในบัญชีผู้ใช้
- ตั้งเวลาเริ่มประมูลล่วงหน้าได้ไม่เกิน 30 วัน
- รายการสินค้าใช้ปุ่ม “เข้าร่วมประมูล” และมีห้องประมูล
- ห้องประมูลมีรูป/วิดีโอ รายละเอียด จำนวนผู้เสนอราคา และแชท
- VIP Zone มี Credit ขั้นต่ำเข้าร่วม และ % Credit ประมูล
- คำนวณ Credit ผู้แพ้ VIP และแบ่ง 50% ให้เว็บไซต์
- Admin Dashboard แสดงจำนวนสินค้า รายการปิดประมูล และรายได้รายเดือน
- ค่าบริการเว็บไซต์จาก Credit: ผู้ขายทั่วไป 7%, ผู้ขาย VIP 4%

## Deploy

```bash
git init
git add .
git commit -m "advanced auction update"
git branch -M main
git remote set-url origin https://github.com/tokizawa1412/Bidmarket.git
git push -f origin main
```

ถ้า remote ไม่มี:
```bash
git remote add origin https://github.com/tokizawa1412/Bidmarket.git
git push -f origin main
```

จากนั้น Render > Manual Deploy > Deploy latest commit

บัญชีทดสอบ:
- demo / 1234 (Admin)
- seller / 1234 (VIP Seller)
