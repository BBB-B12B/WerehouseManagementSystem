#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERT_DIR="${ROOT_DIR}/certs"
KEY_FILE="${CERT_DIR}/localhost-key.pem"
CERT_FILE="${CERT_DIR}/localhost.pem"

if ! command -v openssl >/dev/null 2>&1; then
  echo "❌ ไม่พบคำสั่ง openssl กรุณาติดตั้งก่อน (macOS ติดตั้งมากับระบบอยู่แล้ว)"
  exit 1
fi

mkdir -p "${CERT_DIR}"

if [[ -f "${KEY_FILE}" || -f "${CERT_FILE}" ]]; then
  echo "ℹ️ พบไฟล์ cert/key เดิมแล้ว หากต้องการสร้างใหม่ ให้ลบไฟล์ใน frontend/certs ก่อน"
  exit 0
fi

echo "🔐 กำลังสร้าง self-signed certificate สำหรับ localhost..."
openssl req \
  -x509 \
  -nodes \
  -newkey rsa:2048 \
  -days 365 \
  -keyout "${KEY_FILE}" \
  -out "${CERT_FILE}" \
  -subj "/C=TH/ST=Bangkok/L=Bangkok/O=WMS Dev/OU=Engineering/CN=localhost" \
  >/dev/null 2>&1

echo "✅ สร้างไฟล์เรียบร้อย:"
echo "  Key : ${KEY_FILE}"
echo "  Cert: ${CERT_FILE}"
echo ""
echo "⚠️ macOS จะแจ้งเตือนว่าใบรับรองไม่น่าเชื่อถือ ให้เปิดไฟล์ ${CERT_FILE} แล้วกด trust เป็น 'Always Trust'"
