import Constants from "expo-constants";

export interface TransactionPayload {
  type: "put_away" | "pick" | "adjustment";
  location_token: string;
  item_id: string;
  quantity: number;
  request_id?: string;
  request_line_id?: string;
  reason?: string;
  note?: string;
}

export async function sendTransaction(payload: TransactionPayload) {
  const baseUrl = Constants?.expoConfig?.extra?.apiBaseUrl ?? "http://localhost:8000/api";
  const response = await fetch(`${baseUrl}/inventory/transactions/scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? "ไม่สามารถส่งข้อมูลได้");
  }

  return response.json();
}

export interface MobileWorkOrderTask {
  id: string;
  item_name: string;
  quantity_planned: number;
  quantity_loaded: number;
  status: string;
}

export interface MobileWorkOrder {
  id: string;
  route: string;
  vehicle: string;
  driver: string;
  scheduled_date: string;
  departure_time: string;
  status: string;
  tasks: MobileWorkOrderTask[];
}

export async function fetchMobileWorkOrders(): Promise<MobileWorkOrder[]> {
  const baseUrl = Constants?.expoConfig?.extra?.apiBaseUrl ?? "http://localhost:8000/api";
  const response = await fetch(`${baseUrl}/logistics/work-orders`);
  if (!response.ok) {
    throw new Error("โหลดใบงานไม่สำเร็จ");
  }
  return response.json();
}

export async function fetchMobileWorkOrder(orderId: string): Promise<MobileWorkOrder> {
  const baseUrl = Constants?.expoConfig?.extra?.apiBaseUrl ?? "http://localhost:8000/api";
  const response = await fetch(`${baseUrl}/logistics/work-orders/${orderId}`);
  if (!response.ok) {
    throw new Error("โหลดรายละเอียดใบงานไม่สำเร็จ");
  }
  return response.json();
}
