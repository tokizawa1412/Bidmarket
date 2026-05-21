# Deploy เวอร์ชัน Sidebar/Social Complete

เวอร์ชันนี้รวม:
- แถบด้านซ้าย
- บัญชีผู้ใช้ + รูปโปรไฟล์
- กระเป๋าเงินแบบละเอียด
- รายการที่สนใจ + ปุ่มหัวใจ
- สนทนา ส่งข้อความ/รูปภาพ
- พื้นหลังเว็บประมูล
- render.yaml สำหรับ Render Free ไม่มี disk

## อัปโหลดทับ GitHub

เปิด CMD ในโฟลเดอร์นี้ แล้วพิมพ์:

```bash
git init
git add .
git commit -m "sidebar social render ready"
git branch -M main
git remote set-url origin https://github.com/tokizawa1412/Bidmarket.git
git push -f origin main
```

ถ้า `git remote set-url` แจ้งว่าไม่มี origin ให้ใช้:

```bash
git remote add origin https://github.com/tokizawa1412/Bidmarket.git
git push -f origin main
```

หลัง Push แล้ว ไป Render แล้วกด Manual sync / Manual Deploy latest commit
