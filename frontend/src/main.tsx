import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

function hasSecureLockdown(): boolean {
  const globalWithLockdown = globalThis as typeof globalThis & { lockdown?: unknown; SES?: unknown };
  if (typeof globalWithLockdown.lockdown === "function") {
    return true;
  }
  if (typeof globalWithLockdown.SES === "object" && globalWithLockdown.SES !== null) {
    return true;
  }
  return false;
}

function renderLockdownWarning(root: HTMLElement, reason?: unknown) {
  const message = `
    <section style="font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; max-width: 680px; margin: 64px auto; padding: 32px; border-radius: 16px; background: #fef2f2; color: #7f1d1d; border: 1px solid #fecaca;">
      <h1 style="font-size: 24px; margin: 0 0 16px;">ไม่สามารถโหลดหน้าจอ WMS ได้</h1>
      <p style="margin: 0 0 12px; line-height: 1.6;">
        ระบบตรวจพบว่ามีการเปิดโหมดความปลอดภัย (Secure ECMAScript / Lockdown Mode) ที่ปิดกั้นการทำงานของ JavaScript ปกติ
        ทำให้แอปไม่สามารถเริ่มทำงานได้
      </p>
      <ul style="margin: 0 0 16px 24px; padding: 0; line-height: 1.6;">
        <li>หากใช้ Safari ให้ไปที่ <strong>System Settings → Privacy &amp; Security → Lockdown Mode</strong> แล้วปิดการใช้งาน</li>
        <li>หากใช้ Firefox/Chrome ให้ปิดส่วนขยายด้านความปลอดภัย (เช่น Secure/Lockdown/SES) หรือเพิ่ม <code>http://localhost:3005</code> และ <code>http://localhost:8000</code> ไว้ในรายการยกเว้น</li>
        <li>หลังจากปิดโหมดดังกล่าวแล้ว ให้รีโหลดหน้าจออีกครั้ง</li>
      </ul>
      <p style="font-size: 13px; color: #9f1239; margin: 0;">
        รายละเอียดเพิ่มเติม: <code>${String(reason ?? "detected secure lockdown environment")}</code>
      </p>
    </section>
  `;
  root.innerHTML = message;
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element – cannot bootstrap application");
}

if (hasSecureLockdown()) {
  renderLockdownWarning(rootElement, "globalThis.lockdown detected");
} else {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("lockdown") || message.includes("lexical declaration")) {
      console.error("SES/Lockdown detected during bootstrap:", error);
      renderLockdownWarning(rootElement, message);
    } else {
      throw error;
    }
  }
}
