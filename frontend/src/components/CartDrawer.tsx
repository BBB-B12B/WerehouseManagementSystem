import { Fragment } from "react";
import type { Item } from "../types/catalog";
import { useCart } from "../hooks/useCart";

interface CartDrawerProps {
  onCheckout: () => void;
  onClose?: () => void;
}

export function CartDrawer({ onCheckout, onClose }: CartDrawerProps) {
  const { items, totalItems, updateItem, removeItem } = useCart();

  if (!items.length) {
    return (
      <aside className="relative rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        {onClose ? (
          <button
            type="button"
            aria-label="ปิดตะกร้า"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path d="m6 6 12 12" />
              <path d="m18 6-12 12" />
            </svg>
          </button>
        ) : null}
        ยังไม่มีรายการในตะกร้า
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">ตะกร้ารายการ ({totalItems})</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCheckout}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            ดำเนินการส่งคำร้อง
          </button>
          {onClose ? (
            <button
              type="button"
              aria-label="ปิดตะกร้า"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
                <path d="m6 6 12 12" />
                <path d="m18 6-12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>
      <ul className="flex flex-col gap-3 divide-y divide-slate-100">
        {items.map(({ item, quantity }) => (
          <Fragment key={item.id}>
            <li className="flex flex-col gap-1 pt-3 first:pt-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    SKU {item.sku}
                    {item.asset_code ? ` · รหัสทรัพย์สิน ${item.asset_code}` : ""} · คงเหลือ{" "}
                    {item.stock_on_hand} {item.unit}
                  </p>
                  {item.category_type ? (
                    <p className="text-xs text-slate-500">
                      หมวดหมู่: {item.category_type === "material" ? "วัสดุ" : "อุปกรณ์"}
                    </p>
                  ) : null}
                  {item.category_name ? (
                    <p className="text-xs text-slate-500">ประเภทสินค้า: {item.category_name}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={item.stock_on_hand}
                    value={quantity}
                    onChange={(event) => updateItem(item.id, Number(event.target.value))}
                    className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    ลบ
                  </button>
                </div>
              </div>
              {item.location_hint ? (
                <p className="text-xs text-slate-500">ตำแหน่ง: {item.location_hint}</p>
              ) : null}
            </li>
          </Fragment>
        ))}
      </ul>
    </aside>
  );
}

interface ItemCardProps {
  item: Item;
  onAdd: (item: Item) => void;
  onManage?: (item: Item, action: "edit" | "delete") => void;
}

export function ItemCard({ item, onAdd, onManage }: ItemCardProps) {
  return (
    <article className="relative flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {onManage ? (
        <div className="absolute right-3 top-3 flex gap-2">
          <button
            type="button"
            title="แก้ไขสินค้า"
            onClick={() => onManage?.(item, "edit")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path d="M16.862 4.487 19.5 7.125" />
              <path d="M4.5 19.5h3.75L19.125 8.625a1.875 1.875 0 0 0-2.652-2.652L5.598 16.848 4.5 19.5Z" />
            </svg>
          </button>
          <button
            type="button"
            title="ลบสินค้า"
            onClick={() => onManage?.(item, "delete")}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 hover:bg-red-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </button>
        </div>
      ) : null}

      <div className="h-40 w-full overflow-hidden rounded-md bg-slate-100">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-12 w-12"
            >
              <path d="M3 17V7a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              <path d="m10 12-2 2 2 2" />
              <path d="m14 12 2 2-2 2" />
            </svg>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
        <p className="text-xs text-slate-500">SKU {item.sku}</p>
        {item.category_type ? (
          <p className="text-xs text-slate-500">
            หมวดหมู่: {item.category_type === "material" ? "วัสดุ" : "อุปกรณ์"}
          </p>
        ) : null}
        {item.category_name ? (
          <p className="text-xs text-slate-500">ประเภทสินค้า: {item.category_name}</p>
        ) : null}
        {item.asset_code ? <p className="text-xs text-slate-500">รหัสทรัพย์สิน {item.asset_code}</p> : null}
      </div>
      <p className="text-sm text-slate-600">{item.description ?? "ไม่มีคำอธิบาย"}</p>
      <p className="text-xs text-slate-500">
        คงเหลือ {item.stock_on_hand} {item.unit} · จองแล้ว {item.stock_reserved}
      </p>
      <button
        type="button"
        onClick={() => onAdd(item)}
        className="mt-auto w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        เพิ่มเข้าตะกร้า
      </button>
    </article>
  );
}
