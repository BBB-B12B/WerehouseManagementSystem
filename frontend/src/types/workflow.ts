export type WorkflowCountStatus = "pending" | "matched" | "mismatch";

export interface WorkflowJobLine {
  line_id: string;
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_expected: number;
  count_status: WorkflowCountStatus;
  counted_quantity?: number | null;
}

export interface WorkflowJob {
  id: string;
  display_code: string;
  created_at: string;
  updated_at: string;
  lines: WorkflowJobLine[];
}

export interface WorkflowJobLineCreatePayload {
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_expected: number;
}

export interface WorkflowJobCreatePayload {
  lines: WorkflowJobLineCreatePayload[];
}

export interface WorkflowJobLineUpdatePayload {
  line_id: string;
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_expected: number;
  count_status: WorkflowCountStatus;
  counted_quantity?: number | null;
}

export interface WorkflowJobUpdatePayload {
  lines: WorkflowJobLineUpdatePayload[];
}
