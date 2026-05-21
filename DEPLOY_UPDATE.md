# วิธีอัปเดตขึ้น Render

1. แตก ZIP นี้
2. เปิด CMD ในโฟลเดอร์นี้
3. ใช้คำสั่ง:

```bash
git init
git add .
git commit -m "fix sidebar and user header"
git branch -M main
git remote add origin https://github.com/tokizawa1412/Bidmarket.git
git push -f origin main
```

ถ้า remote มีอยู่แล้ว:

```bash
git remote set-url origin https://github.com/tokizawa1412/Bidmarket.git
git push -f origin main
```

4. ไป Render > bidmarket > Manual Deploy > Deploy latest commit

หลัง Deploy สำเร็จ:
- จะเห็นแถบเมนูด้านซ้าย
- หลังล็อกอิน ปุ่มเข้าสู่ระบบจะหายไป
- ด้านขวาบนจะแสดงรูปโปรไฟล์และชื่อผู้ใช้
