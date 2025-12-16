export interface WarehouseMapAreaPayload {
  id?: string;
  label?: string | null;
  location_id?: string | null;
  zone?: string | null;
  allowed_item_ids?: string[] | null;
  points: number[];
}

export interface WarehouseMapResponse {
  id: string;
  name?: string | null;
  image_url?: string | null;
  image_width: number;
  image_height: number;
  areas: WarehouseMapAreaPayload[];
  created_at: string;
  updated_at: string;
}

export interface WarehouseMapCreatePayload {
  name?: string | null;
  image_url?: string | null;
  image_width: number;
  image_height: number;
  areas: WarehouseMapAreaPayload[];
}

export interface WarehouseMapUpdatePayload {
  name?: string | null;
  image_url?: string | null;
  image_width?: number;
  image_height?: number;
  areas?: WarehouseMapAreaPayload[];
}

export interface StorageLocation {
  id: string;
  name: string;
  building?: string | null;
  zone: string;
  aisle?: string | null;
  rack: string;
  level: string;
  bin?: string | null;
  code: string;
  capacity: number;
  note?: string | null;
  width_cm?: number | null;
  depth_cm?: number | null;
  height_cm?: number | null;
  allowed_item_ids?: string[] | null;
  created_at: string;
  updated_at: string;
  used_volume_cm3?: number | null;
}

export type StorageLocationCreatePayload = Omit<
  StorageLocation,
  "id" | "created_at" | "updated_at" | "used_volume_cm3"
>;

export type StorageLocationUpdatePayload = Partial<StorageLocationCreatePayload>;
