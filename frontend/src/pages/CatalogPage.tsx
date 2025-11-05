import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CartDrawer, ItemCard } from "../components/CartDrawer";
import { AddItemModal } from "../components/AddItemModal";
import { CartProvider, useCart } from "../hooks/useCart";
import { deleteItem, fetchCategories, fetchItems, importItemsFromFile } from "../services/api";
import type { BulkImportResult } from "../services/api";
import type { Category, Item } from "../types/catalog";
import { RequestCheckout } from "./RequestCheckout";
import itemImportTemplate from "../assets/item-import-template.csv?url";

function CatalogView() {
  const { addItem, totalItems } = useCart();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [successRequestId, setSuccessRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCartVisible, setIsCartVisible] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [importSummary, setImportSummary] = useState<BulkImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const itemsQuery = useQuery({
    queryKey: ["items", selectedCategory, search],
    queryFn: () => fetchItems({ categoryId: selectedCategory, search }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteItem,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.setQueryData<Item[]>(["items", selectedCategory, search], (prev) =>
        prev?.filter((item) => item.id !== id) ?? [],
      );
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "ลบสินค้าไม่สำเร็จ");
    },
  });

  const categories = categoriesQuery.data ?? [];
  const items = useMemo<Item[]>(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const enrichedItems = useMemo<Item[]>(
    () =>
      items.map((item) => {
        const categoryName =
          item.category_name ??
          categories.find((category) => category.id === item.category_id)?.name;
        return {
          ...item,
          category_name: categoryName ?? item.category_name ?? undefined,
          category_type:
            item.category_type ?? (item.asset_code ? "equipment" : "material"),
        };
      }),
    [items, categories],
  );
  const tagSuggestions = useMemo<string[]>(
    () =>
      Array.from(
        new Set(
          enrichedItems
            .flatMap((catalogItem) => catalogItem.tags ?? [])
            .filter((tag) => typeof tag === "string" && tag.trim().length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "th")),
    [enrichedItems],
  );
  const shouldShowSidePanel = isCartVisible || showCheckout;

  const importMutation = useMutation({
    mutationFn: importItemsFromFile,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      setErrorMessage(null);
      setImportSummary(result);
    },
    onError: (error: unknown) => {
      setErrorMessage(
        error instanceof Error ? error.message : "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
      setImportSummary(null);
    },
  });

  return (
    <div className={shouldShowSidePanel ? "grid gap-6 lg:grid-cols-[3fr_1fr]" : "grid gap-6"}>
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">เลือกรายการวัสดุ/อุปกรณ์</h1>
              <p className="text-sm text-slate-600">
                กรองรายการตามหมวดหมู่หรือคำค้น เพื่อเพิ่มลงตะกร้าและส่งคำร้องหาคลังสินค้า
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <button
                type="button"
                onClick={() => {
                  setIsCartVisible((prev) => {
                    const next = !prev;
                    if (!next) {
                      setShowCheckout(false);
                    }
                    return next;
                  });
                }}
                className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              >
                <span className="sr-only">ดูตะกร้ารายการ</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
                  <path d="M3 3h2l2 12h10l2-8H6" />
                  <circle cx="9" cy="19" r="1.5" />
                  <circle cx="17" cy="19" r="1.5" />
                </svg>
                {totalItems > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-xs font-semibold text-white">
                    {totalItems}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalMode("create");
                  setEditingItem(null);
                  setShowAddItemModal(true);
                }}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                + เพิ่มสินค้าใหม่
              </button>
              <a
                href={itemImportTemplate}
                download
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <path d="M12 3v12" />
                  <path d="m7 12 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                ดาวน์โหลดเทมเพลต
              </a>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                อัปโหลดรายการ
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setImportSummary(null);
                  setErrorMessage(null);
                  await importMutation.mutateAsync(file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedCategory ?? ""}
              onChange={(event) => setSelectedCategory(event.target.value || undefined)}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.map((category: Category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="ค้นหาตามชื่อหรือ SKU"
              className="w-full flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  viewMode === "grid"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                มุมมองการ์ด
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  viewMode === "table"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                มุมมองตาราง
              </button>
            </div>
          </div>
        </header>

        {errorMessage ? <p className="text-sm text-red-500">{errorMessage}</p> : null}
        {importSummary ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            นำเข้ารายการสำเร็จ เพิ่มใหม่ {importSummary.created} รายการ · อัปเดต {importSummary.updated} · ข้าม {importSummary.skipped}
          </p>
        ) : null}
        {successRequestId ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            ส่งคำร้องสำเร็จ หมายเลขอ้างอิง: {successRequestId}
          </p>
        ) : null}
        {itemsQuery.isLoading ? (
          <p className="text-sm text-slate-500">กำลังโหลดรายการ...</p>
        ) : null}

        {viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {enrichedItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onAdd={(selected) => {
                  addItem(selected);
                  setIsCartVisible(true);
                }}
                onManage={(selected, action) => {
                  if (action === "edit") {
                    setModalMode("edit");
                    setEditingItem(selected);
                    setShowAddItemModal(true);
                  } else if (action === "delete") {
                    const confirmDelete = window.confirm(`ยืนยันการลบสินค้า ${selected.name}?`);
                    if (confirmDelete) {
                      setErrorMessage(null);
                      deleteMutation.mutate(selected.id);
                    }
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">สินค้า</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">หมวดหมู่</th>
                    <th className="px-4 py-3">ประเภทสินค้า</th>
                    <th className="px-4 py-3">รหัสทรัพย์สิน</th>
                    <th className="px-4 py-3">คงเหลือ</th>
                    <th className="px-4 py-3">จองแล้ว</th>
                    <th className="px-4 py-3">ตำแหน่ง</th>
                    <th className="px-4 py-3 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {enrichedItems.length ? (
                    enrichedItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.description ?? "ไม่มีคำอธิบาย"}</p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">{item.sku}</td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {item.category_type === "material" ? "วัสดุ" : "อุปกรณ์"}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {item.category_name ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {item.asset_code ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {item.stock_on_hand} {item.unit}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">{item.stock_reserved}</td>
                        <td className="px-4 py-3 align-top text-slate-600">
                          {item.location_hint ?? "-"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                addItem(item);
                                setIsCartVisible(true);
                              }}
                              className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              เพิ่มเข้าตะกร้า
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setModalMode("edit");
                                setEditingItem(item);
                                setShowAddItemModal(true);
                              }}
                              className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const confirmDelete = window.confirm(`ยืนยันการลบสินค้า ${item.name}?`);
                                if (confirmDelete) {
                                  setErrorMessage(null);
                                  deleteMutation.mutate(item.id);
                                }
                              }}
                              className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50"
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={9}>
                        ยังไม่มีสินค้าในระบบ
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>

      {shouldShowSidePanel ? (
        <div className="flex flex-col gap-4">
          {isCartVisible ? (
            <CartDrawer
              onCheckout={() => {
                setShowCheckout(true);
                setSuccessRequestId(null);
              }}
              onClose={() => {
                setIsCartVisible(false);
                setShowCheckout(false);
              }}
            />
          ) : null}
          {showCheckout ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold">ข้อมูลคำร้อง</h3>
              <RequestCheckout
                onSuccess={(requestId) => {
                  setSuccessRequestId(requestId);
                  setShowCheckout(false);
                  setIsCartVisible(false);
                }}
              />
            </section>
          ) : null}
        </div>
      ) : null}

      {showAddItemModal ? (
        <AddItemModal
          categories={categories}
          mode={modalMode}
          item={editingItem ?? undefined}
          tagSuggestions={tagSuggestions}
          onClose={() => {
            setShowAddItemModal(false);
            setEditingItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function CatalogPage() {
  return (
    <CartProvider>
      <CatalogView />
    </CartProvider>
  );
}
