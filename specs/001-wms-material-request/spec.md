# คุณลักษณะ: ระบบร้องขอวัสดุและการจัดการคลัง (WMS Material Request & Store Ops)

**Feature Branch**: `001-wms-material-request`  
**วันที่อัปเดต**: 2025-11-07  
**สถานะ**: กำลังพัฒนา  
**อินพุตล่าสุด**: ข้อเสนอแนะการใช้งานจริงเกี่ยวกับการจัดคิวรับของ (Receiving), การตรวจนับ (Counting), การจัดเก็บ (Putaway) และการกระจายโหลดรูปผ่าน Cloudflare Worker

---

## 1. เป้าหมาย

1. ให้ผู้ใช้หน้างานร้องขอวัสดุผ่านแคตตาล็อกที่เห็นสต็อกจริง พร้อมแนบไฟล์ได้ง่าย
2. ให้พนักงานคลังติดตามใบงานทีละขั้น (รับของ → ตรวจนับ → จัดเก็บ → ตรวจสอบ) โดยมีข้อมูลจากแผนผังและ Location ครบ
3. ลดการแตะต้อง R2 ตรง ๆ โดยใช้ Cloudflare Worker เป็น CDN ด้านหน้า
4. ลดความผิดพลาดด้านข้อมูลด้วย workflow, role-base access, และ audit log

## 2. ขอบเขต / นอกขอบเขต

| ขอบเขต | รายละเอียด |
| --- | --- |
| ✅ Request Flow | แคตตาล็อก, ตะกร้า, กำหนดวันใช้งาน, อนุมัติ |
| ✅ Store Ops Flow | Receiving jobs, Counting, Putaway, Audit |
| ✅ Media Delivery | Worker URL สำหรับรูปสินค้าและแผนที่ |
| ✅ Location Plan | ผูกตำแหน่งกับรายการ, ลบไฟล์เก่าทันทีเมื่ออัปโหลดใหม่ |
| ❌ Demand Forecast | ไม่รวมการพยากรณ์ความต้องการ |
| ❌ Automation Hardware | ไม่ครอบคลุมหุ่นยนต์หรือ IoT เพิ่มเติม |

## 3. Persona & Roles

| Persona | ความต้องการหลัก |
| --- | --- |
| Requester | ค้นหาของ, เห็นคงเหลือ, ส่งคำร้องพร้อมไฟล์ |
| Store Clerk | รับของ, ตรวจนับ, จัดเก็บ, อัปเดตสถานะไลน์ไอเท็ม |
| Logistics Lead | ตรวจสอบคำร้องทั้งหมด, อนุมัติ/ปฏิเสธ, มองเห็น workload |
| Auditor | ดูประวัติการรับของ, ตรวจสอบสต็อกย้อนหลัง |

## 4. End-to-End Experience

1. **Requester** เลือกสินค้าจากแคตตาล็อก → ส่ง Request → เอกสารไปอยู่ที่ Firestore `requests`
2. **Logistics Lead** อนุมัติ → Request ถูกแปลงเป็นใบงาน `receiving` (collection `warehouse_workflows/document/receiving`)
3. **Store Clerk** ใช้ Store Ops Dashboard:
   - สร้างใบรับ (Receiving Jobs) จากรายการส่งของ
   - เปิด job เพื่อสแกน/กรอกจำนวนจริงในขั้น Counting
   - เมื่อ matched → รายการถูกย้ายไป Putaway list ให้เลือกจัดเก็บ
4. **Putaway**: Clerk เลือกไลน์ที่พร้อมจัดเก็บ, เลือก Location ที่เหมาะสม (จาก Plan) และบันทึกการเคลื่อนไหว
5. **Audit**: ผู้ตรวจสอบดูประวัติ job, ภาพแผนที่, และ log การสแกน
6. **Media Handling**: รูปสินค้าหรือแผนที่ทุกใบนำเสนอผ่าน Worker URL (`https://wms-image-cache.<subdomain>.workers.dev/...`) เพื่อลด egress และเพิ่ม cache

## 5. Functional Requirements

### 5.1 Catalog & Request

- ต้องมีหมวดหมู่, สต็อกคงเหลือ, สถานะสินค้า (`active`)
- Requester สามารถแนบเอกสาร (PDF, ภาพ) ซึ่งจะถูกอัปโหลดไป R2 (prefix `requests/`) และตอบกลับเป็น Worker URL
- Request object ต้องมีสถานะ (`pending_review`, `approved`, `picking`, `completed`, `rejected`)
- ต้องมี validation: วันที่ต้องการ ≥ วันนี้, ปริมาณ > 0, SKU ต้อง `active`

### 5.2 Store Ops - Receiving

- Clerk สร้างใบงานรับเข้าผ่าน API `/inventory/receiving/jobs`
- Job structure:
  ```json
  {
    "id": "...",
    "display_code": "RD-1125-001",
    "lines": [
      {
        "line_id": "...",
        "item_id": "...",
        "sku": "...",
        "quantity_expected": 12,
        "count_status": "pending|matched|mismatch",
        "counted_quantity": 10
      }
    ]
  }
  ```
- ระบบต้อง fallback เป็น in-memory repository เมื่อ Firestore ใช้งานไม่ได้ในโลคัล
- เมื่อ Clerk ส่งผลตรวจนับ → ระบบอัปเดต `count_status` และบันทึกเวลา `updated_at`

### 5.3 Store Ops - Counting

- UI ต้องมี input จำนวน, ปุ่ม `ส่งผลตรวจนับ`, Badge แสดงสถานะ (`ครบ`, `ไม่ครบ`, `รอดำเนินการ`)
- ต้องสามารถแก้ไขผล (ปรับจำนวนแล้วกด `แก้ไขผล` → PUT API)
- ถ้าใส่จำนวนผิด (ค่าติดลบ/NaN) ให้แจ้งเตือน

### 5.4 Store Ops - Putaway (Concept ใหม่)

- รายการที่ `count_status = matched` แสดงใน card “พร้อมจัดเก็บ”
- ผู้ใช้เลือกหลาย line พร้อมกันได้ (checkbox หรือ click highlight)
- เมื่อกดยืนยัน:
  1. **สร้าง Putaway Job** แยก collection (`warehouse_workflows/document/putaway`) โดย 1 job อ้างอิง RD เดิมผ่าน `parent_receiving_job_id` และสามารถมีหลาย line (`receiving_line_ids[]`)
  2. กรอก Location/ปริมาณ/หมายเหตุ แล้ว `สร้างใบงานจัดเก็บ` (หรือเพิ่มเข้า job ที่ open อยู่ถ้ามี)
  3. job มีฟิลด์ `display_code (PW-xxxx)`, `status (open|in_progress|completed|cancelled)`, `assignee`, `movements[]` (location_id, quantity, timestamp)
  4. RD line เก็บ reference `putaway_job_ids[]` เพื่อ track ว่า line ถูกแตกไปกี่ job แล้ว
- เมื่อ Clerk ทำครบ กด `บันทึกการจัดเก็บ` → ปิด Putaway Job, log movement, และอัปเดต RD line เป็น `stored`
- สามารถสร้างหลาย Putaway Job จาก RD เดียวเพื่อแบ่งงาน/ต่างกะได้
- รายการ mismatch ต้องมีปุ่ม `แจ้งตรวจสอบ` (ส่งไป queue อื่น)

#### 5.4.1 Putaway Worker Console (แรงงาน)

- เมื่อหัวหน้า “สร้างใบงานจัดเก็บ” แล้ว งานจะไปคิวแรงงาน (status `open`) โดยแสดงรายการย่อย (SKU, จำนวนที่ต้องเก็บ, location ที่แนะนำ)
- แรงงานเปิดรายการ → Popup ดำเนินการ:
  1. **Scan/เลือกตำแหน่ง**: รองรับทั้งการสแกน QR/Barcode location และ manual autocomplete (ค้นหาจาก master `locations`). ค่า default คือ `preferred_location_id`.  
  2. **แนบรูป**: ใช้กล้องอุปกรณ์เพื่อถ่ายรูปสินค้า/ตำแหน่งก่อนปิดงาน (อัปโหลดผ่าน `/storage/uploads` prefix `putaway/`).  
  3. **กรอกจำนวนจริง**: ระบุจำนวนที่นำเข้าพื้นที่ ณ ตอนนั้น; ระบบคำนวณยอดที่เหลือต้องเก็บบนใบงาน.
- Validation ก่อนบันทึก:
  - ถ้า location ที่ scan/เลือกไม่ตรงกับที่ใบงานกำหนด → แจ้งเตือน “Location ไม่ตรง” และมี reason field (required) หากเลือก “ยืนยันจัดเก็บ” ให้สร้าง movement พร้อม flag `location_mismatch = true`.
  - ถ้าจำนวนที่กรอก **มากกว่า** จำนวนที่เหลือใน job → แจ้งเตือน “เกินกว่าใบงาน ...” กดยืนยันต้องกรอกเหตุผล และ movement flag `quantity_mismatch = true`. RD line จะถูกทำเครื่องหมาย “จัดเก็บผิดปกติ - จำนวนไม่ตรงกับใบงาน”.
  - ถ้าจำนวนที่กรอก **น้อยกว่า** จำนวนที่เหลือ → ยอมให้บันทึกแต่ job ยังไม่ปิด (`status` ค้าง `in_progress`). UI แสดงยอดคงเหลือ เช่น “ต้องเก็บอีก 2 ชิ้น”.
- การบันทึก 1 ครั้ง = append movement (location, quantity, unit, note, flags) และแนบรูปไว้กับ movement record.
- เมื่อยอดสะสมของ movement ต่อ line >= จำนวน job (หรือเกิน) → worker console อนุญาตให้ “ปิดใบงาน”:
  - ถ้าไม่มี flag ผิดปกติ → status `completed`, RD line `putaway_status = stored`.
  - ถ้ามี flag → ปิด job พร้อม `anomaly_report` (location mismatch, quantity mismatch) เพื่อให้หัวหน้าดูบน Dashboard
- ประวัติบนหน้าหัวหน้าจะแสดงรูป, location จริง, note, flag เพื่อใช้ตรวจสอบภายหลัง

### 5.5 Warehouse Map & Location Plan

- การอัปโหลด/แก้ไขแผนที่ (`/inventory/maps`) ต้องลบไฟล์ภาพเก่าใน R2 เมื่อมีรูปใหม่หรือเมื่อลบแผนที่
- ในฐานข้อมูลเก็บเฉพาะ key เช่น `inventory-maps/<timestamp>-....png`
- รายการ API คืนค่า Worker URL ผ่าน `build_public_url`
- แต่ละ map ต้องเก็บ polygon points (Normalized 0..1) และ allowed item ids
- Map area ที่ bind กับ location จะอ้างอิง `location_id` จาก master เสมอ (ห้าม free-text)
- ถ้า location ถูกย้ายไป map ใหม่ ให้ clear ค่า allowed item ids ที่เก่าตามตัวเลือกของผู้ใช้
- master `locations` ต้องมีฟิลด์ `allowed_item_ids` (list ของ item_id) เพื่อให้ backend/putaway ใช้ตรวจสอบ และถือเป็นแหล่งข้อมูลหลัก; Map Editor ต้องอ่านรายการนี้มาแสดง และเมื่อแก้ไขจากผังให้ส่งกลับมาปรับใน `locations` อัตโนมัติ

#### 5.5.1 Legacy Location Set (Seed Data)

ต้อง "เอา location เดิม" ที่เคยใช้งานในสภาพแวดล้อมเดโมไปบันทึกเป็นค่าเริ่มต้นใน `locations` เพื่อให้ทีมหน้างานค้นหาได้ทันที คลังหลักจะเริ่มด้วยรายการต่อไปนี้ (capacity เป็นหน่วยชิ้นตาม volume ที่ประมาณไว้):

| ID | ชื่อ/คำอธิบาย | Zone / Aisle | Rack-Level-Bin | ความจุ | หมายเหตุ |
| --- | --- | --- | --- | --- | --- |
| `loc-a-01` | โซน A ชั้น R1L1 ช่อง B1 | A / 01 | R1-L1-B1 | 216,000 | ใกล้พื้นที่รับสินค้าด่วน |
| `loc-b-03` | โซน B ชั้น R2L3 ช่อง B4 | B / 03 | R2-L3-B4 | 520,000 | ควบคุมอุณหภูมิ |
| `loc-c-05` | โซน C ชั้น R3L2 ช่อง C2 | C / 05 | R3-L2-C2 | 315,000 | สินค้าขนาดกลาง |
| `loc-d-02` | โซน D ชั้น R4L1 ช่อง D1 | D / 02 | R4-L1-D1 | 864,000 | สินค้าหนัก ใช้โฟร์คลิฟต์ |
| `loc-b-07` | โซน B ชั้น R1L4 ช่อง B8 | B / 07 | R1-L4-B8 | 132,000 | อะไหล่สำรอง |
| `loc-e-01` | โซน E ชั้น R5L1 ช่อง E1 | E / 01 | R5-L1-E1 | 2,400,000 | สินค้าชิ้นใหญ่ กันพื้นที่พิเศษ |
| `loc-a-12` | โซน A ชั้น R2L5 ช่อง A9 | A / 12 | R2-L5-A9 | 268,125 | สินค้าตามฤดูกาล |

ข้อกำหนดเสริม:

- ฟิลด์ที่บันทึก: `name`, `building`, `zone`, `aisle`, `rack`, `level`, `bin`, `code`, `capacity`, `width_cm`, `depth_cm`, `height_cm`, `note`, timestamps
- UI แสดงผลต้องอ่านจาก API ไม่ใช่ demo array; demo ใช้เฉพาะ fallback เมื่อ Firestore ล่ม
- การอัปโหลด Plan ต้องแจ้งเตือนว่าหากเลือก location ที่มีอยู่แล้ว ระบบจะย้าย binding จาก map เดิมให้อัตโนมัติ

#### 5.5.2 Bulk Location Template (Download / Upload)

- ปุ่ม `ดาวน์โหลด Template` (CSV หรือ XLSX) ต้องอยู่ในกล่อง "สร้างตำแหน่งจัดเก็บ" เดียวกับฟอร์มเดี่ยว ชื่อไฟล์เช่น `locations-template.csv`
- คอลัมน์ขั้นต่ำ: `name, building, zone, aisle, rack, level, bin, width_cm, depth_cm, height_cm, capacity, note` (ไม่เปิดให้ระบุ `code` เอง)
- ระบบเป็นผู้สร้าง `code` ให้อัตโนมัติจาก Zone/Rack/Level/Bin ตามกฎเดียวกับฟอร์มทีละรายการ – เพื่อให้ naming consistent และป้องกันผู้ใช้กำหนดเอง
- ปุ่ม `อัปโหลด Location (Template)` รับไฟล์เดียวกัน ตรวจสอบ header ก่อน ถ้าผิดให้แจ้งเตือนพร้อมลิสต์คอลัมน์ที่ต้องมี
- หลังกดอัปโหลด:
  1. ระบบคำนวณ `code` ของแต่ละแถว แล้วแยกข้อมูลที่รหัสตรงกับของเดิมออกมาแสดงใน modal ยืนยัน (รายการเป็นตารางพร้อมกล่องเลือก):  
     - มี checkbox รายการต่อแถว  
     - มี `Select all` สำหรับเลือกตกลงทั้งหมด หรือเลือก none  
     - ปุ่ม `ตกลง` = อัปเดตข้อมูลเดิมทับด้วยแถวใหม่  
     - ปุ่ม `ยกเลิก` = ข้ามทุกแถวที่ถูกเลือก (ระบบยังสามารถเพิ่มแถวอื่นที่ไม่ซ้ำ)
  2. ข้อมูลที่คำนวณแล้วไม่ซ้ำให้สร้าง Location ใหม่ทันที
- แสดงสรุปผลหลัง import: จำนวนที่เพิ่มใหม่, จำนวนที่อัปเดต, จำนวนที่ถูกข้าม
- ต้องรองรับไฟล์ใหญ่ระดับ 500 แถว/ครั้ง และใช้ background task (async job + toast แจ้ง progress) เพื่อไม่ล็อก UI
- UI Location Manager ต้องมีการ์ดเป็นมุมมองหลัก และปุ่มเปิด modal "มุมมองตาราง" สำหรับจัดการรวม พร้อมฟิลด์ multi-select เลือก `allowed_item_ids` (search + tag) ทำงานเหมือน Map Editor เพื่อให้ผู้ใช้แก้ไขสินค้าที่อนุญาตได้โดยไม่ต้องเปิดผัง

### 5.6 Media & Worker CDN

- R2 config ใน `.env`:
  ```
  R2_PUBLIC_BASE_URL=https://wms-image-cache.<subdomain>.workers.dev
  ```
- `CloudflareR2Client.build_public_url(key)` ต้องเชื่อมไป Worker
- Worker ต้อง bind R2 bucket (`werehosemanagementsystem`) และ cache 3600s (configurable)
- เมื่อลบหรืออัปโหลดซ้ำ, backend ต้องเรียก `delete_object` เพื่อลบไฟล์เก่า

## 6. Non-Functional Requirements

| หมวด | รายละเอียด |
| --- | --- |
| Performance | หน้า Store Ops ต้องโหลด job+maps ≤ 3 วินาทีบนเครือข่ายภายใน |
| Availability | API อัปโหลดไฟล์/สร้าง job ต้องรองรับ retry; ถ้า Firestore ล่ม ให้แจ้งข้อความภาษาไทย |
| Security | ตรวจสิทธิ์ role (`requester`, `store_clerk`, `admin`, `logistics_lead`) ทุก endpoint |
| Observability | บันทึก event เช่น create_job, update_count, putaway_action |

## 7. Data Model / Collections

### Firestore

- `requests` – ข้อมูลคำร้อง
- `warehouse_workflows/document/receiving` – ใบงาน workflow
- `warehouse_workflows/document/putaway` – ใบงานจัดเก็บ (อ้างอิง RD และเก็บสถานะการจัดเก็บราย job)
- `warehouse_maps` – แผนที่คลัง + areas
- `locations` – master data ของตำแหน่งจัดเก็บ (ใช้ร่วมกับ map และ putaway)
- `categories`, `items` – แคตตาล็อกสินค้า

### Cloudflare R2

| Prefix | ใช้สำหรับ |
| --- | --- |
| `catalog-items/` | รูปสินค้า (thumbnail) |
| `inventory-maps/` | ไฟล์แผนผัง |
| `requests/` | ไฟล์แนบคำร้อง |

## 8. API Checklist

- `[POST] /catalog/items` – คืน image_url เป็น Worker URL เมื่อมีรูป
- `[POST] /storage/uploads` – ใช้ `build_public_url`
- `[POST|PUT|DELETE] /inventory/maps` – ลบไฟล์เก่าเมื่อมีรูปใหม่หรือลบผัง
- `[POST|PUT|DELETE] /inventory/receiving/jobs` – ตาม workflow
- `[GET|POST|PUT|PATCH] /inventory/putaway/jobs` – สร้าง/อัปเดตสถานะ Putaway Job (อ้างอิง RD และ line ที่เกี่ยวข้อง)
- `[GET] /inventory/maps` – ส่ง Worker URL ใน `image_url`
- `[GET|POST|PUT|DELETE] /inventory/locations` – บริหาร master location และลบไฟล์ plan เดิมถ้ามีการแนบใหม่ผ่าน upload API

## 9. UX Notes

- Putaway cards: clickable, แสดงรูป thumbnail, SKU, job code, quantity matched, Status tag
- Counting table: ปุ่มเดียว (`ส่งผลตรวจนับ/แก้ไขผล`) + badge เด่น
- Map upload modal: แจ้งว่าการอัปโหลดใหม่จะลบไฟล์เก่าโดยอัตโนมัติ
- Media URLs ทั้งระบบต้องเป็น HTTPS จาก Worker เพื่อหลีกเลี่ยง CORS/caching
- การอัปโหลดภาพ (คำร้อง, แผนที่, หลักฐาน putaway) ต้องย่อภาพก่อนเก็บ: ด้านยาวสุดไม่เกิน 1600px, JPEG/WEBP quality ~75, PNG optimize; ถ้าแปลงไม่ได้ให้เก็บไฟล์เดิมเพื่อป้องกันข้อมูลเสียหาย

## 10. Migration / Outstanding Tasks

1. **Media Migration**: เขียนสคริปต์ batch อัปเดต image_url เดิม (R2 URL) ให้เป็น Worker base เพื่อให้ข้อมูลเก่าแสดงผลผ่าน CDN
2. **Putaway Action**: ออกแบบ API & UI สำหรับ "เลือกและจัดเก็บ" (ยังไม่มี implementation)
3. **Audit Log**: เก็บ log ทุก action ใน collection `audit_logs` + ดูได้จากหน้า Audit
4. **Notification**: ยังไม่ได้ออกแบบการแจ้งเตือนเมื่อ mismatch หรือ request รออนุมัติ

---

เอกสารฉบับนี้เป็น baseline สำหรับทีม dev/UX/QA เพื่อนำไปออกแบบหน้าจอและ API เพิ่มเติม หากมีข้อมูลใหม่ให้ปรับปรุง spec ก่อนเริ่มงานเสมอ.
