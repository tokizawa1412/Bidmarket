# Deploy BidMarket ขึ้น Render

โปรเจกต์นี้เตรียมไฟล์สำหรับ Deploy แล้ว:
- `render.yaml`
- `package.json` พร้อม Node 22
- ตั้งค่า `DATA_DIR` และ `UPLOAD_DIR` สำหรับเก็บฐานข้อมูล/ไฟล์อัปโหลด
- ใช้ฐานข้อมูล JSON ที่ `data/db.json` สำหรับทดสอบ

## วิธี Deploy แบบง่าย

### 1) แตกไฟล์ ZIP นี้
แตกไฟล์ `BidMarket-Render-Ready.zip`

### 2) ทดสอบบนเครื่องก่อน

```bash
npm install
npm start
```

เปิด:

```text
http://localhost:3000
```

บัญชี Admin:

```text
demo / 1234
```

### 3) อัปโหลดขึ้น GitHub

เปิด CMD ในโฟลเดอร์นี้ แล้วพิมพ์:

```bash
git init
git add .
git commit -m "deploy bidmarket"
git branch -M main
```

สร้าง Repository ใหม่ใน GitHub แล้วใช้คำสั่งที่ GitHub ให้ เช่น:

```bash
git remote add origin https://github.com/USERNAME/bidmarket.git
git push -u origin main
```

### 4) Deploy บน Render

1. เข้า Render
2. กด `New +`
3. เลือก `Blueprint`
4. เลือก Repository นี้
5. Render จะอ่านไฟล์ `render.yaml`
6. กด Deploy

หลัง Deploy เสร็จ Render จะให้ URL เช่น:

```text
https://bidmarket.onrender.com
```

## สำคัญ

ระบบนี้พร้อมให้คนอื่นทดสอบผ่านอินเทอร์เน็ตได้ แต่ถ้าจะเปิดใช้งานจริงแบบธุรกิจ ควรเปลี่ยนฐานข้อมูลเป็น PostgreSQL และเก็บไฟล์อัปโหลดบน Cloud Storage เช่น S3/R2 เพราะ JSON เหมาะกับเดโมและทดสอบเท่านั้น

## ปัญหาที่อาจเจอ

ถ้า Render แจ้งว่า plan free ใช้ Disk ไม่ได้ ให้ลบส่วนนี้ออกจาก `render.yaml`:

```yaml
disk:
  name: bidmarket-data
  mountPath: /var/data
  sizeGB: 1
```

แต่ข้อมูลและไฟล์อัปโหลดอาจหายเมื่อระบบ restart ถ้าไม่มี Persistent Disk
