import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createReceivingJob,
  deleteReceivingJob,
  fetchItems,
  fetchReceivingJobs,
  updateReceivingJob,
} from "../services/api";
import type { Item } from "../types/catalog";
import type {
  WorkflowJob,
  WorkflowJobLine,
  WorkflowJobLineCreatePayload,
  WorkflowJobLineUpdatePayload,
} from "../types/workflow";

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
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  quantityExpected: number;
  countStatus: CountStatus;
  countedQuantity?: number;
}

interface ReceivingJob {
  id: string;
  displayCode: string;
  createdAt: string;
  lines: ReceivingJobLine[];
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
  const autocompleteCloseTimerRef = useRef<number | null>(null);
  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (!receivingJobsData) {
      return;
    }
    setReceivingJobs(receivingJobsData.map(mapJobFromApi));
  }, [receivingJobsData]);

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
      receivingJobs
        .filter((job) => job.id !== editModalState.jobId)
        .forEach((job) => {
          job.lines.forEach((line) => {
            selected.add(line.itemId);
          });
        });
    } else {
      receivingJobs.forEach((job) => {
        job.lines.forEach((line) => {
          selected.add(line.itemId);
        });
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

  const readyForPutaway = useMemo(
    () =>
      receivingJobs.flatMap((job) =>
        job.lines.filter((line) => line.countStatus === "matched").map((line) => ({ job, line })),
      ),
    [receivingJobs],
  );

  const needAttention = useMemo(
    () =>
      receivingJobs.flatMap((job) =>
        job.lines.filter((line) => line.countStatus === "mismatch").map((line) => ({ job, line })),
      ),
    [receivingJobs],
  );

  return (
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
                    const editable = job.lines.every((line) => line.countStatus === "pending");
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
                                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                                disabled={!editable}
                              >
                                แก้ไข
                              </button>
                              <button
                                type="button"
                                onClick={() => setCancelModalJob(job)}
                                className="rounded-md border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
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
                                className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                              >
                                {line.countStatus === "pending" ? "ส่งผลตรวจนับ" : "แก้ไขผล"}
                              </button>
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
    const renderPutawayCard = (
      entry: { job: ReceivingJob; line: ReceivingJobLine },
      variant: "ready" | "attention",
    ) => {
      const { job, line } = entry;
      const item = line.itemId ? itemLookup.get(line.itemId) : undefined;
      const counted = line.countedQuantity ?? line.quantityExpected;
      const expected = line.quantityExpected;
      const imageUrl = item?.image_url;
      const frameColor = variant === "ready" ? "border-emerald-200" : "border-amber-200";
      const imageFrame =
        variant === "ready"
          ? "border-emerald-100 bg-emerald-50"
          : "border-amber-100 bg-amber-50";
      const accentText = variant === "ready" ? "text-emerald-700" : "text-amber-700";

      return (
        <li key={line.lineId} className={`rounded-2xl border ${frameColor} bg-white p-4 shadow-sm`}>
          <div className="flex gap-4">
            <div className={`flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border ${imageFrame}`}>
              {imageUrl ? (
                <img src={imageUrl} alt={line.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-medium text-slate-500">ไม่มีรูป</span>
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="text-sm font-semibold text-slate-900">{line.name}</div>
              <div className="text-xs text-slate-500">SKU {line.sku}</div>
              <div className="text-xs text-slate-500">ใบงาน {job.displayCode}</div>
              {item?.category_name ? (
                <div className="text-xs text-slate-500">หมวดหมู่: {item.category_name}</div>
              ) : null}
              {item?.description ? (
                <p className="text-xs text-slate-600">{item.description}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">นับได้จริง</p>
              <p className={`text-lg font-semibold ${accentText}`}>
                {counted.toLocaleString()} <span className="text-sm">{line.unit}</span>
              </p>
              {variant === "attention" ? (
                <p className="text-xs text-amber-600">
                  จาก {expected.toLocaleString()} {line.unit}
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  เทียบกับ {expected.toLocaleString()} {line.unit}
                </p>
              )}
            </div>
          </div>
        </li>
      );
    };

    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">การจัดเก็บ (Putaway)</h2>
          <p className="mt-1 text-sm text-slate-600">
            เลือกสินค้าที่ตรวจนับครบแล้ว เพื่อจัดเก็บเข้าตำแหน่งที่เหมาะสม
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-emerald-700">
              รายการที่พร้อมจัดเก็บ ({readyForPutaway.length})
            </h3>
            <ul className="mt-3 space-y-3 text-sm text-slate-600">
              {readyForPutaway.length === 0 ? (
                <li>ยังไม่มีรายการที่ผ่านการตรวจนับครบ</li>
              ) : (
                readyForPutaway.map((entry) => renderPutawayCard(entry, "ready"))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-amber-700">
              รายการที่ต้องตรวจสอบเพิ่ม ({needAttention.length})
            </h3>
            <ul className="mt-3 space-y-3 text-sm text-slate-600">
              {needAttention.length === 0 ? (
                <li>ยังไม่มีรายการที่ขาดหรือเกิน</li>
              ) : (
                needAttention.map((entry) => renderPutawayCard(entry, "attention"))
              )}
            </ul>
          </div>
        </section>
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

function removeError(record: Record<string, string>, key: string): Record<string, string> {
  if (!record[key]) {
    return record;
  }
  const next = { ...record };
  delete next[key];
  return next;
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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
    itemId: line.item_id,
    sku: line.sku,
    name: line.name,
    unit: line.unit,
    quantityExpected: line.quantity_expected,
    countStatus: line.count_status,
    countedQuantity: typeof line.counted_quantity === "number" ? line.counted_quantity : undefined,
  };
}

function mapLineToUpdatePayload(line: ReceivingJobLine): WorkflowJobLineUpdatePayload {
  return {
    line_id: line.lineId,
    item_id: line.itemId,
    sku: line.sku,
    name: line.name,
    unit: line.unit,
    quantity_expected: line.quantityExpected,
    count_status: line.countStatus,
    counted_quantity: typeof line.countedQuantity === "number" ? line.countedQuantity : null,
  };
}
