# แผนการพัฒนา: ระบบร้องขอวัสดุและจัดส่ง (WMS Material Request & Dispatch)

**Branch**: `001-wms-material-request` | **วันที่**: 2024-??-?? | **Spec**: `specs/001-wms-material-request/spec.md`  
**อินพุต**: ข้อกำหนดจาก `specs/001-wms-material-request/spec.md`

## สรุป

- เปิดประสบการณ์เหมือน e-commerce สำหรับการร้องขอวัสดุ ใช้ Firebase เป็นแหล่งข้อมูลหลักพร้อม Cloudflare R2 สำหรับไฟล์แนบ
- เชื่อมโยงคำร้องกับข้อมูล Location/Inventory เพื่อให้คลังเห็นคิวหยิบได้แบบเรียลไทม์ และรองรับการสแกน QR ในการปรับสต็อก
- สร้าง workflow จัดรอบรถและใบงานเพื่อควบคุมการส่งของและติดตามสถานะจนถึงส่งมอบ
- จัดเตรียมสภาพแวดล้อม container-based (Docker/Docker Compose) เพื่ออำนวยความสะดวกในการพัฒนาและ deploy

## บริบททางเทคนิค

**ภาษา/เวอร์ชัน**: Python 3.11 สำหรับ backend (FastAPI), TypeScript/React 18 สำหรับ frontend kiosk, Expo SDK 50 (React Native 0.73) สำหรับ mobile scanner  
**ไลบรารีหลัก**: FastAPI, Pydantic, Firebase Admin SDK, FireO/Firebase REST, React Query, React Router, Expo Camera  
**ที่เก็บข้อมูล**: Firebase Firestore (collection-based), Cloudflare R2 สำหรับไฟล์สื่อ, Redis (ทางเลือกสำหรับ cache)  
**การทดสอบ**: pytest + httpx สำหรับ backend, React Testing Library + Playwright (E2E) สำหรับ frontend, jest-expo สำหรับ mobile, moto-like mock สำหรับ R2  
**แพลตฟอร์มเป้าหมาย**: Backend บน Linux container (Docker), Frontend บน Web + PWA, มือถือ Android/iOS สำหรับสแกน  
**เป้าหมายประสิทธิภาพ**: latency API < 300ms p95, รองรับ 200 ผู้ใช้พร้อมกัน, sync สต็อกไม่หน่วงเกิน 5s  
**ข้อจำกัด**: ต้องทำงานได้แม้เครือข่ายภายในไม่นิ่ง → รองรับ offline queue ฝั่งสแกน, รหัส Location ต้องไม่ซ้ำ  
**ขนาด/ขอบเขต**: สต็อก 10k SKU, ประมาณ 50 Location/Zone, Request ~500/สัปดาห์, Work Order ~50/สัปดาห์

## ตรวจสอบ Constitution

- ไม่มีข้อขัดแย้งกับข้อบังคับปัจจุบัน ใช้โครงสร้าง service-based ใน `src/<domain>/` ตามแนวทาง

## โครงสร้างโปรเจกต์

```text
specs/001-wms-material-request/
├── spec.md
├── plan.md
├── checklist.md
└── tasks.md
```

```text
src/
├── inventory/
│   ├── schemas/
│   ├── services/
│   └── routers/
├── requests/
│   ├── schemas/
│   ├── services/
│   └── routers/
├── logistics/
│   ├── schemas/
│   ├── services/
│   └── routers/
└── shared/
    ├── firebase/
    ├── storage/
    └── qr/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   └── services/
└── tests/

mobile-scanner/
├── src/
│   ├── screens/
│   ├── services/
│   └── utils/
└── tests/

tests/
├── unit/
├── integration/
└── contract/
```

**โครงสร้างที่เลือก**: แยก backend/ frontend/ mobile-scanner ชัดเจนเพื่อลด coupling และจับงานตามโดเมน (inventory, requests, logistics) ให้ตรงกับ Testing matrix

## ระยะดำเนินการ

1. **Phase 0 – Research & Data Model**  
   - สรุป requirement Firebase collection, R2 bucket naming, มาตรฐาน QR  
   - ประเมิน SDK/ไลบรารีสำหรับ offline queue และการสแกน  
   - กำหนดภาพรวมการใช้ Docker/Docker Compose สำหรับ dev & deploy
2. **Phase 1 – Catalog & Request MVP**  
   - สร้าง schema `items`, `categories`, `requests`, `request_lines` บน Firebase  
   - พัฒนา API/Frontend สำหรับการค้นหา, ตะกร้า, ส่งคำร้อง พร้อมเกณฑ์อนุมัติพื้นฐาน  
3. **Phase 2 – Inventory & Location Mapping**  
   - ลงทะเบียน Location/Zone, สร้างบริการ sync สต็อก, บอร์ด Store Ops  
   - เขียน integration tests กับข้อมูล Location/Balance
4. **Phase 3 – QR Stock Transaction**  
   - พัฒนามือถือ/PWA สำหรับสแกน, workflow put-away/pick, audit log  
   - รองรับ offline queue และการปรับ stock movement
5. **Phase 4 – Dispatch & Work Orders**  
   - ดีไซน์ work order schema, planner UI, สถานะใบงาน  
   - รายงานสรุปการจัดส่งและการผูกกับ Request Line
6. **Phase 5 – Analytics & Alerting (Optional)**  
   - Dashboard KPIs, การแจ้งเตือนอัตโนมัติ (Slack/Email)

## การติดตามความซับซ้อน

| ประเด็น | เหตุผล | ทางเลือกที่พิจารณาแล้วไม่ใช้ |
|---------|--------|---------------------------------|
| แยก mobile-scanner project | UI สำหรับสแกนต้องเข้าถึงกล้องและทำงาน offline ซึ่ง React web ไม่สะดวก | ใช้เว็บเพียว ๆ แต่ปัญหา permission กล้องและ offline |
