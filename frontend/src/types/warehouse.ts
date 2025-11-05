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
