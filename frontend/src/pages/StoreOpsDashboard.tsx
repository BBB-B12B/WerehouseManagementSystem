import { useQuery } from "@tanstack/react-query";

import { fetchPickingQueue } from "../services/api";
import type { PickingQueueResponse } from "../types/catalog";

export function StoreOpsDashboard() {
  const { data, isLoading, isError } = useQuery<PickingQueueResponse>({
    queryKey: ["picking-queue"],
    queryFn: fetchPickingQueue,
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">กำลังโหลดคิวหยิบ...</p>;
  }

  if (isError || !data) {
    return <p className="text-sm text-red-500">ไม่สามารถโหลดคิวหยิบได้</p>;
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">คิวหยิบสินค้าล่าสุด</h2>
        <p className="text-sm text-slate-600">{data.total_jobs} งานที่ต้องดำเนินการ</p>
      </header>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">คำร้อง</th>
              <th className="px-4 py-3">สินค้า</th>
              <th className="px-4 py-3">จำนวน</th>
              <th className="px-4 py-3">ตำแหน่ง</th>
              <th className="px-4 py-3">กำหนดส่ง</th>
              <th className="px-4 py-3">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((job) => (
              <tr key={`${job.request_id}-${job.request_line_id}`} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium">{job.request_id}</div>
                  <div className="text-xs text-slate-500">line: {job.request_line_id}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{job.item_name}</div>
                  <div className="text-xs text-slate-500">SKU {job.sku}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{job.quantity_needed}</div>
                  <div className="text-xs text-slate-500">หยิบแล้ว {job.quantity_allocated}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{job.location.zone}-{job.location.bin_code}</div>
                  <div className="text-xs text-slate-500">{job.location.comment ?? "-"}</div>
                </td>
                <td className="px-4 py-3">{job.required_date}</td>
                <td className="px-4 py-3">{job.note ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
