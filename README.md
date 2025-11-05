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
