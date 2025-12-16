export type WorkflowCountStatus = "pending" | "matched" | "mismatch";
export type PutawayStatus = "pending" | "scheduled" | "in_progress" | "stored";
export type WorkflowJobStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface WorkflowMovement {
  movement_id: string;
  receiving_line_id: string;
  location_id: string;
  location_label?: string | null;
  quantity: number;
  unit: string;
  note?: string | null;
  recorded_at: string;
  item_name?: string | null;
  sku?: string | null;
  evidence_urls?: string[];
  location_mismatch?: boolean;
  quantity_mismatch?: boolean;
  volume_cm3?: number | null;
}

export interface WorkflowJobLine {
  line_id: string;
  source_line_id?: string | null;
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_expected: number;
  count_status: WorkflowCountStatus;
  counted_quantity?: number | null;
  preferred_location_id?: string | null;
  preferred_location_label?: string | null;
  putaway_quantity?: number | null;
  putaway_status?: PutawayStatus;
  putaway_job_ids?: string[];
  package_volume_cm3?: number | null;
}

export interface WorkflowJob {
  id: string;
  display_code: string;
  created_at: string;
  updated_at: string;
  lines: WorkflowJobLine[];
  parent_receiving_job_id?: string | null;
  receiving_line_ids?: string[];
  status: WorkflowJobStatus;
  assignee?: string | null;
  movements?: WorkflowMovement[];
}

export interface WorkflowJobLineCreatePayload {
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_expected: number;
  package_volume_cm3?: number | null;
}

export interface WorkflowJobCreatePayload {
  lines: WorkflowJobLineCreatePayload[];
}

export interface WorkflowJobLineUpdatePayload {
  line_id: string;
  source_line_id?: string | null;
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity_expected: number;
  count_status: WorkflowCountStatus;
  counted_quantity?: number | null;
  package_volume_cm3?: number | null;
}

export interface WorkflowJobUpdatePayload {
  lines?: WorkflowJobLineUpdatePayload[];
  status?: WorkflowJobStatus;
  assignee?: string | null;
  receiving_line_ids?: string[];
  parent_receiving_job_id?: string | null;
}

export interface PutawayLineAssignmentPayload {
  receiving_line_id: string;
  quantity: number;
  preferred_location_id?: string | null;
  preferred_location_label?: string | null;
  note?: string | null;
}

export interface PutawayJobCreatePayload {
  parent_receiving_job_id: string;
  line_assignments: PutawayLineAssignmentPayload[];
  assignee?: string | null;
}

export interface PutawayMovementPayload {
  receiving_line_id: string;
  location_id: string;
  location_label?: string | null;
  quantity: number;
  unit: string;
  note?: string | null;
  evidence_urls?: string[];
  location_mismatch?: boolean;
  quantity_mismatch?: boolean;
}

export interface PutawayJobUpdatePayload {
  status?: WorkflowJobStatus;
  assignee?: string | null;
  movements?: PutawayMovementPayload[];
}
