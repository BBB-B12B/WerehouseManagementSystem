# Warehouse Management System (WMS) - Material Request

A comprehensive warehouse management system built with FastAPI, React, and React Native, designed to handle material requests, inventory management, and logistics operations.

## Features

- Material request catalog and cart system
- Store operations picking queue management
- QR code scanning for inventory transactions
- Work order planning and dispatch scheduling
- Firebase integration for real-time data
- Cloudflare R2 for file storage
- Multi-platform support (Web + Mobile)

## Tech Stack

- **Backend**: FastAPI + Python 3.11
- **Frontend**: React + Vite + Tailwind CSS
- **Mobile**: React Native + Expo
- **Database**: Firebase Firestore
- **Storage**: Cloudflare R2
- **Authentication**: Firebase Auth

## Quickstart

สำหรับขั้นตอนละเอียด (ภาษาไทย) ดู `specs/001-wms-material-request/quickstart.md`

### One-command dev (UI + worker)

```bash
./scripts/run_ui_and_worker.sh
```
- รัน Vite dev server ของ frontend พร้อม worker สำหรับดึงข้อมูล (ค่าเริ่มต้นใช้ `python -m uvicorn src.main:app --reload`); ปรับคำสั่งได้ผ่าน env `FRONTEND_CMD` และ `WORKER_CMD`.
- กด Ctrl+C เพื่อหยุดทั้งคู่

## การใช้งานระบบ (Usage Overview)

1) เปิด Backend (`uvicorn src.main:app --reload`) พร้อม Frontend (`cd frontend && npm run dev`) และเลือกโหมดการใช้งานจาก UI (Requester / Store Ops / Logistics); ถ้าต้องการสแกน QR/บันทึก put-away ผ่านมือถือให้เปิด Expo (`cd mobile-scanner && npx expo start`).
2) เรียกดูเอกสาร API ที่ http://localhost:8000/docs เพื่อดูสคีมา/ตัวอย่าง payload ทุกจุดของระบบ

### โฟลว์หลักตามบทบาท

- **Requester (ร้องขอวัสดุ)**: เลือกสินค้าในแคตตาล็อก (เรียก `GET /api/catalog/categories|items`), ใส่จำนวนและวันที่ต้องการ ใช้ `/api/storage/uploads` เพื่ออัปโหลดไฟล์แนบ (เก็บใน Cloudflare R2 ผ่าน Worker URL) จากนั้นส่งคำร้องด้วย `POST /api/requests`; ข้อมูลถูกบันทึกลง Firestore collection `requests` (หรือ fallback in-memory เมื่อ `APP_ENV=local`).
- **Store Ops – Receiving & Counting**: สร้างใบงานรับของด้วย `POST /api/inventory/receiving/jobs` ใส่รายการ SKU/จำนวนคาดหวัง แล้วอัปเดตผลตรวจนับผ่าน `PUT /api/inventory/receiving/jobs/{id}` (ตั้ง `count_status` เป็น `pending|matched|mismatch` และบันทึกจำนวนจริง); ระบบจะป้องกันการแก้ไขโครงสร้างใบงานหลังมีการตรวจนับ/ผูก putaway แล้ว.
- **Putaway / จัดเก็บสินค้า**: เลือกไลน์ที่ตรวจนับแล้วจาก RD เพื่อสร้าง Putaway Job (`POST /api/inventory/putaway/jobs` ระบุ `parent_receiving_job_id` และ `receiving_line_ids`); แรงงานบันทึกการเคลื่อนย้ายทีละรายการผ่าน `PUT /api/inventory/putaway/jobs/{job_id}` โดยใส่ `movements` (location, qty, note, evidence) และอัปเดตสถานะ job (`open|in_progress|completed|cancelled`). ถ้าบันทึกผิดสามารถให้แอดมินลบ movement ด้วย `DELETE /api/inventory/putaway/jobs/{job_id}/movements/{movement_id}`.
- **Picking Queue & QR Scanner**: คิวหยิบสินค้าดึงจากคำร้องที่อนุมัติแล้วด้วย `GET /api/inventory/picking-queue` (รวม location แนะนำจาก balance mock); โมบาย/เว็บสแกน QR เพื่อเคลื่อนย้ายสต็อกผ่าน `POST /api/inventory/transactions/scan` โดยรองรับ `put_away` และ `pick` พร้อมตรวจยอดคงเหลือ/โควตาอนุมัติ.
- **Logistics Work Orders**: วางแผนใบงานขนส่ง/โหลดของด้วย `/api/logistics/work-orders` (list/create/update status) และอัปเดตสถานะ task รายสายงานผ่าน `PATCH /api/logistics/work-orders/{id}/tasks/{task_id}` เพื่อให้แดชบอร์ด Logistics เห็นความคืบหน้า.
- **Warehouse Map & Location Master**: จัดการตำแหน่งจัดเก็บด้วย `GET/POST/PUT/DELETE /api/inventory/locations` และแผนผังคลังด้วย `GET/POST/PUT/DELETE /api/inventory/maps`; เมื่ออัปโหลดผังใหม่ระบบลบไฟล์เก่าใน R2 อัตโนมัติและส่งคืน Worker URL ให้ UI.
- **ไฟล์แนบและสตอเรจ**: ทุกไฟล์ (คำร้อง, แผนผัง, หลักฐาน putaway) อัปโหลดผ่าน `/api/storage/uploads` โดยใส่ `prefix` ให้ถูกบริบท (`requests/`, `putaway/`, `inventory-maps/` เป็นต้น) แล้วใช้ `public_url` ที่ได้ไปผูกกับเอนทิตีอื่น ๆ; ไฟล์ภาพจะถูกย่อขนาด (ด้านยาวสุดไม่เกิน 1600px) และบีบอัดก่อนเก็บใน R2 เพื่อประหยัดแบนด์วิธ.

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Poetry (for Python dependency management)
- Conda (optional, for Python environment management)

### Backend Setup

1. Create and activate Python 3.11 environment:
   ```bash
   # Using conda (recommended)
   conda create -n wms-python311 python=3.11
   conda activate wms-python311
   
   # Or using venv
   python3.11 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   
   # Or using Poetry
   poetry install
   ```

3. Start development server:
   ```bash
   # Set PYTHONPATH to find src module
   PYTHONPATH=. uvicorn src.main:app --reload
   
   # Or using Poetry
   poetry run uvicorn src.main:app --reload
   ```

4. Run tests & coverage:
   ```bash
   PYTHONPATH=. coverage run -m pytest
   coverage report --fail-under=85
   ```

### Firebase Setup

1. Download the Firebase service account JSON forโปรเจกต์ `warehousemanagmentsystem-9f698`.
2. บันทึกไฟล์เป็น `config/firebase.json` (อย่า commit ขึ้น git) แล้วอัปเดตค่าตาม service account จริง
3. ตรวจสอบไฟล์ `.env` ให้ตั้งค่า `APP_ENV=staging`, `FIREBASE_PROJECT_ID=warehousemanagmentsystem-9f698`, `FIREBASE_CREDENTIALS=config/firebase.json`
4. รันสคริปต์ seed ข้อมูลตัวอย่าง (หมวดสินค้า, รายการ, แผนผังคลัง):
   ```bash
   PYTHONPATH=. python scripts/seed_firestore.py --force
   ```
   หากต้องการเก็บข้อมูลเดิมไว้ ให้ข้าม flag `--force`


### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```
   - หากต้องการทดสอบฟีเจอร์ที่ต้องใช้กล้อง/HTTPS (เช่น Putaway Worker Scanner) ให้สร้าง self-signed cert สำหรับ `localhost` (เลือกอย่างใดอย่างหนึ่ง):
     ```bash
     cd frontend
     # วิธีที่ 1: ใช้สคริปต์ openssl ที่เตรียมไว้
     ./scripts/generate-dev-cert.sh

     # วิธีที่ 2: ใช้ mkcert (แนะนำถ้าติดตั้งไว้)
     mkcert -install
     mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1
     
     # จากนั้นรัน dev server แบบ HTTPS
     npm run dev:https
     ```
     เมื่อ cert พร้อม Vite จะเสิร์ฟผ่าน `https://localhost:5173` ทำให้ Safari / Mobile Browser ขอสิทธิ์ใช้กล้องได้ตามปกติ (อย่าลืมเปิดไฟล์ cert แล้วตั้ง Trust = Always Trust ใน Keychain บน macOS)

4. Run lint/test/coverage:
   ```bash
   npm run lint
   npm run test -- --coverage
   npm run build
   ```

### Mobile Scanner Setup

1. Navigate to mobile-scanner directory:
   ```bash
   cd mobile-scanner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start Expo development server:
   ```bash
   npx expo start
   ```

4. Run unit tests:
   ```bash
   npm test -- --coverage
   ```

### Docker Setup

1. Build and run with Docker Compose:
   ```bash
   docker compose up --build
   ```
   - Backend API พร้อมที่ `http://localhost:8000`
   - เว็บ UI เสิร์ฟผ่าน Nginx ที่ `http://localhost:${FRONTEND_PORT:-3005}`

> ⚠️ หากเครื่องอยู่ในเครือข่ายปิด ให้ตั้งค่า proxy ก่อนรัน `pip install` หรือ `npm install`

### API Documentation

Once the backend server is running, visit:
- API docs: http://localhost:8000/docs
- Alternative docs: http://localhost:8000/redoc
- Health check: http://localhost:8000/health

### Available API Endpoints

- `GET /api/catalog/categories` - List all categories
- `GET /api/catalog/items` - List items (with optional category filter and search)
- `GET /api/catalog/summary` - Get catalog summary
- `POST /api/requests` - Create a new material request
- `GET /health` - Health check endpoint

## Project Structure

```
├── src/                    # Backend Python modules
│   ├── inventory/         # Inventory management
│   ├── requests/          # Material request handling
│   ├── logistics/         # Work orders and dispatch
│   └── shared/            # Common utilities
├── frontend/              # React web application
├── mobile-scanner/        # React Native mobile app
├── tests/                 # Test suites
└── specs/                 # Feature specifications
```

## Contributing

Please refer to the task list in `specs/001-wms-material-request/tasks.md` for current development priorities.

## License

MIT License
