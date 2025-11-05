import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createWorkOrder,
  fetchWorkOrders,
  updateWorkOrderStatus,
} from "../services/api";
import type { WorkOrder, WorkOrderStatus } from "../types/catalog";

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  planned: "วางแผน",
  loading: "กำลังโหลด",
  in_transit: "ระหว่างขนส่ง",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

export function WorkOrderPlanner() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["work-orders"],
    queryFn: fetchWorkOrders,
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createWorkOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "สร้างใบงานไม่สำเร็จ");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkOrderStatus }) =>
      updateWorkOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    },
  });

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const route = String(formData.get("route") ?? "").trim();
    const vehicle = String(formData.get("vehicle") ?? "").trim();
    const driver = String(formData.get("driver") ?? "").trim();
    const scheduled_date = String(formData.get("scheduled_date") ?? "");
    const departure_time = String(formData.get("departure_time") ?? "");

    if (!route || !vehicle || !driver || !scheduled_date || !departure_time) {
      setErrorMessage("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    setErrorMessage(null);
    createMutation.mutate({ route, vehicle, driver, scheduled_date, departure_time });
    form.reset();
  };

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">วางแผนใบงานขนส่ง</h2>
          <p className="text-sm text-slate-600">สร้างใบงานใหม่และติดตามสถานะรถขนส่ง</p>
        </div>
      </header>

      <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2" onSubmit={handleCreate}>
        <label className="flex flex-col gap-1 text-sm">
          เส้นทาง/โครงการ
          <input name="route" className="rounded-md border border-slate-200 px-3 py-2" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          รถ/ทะเบียน
          <input name="vehicle" className="rounded-md border border-slate-200 px-3 py-2" required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          คนขับ
          <input name="driver" className="rounded-md border border-slate-200 px-3 py-2" required />
        </label>
        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            วันที่ออกเดินทาง
            <input type="date" name="scheduled_date" className="rounded-md border border-slate-200 px-3 py-2" required />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            เวลาออกเดินทาง
            <input type="time" name="departure_time" className="rounded-md border border-slate-200 px-3 py-2" required />
          </label>
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {createMutation.isLoading ? "กำลังสร้าง..." : "สร้างใบงาน"}
          </button>
        </div>
        {errorMessage ? <p className="md:col-span-2 text-sm text-red-500">{errorMessage}</p> : null}
      </form>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-lg font-semibold">ใบงานทั้งหมด</h3>
          {isLoading ? <span className="text-xs text-slate-500">กำลังโหลด...</span> : null}
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">ใบงาน</th>
                <th className="px-4 py-3">เส้นทาง</th>
                <th className="px-4 py-3">รถ/คนขับ</th>
                <th className="px-4 py-3">กำหนดการ</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">รายการ</th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((order: WorkOrder) => (
                <tr key={order.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium">{order.id.slice(0, 8)}</div>
                    <div className="text-xs text-slate-500">สร้าง {new Date(order.created_at).toLocaleString()}</div>
                  </td>
                  <td className="px-4 py-3">{order.route}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{order.vehicle}</div>
                    <div className="text-xs text-slate-500">{order.driver}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{order.scheduled_date}</div>
                    <div className="text-xs text-slate-500">{order.departure_time}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ul className="space-y-1 text-xs text-slate-600">
                      {order.tasks.map((task) => (
                        <li key={task.id}>
                          {task.item_name} · {task.quantity_planned} ชิ้น ({STATUS_LABEL_MAPPING[task.status] ?? task.status})
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3">
                    <WorkOrderActions order={order} onChange={(status) => updateStatusMutation.mutate({ id: order.id, status })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

const STATUS_LABEL_MAPPING: Record<string, string> = {
  pending: "รอโหลด",
  loaded: "โหลดแล้ว",
  delivered: "ส่งมอบแล้ว",
};

function WorkOrderActions({ order, onChange }: { order: WorkOrder; onChange: (status: WorkOrderStatus) => void }) {
  const nextStatuses: WorkOrderStatus[] = [];
  switch (order.status) {
    case "planned":
      nextStatuses.push("loading", "cancelled");
      break;
    case "loading":
      nextStatuses.push("in_transit", "cancelled");
      break;
    case "in_transit":
      nextStatuses.push("completed");
      break;
    default:
      break;
  }

  if (!nextStatuses.length) {
    return <span className="text-xs text-slate-500">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => onChange(status)}
          className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
        >
          ไปยัง {STATUS_LABEL[status]}
        </button>
      ))}
    </div>
  );
}
