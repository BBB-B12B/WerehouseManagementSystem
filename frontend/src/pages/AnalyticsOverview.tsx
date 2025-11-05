import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchCategories, fetchItems, fetchPickingQueue, fetchWorkOrders } from "../services/api";
import type { WorkOrder } from "../types/catalog";

export function AnalyticsOverview() {
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const itemsQuery = useQuery({ queryKey: ["items", null, ""], queryFn: () => fetchItems() });
  const pickingQueueQuery = useQuery({ queryKey: ["picking-queue"], queryFn: fetchPickingQueue });
  const workOrdersQuery = useQuery({ queryKey: ["work-orders"], queryFn: fetchWorkOrders });

  const totalPendingJobs = pickingQueueQuery.data?.total_jobs ?? 0;
  const workOrderStats = useMemo(() => {
    const orders = workOrdersQuery.data ?? [];
    const byStatus = orders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1;
      return acc;
    }, {});
    return { count: orders.length, byStatus };
  }, [workOrdersQuery.data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold">ภาพรวมปฏิบัติการคลัง</h2>
        <p className="text-sm text-slate-600">แดชบอร์ดเบื้องต้นเพื่อดูจำนวนหมวดหมู่, สินค้า, งานหยิบ และใบงานขนส่ง</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InsightCard
          title="หมวดหมู่"
          value={categoriesQuery.data?.length ?? 0}
          description="จำนวนหมวดหมู่ที่เปิดใช้งาน"
          loading={categoriesQuery.isLoading}
        />
        <InsightCard
          title="SKU ในระบบ"
          value={itemsQuery.data?.length ?? 0}
          description="รายการสินค้าที่พร้อมให้ขอ"
          loading={itemsQuery.isLoading}
        />
        <InsightCard
          title="งานหยิบที่รอดำเนินการ"
          value={totalPendingJobs}
          description="รวมคำร้องที่อนุมัติและค้างหยิบ"
          loading={pickingQueueQuery.isLoading}
        />
        <InsightCard
          title="ใบงานขนส่ง"
          value={workOrderStats.count}
          description="จำนวนใบงานทั้งหมดในระบบ"
          loading={workOrdersQuery.isLoading}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">สถานะใบงาน</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {Object.entries(workOrderStats.byStatus).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between">
                <span className="capitalize">{status.replace(/_/g, " ")}</span>
                <span className="font-semibold">{count}</span>
              </li>
            ))}
            {!Object.keys(workOrderStats.byStatus).length ? <li>ยังไม่มีใบงาน</li> : null}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">ใบงานล่าสุด</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {(workOrdersQuery.data ?? []).slice(0, 5).map((order: WorkOrder) => (
              <li key={order.id} className="rounded-md border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{order.route}</span>
                  <span className="text-xs uppercase text-slate-500">{order.status}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {order.vehicle} · {order.driver} · {order.scheduled_date}
                </div>
                <div className="mt-2 text-xs text-slate-500">{order.tasks.length} รายการ</div>
              </li>
            ))}
            {!workOrdersQuery.data?.length ? <li>ยังไม่มีข้อมูลใบงาน</li> : null}
          </ul>
        </div>
      </section>
    </div>
  );
}

function InsightCard({
  title,
  value,
  description,
  loading,
}: {
  title: string;
  value: number;
  description: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">
        {loading ? <span className="text-base">กำลังโหลด...</span> : value}
      </p>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  );
}
