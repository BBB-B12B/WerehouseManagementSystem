# Tasks: ระบบร้องขอวัสดุและจัดส่ง (001-wms-material-request)

**อินพุต**: เอกสาร `spec.md` และ `plan.md` ในโฟลเดอร์เดียวกัน  
**ข้อกำหนดเบื้องต้น**: ปรับโครงสร้างโปรเจกต์และตั้งค่าคอนฟิกพื้นฐานให้พร้อมก่อนเริ่ม User Story ใด ๆ

## รูปแบบ: `[ID] [P?] [Story] รายละเอียด`

- `[P]`: สามารถทำขนานได้ (ไม่มีไฟล์ชนกัน)  
- `[Story]`: ระบุว่าเกี่ยวข้องกับ User Story ใด (US1, US2, US3, US4)  
- ระบุ path ให้ตรงกับโครงสร้างที่กำหนดในแผน

---

## Phase 0: เตรียมพื้นฐานระบบ (Blocking)

- [x] T000 [P] เตรียมโครงสร้างไดเรกทอรี `src/inventory`, `src/requests`, `src/logistics`, `src/shared`, `frontend`, `mobile-scanner`, `tests/*`
- [x] T001 ✅ ตั้งค่าโปรเจกต์ FastAPI + Poetry/pip พร้อม dependency พื้นฐาน (Firebase Admin, httpx, pydantic-settings)
- [x] T002 [P] ตั้งค่า React app + Vite/Next (เลือกหนึ่ง) พร้อม tailwind + React Query
- [x] T003 [P] สร้าง mobile-scanner โปรเจกต์ (Expo/React Native) พร้อมโมดูลสแกน QR
- [x] T004 ✅ ตั้งค่า lint/format/test pipeline (`black`, `isort`, `ruff`, `pytest`, `mypy`, `eslint`, `prettier`)
- [x] T005 [P] ✅ กำหนด environment config loader (`src/shared/config.py`) รองรับ Firebase/R2 template
- [x] T006 [P] ✅ เตรียม Dockerfile, docker-compose และ .dockerignore สำหรับ backend dev

**Checkpoint**: เสถียรภาพพื้นฐานพร้อม เริ่มพัฒนา User Story ได้

---

## Phase 1: US1 ขอวัสดุผ่านแคตตาล็อก (Priority P1)

**เป้าหมาย**: ผู้ใช้ requester ค้นหา/เพิ่มตะกร้า/ส่งคำร้องได้

- [x] T100 [US1] นิยาม schema Pydantic/Firebase สำหรับ `items`, `categories`, `requests`, `request_lines` ใน `src/requests/schemas/`
- [x] T101 [P][US1] สร้างบริการเชื่อม Firebase (`src/shared/firebase/client.py`) + repository สำหรับอ่าน/เขียนคำร้อง
- [x] T102 [US1] พัฒนา API router `src/requests/routers/catalog.py` (ค้นหาหมวด, รายการแนะนำ, รายละเอียดสินค้า)
- [x] T103 [US1] พัฒนา API router `src/requests/routers/request.py` (ตะกร้า, ส่งคำร้อง, แนบไฟล์ R2 placeholder)
- [x] T104 [US1] ตั้งค่า Cloudflare R2 service wrapper ใน `src/shared/storage/r2_client.py`
- [x] T105 [US1] สร้างหน้า React: `frontend/src/pages/CatalogPage.tsx`, `CartDrawer.tsx`, `RequestCheckout.tsx`
- [x] T106 [P][US1] เขียน unit tests ฝั่ง backend (`tests/unit/requests/test_request_service.py`)
- [x] T107 [US1] เขียน integration test ใช้ Firebase emulator/mock (`tests/integration/requests/test_submit_request.py`)
- [x] T108 [US1] เพิ่มฟอร์มสร้างสินค้าใหม่ (API + Modal) พร้อมเทส (`src/requests/routers/catalog.py`, `frontend/src/components/AddItemModal.tsx`, `tests/integration/requests/test_create_item.py`)
- [x] T109 [US1] รองรับแก้ไข/ลบสินค้า (PUT/DELETE API + UI icons) พร้อมเทส (`frontend/src/components/CartDrawer.tsx`, `tests/integration/requests/test_create_item.py`)

**ผลลัพธ์**: Requester ส่งคำร้องพร้อมไฟล์แนบได้, Firebase มีข้อมูลถูกต้อง

---

## Phase 2: US2 หน้าจอ Store Ops ดูคิวหยิบ (Priority P1)

**เป้าหมาย**: เจ้าหน้าที่คลังเห็นรายการที่ต้องหยิบและตำแหน่งจัดเก็บ

- [x] T200 [US2] นิยาม schema `inventory_locations`, `inventory_balances` ใน `src/inventory/schemas/`
- [x] T201 [US2] พัฒนา service sync สต็อกจาก Firebase → memory cache (`src/inventory/services/balance_service.py`)
- [x] T202 [US2] พัฒนา API `src/inventory/routers/picking_queue.py` รวมคำร้องอนุมัติพร้อม Location
- [x] T203 [P][US2] หน้าจอ React `frontend/src/pages/StoreOpsDashboard.tsx` แสดงคิวหยิบ + แผนผัง location
- [x] T204 [US2] Integration test ตรวจสอบการผูก Request กับ Location (`tests/integration/inventory/test_picking_queue.py`)
- [x] T205 [US2] เพิ่ม role-based access control ใน `src/shared/auth` (mock ในระยะแรก)

**ผลลัพธ์**: เจ้าหน้าที่คลังเห็นงานและตำแหน่งหยิบครบถ้วน

---

## Phase 3: US3 สแกน QR เพื่อรับเข้า/ตัดสต็อก (Priority P2)

**เป้าหมาย**: ธุรกรรม put-away และ picking ผ่านมือถือ/PWA

- [x] T300 [US3] ออกแบบ schema `stock_movements` + audit trail ใน `src/inventory/schemas/movement.py`
- [x] T301 [US3] สร้างบริการ `src/inventory/services/movement_service.py` สำหรับ validate + บันทึก transaction
- [x] T302 [US3] API `src/inventory/routers/qr_transactions.py` รองรับ put-away/pick, offline queue webhook
- [x] T303 [P][US3] ฟีเจอร์ mobile-scanner: หน้าจอ `ScanLocationScreen`, `ScanItemScreen`, `ConfirmTransactionScreen`
- [x] T304 [US3] รองรับ offline queue/ retry ใน mobile-scanner (`src/services/offlineQueue.ts`)
- [x] T305 [US3] Integration test จำลองการสแกน (`tests/integration/inventory/test_qr_transactions.py`)
- [x] T306 [US3] Contract test QR API (`tests/contract/inventory/test_qr_transactions.py`)

**ผลลัพธ์**: สแกน QR แล้วสต็อกถูกอัปเดตและ audit trail ครบ

---

## Phase 4: US4 จัดรอบส่งและใบงาน (Priority P3)

**เป้าหมาย**: รวบรวมคำร้องเป็น Work Order ตามรอบรถ

- [x] T400 [US4] Schema `work_orders`, `work_order_tasks` ใน `src/logistics/schemas/`
- [x] T401 [US4] บริการจัดตาราง `src/logistics/services/work_order_planner.py` (เลือกคำร้องตาม route/vehicle)
- [x] T402 [US4] API `src/logistics/routers/work_orders.py` (สร้าง/แก้ไข/อัปเดตสถานะใบงาน)
- [x] T403 [P][US4] หน้า React `frontend/src/pages/WorkOrderPlanner.tsx` + รายงานสถานะ
- [x] T404 [US4] Mobile-scanner เพิ่มหน้า `LoadChecklistScreen` สำหรับเช็กของขึ้นรถ
- [x] T405 [US4] Integration test ตรวจสอบ state machine ใบงาน (`tests/integration/logistics/test_work_orders.py`)
- [x] T406 [US4] Contract test รายงานสถานะ (`tests/contract/logistics/test_work_order_status.py`)

**ผลลัพธ์**: ใบงานถูกสร้าง อัปเดตสถานะ และเชื่อมกับ Request Line ได้ครบ

---

## Phase 5: Cross-Cutting & ปรับปรุง

- [x] T500 ปรับปรุง logging/monitoring (`src/shared/logging.py`, Cloudflare analytics hook)
- [x] T501 [P] อัปเดต quickstart + README ให้ผู้ใช้ทดสอบระบบได้ (`specs/001-wms-material-request/quickstart.md`, `README.md`)
- [x] T502 [P] จัดทำ dashboard พื้นฐานใน `frontend/src/pages/AnalyticsOverview.tsx`
- [ ] T503 ตรวจสอบ coverage ≥85% (pytest + frontend tests + mobile tests) ⚠️ ติดขัดเครือข่ายระหว่างติดตั้ง dependency
- [x] T504 ทบทวน security/performance audit checklist (`specs/001-wms-material-request/security-performance.md`)

---

## 🚨 Network Connectivity Issue

**สถานะปัจจุบัน**: การติดตั้ง dependencies ล้มเหลวเนื่องจากปัญหาเครือข่าย (ENOTFOUND PyPI/npm registry)

**รายการที่รอการติดตั้ง**:
- `google-cloud-firestore` (Python backend)
- `dayjs` (Frontend)  
- `@react-native-async-storage/async-storage` (Mobile)

**การดำเนินการเมื่อเครือข่ายพร้อม**: ดู `NETWORK_RECOVERY.md` และรันสคริปต์ `./check-offline.sh`

**หมายเหตุ**: โครงสร้างและโค้ดทั้งหมดเสร็จสมบูรณ์แล้ว เหลือเพียงการทดสอบด้วย dependencies ที่ต้องการเครือข่าย
