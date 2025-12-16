export interface Category {
  id: string;
  name: string;
  parent_id?: string | null;
  display_order: number;
  thumbnail_url?: string | null;
  active: boolean;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category_id: string;
  category_type?: "material" | "equipment";
  category_name?: string | null;
  asset_code?: string | null;
  unit: string;
  stock_on_hand: number;
  stock_reserved: number;
  image_url?: string | null;
  tags: string[];
  location_hint?: string | null;
  package_width_cm?: number | null;
  package_depth_cm?: number | null;
  package_height_cm?: number | null;
  package_volume_cm3?: number | null;
}

export interface ItemCreatePayload {
  sku: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  category_type?: "material" | "equipment";
  asset_code?: string;
  unit: string;
  stock_on_hand: number;
  stock_reserved?: number;
  tags?: string[];
  image_url?: string;
  location_hint?: string;
  active?: boolean;
  package_width_cm?: number | null;
  package_depth_cm?: number | null;
  package_height_cm?: number | null;
  package_volume_cm3?: number | null;
}

export type ItemUpdatePayload = Partial<ItemCreatePayload>;

export interface Attachment {
  key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  public_url?: string | null;
}

export interface RequestLinePayload {
  item_id: string;
  quantity: number;
  note?: string;
}

export interface RequestPayload {
  requester_id: string;
  requester_name: string;
  department: string;
  required_date: string;
  note?: string;
  attachments?: Attachment[];
  items: RequestLinePayload[];
}

export interface RequestResponse {
  id: string;
  requester_id: string;
  requester_name: string;
  department: string;
  required_date: string;
  status: string;
  items: Array<{
    id: string;
    item_id: string;
    quantity_requested: number;
    quantity_approved: number;
    quantity_picked: number;
    note?: string | null;
  }>;
  attachments: Attachment[];
  note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickingQueueLine {
  request_id: string;
  request_line_id: string;
  item_id: string;
  item_name: string;
  sku: string;
  quantity_needed: number;
  quantity_allocated: number;
  required_date: string;
  note?: string | null;
  location: {
    id: string;
    zone: string;
    aisle: string;
    rack: string;
    bin_code: string;
    comment?: string | null;
  };
}

export interface PickingQueueResponse {
  total_jobs: number;
  jobs: PickingQueueLine[];
}

export type WorkOrderStatus = "planned" | "loading" | "in_transit" | "completed" | "cancelled";

export interface WorkOrderTask {
  id: string;
  request_id: string;
  request_line_id: string;
  item_id: string;
  item_name: string;
  quantity_planned: number;
  quantity_loaded: number;
  status: "pending" | "loaded" | "delivered";
}

export interface WorkOrder {
  id: string;
  route: string;
  vehicle: string;
  driver: string;
  scheduled_date: string;
  departure_time: string;
  status: WorkOrderStatus;
  tasks: WorkOrderTask[];
  created_at: string;
  updated_at: string;
}

export interface WorkOrderCreatePayload {
  route: string;
  vehicle: string;
  driver: string;
  scheduled_date: string;
  departure_time: string;
  include_request_ids?: string[];
}
