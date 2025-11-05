import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createItem, deleteItem, updateItem, uploadAttachment } from "../services/api";
import type { Category, Item, ItemCreatePayload, ItemUpdatePayload } from "../types/catalog";

interface ItemModalProps {
  categories: Category[];
  onClose: () => void;
  mode: "create" | "edit";
  item?: Item;
  tagSuggestions: string[];
}

export function AddItemModal({
  categories,
  onClose,
  mode,
  item,
  tagSuggestions,
}: ItemModalProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(item?.tags ?? []);
  const [categoryType, setCategoryType] = useState<"material" | "equipment">(
    item?.category_type ?? (item?.asset_code ? "equipment" : "material"),
  );
  const [productType, setProductType] = useState<string>("");

  const productTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(categories.map((category) => category.name?.trim()).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b, "th")),
    [categories],
  );

  useEffect(() => {
    setSelectedTags(item?.tags ?? []);
    setTagInput("");
    setCategoryType(item?.category_type ?? (item?.asset_code ? "equipment" : "material"));
    if (item) {
      const matchedCategory = categories.find((category) => category.id === item.category_id);
      setProductType(matchedCategory?.name ?? item.category_name ?? "");
    } else {
      setProductType("");
    }
  }, [item, categories]);

  const isEdit = mode === "edit" && item;

  const successHandler = (savedItem: Item) => {
    queryClient.invalidateQueries({ queryKey: ["items"] });
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: createItem,
    onSuccess: successHandler,
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถสร้างสินค้าได้");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ItemUpdatePayload }) => updateItem(id, payload),
    onSuccess: successHandler,
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถแก้ไขสินค้าได้");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      onClose();
    },
    onError: (error: unknown) => {
      setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถลบสินค้าได้");
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const chosenProductType = productType.trim();
    if (!chosenProductType) {
      setErrorMessage("กรุณาระบุประเภทสินค้าหรือเลือกจากรายการ");
      return;
    }

    const matchedCategory = categories.find(
      (category) => category.name.toLowerCase() === chosenProductType.toLowerCase(),
    );

    const payload: ItemCreatePayload = {
      sku: String(formData.get("sku") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || undefined,
      category_id: matchedCategory?.id,
      category_name: matchedCategory ? undefined : chosenProductType,
      category_type: categoryType,
      asset_code:
        categoryType === "equipment"
          ? String(formData.get("asset_code") ?? "").trim() || undefined
          : undefined,
      unit: String(formData.get("unit") ?? "").trim(),
      stock_on_hand: Number(formData.get("stock_on_hand") ?? 0),
      stock_reserved: Number(formData.get("stock_reserved") ?? 0),
      tags: selectedTags,
      location_hint: String(formData.get("location_hint") ?? "").trim() || undefined,
      active: true,
    };

    if (!payload.sku || !payload.name || !payload.unit) {
      setErrorMessage("กรุณากรอกข้อมูลที่จำเป็นให้ครบ");
      return;
    }

    if (!payload.category_id && !payload.category_name) {
      setErrorMessage("กรุณาระบุประเภทสินค้าหรือเลือกจากรายการ");
      return;
    }

    setErrorMessage(null);

    try {
      if (imageFile) {
        setIsUploading(true);
        const attachment = await uploadAttachment(imageFile, "catalog-items");
        payload.image_url = attachment.public_url ?? attachment.key;
      }
      if (isEdit && item) {
        updateMutation.mutate({ id: item.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    const confirmed = window.confirm(`ยืนยันการลบสินค้า ${item.name}?`);
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(item.id);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">{isEdit ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}</h2>
            <p className="text-xs text-slate-500">ข้อมูลจะถูกบันทึกเข้าคลังสินค้าและพร้อมใช้งานทันที</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            ปิด
          </button>
        </header>
        <form className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            รหัส SKU *
            <input
              name="sku"
              defaultValue={item?.sku ?? ""}
              className="rounded-md border border-slate-200 px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ชื่อสินค้า *
            <input
              name="name"
              defaultValue={item?.name ?? ""}
              className="rounded-md border border-slate-200 px-3 py-2"
              required
            />
          </label>
          <fieldset className="md:col-span-2 flex flex-col gap-2 text-sm">
            <legend className="font-medium">หมวดหมู่</legend>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="category_type"
                  value="material"
                  checked={categoryType === "material"}
                  onChange={() => setCategoryType("material")}
                  className="h-4 w-4"
                />
                <span>วัสดุ (Material)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="category_type"
                  value="equipment"
                  checked={categoryType === "equipment"}
                  onChange={() => setCategoryType("equipment")}
                  className="h-4 w-4"
                />
                <span>อุปกรณ์ (Equipment)</span>
              </label>
            </div>
          </fieldset>
          <label className="md:col-span-2 flex flex-col gap-1 text-sm">
            ประเภทสินค้า *
            <div className="relative">
              <input
                name="product_type"
                list="product-type-options"
                value={productType}
                onChange={(event) => setProductType(event.target.value)}
                placeholder="เช่น อุปกรณ์เครื่องมือ หรือ วัสดุสิ้นเปลือง"
                className="w-full rounded-md border border-slate-200 px-3 py-2"
                required
              />
              <datalist id="product-type-options">
                {productTypeOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <span className="text-xs text-slate-500">
              พิมพ์เพื่อค้นหาหรือเพิ่มประเภทใหม่ ถ้าไม่มีในระบบ
            </span>
            {productTypeOptions.length ? (
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                {productTypeOptions.slice(0, 8).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setProductType(option)}
                    className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-100"
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            รหัสทรัพย์สิน (ถ้ามี)
            <input
              name="asset_code"
              defaultValue={item?.asset_code ?? ""}
              className="rounded-md border border-slate-200 px-3 py-2"
              disabled={categoryType === "material"}
              placeholder="เช่น EQ-2023-001"
            />
            <span className="text-xs text-slate-500">
              ใช้สำหรับอุปกรณ์ที่ต้องติดตามเลขทรัพย์สิน/ครุภัณฑ์ (เลือกหมวดหมู่ “อุปกรณ์” เพื่อเปิดใช้งาน)
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            จำนวนคงเหลือ (On Hand)
            <input
              name="stock_on_hand"
              type="number"
              min={0}
              defaultValue={item?.stock_on_hand ?? 0}
              className="rounded-md border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            จำนวนจอง (Reserved)
            <input
              name="stock_reserved"
              type="number"
              min={0}
              defaultValue={item?.stock_reserved ?? 0}
              className="rounded-md border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1 text-sm">
            คำอธิบาย
            <textarea
              name="description"
              rows={3}
              defaultValue={item?.description ?? ""}
              className="rounded-md border border-slate-200 px-3 py-2"
            />
          </label>
          <div className="md:col-span-2 flex flex-col gap-2 text-sm">
            <span>แท็ก (พิมพ์แล้วกด Enter เพื่อเพิ่ม)</span>
            <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 px-3 py-2">
              {selectedTags.length ? (
                selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTags((prev) => prev.filter((existing) => existing !== tag))
                      }
                      className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200"
                      aria-label={`ลบแท็ก ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">ยังไม่มีแท็ก</span>
              )}
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    const normalized = tagInput.trim();
                    if (normalized && !selectedTags.includes(normalized)) {
                      setSelectedTags((prev) => [...prev, normalized]);
                    }
                    setTagInput("");
                  }
                }}
                className="flex-1 min-w-[120px] border-none bg-transparent text-sm focus:outline-none"
                placeholder={selectedTags.length ? "" : "เช่น ppe หรือ มือถือ"}
              />
            </div>
            {tagInput ? (
              <ul className="flex flex-wrap gap-2 text-xs">
                {tagSuggestions
                  .filter(
                    (suggestion) =>
                      suggestion.toLowerCase().includes(tagInput.toLowerCase()) &&
                      !selectedTags.includes(suggestion),
                  )
                  .slice(0, 5)
                  .map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTags((prev) => [...prev, suggestion]);
                          setTagInput("");
                        }}
                        className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-100"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
            {mode === "edit" && item?.tags?.length ? (
              <p className="text-xs text-slate-500">
                แท็กเดิม: {item.tags.join(", ")}
              </p>
            ) : null}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            ตำแหน่งแนะนำ
            <input
              name="location_hint"
              defaultValue={item?.location_hint ?? ""}
              className="rounded-md border border-slate-200 px-3 py-2"
              placeholder="เช่น โซน A ชั้น 3"
            />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1 text-sm">
            รูปภาพสินค้า
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
              className="rounded-md border border-slate-200 px-3 py-2"
            />
            <span className="text-xs text-slate-500">ไฟล์จะถูกอัปโหลดไปยัง Cloudflare R2 อัตโนมัติ</span>
          </label>
          {errorMessage ? <p className="md:col-span-2 text-sm text-red-500">{errorMessage}</p> : null}
          <div className="md:col-span-2 flex justify-between gap-3">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {isDeleting ? "กำลังลบ..." : "ลบสินค้า"}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={createMutation.isLoading || updateMutation.isLoading || isUploading}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {createMutation.isLoading || updateMutation.isLoading || isUploading
                ? "กำลังบันทึก..."
                : isEdit
                ? "บันทึกการแก้ไข"
                : "บันทึกสินค้า"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
