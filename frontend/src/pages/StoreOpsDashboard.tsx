import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPutawayJob,
  createReceivingJob,
  deleteReceivingJob,
  fetchItems,
  fetchStorageLocations,
  fetchPutawayJobs,
  fetchReceivingJobs,
  fetchWarehouseMaps,
  updatePutawayJob,
  updateReceivingJob,
  uploadAttachment,
  deletePutawayMovement,
} from "../services/api";
import type { Attachment, Item } from "../types/catalog";
import type {
  WorkflowJob,
  WorkflowJobLine,
  WorkflowJobLineCreatePayload,
  WorkflowJobLineUpdatePayload,
  WorkflowJobUpdatePayload,
  PutawayJobUpdatePayload,
  WorkflowMovement,
} from "../types/workflow";
import type { WarehouseMapResponse, StorageLocation as StorageLocationResponse } from "../types/warehouse";

type BrowserBarcodeFormat =
  | "aztec"
  | "code_39"
  | "code_93"
  | "code_128"
  | "data_matrix"
  | "ean_13"
  | "ean_8"
  | "itf"
  | "pdf417"
  | "qr_code"
  | "upc_a"
  | "upc_e";

interface BrowserBarcodeDetectorResult {
  rawValue: string;
}

interface BrowserBarcodeDetector {
  detect(source: HTMLVideoElement | CanvasImageSource): Promise<BrowserBarcodeDetectorResult[]>;
}

interface BrowserBarcodeDetectorConstructor {
  new (options?: { formats?: BrowserBarcodeFormat[] }): BrowserBarcodeDetector;
}

declare global {
  interface Window {
    BarcodeDetector?: BrowserBarcodeDetectorConstructor;
  }
}

type WarehouseTask = "receiving" | "counting" | "putaway" | "audit";
type CountStatus = "pending" | "matched" | "mismatch";

interface ReceivingDraftRow {
  rowId: string;
  itemId: string;
  itemLabel: string;
  quantity: string;
}

interface ReceivingJobLine {
  lineId: string;
  sourceLineId?: string;
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  quantityExpected: number;
  countStatus: CountStatus;
  countedQuantity?: number;
  putawayJobIds?: string[];
  putawayStatus?: "pending" | "scheduled" | "in_progress" | "stored";
  preferredLocationId?: string | null;
  preferredLocationLabel?: string | null;
  packageVolumeCm3?: number;
}

interface ReceivingJob {
  id: string;
  displayCode: string;
  createdAt: string;
  lines: ReceivingJobLine[];
}

const LOCATION_STORAGE_KEY = "location-manager.locations";
const ASSET_BASE_URL = (import.meta.env.VITE_ASSET_BASE_URL ?? "").replace(/\/$/, "");

interface PutawayLocationOption {
  id: string;
  label: string;
  code?: string | null;
  zone?: string | null;
  rack?: string | null;
  level?: string | null;
  bin?: string | null;
  capacity?: number;
  allowedItemIds?: string[];
  widthCm?: number | null;
  depthCm?: number | null;
  heightCm?: number | null;
  capacityVolumeCm3?: number | null;
  usedVolumeCm3?: number | null;
}

interface PutawayStoredInfo {
  locationId: string;
  locationLabel: string;
  storedAt: string;
  quantity: number;
}

interface PutawayHistoryRecord {
  id: string;
  lineId: string;
  jobId: string;
  jobCode: string;
  itemName: string;
  sku: string;
  quantity: number;
  unit: string;
  locationId: string;
  locationLabel: string;
  storedAt: string;
  locationMismatch?: boolean;
  quantityMismatch?: boolean;
}

const TASK_TABS: Array<{ key: WarehouseTask; label: string }> = [
  { key: "receiving", label: "การนัดรับ" },
  { key: "counting", label: "การตรวจนับ" },
  { key: "putaway", label: "การจัดเก็บ" },
  { key: "audit", label: "การตรวจสอบ" },
];

export function StoreOpsDashboard() {
  const [activeTask, setActiveTask] = useState<WarehouseTask>("receiving");
  const [receivingJobs, setReceivingJobs] = useState<ReceivingJob[]>([]);
  const [receivingDraftRows, setReceivingDraftRows] = useState<ReceivingDraftRow[]>(() => [createEmptyDraftRow()]);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [expandedJobIds, setExpandedJobIds] = useState<string[]>([]);
  const [countInputs, setCountInputs] = useState<Record<string, number>>({});
  const [countErrors, setCountErrors] = useState<Record<string, string>>({});
  const [editModalState, setEditModalState] = useState<{
    jobId: string;
    displayCode: string;
    createdAt: string;
    rows: ReceivingDraftRow[];
    errors: Record<string, string>;
  } | null>(null);
  const [activeAutocompleteId, setActiveAutocompleteId] = useState<string | null>(null);
  const [cancelModalJob, setCancelModalJob] = useState<ReceivingJob | null>(null);
  const initialLocations = useMemo(() => loadLocationOptions(), []);
  const [locationOptions, setLocationOptions] = useState<PutawayLocationOption[]>(initialLocations);
  const [allowedItemMap, setAllowedItemMap] = useState<Map<string, string[]>>(new Map());
  const allowedItemMapRef = useRef<Map<string, string[]>>(new Map());
  const [putawaySelections, setPutawaySelections] = useState<string[]>([]);
  const [storedLines, setStoredLines] = useState<Record<string, PutawayStoredInfo>>({});
  const [putawayJobs, setPutawayJobs] = useState<WorkflowJob[]>([]);
  const [putawayHistory, setPutawayHistory] = useState<PutawayHistoryRecord[]>([]);
  const [putawayMovementRecords, setPutawayMovementRecords] = useState<PutawayHistoryRecord[]>([]);
  const [putawayError, setPutawayError] = useState<string | null>(null);
  const [putawaySuccessMessage, setPutawaySuccessMessage] = useState<string | null>(null);
  const [isSubmittingPutaway, setIsSubmittingPutaway] = useState(false);
  const [workerModalState, setWorkerModalState] = useState<{
    job: WorkflowJob;
    line: WorkflowJobLine;
  } | null>(null);
  const [workerLocationId, setWorkerLocationId] = useState<string | null>(null);
  const [workerCustomLocation, setWorkerCustomLocation] = useState("");
  const [workerLocationSearch, setWorkerLocationSearch] = useState("");
  const [workerLocationOptionsOpen, setWorkerLocationOptionsOpen] = useState(false);
  const [workerQuantity, setWorkerQuantity] = useState<string>("0");
  const [workerNote, setWorkerNote] = useState("");
  const [workerEvidenceUrls, setWorkerEvidenceUrls] = useState<string[]>([]);
  const [workerMismatchReason, setWorkerMismatchReason] = useState("");
  const [workerUploading, setWorkerUploading] = useState(false);
  const [workerModalError, setWorkerModalError] = useState<string | null>(null);
  const [workerScanValue, setWorkerScanValue] = useState("");
  const [workerScanMessage, setWorkerScanMessage] = useState<string | null>(null);
  const [workerScannerActive, setWorkerScannerActive] = useState(false);
  const [workerScannerError, setWorkerScannerError] = useState<string | null>(null);
  const [flaggedLines, setFlaggedLines] = useState<Record<string, { flaggedAt: string }>>({});
  const [cancelPutawayJob, setCancelPutawayJob] = useState<WorkflowJob | null>(null);
  const [reviewPutawayJob, setReviewPutawayJob] = useState<WorkflowJob | null>(null);
  const [putawayAssignments, setPutawayAssignments] = useState<
    Record<string, { locationId: string; customLocation: string }>
  >({});
  const [putawayModalState, setPutawayModalState] = useState<{ open: boolean }>({
    open: false,
  });
  const autocompleteCloseTimerRef = useRef<number | null>(null);
  const workerScannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const queryClient = useQueryClient();
  const workerLocationSearchRef = useRef<HTMLDivElement | null>(null);
  const [undoMovementState, setUndoMovementState] = useState<{
    job: WorkflowJob;
    line: WorkflowJobLine;
    selectedMovementIds: string[];
    movements: WorkflowMovement[];
  } | null>(null);
  const [undoMovementError, setUndoMovementError] = useState<string | null>(null);
  const [isWorkerSaving, setIsWorkerSaving] = useState(false);

  const applyWorkerScanInput = useCallback(
    (rawValue: string) => {
      const value = rawValue.trim();
      if (!value) {
        setWorkerScanMessage("กรุณาสแกนหรือกรอกตำแหน่งก่อน");
        return false;
      }
      const normalized = value.toLowerCase();
      const matched = locationOptions.find((option) => {
        const id = option.id?.toLowerCase();
        const label = option.label?.toLowerCase();
        const code = option.code?.toLowerCase();
        return normalized === id || normalized === label || (code ? normalized === code : false);
      });
      if (matched && matched.id) {
        setWorkerLocationId(matched.id);
        setWorkerCustomLocation("");
        setWorkerLocationSearch(buildLocationSearchDisplay(matched));
        setWorkerScanMessage(`จับคู่ตำแหน่ง: ${matched.label ?? matched.id}`);
        setWorkerScannerError(null);
        return true;
      }
      setWorkerLocationId("__custom__");
      setWorkerCustomLocation(value);
      setWorkerLocationSearch(value);
      setWorkerScanMessage("ไม่พบตำแหน่งในระบบ ระบบจะใช้ค่าที่สแกนเป็นข้อความกำหนดเอง");
      setWorkerScannerError(null);
      return true;
    },
    [locationOptions],
  );

  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
  } = useQuery<Item[]>({
    queryKey: ["catalog-items", "store-ops"],
    queryFn: () => fetchItems(),
    staleTime: 5 * 60 * 1000,
  });

  const itemLookup = useMemo(() => {
    const map = new Map<string, Item>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const {
    data: receivingJobsData,
    isLoading: receivingJobsLoading,
    isError: receivingJobsError,
  } = useQuery<WorkflowJob[]>({
    queryKey: ["receiving-jobs"],
    queryFn: fetchReceivingJobs,
    staleTime: 30 * 1000,
  });

  const { data: putawayJobsData } = useQuery<WorkflowJob[]>({
    queryKey: ["putaway-jobs"],
    queryFn: fetchPutawayJobs,
    staleTime: 30 * 1000,
  });

  const { data: warehouseMapsData } = useQuery<WarehouseMapResponse[]>({
    queryKey: ["warehouse-maps-putaway"],
    queryFn: fetchWarehouseMaps,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!receivingJobsData) {
      return;
    }
    setReceivingJobs(receivingJobsData.map(mapJobFromApi));
  }, [receivingJobsData]);

  useEffect(() => {
    if (!putawayJobsData) {
      setPutawayHistory([]);
      setPutawayMovementRecords([]);
      setPutawayJobs([]);
      return;
    }
    setPutawayJobs(putawayJobsData);
    const movementRecords = mapPutawayHistory(putawayJobsData);
    setPutawayHistory(movementRecords);
    setPutawayMovementRecords(movementRecords);
  }, [putawayJobsData]);

  useEffect(() => {
    if (putawayMovementRecords.length === 0) {
      setStoredLines({});
      return;
    }
    const next: Record<string, PutawayStoredInfo> = {};
    putawayMovementRecords.forEach((record) => {
      next[record.lineId] = {
        locationId: record.locationId,
        locationLabel: record.locationLabel,
        storedAt: record.storedAt,
        quantity: record.quantity,
      };
    });
    setStoredLines(next);
  }, [putawayMovementRecords]);

  useEffect(() => {
    if (!warehouseMapsData) {
      return;
    }
    const nextMap = new Map<string, string[]>();
    warehouseMapsData.forEach((map) => {
      map.areas.forEach((area) => {
        if (!area.location_id) {
          return;
        }
        const allowed =
          Array.isArray(area.allowed_item_ids) && area.allowed_item_ids.length > 0
            ? area.allowed_item_ids.filter((item): item is string => typeof item === "string")
            : [];
        nextMap.set(area.location_id, allowed);
      });
    });
    allowedItemMapRef.current = nextMap;
    setAllowedItemMap(nextMap);
    setLocationOptions((prev) => applyAllowedItemsToOptions(prev, nextMap));
  }, [warehouseMapsData]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleStorage = () => {
      const base = loadLocationOptions();
      setLocationOptions(applyAllowedItemsToOptions(base, allowedItemMapRef.current));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function syncLocationsFromServer() {
      try {
        const records = await fetchStorageLocations();
        if (cancelled || !records) {
          return;
        }
        cacheRawLocations(records);
        const options = records.map(mapStorageLocationToOption);
        setLocationOptions(applyAllowedItemsToOptions(options, allowedItemMapRef.current));
      } catch (error) {
        console.warn("sync_locations_failed", error);
      }
    }
    syncLocationsFromServer();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTask === "putaway") {
      setLocationOptions(loadLocationOptions());
      queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["putaway-jobs"] }).catch(() => {});
    }
  }, [activeTask, queryClient]);

  useEffect(() => {
    if (!putawaySuccessMessage) {
      return;
    }
    const timer = window.setTimeout(() => setPutawaySuccessMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [putawaySuccessMessage]);


  const createJobMutation = useMutation({
    mutationFn: createReceivingJob,
    onSuccess: async (job) => {
      const mapped = mapJobFromApi(job);
      setReceivingJobs((prev) => [mapped, ...prev]);
      setCountInputs((prev) => {
        const next = { ...prev };
        mapped.lines.forEach((line) => {
          next[line.lineId] = line.countedQuantity ?? line.quantityExpected;
        });
        return next;
      });
      setCountErrors((prev) => {
        const next = { ...prev };
        mapped.lines.forEach((line) => {
          delete next[line.lineId];
        });
        return next;
      });
      setExpandedJobIds((prev) => [mapped.id, ...prev]);
      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
    },
  });

  const updateJobMutation = useMutation({
    mutationFn: ({ jobId, payload }: { jobId: string; payload: WorkflowJobUpdatePayload }) =>
      updateReceivingJob(jobId, payload),
    onSuccess: async (job) => {
      const mapped = mapJobFromApi(job);
      setReceivingJobs((prev) => prev.map((existing) => (existing.id === mapped.id ? mapped : existing)));
      setCountInputs((prev) => {
        const next = { ...prev };
        mapped.lines.forEach((line) => {
          next[line.lineId] = line.countedQuantity ?? line.quantityExpected;
        });
        return next;
      });
      setCountErrors((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (mapped.lines.every((line) => line.lineId !== key)) {
            delete next[key];
          }
        });
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: ({ job }: { job: ReceivingJob }) => deleteReceivingJob(job.id),
    onSuccess: async (_data, variables) => {
      removeJob(variables.job);
      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
    },
  });

  const createPutawayJobMutation = useMutation({
    mutationFn: createPutawayJob,
  });

  const completePutawayJobMutation = useMutation({
    mutationFn: ({ jobId, payload }: { jobId: string; payload: PutawayJobUpdatePayload }) =>
      updatePutawayJob(jobId, payload),
  });

  const deletePutawayMovementMutation = useMutation({
    mutationFn: ({ jobId, movementId }: { jobId: string; movementId: string }) =>
      deletePutawayMovement(jobId, movementId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["putaway-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
    },
  });

  useEffect(() => {
    setCountInputs((prev) => {
      const next: Record<string, number> = {};
      receivingJobs.forEach((job) => {
        job.lines.forEach((line) => {
          next[line.lineId] = prev[line.lineId] ?? line.countedQuantity ?? line.quantityExpected;
        });
      });
      return next;
    });
  }, [receivingJobs]);

  const readyDraftRows = useMemo(
    () =>
      receivingDraftRows.filter((row) => {
        const quantity = Number(row.quantity);
        const itemId = resolveItemIdFromLabel(row.itemLabel, itemLookup) ?? row.itemId;
        return Boolean(itemId) && Number.isFinite(quantity) && quantity > 0;
      }),
    [receivingDraftRows, itemLookup],
  );

  const canSubmitDrafts = readyDraftRows.length > 0;

  function openAutocomplete(id: string) {
    if (autocompleteCloseTimerRef.current !== null) {
      window.clearTimeout(autocompleteCloseTimerRef.current);
      autocompleteCloseTimerRef.current = null;
    }
    setActiveAutocompleteId(id);
  }

  function scheduleAutocompleteClose(delay = 120) {
    if (autocompleteCloseTimerRef.current !== null) {
      window.clearTimeout(autocompleteCloseTimerRef.current);
    }
    autocompleteCloseTimerRef.current = window.setTimeout(() => {
      setActiveAutocompleteId(null);
      autocompleteCloseTimerRef.current = null;
    }, delay);
  }

  useEffect(() => {
    return () => {
      if (autocompleteCloseTimerRef.current !== null) {
        window.clearTimeout(autocompleteCloseTimerRef.current);
      }
    };
  }, []);

  function handleDraftQuantityChange(rowId: string, value: string) {
    setReceivingDraftRows((prev) => normalizeDraftRows(updateRow(prev, rowId, { quantity: value })));
    setDraftErrors((prev) => removeError(prev, rowId));
  }

  function handleDraftItemInput(rowId: string, value: string) {
    openAutocomplete(rowId);
    setReceivingDraftRows((prev) =>
      normalizeDraftRows(
        updateRow(prev, rowId, {
          itemLabel: value,
          itemId: resolveItemIdFromLabel(value, itemLookup) ?? "",
        }),
      ),
    );
    setDraftErrors((prev) => removeError(prev, rowId));
  }

  function handleDraftItemBlur(rowId: string) {
    const itemId =
      resolveItemIdFromLabel(
        receivingDraftRows.find((row) => row.rowId === rowId)?.itemLabel ?? "",
        itemLookup,
      ) ?? "";
    setReceivingDraftRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const matchedItem = itemId ? itemLookup.get(itemId) : undefined;
        return {
          ...row,
          itemId,
          itemLabel: matchedItem ? formatItemLabel(matchedItem) : row.itemLabel.trim(),
        };
      }),
    );
    scheduleAutocompleteClose();
  }

  function handlePickDraftItem(rowId: string, item: Item) {
    setReceivingDraftRows((prev) =>
      normalizeDraftRows(
        updateRow(prev, rowId, {
          itemId: item.id,
          itemLabel: formatItemLabel(item),
        }),
      ),
    );
    setDraftErrors((prev) => removeError(prev, rowId));
    setActiveAutocompleteId(null);
    if (autocompleteCloseTimerRef.current !== null) {
      window.clearTimeout(autocompleteCloseTimerRef.current);
      autocompleteCloseTimerRef.current = null;
    }
  }

  function handleRemoveDraftRow(rowId: string) {
    setReceivingDraftRows((prev) => normalizeDraftRows(prev.filter((row) => row.rowId !== rowId)));
    setDraftErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (activeAutocompleteId === rowId) {
      setActiveAutocompleteId(null);
    }
  }

  function getSelectedItemIds(excludeKey?: string): Set<string> {
    const selected = new Set<string>();
    receivingDraftRows.forEach((row) => {
      if (excludeKey === row.rowId) return;
      const itemId = row.itemId || resolveItemIdFromLabel(row.itemLabel, itemLookup);
      if (itemId) {
        selected.add(itemId);
      }
    });
    if (editModalState) {
      editModalState.rows.forEach((row) => {
        if (excludeKey === row.rowId) return;
        const itemId = row.itemId || resolveItemIdFromLabel(row.itemLabel, itemLookup);
        if (itemId) {
          selected.add(itemId);
        }
      });
    }
    return selected;
  }

  function getItemSuggestions(query: string, { excludeKey }: { excludeKey?: string } = {}): Item[] {
    const normalized = query.trim().toLowerCase();
    const selectedIds = getSelectedItemIds(excludeKey);
    const available = items.filter((item) => !selectedIds.has(item.id));
    if (!normalized) {
      return available.slice(0, 10);
    }
    return available.filter((item) => formatItemLabel(item).toLowerCase().includes(normalized)).slice(0, 10);
  }

  async function handleSubmitReceivingDrafts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const payloadLines: WorkflowJobLineCreatePayload[] = [];
    const seenItems = new Set<string>();

    receivingDraftRows.forEach((row) => {
      if (!hasRowContent(row)) return;
      const itemId = resolveItemIdFromLabel(row.itemLabel, itemLookup) ?? row.itemId;
      const item = itemId ? itemLookup.get(itemId) : undefined;
      const quantity = Number(row.quantity);
      if (!item) {
        nextErrors[row.rowId] = "กรุณาเลือกรายการสินค้า";
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        nextErrors[row.rowId] = "กรุณากรอกจำนวนที่รับมากกว่า 0";
        return;
      }
      if (seenItems.has(item.id)) {
        nextErrors[row.rowId] = "รายการนี้ถูกเลือกแล้ว";
        return;
      }
      seenItems.add(item.id);
      payloadLines.push({
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantity_expected: Math.round(quantity),
        package_volume_cm3: typeof item.package_volume_cm3 === "number" ? item.package_volume_cm3 : undefined,
      });
    });

    if (Object.keys(nextErrors).length > 0) {
      setDraftErrors(nextErrors);
      return;
    }
    if (payloadLines.length === 0) {
      return;
    }

    try {
      await createJobMutation.mutateAsync({ lines: payloadLines });
      setReceivingDraftRows([createEmptyDraftRow()]);
      setDraftErrors({});
      setActiveAutocompleteId(null);
      setActiveTask("receiving");
    } catch {
      // API error handled by mutation; keep draft state for retry
    }
  }

  function openEditModal(job: ReceivingJob) {
    const rows: ReceivingDraftRow[] = job.lines.map((line) => ({
      rowId: line.lineId,
      itemId: line.itemId,
      itemLabel: formatLineLabel(line),
      quantity: line.quantityExpected.toString(),
    }));
    setEditModalState({
      jobId: job.id,
      displayCode: job.displayCode,
      createdAt: job.createdAt,
      rows: normalizeDraftRows([...rows, createEmptyDraftRow()]),
      errors: {},
    });
    setActiveAutocompleteId(null);
  }

  function closeEditModal() {
    setEditModalState(null);
    setActiveAutocompleteId(null);
    if (autocompleteCloseTimerRef.current !== null) {
      window.clearTimeout(autocompleteCloseTimerRef.current);
      autocompleteCloseTimerRef.current = null;
    }
  }

  function handleEditRowQuantityChange(rowId: string, value: string) {
    setEditModalState((prev) => {
      if (!prev) return prev;
      const nextRows = normalizeDraftRows(updateRow(prev.rows, rowId, { quantity: value }));
      return {
        ...prev,
        rows: nextRows,
        errors: removeError(removeError(prev.errors, rowId), "general"),
      };
    });
  }

  function handleEditRowItemInput(rowId: string, value: string) {
    openAutocomplete(rowId);
    setEditModalState((prev) => {
      if (!prev) return prev;
      const nextRows = normalizeDraftRows(
        updateRow(prev.rows, rowId, {
          itemLabel: value,
          itemId: resolveItemIdFromLabel(value, itemLookup) ?? "",
        }),
      );
      return {
        ...prev,
        rows: nextRows,
        errors: removeError(removeError(prev.errors, rowId), "general"),
      };
    });
  }

  function handleEditRowItemBlur(rowId: string) {
    setEditModalState((prev) => {
      if (!prev) return prev;
      const target = prev.rows.find((row) => row.rowId === rowId);
      if (!target) return prev;
      const itemId = resolveItemIdFromLabel(target.itemLabel, itemLookup) ?? target.itemId;
      const matchedItem = itemId ? itemLookup.get(itemId) : undefined;
      const nextRows = prev.rows.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              itemId: itemId ?? "",
              itemLabel: matchedItem ? formatItemLabel(matchedItem) : row.itemLabel.trim(),
            }
          : row,
      );
      scheduleAutocompleteClose();
      return {
        ...prev,
        rows: normalizeDraftRows(nextRows),
      };
    });
  }

  function handlePickEditRowItem(rowId: string, item: Item) {
    setEditModalState((prev) => {
      if (!prev) return prev;
      const nextRows = normalizeDraftRows(
        updateRow(prev.rows, rowId, {
          itemId: item.id,
          itemLabel: formatItemLabel(item),
        }),
      );
      return {
        ...prev,
        rows: nextRows,
        errors: removeError(removeError(prev.errors, rowId), "general"),
      };
    });
    setActiveAutocompleteId(null);
    if (autocompleteCloseTimerRef.current !== null) {
      window.clearTimeout(autocompleteCloseTimerRef.current);
      autocompleteCloseTimerRef.current = null;
    }
  }

  function handleRemoveEditRow(rowId: string) {
    setEditModalState((prev) => {
      if (!prev) return prev;
      const nextRows = normalizeDraftRows(prev.rows.filter((row) => row.rowId !== rowId));
      const nextErrors = removeError(removeError(prev.errors, rowId), "general");
      return { ...prev, rows: nextRows, errors: nextErrors };
    });
    if (activeAutocompleteId === rowId) {
      setActiveAutocompleteId(null);
    }
  }

  async function handleSubmitEditModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editModalState) return;
    const job = receivingJobs.find((entry) => entry.id === editModalState.jobId);
    if (!job) {
      closeEditModal();
      return;
    }

    const nextErrors: Record<string, string> = {};
    const seenItems = new Set<string>();
    const payloadLines: WorkflowJobLineUpdatePayload[] = [];

    editModalState.rows.forEach((row) => {
      if (!hasRowContent(row)) return;
      const itemId = resolveItemIdFromLabel(row.itemLabel, itemLookup) ?? row.itemId;
      const item = itemId ? itemLookup.get(itemId) : undefined;
      const quantity = Number(row.quantity);
      if (!item) {
        nextErrors[row.rowId] = "กรุณาเลือกรายการสินค้า";
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        nextErrors[row.rowId] = "กรุณากรอกจำนวนที่รับมากกว่า 0";
        return;
      }
      if (seenItems.has(item.id)) {
        nextErrors[row.rowId] = "รายการนี้ถูกเลือกแล้ว";
        return;
      }
      seenItems.add(item.id);
      const existingLine = job.lines.find((line) => line.lineId === row.rowId);
      const lineId = existingLine ? existingLine.lineId : randomId("line");
      payloadLines.push({
        line_id: lineId,
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        quantity_expected: Math.round(quantity),
        count_status: existingLine ? existingLine.countStatus : "pending",
        counted_quantity: existingLine?.countedQuantity ?? null,
        package_volume_cm3:
          typeof item.package_volume_cm3 === "number"
            ? item.package_volume_cm3
            : existingLine?.packageVolumeCm3 ?? null,
      });
    });

    if (Object.keys(nextErrors).length > 0) {
      setEditModalState((prev) => (prev ? { ...prev, errors: nextErrors } : prev));
      return;
    }
    if (payloadLines.length === 0) {
      setEditModalState((prev) => (prev ? { ...prev, errors: { general: "ต้องมีอย่างน้อย 1 รายการ" } } : prev));
      return;
    }

    try {
      await updateJobMutation.mutateAsync({
        jobId: job.id,
        payload: { lines: payloadLines },
      });
      closeEditModal();
    } catch {
      setEditModalState((prev) => (prev ? { ...prev, errors: { general: "ไม่สามารถบันทึกการแก้ไขได้" } } : prev));
    }
  }

  async function confirmCancelJob() {
    if (!cancelModalJob) return;
    try {
      await deleteJobMutation.mutateAsync({ job: cancelModalJob });
      closeCancelModal();
    } catch {
      // keep modal open for retry
    }
  }

  function closeCancelModal() {
    setCancelModalJob(null);
  }

  function handleEditJob(jobId: string) {
    const job = receivingJobs.find((entry) => entry.id === jobId);
    if (!job) return;
    openEditModal(job);
  }

  function removeJob(job: ReceivingJob) {
    setReceivingJobs((prev) => prev.filter((jobEntry) => jobEntry.id !== job.id));
    setExpandedJobIds((prev) => prev.filter((id) => id !== job.id));
    setCountInputs((prev) => {
      const next = { ...prev };
      job.lines.forEach((line) => {
        delete next[line.lineId];
      });
      return next;
    });
    setCountErrors((prev) => {
      const next = { ...prev };
      job.lines.forEach((line) => {
        delete next[line.lineId];
      });
      return next;
    });
    if (editModalState?.jobId === job.id) {
      setEditModalState(null);
    }
    if (cancelModalJob?.id === job.id) {
      setCancelModalJob(null);
    }
  }

  function toggleJobExpansion(jobId: string) {
    setExpandedJobIds((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId);
      }
      return [...prev, jobId];
    });
  }

  function handleCountInputChange(lineId: string, value: string) {
    const numeric = Number(value);
    setCountInputs((prev) => ({
      ...prev,
      [lineId]: Number.isFinite(numeric) ? numeric : 0,
    }));
  }

  async function handleSubmitCount(lineId: string) {
    const line = findLineById(lineId);
    if (!line) return;
    if (isLineLocked(line)) {
      return;
    }
    const value = Math.round(countInputs[lineId] ?? line.quantityExpected);
    if (!Number.isFinite(value) || value < 0) {
      setCountErrors((prev) => ({
        ...prev,
        [lineId]: "กรุณากรอกจำนวนที่ถูกต้อง",
      }));
      return;
    }
    setCountErrors((prev) => removeError(prev, lineId));
    await applyCountResult(lineId, value);
  }

  async function applyCountResult(lineId: string, countedQuantity: number) {
    const job = receivingJobs.find((entry) => entry.lines.some((line) => line.lineId === lineId));
    if (!job) return;
    const updatedLines = job.lines.map((line) =>
      line.lineId === lineId
        ? {
            ...line,
            countedQuantity,
            countStatus: countedQuantity === line.quantityExpected ? "matched" : "mismatch",
          }
        : line,
    );
    try {
      await updateJobMutation.mutateAsync({
        jobId: job.id,
        payload: {
          lines: updatedLines.map(mapLineToUpdatePayload),
        },
      });
    } catch {
      // ignore errors here; mutation handles state updates on success
    }
  }

  function findLineById(lineId: string): ReceivingJobLine | undefined {
    for (const job of receivingJobs) {
      const line = job.lines.find((entry) => entry.lineId === lineId);
      if (line) {
        return line;
      }
    }
    return undefined;
  }

  function togglePutawaySelection(lineId: string) {
    setPutawaySelections((prev) => {
      if (prev.includes(lineId)) {
        return prev.filter((id) => id !== lineId);
      }
      return [...prev, lineId];
    });
  }

  function refreshLocationOptions() {
    const base = loadLocationOptions();
    setLocationOptions(applyAllowedItemsToOptions(base, allowedItemMap));
  }

  function getLocationLabelById(id: string | undefined | null): string | null {
    if (!id || id === "__custom__") {
      return null;
    }
    return locationOptions.find((option) => option.id === id)?.label ?? null;
  }

  function openPutawayModal() {
    if (putawaySelections.length === 0) {
      return;
    }
    setPutawayModalState({ open: true });
  }

  function closePutawayModal() {
    setPutawayModalState({ open: false });
  }

  async function handleConfirmPutaway() {
    if (putawaySelections.length === 0) {
      closePutawayModal();
      return;
    }
    const selectedEntries = selectedPutawayEntries;
    if (selectedEntries.length === 0) {
      closePutawayModal();
      return;
    }
    const grouped = new Map<string, { job: ReceivingJob; entries: typeof selectedEntries }>();
    selectedEntries.forEach((entry) => {
      const existing = grouped.get(entry.job.id);
      if (existing) {
        existing.entries.push(entry);
      } else {
        grouped.set(entry.job.id, { job: entry.job, entries: [entry] });
      }
    });

    setPutawayError(null);
    setPutawaySuccessMessage(null);
    setIsSubmittingPutaway(true);

    try {
      const createdCodes: string[] = [];
      for (const [, group] of grouped) {
        const lineAssignments = group.entries.map(({ line }) => {
          const assignment = putawayAssignments[line.lineId];
          const { isCustom, resolvedLocationLabel } = resolveAssignment(line.lineId);
          return {
            receiving_line_id: line.lineId,
            quantity: getLineQuantity(line),
            preferred_location_id: !isCustom ? assignment?.locationId ?? undefined : undefined,
            preferred_location_label: resolvedLocationLabel ?? undefined,
          };
        });

        const job = await createPutawayJobMutation.mutateAsync({
          parent_receiving_job_id: group.job.id,
          line_assignments: lineAssignments,
        });
        createdCodes.push(job.display_code);
      }

      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["putaway-jobs"] });
      setPutawayAssignments((prev) => {
        const next = { ...prev };
        selectedEntries.forEach(({ line }) => {
          delete next[line.lineId];
        });
        return next;
      });
      setPutawaySelections([]);
      setPutawaySuccessMessage(
        createdCodes.length > 0
          ? `สร้างใบงานจัดเก็บแล้ว (${createdCodes.join(", ")})`
          : "สร้างใบงานจัดเก็บเรียบร้อยแล้ว",
      );
      closePutawayModal();
    } catch (error) {
      console.error("putaway_submit_error", error);
      setPutawayError("ไม่สามารถสร้างใบงานจัดเก็บได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmittingPutaway(false);
    }

    function resolveAssignment(lineId: string): {
      isCustom: boolean;
      resolvedLocationId: string;
      resolvedLocationLabel: string | null;
    } {
      const assignment = putawayAssignments[lineId];
      const isCustom = assignment?.locationId === "__custom__";
      const customLabel = assignment?.customLocation?.trim() ?? "";
      const resolvedLocationId = isCustom
        ? `custom:${customLabel || "manual"}`
        : assignment?.locationId ?? "unknown";
      const resolvedLocationLabel =
        (!isCustom && getLocationLabelById(assignment?.locationId)) ||
        (isCustom && (customLabel || "ตำแหน่งกำหนดเอง")) ||
        "ไม่ระบุตำแหน่ง";
      return { isCustom, resolvedLocationId, resolvedLocationLabel };
    }
  }
  function handleUndoFromHistory(record: PutawayHistoryRecord) {
    const job = putawayJobs.find((entry) => entry.id === record.jobId);
    if (!job) {
      setPutawayError("ไม่พบใบงานจัดเก็บที่เลือก");
      return;
    }
    const movement = job.movements?.find((entry) => entry.movement_id === record.id);
    if (!movement) {
      setPutawayError("ไม่พบข้อมูลการจัดเก็บที่ต้องการยกเลิก");
      return;
    }
    const line = findLineForMovement(job, movement);
    if (!line) {
      setPutawayError("ไม่พบรายการสินค้าที่เกี่ยวข้อง");
      return;
    }
    openUndoMovement(job, line);
    setUndoMovementState((prev) =>
      prev ? { ...prev, selectedMovementIds: [movement.movement_id] } : prev,
    );
  }

  function handleFlagLine(lineId: string) {
    setFlaggedLines((prev) => ({
      ...prev,
      [lineId]: { flaggedAt: new Date().toISOString() },
    }));
  }

  function openWorkerModal(job: WorkflowJob, line: WorkflowJobLine) {
    setWorkerModalState({ job, line });
    setWorkerLocationId(line.preferred_location_id ?? null);
    setWorkerCustomLocation(line.preferred_location_label ?? "");
    if (line.preferred_location_id) {
      const option = locationOptions.find((entry) => entry.id === line.preferred_location_id);
      if (option) {
        setWorkerLocationSearch(buildLocationSearchDisplay(option));
      } else {
        setWorkerLocationSearch(line.preferred_location_label ?? line.preferred_location_id);
      }
    } else {
      setWorkerLocationSearch(line.preferred_location_label ?? "");
    }
    const receivingLineId = resolvePutawayLineReceivingId(job, line);
    const remaining = Math.max(line.quantity_expected - sumMovementForLine(job, receivingLineId), 0);
    setWorkerQuantity(String(remaining > 0 ? remaining : line.quantity_expected));
    setWorkerNote("");
    setWorkerEvidenceUrls([]);
    setWorkerMismatchReason("");
    setWorkerModalError(null);
  }

  function closeWorkerModal() {
    setWorkerModalState(null);
    setWorkerLocationId(null);
    setWorkerCustomLocation("");
    setWorkerQuantity("0");
    setWorkerNote("");
    setWorkerEvidenceUrls([]);
    setWorkerMismatchReason("");
    setWorkerModalError(null);
    setWorkerScanValue("");
    setWorkerScanMessage(null);
    setWorkerScannerActive(false);
    setWorkerScannerError(null);
    setWorkerLocationSearch("");
    setIsWorkerSaving(false);
  }

  function applyWorkerScanValue() {
    if (applyWorkerScanInput(workerScanValue)) {
      setWorkerScanValue("");
    }
  }

  function handleLocationSearchInput(value: string) {
    setWorkerLocationSearch(value);
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      setWorkerLocationId("__custom__");
      setWorkerCustomLocation("");
      setWorkerScanMessage(null);
      return;
    }
    const matched = locationOptions.find((option) => {
      const id = option.id?.toLowerCase();
      const code = option.code?.toLowerCase();
      const label = option.label?.toLowerCase();
      const display = buildLocationSearchDisplay(option).toLowerCase();
      return (
        normalized === id ||
        normalized === label ||
        normalized === display ||
        (code ? normalized === code : false)
      );
    });
    if (matched && matched.id) {
      setWorkerLocationId(matched.id);
      setWorkerCustomLocation("");
      setWorkerLocationSearch(buildLocationSearchDisplay(matched));
      setWorkerScanMessage(`เลือกตำแหน่ง: ${matched.label ?? matched.id}`);
    } else {
      setWorkerLocationId("__custom__");
      setWorkerCustomLocation(value);
      setWorkerScanMessage("ไม่พบตำแหน่งในระบบ ระบบจะใช้ค่าที่กรอกเป็นตำแหน่งกำหนดเอง");
    }
  }

  function handleLocationOptionSelect(option: PutawayLocationOption) {
    if (option.id) {
      setWorkerLocationId(option.id);
      setWorkerCustomLocation("");
      setWorkerLocationSearch(buildLocationSearchDisplay(option));
      setWorkerScanMessage(`เลือกตำแหน่ง: ${option.label ?? option.id}`);
    } else {
      setWorkerLocationId("__custom__");
      setWorkerCustomLocation(option.label ?? "");
      setWorkerLocationSearch(option.label ?? "");
    }
    setWorkerLocationOptionsOpen(false);
  }

  function openUndoMovement(job: WorkflowJob, line: WorkflowJobLine) {
    const receivingId = resolvePutawayLineReceivingId(job, line);
    const movements =
      job.movements
        ?.filter((movement) => movement.receiving_line_id === receivingId)
        .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()) ?? [];
    if (movements.length === 0) {
      setPutawayError("ไม่พบข้อมูลการจัดเก็บสำหรับรายการนี้");
      return;
    }
    setUndoMovementError(null);
    setUndoMovementState({
      job,
      line,
      selectedMovementIds: movements.length > 0 ? [movements[0].movement_id] : [],
      movements,
    });
  }

  async function handleWorkerEvidenceUpload(event: React.ChangeEvent<HTMLInputElement>) {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }
    setWorkerUploading(true);
    setWorkerModalError(null);
    try {
      const uploads: string[] = [];
      for (const file of Array.from(event.target.files)) {
        const attachment = await uploadAttachment(file, "putaway");
        uploads.push(buildWorkerAssetUrl(attachment));
      }
      setWorkerEvidenceUrls((prev) => [...prev, ...uploads]);
    } catch (error) {
      console.error("upload_evidence_failed", error);
      setWorkerModalError("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setWorkerUploading(false);
      event.target.value = "";
    }
  }

  async function submitWorkerMovement() {
    if (!workerModalState) {
      return;
    }
    if (isWorkerSaving) {
      return;
    }
    const { job, line } = workerModalState;
    const numericQuantity = Number(workerQuantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      setWorkerModalError("กรุณากรอกจำนวนที่ถูกต้อง");
      return;
    }
    if (workerEvidenceUrls.length === 0) {
      setWorkerModalError("กรุณาแนบรูปอย่างน้อย 1 รูป");
      return;
    }
    const resolved = resolveWorkerLocation();
    if (!resolved.locationId && !resolved.locationLabel) {
      setWorkerModalError("กรุณาสแกนหรือเลือกตำแหน่งจัดเก็บ");
      return;
    }
    const receivingLineId = resolvePutawayLineReceivingId(job, line);
    const existingTotal = sumMovementForLine(job, receivingLineId);
    const remaining = Math.max(line.quantity_expected - existingTotal, 0);
    const isLocationMismatch =
      Boolean(line.preferred_location_id) &&
      resolved.locationId &&
      line.preferred_location_id !== resolved.locationId;
    const isQuantityOver = numericQuantity > remaining;
    const requiresReason = isLocationMismatch || isQuantityOver;
    if (requiresReason && workerMismatchReason.trim().length < 3) {
      setWorkerModalError("กรุณาระบุเหตุผลเมื่อมีการจัดเก็บผิดปกติ");
      return;
    }
    setWorkerModalError(null);

    const overridesTotals: Record<string, number> = {
      [receivingLineId]: existingTotal + numericQuantity,
    };
    const nextStatus = isJobSatisfied(job, overridesTotals) ? "completed" : "in_progress";
    const movementNoteParts = [workerNote.trim()];
    if (requiresReason) {
      movementNoteParts.push(`เหตุผล: ${workerMismatchReason.trim()}`);
    }
    try {
      setIsWorkerSaving(true);
      await completePutawayJobMutation.mutateAsync({
        jobId: job.id,
        payload: {
          status: nextStatus,
          movements: [
            {
              receiving_line_id: receivingLineId,
              location_id: resolved.locationId ?? "manual",
              location_label: resolved.locationLabel ?? resolved.locationId ?? "manual",
              quantity: numericQuantity,
              unit: line.unit,
              note: movementNoteParts.filter(Boolean).join(" | ") || undefined,
              evidence_urls: workerEvidenceUrls,
              location_mismatch: isLocationMismatch,
              quantity_mismatch: isQuantityOver,
            },
          ],
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["putaway-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
      closeWorkerModal();
    } catch (error) {
      console.error("submit_worker_movement_failed", error);
      setWorkerModalError("ไม่สามารถบันทึกการจัดเก็บได้ กรุณาลองใหม่");
    } finally {
      setIsWorkerSaving(false);
    }

    function resolveWorkerLocation(): { locationId: string | null; locationLabel: string | null } {
      if (workerLocationId && workerLocationId !== "__custom__") {
      const label = (getLocationLabelById(workerLocationId) ?? workerCustomLocation) || null;
        return { locationId: workerLocationId, locationLabel: label };
      }
      const custom = workerCustomLocation.trim();
      return {
        locationId: custom ? `manual:${custom}` : null,
        locationLabel: custom || null,
      };
    }
  }

  async function confirmCancelPutawayJob() {
    if (!cancelPutawayJob) {
      return;
    }
    try {
      await completePutawayJobMutation.mutateAsync({
        jobId: cancelPutawayJob.id,
        payload: { status: "cancelled" },
      });
      await queryClient.invalidateQueries({ queryKey: ["putaway-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
      setCancelPutawayJob(null);
    } catch (error) {
      console.error("cancel_putaway_job_failed", error);
      setPutawayError("ไม่สามารถยกเลิกใบงานจัดเก็บได้ กรุณาลองใหม่");
    }
  }

  async function confirmApproveJob() {
    if (!reviewPutawayJob) {
      return;
    }
    try {
      await completePutawayJobMutation.mutateAsync({
        jobId: reviewPutawayJob.id,
        payload: { status: "completed" },
      });
      await queryClient.invalidateQueries({ queryKey: ["putaway-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["receiving-jobs"] });
      setReviewPutawayJob(null);
    } catch (error) {
      console.error("approve_putaway_job_failed", error);
      setPutawayError("ไม่สามารถอนุมัติใบงานได้ กรุณาลองใหม่");
    }
  }

  async function confirmUndoMovement() {
    if (!undoMovementState || undoMovementState.selectedMovementIds.length === 0) {
      setUndoMovementError("กรุณาเลือกรายการที่จะย้อนกลับอย่างน้อย 1 รายการ");
      return;
    }
    try {
      for (const movementId of undoMovementState.selectedMovementIds) {
        // เรียกทีละรายการเพื่อให้ state backend ตรงและลดโอกาส race condition
        // eslint-disable-next-line no-await-in-loop
        await deletePutawayMovementMutation.mutateAsync({
          jobId: undoMovementState.job.id,
          movementId,
        });
      }
      setUndoMovementState(null);
      setUndoMovementError(null);
    } catch (error) {
      console.error("undo_movement_failed", error);
      setUndoMovementError("ไม่สามารถย้อนการจัดเก็บได้ กรุณาลองใหม่");
    }
  }

  function getValidLocationOptionsForLine(line: ReceivingJobLine): PutawayLocationOption[] {
    return locationOptions.filter((option) => isOptionValidForLine(line, option, line.lineId));
  }

  function isOptionValidForLine(
    line: ReceivingJobLine,
    option: PutawayLocationOption,
    excludeLineId?: string,
  ): boolean {
    if (!isOptionAllowedForItem(option, line.itemId)) {
      return false;
    }
    const capacityVolume = getLocationCapacityVolume(option);
    const lineVolume = getLineVolume(line);
    if (option.id && capacityVolume && capacityVolume > 0 && lineVolume) {
      const projectedVolume = getProjectedVolumeUsage(option.id, excludeLineId ?? line.lineId);
      if (projectedVolume + lineVolume > capacityVolume) {
        return false;
      }
      return true;
    }
    if (option.capacity && option.capacity > 0 && option.id) {
      const projectedUsage = getProjectedUsage(option.id, excludeLineId ?? line.lineId);
      if (projectedUsage + getLineQuantity(line) > option.capacity) {
        return false;
      }
    }
    return true;
  }

  function isOptionAllowedForItem(option: PutawayLocationOption, itemId: string): boolean {
    if (!option.allowedItemIds || option.allowedItemIds.length === 0) {
      return true;
    }
    return option.allowedItemIds.includes(itemId);
  }

  function getProjectedUsage(locationId: string, excludeLineId?: string): number {
    let used = locationUsageUnits.get(locationId) ?? 0;
    selectedPutawayEntries.forEach(({ line }) => {
      if (line.lineId === excludeLineId) {
        return;
      }
      const assignment = putawayAssignments[line.lineId];
      if (!assignment || assignment.locationId !== locationId || assignment.locationId === "__custom__") {
        return;
      }
      used += getLineQuantity(line);
    });
    return used;
  }

  function getProjectedVolumeUsage(locationId: string, excludeLineId?: string): number {
    let used = locationUsageVolume.get(locationId) ?? 0;
    selectedPutawayEntries.forEach(({ line }) => {
      if (line.lineId === excludeLineId) {
        return;
      }
      const assignment = putawayAssignments[line.lineId];
      if (!assignment || assignment.locationId !== locationId || assignment.locationId === "__custom__") {
        return;
      }
      const lineVolume = getLineVolume(line);
      if (lineVolume) {
        used += lineVolume;
      }
    });
    return used;
  }

  const readyForPutaway = useMemo(
    () =>
      receivingJobs.flatMap((job) =>
        job.lines
          .filter(
            (line) =>
              line.countStatus === "matched" &&
              ((line.putawayStatus ?? "pending") === "pending" || !line.putawayStatus) &&
              (!line.putawayJobIds || line.putawayJobIds.length === 0),
          )
          .map((line) => ({ job, line })),
      ),
    [receivingJobs],
  );

  useEffect(() => {
    setPutawaySelections((prev) =>
      prev.filter((lineId) => readyForPutaway.some((entry) => entry.line.lineId === lineId)),
    );
  }, [readyForPutaway]);

  const needAttention = useMemo(
    () =>
      receivingJobs.flatMap((job) =>
        job.lines.filter((line) => line.countStatus === "mismatch").map((line) => ({ job, line })),
      ),
    [receivingJobs],
  );
  const readySelectionSet = useMemo(() => new Set(putawaySelections), [putawaySelections]);
  const selectedPutawayEntries = useMemo(
    () => readyForPutaway.filter((entry) => putawaySelections.includes(entry.line.lineId)),
    [readyForPutaway, putawaySelections],
  );
  const workerQueue = useMemo(
    () => putawayJobs.filter((job) => job.status === "open" || job.status === "in_progress"),
    [putawayJobs],
  );
  const filteredLocationOptions = useMemo(() => {
    const query = workerLocationSearch.trim().toLowerCase();
    const candidates =
      query.length === 0
        ? locationOptions
        : locationOptions.filter((option) => {
            const id = option.id?.toLowerCase() ?? "";
            const code = option.code?.toLowerCase() ?? "";
            const label = option.label?.toLowerCase() ?? "";
            return (
              id.includes(query) ||
              code.includes(query) ||
              label.includes(query) ||
              buildLocationSearchDisplay(option).toLowerCase().includes(query)
            );
          });
    return candidates.slice(0, 8);
  }, [workerLocationSearch, locationOptions]);

  const locationUsageUnits = useMemo(() => {
    const usage = new Map<string, number>();
    Object.values(storedLines).forEach((info) => {
      if (!info.locationId || info.locationId === "unknown" || info.locationId.startsWith("custom")) {
        return;
      }
      usage.set(info.locationId, (usage.get(info.locationId) ?? 0) + info.quantity);
    });
    return usage;
  }, [storedLines]);

  const locationUsageVolume = useMemo(() => {
    const usage = new Map<string, number>();
    locationOptions.forEach((option) => {
      if (!option.id) {
        return;
      }
      const baseVolume =
        typeof option.usedVolumeCm3 === "number" && Number.isFinite(option.usedVolumeCm3) && option.usedVolumeCm3 > 0
          ? option.usedVolumeCm3
          : 0;
      usage.set(option.id, baseVolume);
    });
    return usage;
  }, [locationOptions]);

  const isLineLocked = useCallback((line: ReceivingJobLine): boolean => {
    if (Array.isArray(line.putawayJobIds) && line.putawayJobIds.length > 0) {
      return true;
    }
    if (line.putawayStatus && line.putawayStatus !== "pending") {
      return true;
    }
    return false;
  }, []);

useEffect(() => {
  setPutawayAssignments((prev) => {
      let changed = false;
      const next: typeof prev = {};
      readyForPutaway.forEach(({ line }) => {
        const existing = prev[line.lineId];
        if (existing) {
          if (existing.locationId !== "__custom__") {
            const option = locationOptions.find((entry) => entry.id === existing.locationId);
            if (option && isOptionAllowedForItem(option, line.itemId)) {
              next[line.lineId] = existing;
              return;
            }
          } else {
            next[line.lineId] = existing;
            return;
          }
        }
        const fallback = locationOptions.find((option) => isOptionAllowedForItem(option, line.itemId));
        next[line.lineId] = fallback
          ? { locationId: fallback.id, customLocation: "" }
          : { locationId: "__custom__", customLocation: "" };
        changed = true;
      });
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
  }, [readyForPutaway, locationOptions]);

useEffect(() => {
  if (!workerScannerActive || !workerModalState) {
      return;
    }
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    const BarcodeCtor = window.BarcodeDetector;
    if (!BarcodeCtor) {
      setWorkerScannerError("เบราว์เซอร์ไม่รองรับการสแกนด้วยกล้อง กรุณาใช้การกรอกหรือเครื่องสแกนภายนอก");
      setWorkerScannerActive(false);
      return;
    }
    const videoElement = workerScannerVideoRef.current;
    if (!videoElement) {
      return;
    }

    let detector: BrowserBarcodeDetector | null = new BarcodeCtor({
      formats: ["qr_code", "code_128", "code_39", "data_matrix"],
    });
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let stopped = false;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        videoElement.srcObject = stream;
        await videoElement.play();
        scanLoop();
      } catch (error) {
        console.error("worker_scanner_camera_error", error);
        setWorkerScannerError("ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตให้เข้าถึงกล้องหรือใช้วิธีกดรหัสแทน");
        setWorkerScannerActive(false);
      }
    }

    async function scanLoop() {
      if (!detector || !videoElement || stopped) {
        return;
      }
      try {
        const results = await detector.detect(videoElement);
        if (results && results.length > 0) {
          const value = results[0].rawValue;
          if (value) {
            applyWorkerScanInput(value);
            setWorkerScannerError(null);
            setWorkerScannerActive(false);
            stop();
            return;
          }
        }
      } catch (error) {
        console.error("worker_scanner_detect_error", error);
        setWorkerScannerError("ไม่สามารถอ่านโค้ดได้ กรุณาจัดตำแหน่งใหม่");
      }
      rafId = window.requestAnimationFrame(scanLoop);
    }

    function stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
      }
      detector = null;
    }

    startCamera();

    return () => {
      stop();
    };
  }, [workerScannerActive, workerModalState, applyWorkerScanInput]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!workerLocationSearchRef.current) {
        return;
      }
      if (!workerLocationSearchRef.current.contains(event.target as Node)) {
        setWorkerLocationOptionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <section className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold">งานคลังสินค้า</h1>
          <p className="text-sm text-slate-600">
            เลือกขั้นตอนที่ต้องการดำเนินการ เริ่มจากการนัดรับ → ตรวจนับ → จัดเก็บ → ตรวจสอบ
          </p>
          <div className="flex flex-wrap gap-2">
            {TASK_TABS.map((task) => (
              <button
                key={task.key}
                type="button"
                onClick={() => setActiveTask(task.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTask === task.key
                    ? "bg-slate-900 text-white shadow"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {task.label}
              </button>
            ))}
          </div>
        </header>

        {activeTask === "receiving" ? renderReceivingSection() : null}
        {activeTask === "counting" ? renderCountingSection() : null}
        {activeTask === "putaway" ? renderPutawaySection() : null}
        {activeTask === "audit" ? renderAuditSection() : null}
      </section>
      {putawayModalState.open ? renderPutawayModal() : null}
      {workerModalState ? renderWorkerModal() : null}
      {cancelPutawayJob ? renderCancelPutawayModal() : null}
      {reviewPutawayJob ? renderReviewPutawayModal() : null}
      {undoMovementState ? renderUndoMovementModal() : null}
    </>
  );

  function renderReceivingSection() {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">สร้างใบงานการนัดรับ</h2>
          <p className="mt-1 text-sm text-slate-600">
            บันทึกรายการสินค้าตามใบส่งของ เพื่อส่งต่อให้ขั้นตอนตรวจนับและจัดเก็บ
          </p>
          <form className="mt-4 space-y-4" onSubmit={handleSubmitReceivingDrafts}>
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">รายการสินค้า</th>
                    <th className="px-4 py-3">จำนวนที่รับในรอบนี้</th>
                    <th className="px-4 py-3">หน่วย</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {receivingDraftRows.map((row, index) => {
                    const item = row.itemId ? itemLookup.get(row.itemId) : undefined;
                    const isBlank = !hasRowContent(row);
                    const isAutocompleteOpen = activeAutocompleteId === row.rowId;
                    const suggestions = isAutocompleteOpen
                      ? getItemSuggestions(row.itemLabel, { excludeKey: row.rowId })
                      : [];
                    const showLoadingState = isAutocompleteOpen && itemsLoading && items.length === 0;
                    return (
                      <tr
                        key={row.rowId}
                        className={`border-t border-slate-100 ${
                          draftErrors[row.rowId] ? "bg-rose-50/60" : "bg-white"
                        }`}
                      >
                        <td className="relative px-4 py-3 align-top">
                          <div className={`relative ${isAutocompleteOpen ? "z-50" : ""}`}>
                            <input
                              type="text"
                              value={row.itemLabel}
                              onChange={(event) => handleDraftItemInput(row.rowId, event.target.value)}
                              onFocus={() => openAutocomplete(row.rowId)}
                              onBlur={() => handleDraftItemBlur(row.rowId)}
                              placeholder={
                                index === receivingDraftRows.length - 1
                                  ? "เลือก SKU/ชื่อสินค้า (เพิ่มรายการ)"
                                  : "เลือก SKU/ชื่อสินค้า"
                              }
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              autoComplete="off"
                            />
                            {isAutocompleteOpen ? (
                              <ul
                                className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                                onMouseDown={(event) => event.preventDefault()}
                              >
                                {showLoadingState ? (
                                  <li className="px-3 py-2 text-xs text-slate-400">กำลังโหลดรายการสินค้า...</li>
                                ) : suggestions.length === 0 ? (
                                  <li className="px-3 py-2 text-xs text-slate-400">ไม่พบรายการที่ตรงกับคำค้น</li>
                                ) : (
                                  suggestions.map((suggestion) => (
                                    <li key={suggestion.id}>
                                      <button
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handlePickDraftItem(row.rowId, suggestion)}
                                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs transition hover:bg-slate-100"
                                      >
                                        <span className="font-medium text-slate-700">
                                          {formatItemLabel(suggestion)}
                                        </span>
                                        <span className="text-[11px] text-slate-500">{suggestion.unit}</span>
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            ) : null}
                          </div>
                          {draftErrors[row.rowId] ? (
                            <p className="mt-1 text-xs text-rose-600">{draftErrors[row.rowId]}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input
                            type="number"
                            min="0"
                            value={row.quantity}
                            onChange={(event) => handleDraftQuantityChange(row.rowId, event.target.value)}
                            className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
                            placeholder="จำนวน"
                          />
                        </td>
                        <td className="px-4 py-3 align-top text-sm text-slate-600">
                          {item?.unit ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          {!isBlank ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveDraftRow(row.rowId)}
                              className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                            >
                              ลบ
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">เพิ่มรายการใหม่ได้จากบรรทัดนี้</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <div className="space-x-3">
                {itemsLoading ? <span>กำลังโหลดรายการสินค้า...</span> : null}
                {itemsError ? <span className="text-red-500">โหลดรายการสินค้าไม่สำเร็จ</span> : null}
              </div>
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-60"
                disabled={!canSubmitDrafts || createJobMutation.isLoading}
              >
                {createJobMutation.isLoading ? "กำลังบันทึก..." : "บันทึกใบงานการนัดรับ"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">ใบงานการนัดรับล่าสุด</h3>
          <p className="mt-1 text-sm text-slate-600">
            ใบงานหนึ่งใบรองรับหลายรายการ เพื่อส่งต่อให้ขั้นตอนตรวจนับและจัดเก็บ
          </p>
          {(receivingJobsLoading || receivingJobsError) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {receivingJobsLoading ? <span className="text-slate-500">กำลังโหลดใบงาน...</span> : null}
              {receivingJobsError ? (
                <span className="text-rose-600">ไม่สามารถโหลดใบงานได้ กรุณาลองใหม่</span>
              ) : null}
            </div>
          )}
          {receivingJobs.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">ยังไม่มีใบงานการนัดรับ</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ใบงาน</th>
                    <th className="px-4 py-3">จำนวนตามใบส่งของ</th>
                    <th className="px-4 py-3">ผลตรวจนับ</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                    <th className="px-4 py-3">สร้างเมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {receivingJobs.map((job) => {
                    const jobStatus = computeJobStatus(job);
                    const totalExpected = job.lines.reduce((acc, line) => acc + line.quantityExpected, 0);
                    const totalCounted = job.lines
                      .filter((line) => typeof line.countedQuantity === "number")
                      .reduce((acc, line) => acc + (line.countedQuantity ?? 0), 0);
                    const jobLocked = hasReceivingJobProgress(job);
                    const canEditJob = !jobLocked;
                    const canCancelJob = !jobLocked;
                    const expanded = expandedJobIds.includes(job.id);
                    return (
                      <Fragment key={job.id}>
                        <tr className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleJobExpansion(job.id)}
                              className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
                            >
                              <span
                                aria-hidden
                                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                                  expanded ? "rotate-90" : ""
                                }`}
                              >
                                ▶
                              </span>
                              <span className="font-mono text-xs text-slate-500">{job.displayCode}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            {totalExpected.toLocaleString()} ชิ้น ( {job.lines.length} รายการ )
                          </td>
                          <td className="px-4 py-3">
                            {totalCounted > 0 ? `${totalCounted.toLocaleString()} ชิ้น` : "-"}
                          </td>
                          <td className="px-4 py-3">{renderStatusBadge(jobStatus)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditJob(job.id)}
                                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canEditJob}
                              >
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancelModalJob(job)}
                                className="rounded-md border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canCancelJob}
                              >
                                ยกเลิกใบงาน
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {new Date(job.createdAt).toLocaleString()}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-slate-100 bg-slate-50/60">
                            <td colSpan={6} className="px-6 py-4">
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="min-w-full text-left text-sm">
                                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                                    <tr>
                                      <th className="px-4 py-3">สินค้า</th>
                                      <th className="px-4 py-3">จำนวน</th>
                                      <th className="px-4 py-3">ผลตรวจนับ</th>
                                      <th className="px-4 py-3">สถานะ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {job.lines.map((line) => (
                                      <tr key={line.lineId} className="border-t border-slate-100">
                                        <td className="px-4 py-2">
                                          <div className="font-medium">{line.name}</div>
                                          <div className="text-xs text-slate-500">SKU {line.sku}</div>
                                        </td>
                                        <td className="px-4 py-2">
                                          {line.quantityExpected.toLocaleString()} {line.unit}
                                        </td>
                                        <td className="px-4 py-2">
                                          {line.countedQuantity !== undefined
                                            ? `${line.countedQuantity.toLocaleString()} ${line.unit}`
                                            : "-"}
                                        </td>
                                        <td className="px-4 py-2">{renderStatusBadge(line.countStatus)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {editModalState ? (
          <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
              <form onSubmit={handleSubmitEditModal} className="flex flex-col gap-4">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">แก้ไขใบงาน {editModalState.displayCode}</h3>
                    <p className="text-xs text-slate-500">
                      สร้างเมื่อ {new Date(editModalState.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                  >
                    ปิด
                  </button>
                </header>
                <div className="max-h-[60vh] overflow-y-auto px-6">
                  {editModalState.errors.general ? (
                    <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-600">
                      {editModalState.errors.general}
                    </div>
                  ) : null}
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">สินค้า</th>
                        <th className="px-4 py-3">จำนวนที่รับในรอบนี้</th>
                        <th className="px-4 py-3">หน่วย</th>
                        <th className="px-4 py-3 text-right">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editModalState.rows.map((row, index) => {
                        const item = row.itemId ? itemLookup.get(row.itemId) : undefined;
                        const isBlank = !hasRowContent(row);
                        const isOpen = activeAutocompleteId === row.rowId;
                        const suggestions = isOpen
                          ? getItemSuggestions(row.itemLabel, { excludeKey: row.rowId })
                          : [];
                        const showLoading = isOpen && itemsLoading && items.length === 0;
                        return (
                          <tr
                            key={row.rowId}
                            className={`border-t border-slate-100 ${
                              editModalState.errors[row.rowId] ? "bg-rose-50/60" : "bg-white"
                            }`}
                          >
                            <td className="relative px-4 py-3 align-top">
                              <div className={`relative ${isOpen ? "z-50" : ""}`}>
                                <input
                                  type="text"
                                  value={row.itemLabel}
                                  onChange={(event) => handleEditRowItemInput(row.rowId, event.target.value)}
                                  onBlur={() => handleEditRowItemBlur(row.rowId)}
                                  onFocus={() => openAutocomplete(row.rowId)}
                                  placeholder={
                                    index === editModalState.rows.length - 1
                                      ? "เลือก SKU/ชื่อสินค้า (เพิ่มรายการ)"
                                      : "เลือก SKU/ชื่อสินค้า"
                                  }
                                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  autoComplete="off"
                                />
                                {isOpen ? (
                                  <ul
                                    className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
                                    onMouseDown={(event) => event.preventDefault()}
                                  >
                                    {showLoading ? (
                                      <li className="px-3 py-2 text-xs text-slate-400">กำลังโหลดรายการสินค้า...</li>
                                    ) : suggestions.length === 0 ? (
                                      <li className="px-3 py-2 text-xs text-slate-400">ไม่พบรายการที่ตรงกับคำค้น</li>
                                    ) : (
                                      suggestions.map((suggestion) => (
                                        <li key={suggestion.id}>
                                          <button
                                            type="button"
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => handlePickEditRowItem(row.rowId, suggestion)}
                                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs transition hover:bg-slate-100"
                                          >
                                            <span className="font-medium text-slate-700">
                                              {formatItemLabel(suggestion)}
                                            </span>
                                            <span className="text-[11px] text-slate-500">{suggestion.unit}</span>
                                          </button>
                                        </li>
                                      ))
                                    )}
                                  </ul>
                                ) : null}
                              </div>
                              {editModalState.errors[row.rowId] ? (
                                <p className="mt-1 text-xs text-rose-600">{editModalState.errors[row.rowId]}</p>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <input
                                type="number"
                                min="0"
                                value={row.quantity}
                                onChange={(event) => handleEditRowQuantityChange(row.rowId, event.target.value)}
                                className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
                                placeholder="จำนวน"
                              />
                            </td>
                            <td className="px-4 py-3 align-top text-sm text-slate-600">{item?.unit ?? "-"}</td>
                            <td className="px-4 py-3 align-top text-right">
                              {!isBlank ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveEditRow(row.rowId)}
                                  className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                                >
                                  ลบ
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">เพิ่มรายการใหม่ได้จากบรรทัดนี้</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
                  <button
                    type="button"
                    onClick={closeEditModal}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-60"
                disabled={updateJobMutation.isLoading}
              >
                {updateJobMutation.isLoading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
                </footer>
              </form>
            </div>
          </div>
        ) : null}
        {cancelModalJob ? (
          <div className="fixed inset-0 z-[998] flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-800">ยืนยันการยกเลิกใบงาน</h3>
                <p className="mt-1 text-sm text-slate-600">
                  ใบงาน {cancelModalJob.displayCode} จะถูกลบพร้อมรายการทั้งหมด
                </p>
              </div>
              <div className="px-6 py-4 text-sm text-slate-700">
                <ul className="space-y-2">
                  {cancelModalJob.lines.map((line) => (
                    <li key={line.lineId} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="font-medium">{line.name}</div>
                      <div className="text-xs text-slate-500">SKU {line.sku}</div>
                      <div className="text-xs text-slate-600">
                        {line.quantityExpected.toLocaleString()} {line.unit}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-amber-600">
                  การยกเลิกไม่สามารถย้อนกลับได้ หากต้องการเปลี่ยนแปลงให้เลือกแก้ไขแทน
                </p>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <button
                  type="button"
                  onClick={closeCancelModal}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  กลับไปก่อน
                </button>
                <button
                  type="button"
                  onClick={confirmCancelJob}
                  disabled={deleteJobMutation.isLoading}
                  className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-60"
                >
                  ยืนยันยกเลิก
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderCountingSection() {
    return (
      <div className="space-y-6">
        {receivingJobs.length === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            ยังไม่มีใบงานสำหรับตรวจนับ กรุณาเริ่มจากขั้นตอนการนัดรับ
          </section>
        ) : (
          receivingJobs.map((job) => (
            <section key={job.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">ใบงาน {job.displayCode}</h2>
                  <p className="text-xs text-slate-500">สร้างเมื่อ {new Date(job.createdAt).toLocaleString()}</p>
                </div>
                <div className="text-sm text-slate-600">
                  รวม {job.lines.length} รายการ · {job.lines.reduce((acc, line) => acc + line.quantityExpected, 0)} ชิ้น
                </div>
              </header>
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">สินค้า</th>
                      <th className="px-4 py-3">จำนวนตามใบส่งของ</th>
                      <th className="px-4 py-3">นับได้จริง</th>
                      <th className="px-4 py-3">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.lines.map((line) => {
                      const inputValue = countInputs[line.lineId] ?? line.quantityExpected;
                      const lineLocked = isLineLocked(line);
                      return (
                        <tr key={line.lineId} className="border-t border-slate-100 align-top">
                          <td className="px-4 py-3">
                            <div className="font-medium">{line.name}</div>
                            <div className="text-xs text-slate-500">SKU {line.sku} · ใบงาน {job.displayCode}</div>
                          </td>
                          <td className="px-4 py-3">
                            {line.quantityExpected.toLocaleString()} {line.unit}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={inputValue}
                                onChange={(event) => handleCountInputChange(line.lineId, event.target.value)}
                                className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                                disabled={lineLocked}
                              />
                              <span className="text-xs text-slate-500">{line.unit}</span>
                            </div>
                            {countErrors[line.lineId] ? (
                              <p className="mt-1 text-xs text-rose-600">{countErrors[line.lineId]}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {renderStatusBadge(line.countStatus)}
                              <button
                                type="button"
                                onClick={() => handleSubmitCount(line.lineId)}
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                  line.countStatus === "pending"
                                    ? "bg-slate-900 text-white hover:bg-slate-800"
                                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                                }`}
                                disabled={lineLocked}
                              >
                                {lineLocked
                                  ? "ถูกล็อก"
                                  : line.countStatus === "pending"
                                  ? "ส่งผลตรวจนับ"
                                  : "แก้ไขผล"}
                              </button>
                              {lineLocked ? (
                                <span className="text-xs text-amber-600">
                                  ล็อกเพราะอยู่ในงานจัดเก็บ/มีการจัดเก็บแล้ว
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    );
  }

  function renderPutawaySection() {
    const hasSelection = selectedPutawayEntries.length > 0;
    const locationSummary = locationOptions.length
      ? `ตำแหน่งพร้อมใช้ ${locationOptions.length} จุด`
      : "ยังไม่มีตำแหน่งจากหน้าจัดการ Location (สามารถป้อนเองในขั้นตอนถัดไป)";
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">การจัดเก็บ (Putaway)</h2>
          <p className="mt-1 text-sm text-slate-600">
            เลือกสินค้าที่ตรวจนับครบแล้ว เพื่อจัดเก็บเข้าตำแหน่งที่เหมาะสม
          </p>
          {putawayError ? <p className="mt-2 text-sm text-rose-600">{putawayError}</p> : null}
          {putawaySuccessMessage ? (
            <p className="mt-2 text-sm text-emerald-700">{putawaySuccessMessage}</p>
          ) : null}
          {readyForPutaway.length > 0 ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-emerald-900">
                  เลือกแล้ว {selectedPutawayEntries.length} รายการ
                </span>
                <button
                  type="button"
                  onClick={openPutawayModal}
                  disabled={!hasSelection}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  สร้างใบงานจัดเก็บ
                </button>
                <button
                  type="button"
                  onClick={refreshLocationOptions}
                  className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-white"
                >
                  รีเฟรชตำแหน่ง
                </button>
              </div>
              <p className="mt-1 text-xs text-emerald-900/80">{locationSummary}</p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-emerald-700">
              รายการที่พร้อมจัดเก็บ ({readyForPutaway.length})
            </h3>
            {readyForPutaway.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">ยังไม่มีรายการที่ผ่านการตรวจนับครบ</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm text-slate-600">
                {readyForPutaway.map(({ job, line }) => {
                  const item = line.itemId ? itemLookup.get(line.itemId) : undefined;
                  const imageUrl = item?.image_url;
                  const counted = line.countedQuantity ?? line.quantityExpected;
                  const isSelected = readySelectionSet.has(line.lineId);
                  return (
                    <li key={line.lineId}>
                      <button
                        type="button"
                        onClick={() => togglePutawaySelection(line.lineId)}
                        className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                          isSelected
                            ? "border-emerald-500 ring-2 ring-emerald-200"
                            : "border-emerald-200 hover:border-emerald-400"
                        }`}
                      >
                        <div className="flex gap-4">
                          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50">
                            {imageUrl ? (
                              <img src={imageUrl} alt={line.name} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs font-medium text-slate-500">ไม่มีรูป</span>
                            )}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="text-sm font-semibold text-slate-900">{line.name}</div>
                            <div className="text-xs text-slate-500">SKU {line.sku}</div>
                            {item?.category_name ? (
                              <div className="text-xs text-slate-500">หมวดหมู่: {item.category_name}</div>
                            ) : null}
                            {item?.description ? (
                              <p className="text-xs text-slate-600">{item.description}</p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">นับได้จริง</p>
                            <p className="text-lg font-semibold text-emerald-700">
                              {counted.toLocaleString()} <span className="text-sm">{line.unit}</span>
                            </p>
                            <p className="text-xs text-slate-500">ใบงาน {job.displayCode}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="text-slate-500">คลิกเพื่อ{isSelected ? "ยกเลิกการเลือก" : "เลือก"}</span>
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 font-semibold text-emerald-700">
                              ✓ เลือกแล้ว
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-700">
              รายการที่ต้องตรวจสอบเพิ่ม ({needAttention.length})
            </h3>
            {needAttention.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">ยังไม่มีรายการที่ขาดหรือเกิน</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm text-slate-600">
                {needAttention.map(({ job, line }) => {
                  const item = line.itemId ? itemLookup.get(line.itemId) : undefined;
                  const counted = line.countedQuantity ?? 0;
                  const flagged = Boolean(flaggedLines[line.lineId]);
                  return (
                    <li key={line.lineId} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                      <div className="flex gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="text-sm font-semibold text-slate-900">{line.name}</div>
                          <div className="text-xs text-slate-500">ใบงาน {job.displayCode}</div>
                          <div className="text-xs text-amber-600">
                            นับได้ {counted.toLocaleString()} / {line.quantityExpected.toLocaleString()} {line.unit}
                          </div>
                          {item?.description ? (
                            <p className="text-xs text-slate-500">{item.description}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => handleFlagLine(line.lineId)}
                          disabled={flagged}
                          className="rounded-md border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {flagged ? "แจ้งแล้ว" : "แจ้งตรวจสอบ"}
                        </button>
                        {flagged ? (
                          <span className="text-[11px] text-amber-700">
                            แจ้งเมื่อ {formatDateTime(flaggedLines[line.lineId].flaggedAt)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                );
              })}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                งานจัดเก็บที่รอแรงงาน ({workerQueue.length})
              </h3>
              <p className="text-xs text-slate-500">
                แสดงใบงาน Putaway ที่สถานะเปิดหรือกำลังดำเนินการ
              </p>
            </div>
          </div>
          {workerQueue.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">ยังไม่มีใบงานที่รอจัดเก็บ</p>
          ) : (
            <div className="mt-4 space-y-4">
              {workerQueue.map((job) => (
                <div key={job.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    ใบงาน {job.display_code}
                  </h4>
                  <p className="text-xs text-slate-500">
                    สถานะ: {job.status === "open" ? "รอดำเนินการ" : "กำลังจัดเก็บ"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">รวม {job.lines.length} รายการ</span>
                  {isJobReadyForApproval(job) && job.status !== "completed" ? (
                    <button
                      type="button"
                      onClick={() => setReviewPutawayJob(job)}
                      className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                      อนุมัติใบงาน
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCancelPutawayJob(job)}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    ยกเลิกใบงาน
                  </button>
                </div>
              </header>
                  <ul className="mt-3 divide-y divide-slate-100">
                    {job.lines.map((line) => {
                      const receivingId = resolvePutawayLineReceivingId(job, line);
                      const moved = sumMovementForLine(job, receivingId);
                      const remaining = Math.max(line.quantity_expected - moved, 0);
                      const preferredLabel =
                        line.preferred_location_label ??
                        (line.preferred_location_id
                          ? getLocationLabelById(line.preferred_location_id)
                          : null);
                      const lineMovements =
                        job.movements
                          ?.filter((movement) => movement.receiving_line_id === receivingId)
                          .sort(
                            (a, b) =>
                              new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
                          ) ?? [];
                      const isComplete = remaining <= 0;
                      const hasMovements = lineMovements.length > 0;
                      return (
                        <li key={line.line_id} className="py-3 text-sm text-slate-600">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <div className="font-semibold text-slate-900">{line.name}</div>
                              <div className="text-xs text-slate-500">SKU {line.sku}</div>
                              <div className="text-xs text-slate-500">
                                คงเหลือ {remaining.toLocaleString()} / {line.quantity_expected.toLocaleString()}{" "}
                                {line.unit}
                              </div>
                              {preferredLabel ? (
                                <div className="text-xs text-emerald-700">
                                  ตำแหน่งแนะนำ: {preferredLabel}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              {isComplete ? (
                                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                  สำเร็จแล้ว
                                </span>
                              ) : null}
                              {hasMovements ? (
                                <button
                                  type="button"
                                  onClick={() => openUndoMovement(job, line)}
                                  className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                >
                                  ย้อนกลับ
                                </button>
                              ) : null}
                              {!isComplete ? (
                                <button
                                  type="button"
                                  onClick={() => openWorkerModal(job, line)}
                                  className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  จัดเก็บ
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {putawayHistory.length > 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <header className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">ประวัติการจัดเก็บล่าสุด</h3>
              <span className="text-xs text-slate-500">แสดง {Math.min(putawayHistory.length, 5)} รายการล่าสุด</span>
            </header>
            <ul className="mt-3 divide-y divide-slate-100 text-sm text-slate-600">
              {putawayHistory.slice(0, 5).map((record) => (
                <li key={record.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <div className="font-medium text-slate-900">{record.itemName}</div>
                    <div className="text-xs text-slate-500">
                      ใบงาน {record.jobCode} · จัดเก็บที่ {record.locationLabel}
                    </div>
                    {(record.locationMismatch || record.quantityMismatch) && (
                      <div className="mt-1 flex gap-2 text-[11px]">
                        {record.locationMismatch ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                            Location ไม่ตรง
                          </span>
                        ) : null}
                        {record.quantityMismatch ? (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
                            จำนวนไม่ตรง
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>
                      {record.quantity.toLocaleString()} {record.unit}
                    </div>
                    <div>{formatDateTime(record.storedAt)}</div>
                    <button
                      type="button"
                      onClick={() => handleUndoFromHistory(record)}
                      className="mt-1 rounded-md border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  function renderPutawayModal() {
    const selectedEntries = selectedPutawayEntries;
    const allValid = selectedEntries.every(({ line }) => {
      const assignment = putawayAssignments[line.lineId];
      if (!assignment) return false;
      if (assignment.locationId === "__custom__") {
        return assignment.customLocation.trim().length > 0;
      }
      const option = locationOptions.find((entry) => entry.id === assignment.locationId);
      return option ? isOptionValidForLine(line, option, line.lineId) : false;
    });
    const saving =
      isSubmittingPutaway || createPutawayJobMutation.isLoading || completePutawayJobMutation.isLoading;
    const canConfirm = selectedEntries.length > 0 && allValid && !saving;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold">สร้างใบงานจัดเก็บ</h2>
            <button
              type="button"
              onClick={closePutawayModal}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              ปิด
            </button>
          </header>
          <div className="space-y-5 px-6 py-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">
                รายการที่เลือก ({selectedEntries.length})
              </h3>
              <ul className="mt-2 space-y-3 text-sm text-slate-600 max-h-64 overflow-auto pr-1">
                {selectedEntries.map(({ job, line }) => {
                  const assignment = putawayAssignments[line.lineId] ?? {
                    locationId: "__custom__",
                    customLocation: "",
                  };
                  const validOptions = getValidLocationOptionsForLine(line);
                  const hasValidOptions = validOptions.length > 0;
                  const selectedValue =
                    assignment.locationId &&
                    assignment.locationId !== "__custom__" &&
                    validOptions.some((option) => option.id === assignment.locationId)
                      ? assignment.locationId
                      : "__custom__";
                  return (
                    <li key={line.lineId} className="rounded-lg border border-slate-100 px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-slate-900">{line.name}</div>
                          <div className="text-xs text-slate-500">ใบงาน {job.displayCode}</div>
                        </div>
                        <div className="text-xs text-slate-500">
                          {line.countedQuantity ?? line.quantityExpected} {line.unit}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-600">ตำแหน่งจัดเก็บ</label>
                        <select
                          value={selectedValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPutawayAssignments((prev) => ({
                              ...prev,
                              [line.lineId]: {
                                locationId: value,
                                customLocation:
                                  value === "__custom__"
                                    ? prev[line.lineId]?.customLocation ?? ""
                                    : "",
                              },
                            }));
                          }}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                          {validOptions.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.label}
                            </option>
                          ))}
                          <option value="__custom__">ระบุตำแหน่งเอง</option>
                        </select>
                        {!hasValidOptions ? (
                          <p className="text-xs text-rose-600">
                            ไม่มีตำแหน่งที่รองรับ SKU นี้หรือพื้นที่เต็ม กรุณาระบุตำแหน่งเอง
                          </p>
                        ) : null}
                        {selectedValue === "__custom__" ? (
                          <input
                            type="text"
                            value={assignment.customLocation ?? ""}
                            onChange={(event) =>
                              setPutawayAssignments((prev) => ({
                                ...prev,
                                [line.lineId]: {
                                  locationId: "__custom__",
                                  customLocation: event.target.value,
                                },
                              }))
                            }
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            placeholder="เช่น โซน A ชั้น 3 ช่อง B2"
                          />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={closePutawayModal}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                void handleConfirmPutaway();
              }}
              disabled={!canConfirm}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "กำลังสร้าง..." : "สร้างใบงานจัดเก็บ"}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  function renderWorkerModal() {
    if (!workerModalState) {
      return null;
    }
    const { job, line } = workerModalState;
    const receivingLineId = line.source_line_id ?? line.line_id;
    const remaining = Math.max(line.quantity_expected - sumMovementForLine(job, receivingLineId), 0);
    const quantityNumber = Number(workerQuantity);
    const selectedOption =
      workerLocationId && workerLocationId !== "__custom__"
        ? locationOptions.find((option) => option.id === workerLocationId)
        : null;
    const selectedLocationLabel =
      selectedOption?.label ??
      (workerLocationId === "__custom__" ? workerCustomLocation || "ตำแหน่งกำหนดเอง" : null);
    const selectedLocationCode =
      workerLocationId && workerLocationId !== "__custom__"
        ? selectedOption?.code ?? workerLocationId
        : workerCustomLocation.trim()
        ? workerCustomLocation.trim()
        : "-";
    const isLocationMismatch =
      Boolean(line.preferred_location_id) &&
      workerLocationId &&
      workerLocationId !== "__custom__" &&
      line.preferred_location_id !== workerLocationId;
    const isQuantityOver = Number.isFinite(quantityNumber) && quantityNumber > remaining;
    const requiresReason = isLocationMismatch || isQuantityOver;
    const allowsCurrentSku =
      selectedOption && selectedOption.id ? isOptionAllowedForItem(line, selectedOption) : true;
    const capacityLimit = selectedOption?.capacity ?? null;
    const capacityOk =
      !capacityLimit || !Number.isFinite(quantityNumber) ? true : quantityNumber <= capacityLimit;
    const locationScoreCriteria = [
      { label: "เป็นตำแหน่งที่อนุญาต SKU นี้", passed: allowsCurrentSku },
      { label: "จำนวนไม่เกินความจุที่ตั้งไว้", passed: capacityOk },
      { label: "ตรงกับตำแหน่งที่ระบุในใบงาน", passed: !isLocationMismatch },
    ];
    const scorePercent = Math.round(
      (locationScoreCriteria.filter((criterion) => criterion.passed).length / locationScoreCriteria.length) * 100,
    );
    const scoreColor =
      scorePercent >= 80 ? "bg-emerald-500" : scorePercent >= 50 ? "bg-amber-500" : "bg-rose-500";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">จัดเก็บสินค้า</h2>
              <p className="text-xs text-slate-500">
                ใบงาน {job.display_code} · {line.name}
              </p>
            </div>
            <button
              type="button"
              onClick={closeWorkerModal}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              ปิด
            </button>
          </header>
          <div className="grid gap-5 overflow-y-auto px-6 py-5 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  ตำแหน่งจัดเก็บ
                </label>
                <select
                  value={workerLocationId ?? "__custom__"}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "__custom__") {
                      setWorkerLocationId("__custom__");
                      setWorkerLocationSearch(workerCustomLocation);
                    } else {
                      setWorkerLocationId(value);
                      setWorkerCustomLocation("");
                      const option = locationOptions.find((entry) => entry.id === value);
                      if (option) {
                        setWorkerLocationSearch(buildLocationSearchDisplay(option));
                      } else {
                        setWorkerLocationSearch(value);
                      }
                    }
                    setWorkerScanMessage(null);
                    setWorkerScanValue("");
                    setWorkerLocationOptionsOpen(false);
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="__custom__">สแกน/กรอกเอง</option>
                  {locationOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {workerLocationId === "__custom__" ? (
                  <input
                    type="text"
                    value={workerCustomLocation}
                    onChange={(event) => {
                      setWorkerCustomLocation(event.target.value);
                      if (workerLocationId === "__custom__") {
                        setWorkerLocationSearch(event.target.value);
                      }
                    }}
                    className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="สแกน QR-Code หรือกรอกชื่อ Location"
                  />
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    เลือกแล้ว: {selectedLocationLabel ?? workerLocationId} · Code: {selectedLocationCode}
                  </p>
                )}
                <div className="mt-2" ref={workerLocationSearchRef}>
                  <label className="text-xs font-semibold text-slate-600">
                    หรือค้นหาตำแหน่ง (Auto-complete)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={workerLocationSearch}
                      onFocus={() => setWorkerLocationOptionsOpen(true)}
                      onChange={(event) => {
                        handleLocationSearchInput(event.target.value);
                        setWorkerLocationOptionsOpen(true);
                      }}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="พิมพ์ชื่อหรือรหัสตำแหน่ง"
                    />
                    {workerLocationOptionsOpen && filteredLocationOptions.length > 0 ? (
                      <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {filteredLocationOptions.map((option) => (
                          <button
                            key={option.id ?? option.label}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleLocationOptionSelect(option)}
                            className="flex w-full flex-col items-start px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100"
                          >
                            <span className="font-semibold text-slate-900">{option.label ?? option.id}</span>
                            {option.code ? (
                              <span className="text-[11px] text-slate-500">Code: {option.code}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2">
                  <label className="text-xs font-semibold text-slate-600">
                    สแกน QR / Barcode
                  </label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={workerScanValue}
                      onChange={(event) => setWorkerScanValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyWorkerScanValue();
                        }
                      }}
                      className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="สแกนด้วยเครื่องอ่าน QR/Barcode หรือกรอกรหัส Location"
                    />
                    <button
                      type="button"
                      onClick={applyWorkerScanValue}
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      ใช้ผลสแกน
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (workerScannerActive) {
                          setWorkerScannerActive(false);
                          setWorkerScannerError(null);
                        } else {
                          setWorkerScannerError(null);
                          setWorkerScannerActive(true);
                        }
                      }}
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {workerScannerActive ? "หยุดกล้อง" : "เปิดกล้องเพื่อสแกน"}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    ใช้เครื่องสแกนต่อ USB/BT (คีย์บอร์ดจำลอง) หรือเปิดกล้องมือถือเพื่ออ่านโค้ดก็ได้
                  </p>
                  {workerScannerActive ? (
                    <div className="mt-2 space-y-2">
                      <div className="rounded-lg border border-slate-200 bg-black/60 p-1">
                        <video
                          ref={workerScannerVideoRef}
                          className="h-48 w-full rounded-md bg-black object-cover"
                          muted
                          autoPlay
                          playsInline
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">จัดตำแหน่ง QR/Barcode ให้อยู่กลางกรอบแล้วรอให้ระบบอ่าน</p>
                    </div>
                  ) : null}
                {workerScannerError ? (
                  <p className="mt-1 text-xs font-semibold text-rose-600">{workerScannerError}</p>
                ) : null}
                {workerScanMessage ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-700">{workerScanMessage}</p>
                ) : null}
              </div>
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800">
                <p className="font-semibold text-emerald-900">ตำแหน่งที่จะใช้จัดเก็บ (ยืนยัน)</p>
                <p className="text-sm text-emerald-900">{selectedLocationLabel ?? "ยังไม่ได้เลือกตำแหน่ง"}</p>
                <p className="text-[11px]">
                  รหัส/Code: <span className="font-semibold">{selectedLocationCode}</span>
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-100 bg-white/60 p-3 text-xs text-slate-600">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-slate-500">
                  <span>ความเหมาะสมตำแหน่ง</span>
                  <span>{Number.isFinite(scorePercent) ? scorePercent : 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${scoreColor}`}
                    style={{ width: `${Number.isFinite(scorePercent) ? scorePercent : 0}%` }}
                  />
                </div>
                <ul className="space-y-1">
                  {locationScoreCriteria.map((criterion) => (
                    <li key={criterion.label} className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${criterion.passed ? "bg-emerald-500" : "bg-rose-500"}`}
                      />
                      <span className={criterion.passed ? "text-emerald-700" : "text-rose-600"}>
                        {criterion.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
                {isLocationMismatch ? (
                  <p className="mt-1 text-xs text-amber-600">
                    ตำแหน่งไม่ตรงกับใบงาน กรุณาให้เหตุผลก่อนบันทึก
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  จำนวนที่จัดเก็บ (คงเหลือ {remaining.toLocaleString()} {line.unit})
                </label>
                <input
                  type="number"
                  min={1}
                  value={workerQuantity}
                  onChange={(event) => setWorkerQuantity(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                {isQuantityOver ? (
                  <p className="mt-1 text-xs text-amber-600">จำนวนเกินกว่าใบงาน กรุณาให้เหตุผล</p>
                ) : null}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  หมายเหตุ
                </label>
                <textarea
                  value={workerNote}
                  onChange={(event) => setWorkerNote(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  rows={3}
                  placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                />
              </div>

              {requiresReason ? (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    เหตุผลการจัดเก็บผิดปกติ
                  </label>
                  <textarea
                    value={workerMismatchReason}
                    onChange={(event) => setWorkerMismatchReason(event.target.value)}
                    className="mt-1 w-full rounded-md border border-amber-300 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="อธิบายว่าทำไมต้องจัดเก็บต่างจากใบงาน"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  รูปถ่าย (ขั้นต่ำ 1 รูป)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleWorkerEvidenceUpload}
                  className="mt-1 w-full text-sm"
                  disabled={workerUploading}
                />
                {workerEvidenceUrls.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-slate-500">
                    {workerEvidenceUrls.map((url) => (
                      <li key={url} className="truncate">
                        <a href={url} target="_blank" rel="noreferrer" className="text-emerald-600 underline">
                          {url.split("/").pop()}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">ยังไม่มีรูปที่อัปโหลด</p>
                )}
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                <p>สามารถบันทึกบางส่วนได้ ระบบจะแสดงยอดคงเหลือให้จัดเก็บต่อ</p>
                {workerModalError ? (
                  <p className="mt-2 font-semibold text-rose-600">{workerModalError}</p>
                ) : null}
              </div>
            </div>
          </div>
          <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={closeWorkerModal}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                void submitWorkerMovement();
              }}
              disabled={workerUploading || isWorkerSaving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isWorkerSaving ? "กำลังบันทึก..." : "บันทึกการจัดเก็บ"}
            </button>
          </footer>
        </div>
      </div>
    );
  }

  function renderCancelPutawayModal() {
    if (!cancelPutawayJob) {
      return null;
    }
    const job = cancelPutawayJob;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold">ยกเลิกใบงานจัดเก็บ</h2>
            <button
              type="button"
              onClick={() => setCancelPutawayJob(null)}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              ปิด
            </button>
          </header>
          <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
            <p>
              ใบงาน <span className="font-semibold text-slate-900">{job.display_code}</span> จะถูกยกเลิกและนำออกจากคิวแรงงาน
              หากมีการเก็บบางส่วนแล้ว กรุณาบันทึกข้อมูลให้ครบก่อนยกเลิกงานนี้
            </p>
            <ul className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
              {job.lines.map((line) => {
                const refId = resolvePutawayLineReceivingId(job, line);
                return (
                  <li key={line.line_id}>
                    <span className="font-semibold text-slate-900">{line.name}</span> · คงเหลือ{" "}
                    {(line.quantity_expected - sumMovementForLine(job, refId)).toLocaleString()} /{" "}
                    {line.quantity_expected.toLocaleString()} {line.unit}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-rose-600">
              การยกเลิกไม่สามารถย้อนกลับได้ ต้องสร้างใบงานใหม่หากต้องการจัดเก็บรายการเดิมอีกครั้ง
            </p>
          </div>
          <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={() => setCancelPutawayJob(null)}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              กลับไปก่อน
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmCancelPutawayJob();
              }}
              disabled={completePutawayJobMutation.isLoading}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ยืนยันยกเลิก
            </button>
          </footer>
        </div>
      </div>
    );
  }

  function renderReviewPutawayModal() {
    if (!reviewPutawayJob) {
      return null;
    }
    const job = reviewPutawayJob;
    const allLines = job.lines;
    const totals = job.movements ?? [];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">ตรวจสอบใบงานจัดเก็บ</h2>
              <p className="text-xs text-slate-500">ใบงาน {job.display_code}</p>
            </div>
            <button
              type="button"
              onClick={() => setReviewPutawayJob(null)}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              ปิด
            </button>
          </header>
          <div className="space-y-4 px-6 py-5 text-sm text-slate-700">
            <p>ตรวจสอบรูปหลักฐานและตำแหน่งก่อนอนุมัติใบงานนี้</p>
            <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-100">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">สินค้า</th>
                    <th className="px-4 py-2">จำนวน</th>
                    <th className="px-4 py-2">ตำแหน่ง</th>
                    <th className="px-4 py-2">หลักฐาน</th>
                  </tr>
                </thead>
                <tbody>
                  {allLines.map((line) => {
                    const refId = resolvePutawayLineReceivingId(job, line);
                    const lineMovements = totals.filter((movement) => movement.receiving_line_id === refId);
                    return (
                      <tr key={line.line_id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{line.name}</div>
                          <div className="text-[11px] text-slate-500">SKU {line.sku}</div>
                        </td>
                        <td className="px-4 py-3">
                          {line.quantity_expected.toLocaleString()} {line.unit}
                        </td>
                        <td className="px-4 py-3">
                          {lineMovements.map((movement) => (
                            <div key={movement.movement_id} className="mb-2">
                              <div className="font-semibold text-slate-900">
                                {movement.location_label ?? movement.location_id}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {movement.quantity.toLocaleString()} {movement.unit} · {formatDateTime(movement.recorded_at)}
                              </div>
                            </div>
                          ))}
                          {lineMovements.length === 0 ? <span className="text-rose-600">ยังไม่มีการจัดเก็บ</span> : null}
                        </td>
                        <td className="px-4 py-3">
                          {lineMovements.flatMap((movement) =>
                            movement.evidence_urls?.map((url, index) => (
                              <div key={`${movement.movement_id}-${index}`}>
                                <a href={url} target="_blank" rel="noreferrer" className="text-emerald-600 underline">
                                  หลักฐาน {index + 1}
                                </a>
                              </div>
                            )) ?? [],
                          )}
                          {lineMovements.every((movement) => !movement.evidence_urls?.length) ? (
                            <span className="text-[11px] text-slate-500">ไม่มีรูปแนบ</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={() => setReviewPutawayJob(null)}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmApproveJob();
              }}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              อนุมัติใบงาน
            </button>
          </footer>
        </div>
      </div>
    );
  }
  function renderUndoMovementModal() {
    if (!undoMovementState) {
      return null;
    }
    const { job, line, movements, selectedMovementIds } = undoMovementState;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">ย้อนการจัดเก็บ</h2>
              <p className="text-xs text-slate-500">
                ใบงาน {job.display_code} · {line.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setUndoMovementState(null);
                setUndoMovementError(null);
              }}
              className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              ปิด
            </button>
          </header>
          <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
            <p>เลือกการบันทึกที่ต้องการย้อนกลับ (เลือกได้หลายรายการ) ระบบจะลบจำนวนและเปิดให้จัดเก็บใหม่อีกครั้ง</p>
            <div className="max-h-60 overflow-auto rounded-lg border border-slate-100">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">เลือก</th>
                    <th className="px-4 py-2">ตำแหน่ง</th>
                    <th className="px-4 py-2">จำนวน</th>
                    <th className="px-4 py-2">เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.movement_id} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          name="undo-movement"
                          value={movement.movement_id}
                          checked={selectedMovementIds.includes(movement.movement_id)}
                          onChange={(event) =>
                            setUndoMovementState((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    selectedMovementIds: event.target.checked
                                      ? Array.from(new Set([...prev.selectedMovementIds, movement.movement_id]))
                                      : prev.selectedMovementIds.filter((id) => id !== movement.movement_id),
                                  }
                                : prev,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-900">{movement.location_label ?? movement.location_id}</div>
                        <div className="text-[11px] text-slate-500">{movement.location_id}</div>
                      </td>
                      <td className="px-4 py-2">
                        {movement.quantity.toLocaleString()} {movement.unit}
                      </td>
                      <td className="px-4 py-2">{formatDateTime(movement.recorded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {undoMovementError ? (
              <p className="text-xs font-semibold text-rose-600">{undoMovementError}</p>
            ) : null}
          </div>
          <footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={() => {
                setUndoMovementState(null);
                setUndoMovementError(null);
              }}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmUndoMovement();
              }}
              disabled={selectedMovementIds.length === 0 || deletePutawayMovementMutation.isLoading}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ยืนยันย้อนกลับ
            </button>
          </footer>
        </div>
      </div>
    );
  }

  function renderAuditSection() {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">การตรวจสอบ (Audit)</h2>
        <p className="mt-1 text-sm text-slate-600">
          เตรียมเชื่อมโยงกับข้อมูลการจัดเก็บและผลตรวจนับ เพื่อสนับสนุนการตรวจสอบย้อนหลัง
        </p>
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          อยู่ระหว่างการออกแบบรายละเอียดเพิ่มเติม
        </div>
      </section>
    );
  }

  function renderStatusBadge(status: CountStatus) {
    const label = status === "matched" ? "ครบ" : status === "mismatch" ? "ไม่ครบ" : "รอดำเนินการ";
    const styles =
      status === "matched"
        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
        : status === "mismatch"
        ? "bg-amber-100 text-amber-700 border border-amber-200"
        : "bg-slate-100 text-slate-600 border border-slate-200";
    return <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles}`}>{label}</span>;
  }
}

function createEmptyDraftRow(): ReceivingDraftRow {
  return {
    rowId: randomId("draft"),
    itemId: "",
    itemLabel: "",
    quantity: "",
  };
}

function updateRow(rows: ReceivingDraftRow[], rowId: string, patch: Partial<ReceivingDraftRow>): ReceivingDraftRow[] {
  return rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row));
}

function normalizeDraftRows(rows: ReceivingDraftRow[]): ReceivingDraftRow[] {
  if (rows.length === 0) {
    return [createEmptyDraftRow()];
  }
  const filled = rows.filter((row, index) => hasRowContent(row) || index === rows.length - 1);
  const last = filled[filled.length - 1];
  if (!last || hasRowContent(last)) {
    return [...filled, createEmptyDraftRow()];
  }
  return filled;
}

function hasRowContent(row: ReceivingDraftRow): boolean {
  return row.itemLabel.trim().length > 0 || row.quantity.trim().length > 0;
}

function formatItemLabel(item: Pick<Item, "sku" | "name">): string {
  return `${item.sku}_${item.name}`;
}

function formatLineLabel(line: ReceivingJobLine): string {
  return `${line.sku}_${line.name}`;
}

function resolveItemIdFromLabel(label: string, itemLookup: Map<string, Item>): string | undefined {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return undefined;
  for (const item of itemLookup.values()) {
    if (formatItemLabel(item).toLowerCase() === normalized) {
      return item.id;
    }
  }
  return undefined;
}

function computeJobStatus(job: ReceivingJob): CountStatus {
  if (job.lines.every((line) => line.countStatus === "matched" && typeof line.countedQuantity === "number")) {
    return "matched";
  }
  if (job.lines.some((line) => line.countStatus === "mismatch")) {
    return "mismatch";
  }
  return "pending";
}

function hasReceivingJobProgress(job: ReceivingJob): boolean {
  return job.lines.some((line) => {
    const countedQuantity = typeof line.countedQuantity === "number" ? line.countedQuantity : 0;
    const hasCountingActivity = line.countStatus !== "pending" || countedQuantity > 0;
    const hasPutawayLink = Array.isArray(line.putawayJobIds) && line.putawayJobIds.length > 0;
    const hasPutawayProgress = line.putawayStatus ? line.putawayStatus !== "pending" : false;
    return hasCountingActivity || hasPutawayLink || hasPutawayProgress;
  });
}

function removeError(record: Record<string, string>, key: string): Record<string, string> {
  if (!record[key]) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildLocationSearchDisplay(option: PutawayLocationOption): string {
  if (!option.id) {
    return option.label ?? "";
  }
  const code = option.code ?? option.id;
  if (option.label) {
    return `${option.label} (${code})`;
  }
  return code;
}

function buildWorkerAssetUrl(attachment: Attachment): string {
  const cleanKey = attachment.key?.replace(/^\/+/, "") ?? "";
  if (ASSET_BASE_URL && cleanKey) {
    return `${ASSET_BASE_URL}/${cleanKey}`;
  }
  if (attachment.public_url) {
    return attachment.public_url;
  }
  return cleanKey || attachment.file_name;
}

const DEFAULT_LOCATION_OPTIONS: PutawayLocationOption[] = [
  {
    id: "loc-a-01",
    label: "โซน A ชั้น 1 ช่อง B1",
    code: "A-R1-B1",
    capacity: 200,
    allowedItemIds: [],
    capacityVolumeCm3: null,
    usedVolumeCm3: null,
  },
  {
    id: "loc-b-05",
    label: "โซน B ชั้น 2 ช่อง A3",
    code: "B-R2-A3",
    capacity: 150,
    allowedItemIds: [],
    capacityVolumeCm3: null,
    usedVolumeCm3: null,
  },
  {
    id: "loc-c-12",
    label: "โซน C ชั้น 4 ช่อง D2",
    code: "C-R4-D2",
    capacity: 300,
    allowedItemIds: [],
    capacityVolumeCm3: null,
    usedVolumeCm3: null,
  },
];

function loadLocationOptions(): PutawayLocationOption[] {
  if (typeof window === "undefined") {
    return DEFAULT_LOCATION_OPTIONS;
  }
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_LOCATION_OPTIONS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_LOCATION_OPTIONS;
    }
    const normalized = parsed
      .map((entry) => normalizeLocationRecord(entry))
      .filter((entry): entry is PutawayLocationOption => Boolean(entry));
    return normalized.length > 0 ? normalized : DEFAULT_LOCATION_OPTIONS;
  } catch {
    return DEFAULT_LOCATION_OPTIONS;
  }
}

function buildLocationLabel(record: Record<string, unknown>): string {
  const name = typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : "";
  if (name) {
    return name;
  }
  const parts: string[] = [];
  if (typeof record.zone === "string" && record.zone.trim()) {
    parts.push(`โซน ${record.zone.trim()}`);
  }
  if (typeof record.rack === "string" && record.rack.trim()) {
    parts.push(`ชั้น ${record.rack.trim()}`);
  }
  if (typeof record.level === "string" && record.level.trim()) {
    parts.push(`ระดับ ${record.level.trim()}`);
  }
  if (typeof record.bin === "string" && record.bin.trim()) {
    parts.push(`ช่อง ${record.bin.trim()}`);
  }
  return parts.length ? parts.join(" · ") : "ตำแหน่งไม่ระบุ";
}

function normalizeLocationRecord(record: Record<string, unknown>): PutawayLocationOption | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const id = typeof record.id === "string" ? record.id : randomId("loc");
  const label = buildLocationLabel(record);
  const allowedSource =
    Array.isArray((record as { allowedItems?: unknown }).allowedItems) ||
    Array.isArray((record as { allowed_item_ids?: unknown }).allowed_item_ids)
      ? ((record as { allowedItems?: unknown }).allowedItems as unknown[]) ??
        ((record as { allowed_item_ids?: unknown }).allowed_item_ids as unknown[])
      : [];
  const allowedItemIds = Array.isArray(allowedSource)
    ? allowedSource.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const capacityValue = (record as { capacity?: unknown }).capacity;
  const capacity =
    typeof capacityValue === "number" && Number.isFinite(capacityValue) && capacityValue > 0 ? capacityValue : 0;
  const widthCm = parseDimensionValue((record as { width_cm?: unknown }).width_cm ?? (record as { widthCm?: unknown }).widthCm);
  const depthCm = parseDimensionValue((record as { depth_cm?: unknown }).depth_cm ?? (record as { depthCm?: unknown }).depthCm);
  const heightCm = parseDimensionValue((record as { height_cm?: unknown }).height_cm ?? (record as { heightCm?: unknown }).heightCm);
  const capacityVolumeCm3 = calculateVolumeCm3(widthCm, depthCm, heightCm);
  const usedVolumeRaw =
    (record as { used_volume_cm3?: unknown }).used_volume_cm3 ??
    (record as { usedVolumeCm3?: unknown }).usedVolumeCm3;
  const usedVolumeCm3 =
    typeof usedVolumeRaw === "number" && Number.isFinite(usedVolumeRaw) && usedVolumeRaw >= 0
      ? usedVolumeRaw
      : null;
  return {
    id,
    label,
    code: typeof record.code === "string" ? record.code : null,
    zone: typeof record.zone === "string" ? record.zone : null,
    rack: typeof record.rack === "string" ? record.rack : null,
    level: typeof record.level === "string" ? record.level : null,
    bin: typeof record.bin === "string" ? record.bin : null,
    capacity,
    allowedItemIds,
    widthCm,
    depthCm,
    heightCm,
    capacityVolumeCm3,
    usedVolumeCm3,
  };
}

function cacheRawLocations(records: StorageLocationResponse[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage errors
  }
}

function mapStorageLocationToOption(record: StorageLocationResponse): PutawayLocationOption {
  const widthCm = parseDimensionValue(record.width_cm);
  const depthCm = parseDimensionValue(record.depth_cm);
  const heightCm = parseDimensionValue(record.height_cm);
  const capacityVolumeCm3 = calculateVolumeCm3(widthCm, depthCm, heightCm);
  const allowedItemIds = Array.isArray(record.allowed_item_ids)
    ? record.allowed_item_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  return {
    id: record.id,
    label: record.name || record.code || record.id,
    code: record.code,
    zone: record.zone,
    rack: record.rack,
    level: record.level,
    bin: record.bin,
    capacity: record.capacity,
    allowedItemIds,
    widthCm,
    depthCm,
    heightCm,
    capacityVolumeCm3,
    usedVolumeCm3:
      typeof record.used_volume_cm3 === "number" && Number.isFinite(record.used_volume_cm3)
        ? record.used_volume_cm3
        : null,
  };
}

function parseDimensionValue(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return null;
  }
  return value;
}

function calculateVolumeCm3(
  widthCm: number | null | undefined,
  depthCm: number | null | undefined,
  heightCm: number | null | undefined,
): number | null {
  if (!widthCm || !depthCm || !heightCm) {
    return null;
  }
  const volume = widthCm * depthCm * heightCm;
  if (!Number.isFinite(volume) || volume <= 0) {
    return null;
  }
  return Math.round(volume);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function mapJobFromApi(job: WorkflowJob): ReceivingJob {
  return {
    id: job.id,
    displayCode: job.display_code,
    createdAt: job.created_at,
    lines: job.lines.map(mapLineFromApi),
  };
}

function mapLineFromApi(line: WorkflowJobLine): ReceivingJobLine {
  return {
    lineId: line.line_id,
    sourceLineId: line.source_line_id ?? line.line_id,
    itemId: line.item_id,
    sku: line.sku,
    name: line.name,
    unit: line.unit,
    quantityExpected: line.quantity_expected,
    countStatus: line.count_status,
    countedQuantity: typeof line.counted_quantity === "number" ? line.counted_quantity : undefined,
    putawayJobIds: Array.isArray(line.putaway_job_ids) ? line.putaway_job_ids : [],
    putawayStatus: line.putaway_status,
    preferredLocationId: line.preferred_location_id ?? undefined,
    preferredLocationLabel: line.preferred_location_label ?? undefined,
    packageVolumeCm3: typeof line.package_volume_cm3 === "number" ? line.package_volume_cm3 : undefined,
  };
}

function mapPutawayHistory(jobs: WorkflowJob[]): PutawayHistoryRecord[] {
  const records: PutawayHistoryRecord[] = [];
  jobs.forEach((job) => {
    (job.movements ?? []).forEach((movement) => {
      const line = findLineForMovement(job, movement);
      records.push({
        id: movement.movement_id,
        lineId: movement.receiving_line_id,
        jobId: job.id,
        jobCode: job.display_code,
        itemName: movement.item_name ?? line?.name ?? "ไม่ระบุ",
        sku: movement.sku ?? line?.sku ?? "-",
        quantity: movement.quantity,
        unit: movement.unit,
        locationId: movement.location_id,
        locationLabel: movement.location_label ?? movement.location_id ?? "ไม่ระบุตำแหน่ง",
        storedAt: movement.recorded_at,
        locationMismatch: movement.location_mismatch,
        quantityMismatch: movement.quantity_mismatch,
      });
    });
  });
  return records.sort(
    (a, b) => new Date(b.storedAt).getTime() - new Date(a.storedAt).getTime(),
  );
}

function sumMovementForLine(job: WorkflowJob, lineId: string): number {
  if (!job.movements || job.movements.length === 0) {
    return 0;
  }
  return job.movements
    .filter((movement) => movement.receiving_line_id === lineId)
    .reduce((acc, movement) => acc + movement.quantity, 0);
}

function isJobSatisfied(job: WorkflowJob, overrides: Record<string, number> = {}): boolean {
  return job.lines.every((line) => {
    const refId = line.source_line_id ?? line.line_id;
    const total = overrides[refId] ?? sumMovementForLine(job, refId);
    return total >= line.quantity_expected;
  });
}

function resolvePutawayLineReceivingId(job: WorkflowJob, line: WorkflowJobLine): string {
  if (line.source_line_id) {
    return line.source_line_id;
  }
  const index = job.lines.findIndex((entry) => entry.line_id === line.line_id);
  if (index >= 0 && Array.isArray(job.receiving_line_ids) && job.receiving_line_ids[index]) {
    return job.receiving_line_ids[index];
  }
  return line.line_id;
}

function isJobReadyForApproval(job: WorkflowJob): boolean {
  if (!job.lines || job.lines.length === 0 || !job.movements || job.movements.length === 0) {
    return false;
  }
  return job.lines.every((line) => {
    const receivingId = resolvePutawayLineReceivingId(job, line);
    return sumMovementForLine(job, receivingId) >= line.quantity_expected;
  });
}

function findLineForMovement(job: WorkflowJob, movement: WorkflowMovement): WorkflowJobLine | undefined {
  const direct = job.lines.find(
    (line) =>
      line.source_line_id === movement.receiving_line_id || line.line_id === movement.receiving_line_id,
  );
  if (direct) {
    return direct;
  }
  if (Array.isArray(job.receiving_line_ids) && job.receiving_line_ids.length === job.lines.length) {
    const index = job.receiving_line_ids.findIndex((id) => id === movement.receiving_line_id);
    if (index >= 0) {
      return job.lines[index];
    }
  }
  return undefined;
}

function mapLineToUpdatePayload(line: ReceivingJobLine): WorkflowJobLineUpdatePayload {
  return {
    line_id: line.lineId,
    source_line_id: line.sourceLineId ?? line.lineId,
    item_id: line.itemId,
    sku: line.sku,
    name: line.name,
    unit: line.unit,
    quantity_expected: line.quantityExpected,
    count_status: line.countStatus,
    counted_quantity: typeof line.countedQuantity === "number" ? line.countedQuantity : null,
    package_volume_cm3: typeof line.packageVolumeCm3 === "number" ? line.packageVolumeCm3 : null,
  };
}

function getLineQuantity(line: ReceivingJobLine): number {
  return typeof line.countedQuantity === "number" ? line.countedQuantity : line.quantityExpected;
}

function getReceivingLineId(line: ReceivingJobLine): string {
  return line.sourceLineId ?? line.lineId;
}

function getLineVolume(line: ReceivingJobLine): number | null {
  if (typeof line.packageVolumeCm3 !== "number" || line.packageVolumeCm3 <= 0) {
    return null;
  }
  const quantity = getLineQuantity(line);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const volume = line.packageVolumeCm3 * quantity;
  return Number.isFinite(volume) && volume > 0 ? volume : null;
}

function applyAllowedItemsToOptions(
  options: PutawayLocationOption[],
  allowedMap: Map<string, string[]>,
): PutawayLocationOption[] {
  return options.map((option) => ({
    ...option,
    allowedItemIds: allowedMap.get(option.id) ?? option.allowedItemIds ?? [],
  }));
}

function getLocationCapacityVolume(option: PutawayLocationOption): number | null {
  if (typeof option.capacityVolumeCm3 === "number" && option.capacityVolumeCm3 > 0) {
    return option.capacityVolumeCm3;
  }
  return calculateVolumeCm3(option.widthCm, option.depthCm, option.heightCm);
}
