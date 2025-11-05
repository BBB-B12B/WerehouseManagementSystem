# Quickstart: ระบบร้องขอวัสดุและจัดส่ง (001-wms-material-request)

## เตรียมสภาพแวดล้อม

1. **Python 3.11** – แนะนำใช้ `conda` หรือ `pyenv`
2. **Node.js 18+** พร้อม npm
3. **Expo CLI** (`npm install -g expo-cli`) หากต้องการรัน mobile scanner
4. Cloud Service Secret:
   - `config/firebase.template.json` → คัดลอกเป็น `config/firebase.json` และกรอกข้อมูลจริง
   - `config/cloudflare-r2.template.env` → สร้างไฟล์ `.env` จากค่าเทมเพลต

> ⚠️ หากอยู่ในเครือข่ายจำกัด ให้ตั้งค่า proxy สำหรับ `pip` และ `npm` ก่อนรันคำสั่งติดตั้ง

## Backend (FastAPI)

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --default-timeout=120 --no-cache-dir -r requirements.txt

# รันเซิร์ฟเวอร์
PYTHONPATH=. uvicorn src.main:app --reload
```

- Swagger: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

เปิดเบราว์เซอร์ที่ http://localhost:5173 เพื่อสลับโหมด Requester / Store Ops / Logistics

## Mobile Scanner (Expo)

```bash
cd mobile-scanner
npm install
npx expo start
```

ใช้ Expo Go สแกน QR หรือรันบน Emulator เพื่อทดสอบ workflow สแกน QR + เช็กลิสต์โหลดของ

## Docker Compose (backend อย่างเดียว)

```bash
docker compose up --build
```

⚠️ โปรเจกต์ frontend และ mobile ยังต้องติดตั้งด้วย npm ตามขั้นตอนด้านบน

## ชุดทดสอบและ Coverage

```bash
# Backend
PYTHONPATH=. coverage run -m pytest && coverage xml
coverage report --fail-under=85

# Frontend
cd frontend
npm run lint && npm run test -- --coverage

# Mobile (Jest)
cd mobile-scanner
npm test -- --coverage
```

> หากติดตั้ง dependency ไม่ได้เพราะไม่มีเน็ต ให้จดบันทึกไว้ใน `NETWORK_RECOVERY.md` และรันซ้ำเมื่อพร้อม

## ทรัพยากรเพิ่มเติม

- Task list: `specs/001-wms-material-request/tasks.md`
- แผนงาน: `specs/001-wms-material-request/plan.md`
- เช็กลิสต์: `specs/001-wms-material-request/checklist.md`
- บันทึก security/performance: `specs/001-wms-material-request/security-performance.md`
