import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import dayjs from "dayjs";

import { useCart } from "../hooks/useCart";
import { submitRequest, uploadAttachment } from "../services/api";
import type { Attachment } from "../types/catalog";

interface Props {
  onSuccess: (requestId: string) => void;
}

export function RequestCheckout({ onSuccess }: Props) {
  const { items, updateItem, removeItem, toPayload, clear } = useCart();
  const [formErrors, setFormErrors] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const mutation = useMutation({
    mutationFn: submitRequest,
    onSuccess: (data) => {
      clear();
      onSuccess(data.id);
    },
    onError: (error: unknown) => {
      setFormErrors(error instanceof Error ? error.message : "ไม่สามารถส่งคำร้องได้");
    },
  });

  async function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.files?.length) return;
    const uploaded: Attachment[] = [];
    for (const file of Array.from(event.target.files)) {
      uploaded.push(await uploadAttachment(file));
    }
    setAttachments((prev) => [...prev, ...uploaded]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requester_id = String(formData.get("requester_id") ?? "");
    const requester_name = String(formData.get("requester_name") ?? "");
    const department = String(formData.get("department") ?? "");
    const required_date = String(formData.get("required_date") ?? "");

    if (!requester_id || !requester_name || !department || !required_date) {
      setFormErrors("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    const requestItems = toPayload();
    if (!requestItems.length) {
      setFormErrors("กรุณาเลือกสินค้าอย่างน้อย 1 รายการก่อนส่งคำร้อง");
      return;
    }

    setFormErrors(null);
    mutation.mutate({
      requester_id,
      requester_name,
      department,
      required_date,
      note: String(formData.get("note") ?? ""),
      attachments,
      items: requestItems,
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">รายการวัสดุที่ร้องขอ</h3>
            <p className="text-xs text-slate-500">
              ปรับจำนวนหรือหมายเหตุสำหรับแต่ละรายการ ก่อนยืนยันการส่งคำร้อง
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            {items.length} รายการ
          </span>
        </header>

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            ยังไม่มีสินค้าในคำร้อง โปรดกลับไปเลือกสินค้าและเพิ่มเข้าตะกร้าก่อน
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">สินค้า</th>
                  <th className="px-3 py-2">คงเหลือ</th>
                  <th className="px-3 py-2">จำนวนที่ต้องการ</th>
                  <th className="px-3 py-2">หมายเหตุ</th>
                  <th className="px-3 py-2 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {items.map(({ item, quantity, note }) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">SKU {item.sku}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-slate-500">
                      คงเหลือ {item.stock_on_hand} {item.unit}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="number"
                        min={1}
                        max={item.stock_on_hand}
                        value={quantity}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          const safeQuantity = Number.isFinite(next)
                            ? Math.max(1, Math.min(item.stock_on_hand, next))
                            : 1;
                          updateItem(item.id, safeQuantity, note);
                        }}
                        className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <input
                        type="text"
                        value={note ?? ""}
                        placeholder="ระบุหมายเหตุ (ถ้ามี)"
                        onChange={(event) => updateItem(item.id, quantity, event.target.value)}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3 align-top text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-xs font-semibold text-red-500 hover:text-red-600"
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          รหัสผู้ร้องขอ
          <input name="requester_id" className="rounded-md border border-slate-200 px-3 py-2" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ชื่อผู้ร้องขอ
          <input name="requester_name" className="rounded-md border border-slate-200 px-3 py-2" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          หน่วยงาน/โครงการ
          <input name="department" className="rounded-md border border-slate-200 px-3 py-2" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          วันที่ต้องการรับของ
          <input
            name="required_date"
            type="date"
            min={dayjs().format("YYYY-MM-DD")}
            className="rounded-md border border-slate-200 px-3 py-2"
            required
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        หมายเหตุเพิ่มเติม
        <textarea name="note" rows={3} className="rounded-md border border-slate-200 px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        แนบไฟล์อ้างอิง (ถ้ามี)
        <input type="file" multiple onChange={handleAttachmentChange} />
        <span className="text-xs text-slate-500">ระบบจะอัปโหลดขึ้น Cloudflare R2 อัตโนมัติ</span>
      </label>

      {attachments.length ? (
        <ul className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          {attachments.map((file) => (
            <li key={file.key}>{file.file_name}</li>
          ))}
        </ul>
      ) : null}

      {formErrors ? <p className="text-sm text-red-500">{formErrors}</p> : null}

      <button
        type="submit"
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        disabled={mutation.isLoading || items.length === 0}
      >
        {mutation.isLoading ? "กำลังส่งคำร้อง..." : items.length === 0 ? "เพิ่มสินค้าเพื่อส่งคำร้อง" : "ส่งคำร้อง"}
      </button>
    </form>
  );
}
