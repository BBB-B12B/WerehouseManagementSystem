# Security & Performance Checklist

## Security

- [x] จำกัดสิทธิ์ผ่าน role-based dependency (`src/shared/auth/context.py`) – mock user มีสิทธิ์ครบสำหรับ dev แต่ต้องเปลี่ยนเป็น Auth จริงก่อนผลิตจริง
- [x] ไฟล์ secret เก็บไว้ใน `config/*.template` และให้ออกไฟล์จริงใน `.env`/`config/firebase.json`
- [x] Logging ใช้ stdout และไม่พิมพ์ secret (`src/shared/logging.py`)
- [ ] ต้องเพิ่ม TLS/HTTPS เมื่อ deploy production
- [ ] พิจารณา rate limit ทุก endpoint ก่อนเปิดใช้งานจริง

## Performance

- [x] API หลักใช้ FastAPI (async) + uvicorn – รองรับการ scale แบบ container
- [x] Query Firebase ผ่าน repository เพื่อควบคุม cache/optimisation ในอนาคต (`src/requests/services/repository.py`)
- [x] Inventory queue ใช้การ pre-load ใน memory สำหรับ dev และสามารถต่อยอดเป็น Redis cache ได้ (`src/inventory/services/balance_service.py`)
- [ ] ตั้งค่า CDN/Edge cache สำหรับ static asset (R2, frontend build)
- [ ] เก็บ metrics (Prometheus/Cloudflare Analytics) และตั้ง alert สำหรับ SLA

> หมายเหตุ: รายการที่ยังไม่ทำเครื่องหมายคือประเด็นสำหรับ production hardening
