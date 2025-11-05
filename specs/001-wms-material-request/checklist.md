# Checklist: ระบบร้องขอวัสดุและจัดส่ง (001-wms-material-request)

**วัตถุประสงค์**: ตรวจความพร้อมตั้งแต่เอกสาร, โครงสร้างระบบ, การทดสอบ จนถึงการส่งมอบ  
**วันที่สร้าง**: 2024-??-??  
**อ้างอิงฟีเจอร์**: `specs/001-wms-material-request/spec.md`

## ก่อนเริ่มพัฒนา

- [ ] CHK-001 ยืนยันว่า `spec.md`, `plan.md`, `tasks.md` ภาษาไทยและสอดคล้องกัน
- [ ] CHK-002 รัน `./.specify/scripts/bash/check-prerequisites.sh --json --require-tasks` ผ่านโดยไม่มี error
- [ ] CHK-003 ตั้งค่า Firebase Project + Service Account (ใช้ไฟล์เทมเพลต) และเตรียม Cloudflare R2 bucket
- [ ] CHK-004 แชร์แผนการเข้าถึง Role (Requester, Store Clerk, Logistics Lead, Admin)

## ระหว่างพัฒนา

- [ ] CHK-010 บันทึก mapping ของ Collections/Fields ที่ใช้ใน Firebase ลง `data-model.md`
- [ ] CHK-011 ตรวจสอบให้ทุก API มี unit/integration test อย่างน้อยหนึ่งไฟล์ใน `tests/integration` หรือ `tests/contract`
- [ ] CHK-012 ทดสอบการสแกน QR แบบ offline queue แล้ว sync คืน (จำลอง scenario)
- [ ] CHK-013 อัปเดต `quickstart.md` สำหรับการรัน backend, frontend, mobile-scanner
- [ ] CHK-014 บันทึก issue/risks ใน `plan.md` หรือ `quickstart.md` หากเจออุปสรรค

## ก่อนส่งมอบ

- [ ] CHK-020 รัน `ruff`, `black`, `isort`, `mypy`, `pytest --maxfail=1 --disable-warnings -q` และแนบผลสรุปใน PR
- [ ] CHK-021 ตรวจสอบ coverage ≥85% และบันทึกค่าใน PR template
- [ ] CHK-022 ทบทวน audit log ให้ครบทุกธุรกรรม (put-away, pick, adjustment, work order)
- [ ] CHK-023 แนบตัวอย่าง payload/หน้าจอ (request, picking queue, work order) ใน PR
- [ ] CHK-024 รัน `./.specify/scripts/bash/update-agent-context.sh` หลังอัปเดตเอกสาร
