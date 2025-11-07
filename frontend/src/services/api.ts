import axios from "axios";
import type {
  Attachment,
  Category,
  Item,
  ItemCreatePayload,
  ItemUpdatePayload,
  PickingQueueResponse,
  RequestPayload,
  RequestResponse,
  WorkOrder,
  WorkOrderCreatePayload,
  WorkOrderStatus,
} from "../types/catalog";
import type {
  WarehouseMapCreatePayload,
  WarehouseMapResponse,
  WarehouseMapUpdatePayload,
} from "../types/warehouse";
import type {
  WorkflowJob,
  WorkflowJobCreatePayload,
  WorkflowJobUpdatePayload,
} from "../types/workflow";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api",
  timeout: 30000,
});

export async function fetchCategories(): Promise<Category[]> {
  const response = await apiClient.get<Category[]>("/catalog/categories");
  return response.data;
}

export interface FetchItemsParams {
  categoryId?: string;
  search?: string;
}

export async function fetchItems(params: FetchItemsParams = {}): Promise<Item[]> {
  const queryParams: Record<string, string | undefined> = {
    category_id: params.categoryId,
  };
  if (params.search && params.search.trim().length >= 2) {
    queryParams.search = params.search.trim();
  }
  const response = await apiClient.get<Item[]>("/catalog/items", {
    params: queryParams,
  });
  return response.data;
}

export async function submitRequest(payload: RequestPayload): Promise<RequestResponse> {
  const response = await apiClient.post<RequestResponse>("/requests", payload);
  return response.data;
}

export async function createItem(payload: ItemCreatePayload): Promise<Item> {
  const response = await apiClient.post<Item>("/catalog/items", payload);
  return response.data;
}

export async function updateItem(itemId: string, payload: ItemUpdatePayload): Promise<Item> {
  const response = await apiClient.put<Item>(`/catalog/items/${itemId}`, payload);
  return response.data;
}

export async function deleteItem(itemId: string): Promise<void> {
  await apiClient.delete(`/catalog/items/${itemId}`);
}

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
}

export async function importItemsFromFile(file: File): Promise<BulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<BulkImportResult>("/catalog/items/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function fetchPickingQueue(): Promise<PickingQueueResponse> {
  const response = await apiClient.get<PickingQueueResponse>("/inventory/picking-queue");
  return response.data;
}

export async function fetchWorkOrders(): Promise<WorkOrder[]> {
  const response = await apiClient.get<WorkOrder[]>("/logistics/work-orders");
  return response.data;
}

export async function createWorkOrder(payload: WorkOrderCreatePayload): Promise<WorkOrder> {
  const response = await apiClient.post<WorkOrder>("/logistics/work-orders", payload);
  return response.data;
}

export async function updateWorkOrderStatus(
  workOrderId: string,
  status: WorkOrderStatus,
): Promise<WorkOrder> {
  const response = await apiClient.patch<WorkOrder>(
    `/logistics/work-orders/${workOrderId}/status`,
    { status },
  );
  return response.data;
}

export async function fetchWarehouseMaps(): Promise<WarehouseMapResponse[]> {
  const response = await apiClient.get<WarehouseMapResponse[]>("/inventory/maps");
  return response.data;
}

export async function createWarehouseMap(
  payload: WarehouseMapCreatePayload,
): Promise<WarehouseMapResponse> {
  const response = await apiClient.post<WarehouseMapResponse>("/inventory/maps", payload);
  return response.data;
}

export async function updateWarehouseMap(
  mapId: string,
  payload: WarehouseMapUpdatePayload,
): Promise<WarehouseMapResponse> {
  const response = await apiClient.put<WarehouseMapResponse>(`/inventory/maps/${mapId}`, payload);
  return response.data;
}

export async function deleteWarehouseMap(mapId: string): Promise<void> {
  await apiClient.delete(`/inventory/maps/${mapId}`);
}

export async function uploadAttachment(
  file: File,
  prefix = "requests",
): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("prefix", prefix);

  const response = await apiClient.post<Attachment>("/storage/uploads", formData);
  return response.data;
}

export async function fetchReceivingJobs(): Promise<WorkflowJob[]> {
  const response = await apiClient.get<WorkflowJob[]>("/inventory/receiving/jobs");
  return response.data;
}

export async function createReceivingJob(payload: WorkflowJobCreatePayload): Promise<WorkflowJob> {
  const response = await apiClient.post<WorkflowJob>("/inventory/receiving/jobs", payload);
  return response.data;
}

export async function updateReceivingJob(
  jobId: string,
  payload: WorkflowJobUpdatePayload,
): Promise<WorkflowJob> {
  const response = await apiClient.put<WorkflowJob>(`/inventory/receiving/jobs/${jobId}`, payload);
  return response.data;
}

export async function deleteReceivingJob(jobId: string): Promise<void> {
  await apiClient.delete(`/inventory/receiving/jobs/${jobId}`);
}
