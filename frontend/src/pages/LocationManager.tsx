import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { LocationShape, WarehouseItem } from "../components/WarehouseMapEditor";
import { WarehouseMapEditor } from "../components/WarehouseMapEditor";
import {
  createWarehouseMap,
  deleteWarehouseMap,
  fetchItems,
  fetchWarehouseMaps,
  updateWarehouseMap,
  uploadAttachment,
  fetchStorageLocations,
  createStorageLocation,
  updateStorageLocation,
  deleteStorageLocation,
} from "../services/api";
import type {
  WarehouseMapAreaPayload,
  WarehouseMapResponse,
  WarehouseMapCreatePayload,
  WarehouseMapUpdatePayload,
  StorageLocation as StorageLocationResponse,
  StorageLocationCreatePayload,
} from "../types/warehouse";

interface StorageLocation {
  id: string;
  name: string;
  building?: string;
  zone: string;
  aisle?: string;
  rack: string;
  level: string;
  bin?: string;
  code: string;
  capacity: number;
  note?: string;
  width_cm?: number;
  depth_cm?: number;
  height_cm?: number;
  allowedItems: string[];
  used_volume_cm3?: number;
}

type LocationFormState = Omit<StorageLocationCreatePayload, "code">;

const ZONE_STYLES = [
  "border-emerald-300 bg-emerald-100 text-emerald-900",
  "border-sky-300 bg-sky-100 text-sky-900",
  "border-amber-300 bg-amber-100 text-amber-900",
  "border-rose-300 bg-rose-100 text-rose-900",
  "border-indigo-300 bg-indigo-100 text-indigo-900",
] as const;

const LOCATIONS_STORAGE_KEY = "location-manager.locations";
const LOCATION_TEMPLATE_HEADERS = [
  "name",
  "building",
  "zone",
  "aisle",
  "rack",
  "level",
  "bin",
  "width_cm",
  "depth_cm",
  "height_cm",
  "capacity",
  "note",
] as const;

const demoItems: WarehouseItem[] = [
  {
    id: "item-1",
    name: "โทรศัพท์มือถือ iPhone 15",
    sku: "IP15-128GB-BLK",
    category: "อิเล็กทรอนิกส์",
    description: "iPhone 15 128GB สีดำ"
  },
  {
    id: "item-2", 
    name: "เสื้อยืดคอกลม",
    sku: "SHIRT-M-WHT",
    category: "เสื้อผ้า",
    description: "เสื้อยืดสีขาว ไซส์ M"
  },
  {
    id: "item-3",
    name: "แล็ปท็อป Dell Inspiron",
    sku: "DELL-INS-15",
    category: "คอมพิวเตอร์",
    description: "Dell Inspiron 15 นิ้ว"
  },
  {
    id: "item-4",
    name: "รองเท้าผ้าใบ Nike",
    sku: "NIKE-AIR-42",
    category: "รองเท้า",
    description: "Nike Air Max ไซส์ 42"
  },
  {
    id: "item-5",
    name: "หูฟัง Sony WH-1000XM4",
    sku: "SONY-WH1000XM4",
    category: "อิเล็กทรอนิกส์",
    description: "หูฟังไร้สาย Sony"
  },
  {
    id: "item-6",
    name: "กระเป๋าเป้ Jansport",
    sku: "JS-SUPER-BLU",
    category: "กระเป๋า",
    description: "กระเป๋าเป้ Jansport สีน้ำเงิน"
  },
  {
    id: "item-7",
    name: "นาฬิกา Apple Watch Series 9",
    sku: "AW-S9-45MM",
    category: "อิเล็กทรอนิกส์",
    description: "Apple Watch Series 9 45mm"
  },
  {
    id: "item-8",
    name: "กางเกงยีนส์ Levi's",
    sku: "LEVI-501-32",
    category: "เสื้อผ้า",
    description: "กางเกงยีนส์ Levi's 501 เอว 32"
  }
];

type StorageLocationSeed = Omit<StorageLocation, "code">;
type TemplateHeader = (typeof LOCATION_TEMPLATE_HEADERS)[number];

type LocationCodeSource = Partial<Pick<StorageLocation, "zone" | "rack" | "level" | "bin" | "name">>;

interface BulkImportRecord {
  payload: StorageLocationCreatePayload;
  rowNumber: number;
}

interface DuplicateImportRecord extends BulkImportRecord {
  existing: StorageLocation;
}

interface BulkImportState {
  fileName: string;
  totalRows: number;
  newRecords: BulkImportRecord[];
  duplicateRecords: DuplicateImportRecord[];
  selectedDuplicateCodes: Set<string>;
}

function normalizeCodeValue(value?: string): string {
  if (!value) return "";
  const trimmed = value.trim().toUpperCase();
  return trimmed.replace(/[^A-Z0-9]/g, "");
}

function ensurePrefixed(value: string, prefix: string): string {
  if (!value) return "";
  if (value.startsWith(prefix)) {
    return value;
  }
  return `${prefix}${value}`;
}

function generateLocationCode(source: LocationCodeSource): string {
  const zoneSegment = normalizeCodeValue(source.zone);
  const rackSegment = ensurePrefixed(normalizeCodeValue(source.rack), "R");
  const levelSegment = ensurePrefixed(normalizeCodeValue(source.level), "L");
  const binSegment = ensurePrefixed(normalizeCodeValue(source.bin), "B");
  const segments = [zoneSegment, rackSegment, levelSegment, binSegment].filter(Boolean);
  if (segments.length > 0) {
    return segments.join("-");
  }
  const fallback = normalizeCodeValue(source.name);
  return fallback || "";
}

const demoLocationsSeed: StorageLocationSeed[] = [
  {
    id: "loc-a-01",
    name: "โซน A ชั้น R1L1 ช่อง B1",
    building: "อาคารหลัก",
    zone: "A",
    aisle: "01",
    rack: "R1",
    level: "L1",
    bin: "B1",
    capacity: 216000,
    width_cm: 80,
    depth_cm: 60,
    height_cm: 45,
    note: "ใกล้พื้นที่รับสินค้าด่วน",
  },
  {
    id: "loc-b-03",
    name: "โซน B ชั้น R2L3 ช่อง B4",
    building: "อาคารหลัก",
    zone: "B",
    aisle: "03",
    rack: "R2",
    level: "L3",
    bin: "B4",
    capacity: 520000,
    width_cm: 100,
    depth_cm: 80,
    height_cm: 65,
    note: "ชั้นควบคุมอุณหภูมิ",
  },
  {
    id: "loc-c-05",
    name: "โซน C ชั้น R3L2 ช่อง C2",
    building: "อาคารหลัก",
    zone: "C",
    aisle: "05",
    rack: "R3",
    level: "L2",
    bin: "C2",
    capacity: 315000,
    width_cm: 90,
    depth_cm: 70,
    height_cm: 50,
    note: "พื้นที่สำหรับสินค้าขนาดกลาง",
  },
  {
    id: "loc-d-02",
    name: "โซน D ชั้น R4L1 ช่อง D1",
    building: "อาคารหลัก",
    zone: "D",
    aisle: "02",
    rack: "R4",
    level: "L1",
    bin: "D1",
    capacity: 864000,
    width_cm: 120,
    depth_cm: 90,
    height_cm: 80,
    note: "โซนสินค้าหนัก ต้องใช้โฟร์คลิฟต์",
  },
  {
    id: "loc-b-07",
    name: "โซน B ชั้น R1L4 ช่อง B8",
    building: "อาคารหลัก",
    zone: "B",
    aisle: "07",
    rack: "R1",
    level: "L4",
    bin: "B8",
    capacity: 132000,
    width_cm: 60,
    depth_cm: 55,
    height_cm: 40,
    note: "เก็บอะไหล่สำรอง",
  },
  {
    id: "loc-e-01",
    name: "โซน E ชั้น R5L1 ช่อง E1",
    building: "อาคารหลัก",
    zone: "E",
    aisle: "01",
    rack: "R5",
    level: "L1",
    bin: "E1",
    capacity: 2400000,
    width_cm: 200,
    depth_cm: 120,
    height_cm: 100,
    note: "สินค้าชิ้นใหญ่ ต้องกันพื้นที่พิเศษ",
  },
  {
    id: "loc-a-12",
    name: "โซน A ชั้น R2L5 ช่อง A9",
    building: "อาคารหลัก",
    zone: "A",
    aisle: "12",
    rack: "R2",
    level: "L5",
    bin: "A9",
    capacity: 268125,
    width_cm: 75,
    depth_cm: 65,
    height_cm: 55,
    note: "พื้นที่สินค้าตามฤดูกาล",
  },
];

const demoLocations: StorageLocation[] = demoLocationsSeed.map((location) => ({
  ...location,
  code: generateLocationCode(location),
  allowedItems: [],
}));

function cacheLocations(records: StorageLocation[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore cache errors
  }
}

function sanitizeStoredLocations(data: unknown): StorageLocation[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .filter((item): item is StorageLocationSeed & { code?: string } => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.zone === "string" &&
        typeof item.rack === "string" &&
        typeof item.level === "string"
      );
    })
    .map((item) => {
      const zone = item.zone.trim().toUpperCase();
      const rack = item.rack.trim().toUpperCase();
      const level = item.level.trim().toUpperCase();
      const binValue = item.bin?.trim().toUpperCase();
      const codeCandidate =
        item.code ||
        generateLocationCode({
          zone,
          rack,
          level,
          bin: binValue,
          name: item.name,
        }) ||
        normalizeCodeValue(item.name) ||
        "LOC";
      return {
        ...item,
        zone,
        rack,
        level,
        bin: binValue,
        building:
          typeof item.building === "string" && item.building.trim() ? item.building.trim() : undefined,
        aisle: typeof item.aisle === "string" && item.aisle.trim() ? item.aisle.trim() : undefined,
        code: codeCandidate,
        width_cm:
          typeof item.width_cm === "number" && Number.isFinite(item.width_cm) ? item.width_cm : undefined,
        depth_cm:
          typeof item.depth_cm === "number" && Number.isFinite(item.depth_cm) ? item.depth_cm : undefined,
        height_cm:
          typeof item.height_cm === "number" && Number.isFinite(item.height_cm) ? item.height_cm : undefined,
        capacity: typeof item.capacity === "number" && Number.isFinite(item.capacity) ? item.capacity : 0,
        note: typeof item.note === "string" && item.note.trim() ? item.note.trim() : undefined,
        allowedItems: (() => {
          const legacy =
            Array.isArray((item as { allowed_item_ids?: unknown }).allowed_item_ids) &&
            (item as { allowed_item_ids?: unknown[] }).allowed_item_ids
              ? (item as { allowed_item_ids?: unknown[] }).allowed_item_ids
                  .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                  .map((value) => value.trim())
              : [];
          if (legacy.length > 0) {
            return legacy;
          }
          return Array.isArray((item as { allowedItems?: unknown }).allowedItems)
            ? ((item as { allowedItems?: unknown[] }).allowedItems ?? [])
                .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
                .map((value) => value.trim())
            : [];
        })(),
      } satisfies StorageLocation;
    });
}

function loadCachedLocations(): StorageLocation[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LOCATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return sanitizeStoredLocations(parsed);
  } catch {
    return [];
  }
}

function mapLocationResponse(record: StorageLocationResponse): StorageLocation {
  const sanitized = sanitizeStoredLocations([record]);
  if (sanitized.length > 0) {
    return sanitized[0];
  }
  const zone = record.zone?.trim().toUpperCase() ?? "";
  const rack = record.rack?.trim().toUpperCase() ?? "";
  const level = record.level?.trim().toUpperCase() ?? "";
  const bin = record.bin?.trim().toUpperCase();
  const codeCandidate =
    record.code?.trim() ||
    generateLocationCode({
      zone,
      rack,
      level,
      bin,
      name: record.name ?? "",
    }) ||
    normalizeCodeValue(record.name) ||
    "LOC";
  return {
    id: record.id,
    name: record.name ?? "ตำแหน่งไม่ได้ตั้งชื่อ",
    building: record.building ?? undefined,
    zone,
    aisle: record.aisle ?? undefined,
    rack,
    level,
    bin,
    code: codeCandidate,
    capacity: Number.isFinite(record.capacity) ? record.capacity : 0,
    note: record.note ?? undefined,
    width_cm: record.width_cm ?? undefined,
    depth_cm: record.depth_cm ?? undefined,
    height_cm: record.height_cm ?? undefined,
    allowedItems: Array.isArray(record.allowed_item_ids)
      ? record.allowed_item_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [],
    used_volume_cm3: (() => {
      const raw = (record as { used_volume_cm3?: unknown }).used_volume_cm3;
      const numeric = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
    })(),
  };
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `loc-${Math.random().toString(36).slice(2, 10)}`;
}

function calculateCapacityFromDimensions(
  width?: number,
  depth?: number,
  height?: number,
): number {
  if (!width || !depth || !height) {
    return 0;
  }
  const volume = width * depth * height;
  if (!Number.isFinite(volume) || volume <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(volume));
}

function getLocationVolumeCm3(location: StorageLocation): number {
  const derived = calculateCapacityFromDimensions(location.width_cm, location.depth_cm, location.height_cm);
  if (derived > 0) {
    return derived;
  }
  if (location.capacity && Number.isFinite(location.capacity)) {
    return location.capacity;
  }
  return 0;
}

function calculateAreaFromDimensions(width?: number, depth?: number): number {
  if (!width || !depth) {
    return 0;
  }
  const area = width * depth;
  if (!Number.isFinite(area) || area <= 0) {
    return 0;
  }
  return area;
}

function formatMetric(value: number, options?: Intl.NumberFormatOptions) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, options) : "-";
}

export function LocationManager() {
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSuccessMessage, setLocationSuccessMessage] = useState<string | null>(null);
  const [locationInfoMessage, setLocationInfoMessage] = useState<string | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [bulkImportState, setBulkImportState] = useState<BulkImportState | null>(null);
  const [bulkImportProcessing, setBulkImportProcessing] = useState(false);
  const [mapShapes, setMapShapes] = useState<LocationShape[]>([]);
  const [mapList, setMapList] = useState<WarehouseMapResponse[]>([]);
  const [formState, setFormState] = useState<LocationFormState>({
    name: "",
    building: "",
    zone: "",
    aisle: "",
    rack: "",
    level: "",
    bin: undefined,
    capacity: 0,
    note: "",
    width_cm: undefined,
    depth_cm: undefined,
    height_cm: undefined,
    allowed_item_ids: [],
  });
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editFormState, setEditFormState] = useState<LocationFormState | null>(null);
  const [locationSearch, setLocationSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("ทั้งหมด");
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [mapName, setMapName] = useState("");
  const [mapImage, setMapImage] = useState<{ url: string | null; width: number | null; height: number | null }>({
    url: null,
    width: null,
    height: null,
  });
  const [mapLoading, setMapLoading] = useState(false);
  const [mapImageUploading, setMapImageUploading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSavingMap, setIsSavingMap] = useState(false);
  const [mapSuccessMessage, setMapSuccessMessage] = useState<string | null>(null);
  const [mapItems, setMapItems] = useState<WarehouseItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [locationsHydrated, setLocationsHydrated] = useState(false);
  const [formItemQuery, setFormItemQuery] = useState("");
  const [editItemQuery, setEditItemQuery] = useState("");
  const [isFormItemDropdownVisible, setIsFormItemDropdownVisible] = useState(false);
  const [isEditItemDropdownVisible, setIsEditItemDropdownVisible] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [tableDrafts, setTableDrafts] = useState<Record<string, string[]>>({});
  const [tableQueries, setTableQueries] = useState<Record<string, string>>({});
  const [tableSaving, setTableSaving] = useState(false);
  const [tableSelection, setTableSelection] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const itemLookup = useMemo(() => {
    const lookup = new Map<string, WarehouseItem>();
    mapItems.forEach((item) => {
      lookup.set(item.id, item);
    });
    return lookup;
  }, [mapItems]);

  const locationLookup = useMemo(() => {
    const lookup = new Map<string, StorageLocation>();
    locations.forEach((location) => {
      lookup.set(location.id, location);
    });
    return lookup;
  }, [locations]);

  const syncLocationAllowedItemsFromShapes = useCallback(
    async (areas: WarehouseMapAreaPayload[]) => {
      if (!areas || areas.length === 0) {
        return;
      }
      const updates: Array<{ id: string; allowed_item_ids: string[] }> = [];
      areas.forEach((area) => {
        if (!area.location_id) {
          return;
        }
        const desired =
          Array.isArray(area.allowed_item_ids) && area.allowed_item_ids.length > 0
            ? area.allowed_item_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
        const location = locationLookup.get(area.location_id);
        if (!location) {
          return;
        }
        const current = location.allowedItems ?? [];
        if (areStringArraysEqual(desired, current)) {
          return;
        }
        updates.push({ id: area.location_id, allowed_item_ids: desired });
      });
      if (updates.length === 0) {
        return;
      }
      for (const update of updates) {
        try {
          const updated = await updateStorageLocation(update.id, update);
          const normalized = mapLocationResponse(updated);
          setLocations((prev) => prev.map((location) => (location.id === normalized.id ? normalized : location)));
        } catch (error) {
          setLocationError((prev) => prev ?? formatErrorMessage(error));
        }
      }
    },
    [locationLookup],
  );

  const hydrateMap = useCallback((map: WarehouseMapResponse) => {
    const width = Number(map.image_width);
    const height = Number(map.image_height);
    setActiveMapId(map.id);
    setMapName(map.name?.trim() ?? "");
    setMapImage({
      url: map.image_url ?? null,
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
    });
    const shapes = map.areas.map((area) => mapAreaToShape(area, locationLookup));
    setMapShapes(shapes);
    setHasUnsavedChanges(false);
    setMapError(null);
    setMapSuccessMessage(null);
    setMapImageUploading(false);
  }, [locationLookup]);

  useEffect(() => {
    if (locationsHydrated) {
      return;
    }
    if (typeof window === "undefined") {
      setLocationsHydrated(true);
      return;
    }
    const cached = loadCachedLocations();
    if (cached.length > 0) {
      setLocations(cached);
    } else {
      setLocations(demoLocations);
    }
    setLocationsHydrated(true);
  }, [locationsHydrated]);

  useEffect(() => {
    let cancelled = false;
    async function loadRemoteLocations() {
      setLocationsLoading(true);
      setLocationError(null);
      try {
        const remoteRecords = await fetchStorageLocations();
        if (cancelled) {
          return;
        }
        const normalized = remoteRecords.map(mapLocationResponse);
        setLocations(normalized);
        cacheLocations(normalized);
      } catch (error) {
        if (!cancelled) {
          setLocationError(formatErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLocationsLoading(false);
        }
      }
    }
    void loadRemoteLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!locationsHydrated) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
    } catch {
      // ignore storage write errors in this prototype view
    }
  }, [locations, locationsHydrated]);

  useEffect(() => {
    let mounted = true;
    async function loadMaps() {
      setMapLoading(true);
      setMapError(null);
      try {
        const maps = await fetchWarehouseMaps();
        if (!mounted) return;
        setMapList(maps);
        if (maps.length > 0) {
          hydrateMap(maps[0]);
        } else {
          setActiveMapId(null);
          setMapName("");
          setMapShapes([]);
          setMapImage({ url: null, width: null, height: null });
          setHasUnsavedChanges(false);
        }
      } catch (error) {
        if (mounted) {
          setMapError(formatErrorMessage(error));
        }
      } finally {
        if (mounted) {
          setMapLoading(false);
        }
      }
    }
    void loadMaps();
    return () => {
      mounted = false;
    };
  }, [hydrateMap]);

  useEffect(() => {
    let cancelled = false;
    async function loadItems() {
      setItemsLoading(true);
      setItemsError(null);
      try {
        const catalogItems = await fetchItems();
        if (cancelled) return;
        const normalized: WarehouseItem[] = catalogItems.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          category: item.category_name ?? undefined,
          description: item.description ?? undefined,
        }));
        setMapItems(normalized);
      } catch (error) {
        if (cancelled) return;
        setItemsError(formatErrorMessage(error));
        setMapItems(demoItems);
      } finally {
        if (!cancelled) {
          setItemsLoading(false);
        }
      }
    }
    void loadItems();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapSuccessMessage) return;
    const timer = window.setTimeout(() => setMapSuccessMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [mapSuccessMessage]);

  useEffect(() => {
    if (!locationSuccessMessage) {
      return;
    }
    const timer = window.setTimeout(() => setLocationSuccessMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [locationSuccessMessage]);

  const handleShapesChange = useCallback((shapes: LocationShape[]) => {
    setMapShapes(shapes);
    setHasUnsavedChanges(true);
    setMapSuccessMessage(null);
  }, []);

  const lockedLocationMap = useMemo(() => {
    const locked = new Map<
      string,
      {
        mapId: string;
        mapName: string;
        areaId: string;
        allowedItems: string[];
      }
    >();
    mapList.forEach((map, index) => {
      if (map.id === activeMapId) {
        return;
      }
      map.areas.forEach((area, areaIndex) => {
        if (area.location_id) {
          locked.set(area.location_id, {
            mapId: map.id,
            mapName: (map.name?.trim() || `ผัง #${index + 1}`),
            areaId: area.id ?? `${areaIndex}`,
            allowedItems: Array.isArray(area.allowed_item_ids) ? area.allowed_item_ids.slice() : [],
          });
        }
      });
    });
    return locked;
  }, [mapList, activeMapId]);

  const handleEditorImageChange = useCallback(
    async ({
      file,
      previewUrl,
      width,
      height,
    }: {
      file: File;
      previewUrl: string;
      width: number;
      height: number;
    }) => {
      const previous = mapImage;
      const wasDirty = hasUnsavedChanges;
      setMapImage({ url: previewUrl, width, height });
      setHasUnsavedChanges(true);
      setMapSuccessMessage(null);
      setMapError(null);
      setMapImageUploading(true);
      try {
        const attachment = await uploadAttachment(file, "inventory-maps");
        const remoteUrl = attachment.public_url ?? previewUrl;
        setMapImage({ url: remoteUrl, width, height });
      } catch (error) {
        setMapError(formatErrorMessage(error));
        setHasUnsavedChanges(wasDirty);
        setMapImage(previous);
      } finally {
        setMapImageUploading(false);
      }
    },
    [hasUnsavedChanges, mapImage],
  );

  const handleMapNameChange = useCallback((value: string) => {
    setMapName(value);
    setHasUnsavedChanges(true);
    setMapSuccessMessage(null);
    setMapError(null);
  }, []);

  const handleSelectMap = useCallback(
    (mapId: string) => {
      if (mapId === activeMapId) return;
      if (hasUnsavedChanges) {
        const confirmSwitch = window.confirm("มีการแก้ไขที่ยังไม่บันทึก ต้องการสลับไปยังผังอื่นหรือไม่?");
        if (!confirmSwitch) {
          return;
        }
      }
      const target = mapList.find((map) => map.id === mapId);
      if (target) {
        hydrateMap(target);
      }
    },
    [activeMapId, hasUnsavedChanges, hydrateMap, mapList],
  );

  const handleStartNewMap = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmReset = window.confirm("มีการแก้ไขที่ยังไม่บันทึก ต้องการสร้างผังใหม่หรือไม่?");
      if (!confirmReset) {
        return;
      }
    }
    setActiveMapId(null);
    setMapName("");
    setMapShapes([]);
    setMapImage({ url: null, width: null, height: null });
    setHasUnsavedChanges(false);
    setMapError(null);
    setMapSuccessMessage(null);
    setMapImageUploading(false);
  }, [hasUnsavedChanges]);

  const generateUniqueName = useCallback(
    (candidate: string, excludeId?: string | null) => {
      const normalizedCandidate = candidate.trim();
      if (!normalizedCandidate) {
        return normalizedCandidate;
      }
      const existingNames = mapList
        .filter((map) => (excludeId ? map.id !== excludeId : true))
        .map((map) => map.name?.trim().toLowerCase())
        .filter((name): name is string => Boolean(name));
      if (!existingNames.includes(normalizedCandidate.toLowerCase())) {
        return normalizedCandidate;
      }
      let counter = 2;
      let nextName = `${normalizedCandidate} (${counter})`;
      while (existingNames.includes(nextName.toLowerCase())) {
        counter += 1;
        nextName = `${normalizedCandidate} (${counter})`;
      }
      return nextName;
    },
    [mapList, setMapError, setMapList, setMapSuccessMessage],
  );

  const handleSaveMap = useCallback(async ({ auto = false }: { auto?: boolean } = {}) => {
    const trimmedName = mapName.trim();
    if (!trimmedName) {
      setMapError("กรุณาตั้งชื่อผังคลังสินค้าก่อนบันทึก");
      return;
    }
    const normalizedName = trimmedName.toLowerCase();
    const hasDuplicateName = mapList.some(
      (map) => map.id !== activeMapId && map.name?.trim().toLowerCase() === normalizedName,
    );
    if (hasDuplicateName) {
      setMapError("มีผังคลังสินค้าที่ใช้ชื่อนี้อยู่แล้ว กรุณาตั้งชื่อใหม่");
      return;
    }
    if (!mapImage.url || !mapImage.width || !mapImage.height) {
      setMapError("กรุณาอัปโหลดผังคลังสินค้าและให้ระบบรู้ขนาดรูปก่อนบันทึก");
      return;
    }
    if (mapImageUploading) {
      setMapError("กำลังอัปโหลดผังคลังสินค้าอยู่ กรุณารอให้เสร็จก่อนบันทึก");
      return;
    }
    const payload = {
      name: trimmedName,
      image_url: mapImage.url,
      image_width: mapImage.width,
      image_height: mapImage.height,
      areas: mapShapes.map(shapeToMapAreaPayload),
    };
    setIsSavingMap(true);
    setMapError(null);
    setMapSuccessMessage(null);
    try {
      let saved: WarehouseMapResponse;
      if (activeMapId) {
        saved = await updateWarehouseMap(activeMapId, payload);
      } else {
        saved = await createWarehouseMap(payload);
      }
      await syncLocationAllowedItemsFromShapes(saved.areas);
      setMapList((prev) => {
        const index = prev.findIndex((item) => item.id === saved.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      hydrateMap(saved);
      setMapSuccessMessage(auto ? "บันทึกอัตโนมัติเรียบร้อย" : "บันทึกผังคลังสินค้าเรียบร้อย");
    } catch (error) {
      setMapError(formatErrorMessage(error));
    } finally {
      setIsSavingMap(false);
    }
  }, [activeMapId, hydrateMap, mapImage, mapImageUploading, mapName, mapShapes, syncLocationAllowedItemsFromShapes]);

  const handleDuplicateMap = useCallback(
    async (mapId: string) => {
      const source = mapList.find((map) => map.id === mapId);
      if (!source) return;
      const baseName = source.name?.trim() || "ผังใหม่";
      const initialName = `Copy ${baseName}`;
      const duplicatedName = generateUniqueName(initialName);
      const payload = {
        name: duplicatedName,
        image_url: source.image_url ?? null,
        image_width: source.image_width,
        image_height: source.image_height,
        areas: source.areas.map((area) => ({
          ...area,
          id: undefined,
          location_id: null,
          allowed_item_ids: [],
        })),
      } satisfies WarehouseMapCreatePayload;
      setMapLoading(true);
      setMapError(null);
      try {
        const created = await createWarehouseMap(payload);
        setMapList((prev) => [created, ...prev]);
        hydrateMap(created);
        setMapSuccessMessage("คัดลอกผังเรียบร้อย");
      } catch (error) {
        setMapError(formatErrorMessage(error));
      } finally {
        setMapLoading(false);
      }
    },
    [generateUniqueName, hydrateMap, mapList],
  );

  const handleTransferLockedLocation = useCallback(
    async ({
      locationId: _locationId,
      sourceMapId,
      areaId,
      clearItems,
      allowedItems,
    }: {
      locationId: string;
      sourceMapId: string;
      areaId: string;
      clearItems: boolean;
      allowedItems: string[];
    }): Promise<{ allowedItems?: string[] }> => {
      void _locationId;
      const sourceMap = mapList.find((map) => map.id === sourceMapId);
      if (!sourceMap) {
        throw new Error("ไม่พบผังต้นทางเพื่อย้าย Location");
      }

      const updatedAreas: WarehouseMapAreaPayload[] = sourceMap.areas.map((area, index) => {
        const areaKey = area.id ?? `${index}`;
        if (areaKey !== areaId) {
          return area;
        }
        return {
          ...area,
          location_id: null,
          allowed_item_ids: clearItems ? [] : area.allowed_item_ids ?? [],
        };
      });

      try {
        setMapLoading(true);
        const payload: WarehouseMapUpdatePayload = {
          areas: updatedAreas,
        };
        await updateWarehouseMap(sourceMapId, payload);
        await syncLocationAllowedItemsFromShapes(updatedAreas);
        setMapList((prev) =>
          prev.map((map) =>
            map.id === sourceMapId
              ? {
                  ...map,
                  areas: updatedAreas,
                }
              : map,
          ),
        );
        setMapSuccessMessage("ย้าย Location จากผังอื่นเรียบร้อย");
        return { allowedItems: clearItems ? [] : allowedItems.slice() };
      } catch (error) {
        setMapError(formatErrorMessage(error));
        throw error;
      } finally {
        setMapLoading(false);
      }
    },
    [mapList, setMapError, setMapList, setMapSuccessMessage, syncLocationAllowedItemsFromShapes],
  );

  const autoSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeMapId) return;
    if (!hasUnsavedChanges) return;
    if (isSavingMap || mapLoading || mapImageUploading) return;
    if (!mapImage.url || !mapImage.width || !mapImage.height) return;

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void handleSaveMap({ auto: true });
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    activeMapId,
    hasUnsavedChanges,
    isSavingMap,
    mapLoading,
    mapImageUploading,
    mapImage.url,
    mapImage.width,
    mapImage.height,
    handleSaveMap,
  ]);

  const handleDeleteMap = useCallback(async () => {
    if (!activeMapId) return;
    const confirmed = window.confirm("ต้องการลบผังคลังสินค้านี้หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้");
    if (!confirmed) return;

    setMapLoading(true);
    setMapError(null);
    setMapSuccessMessage(null);
    try {
      await deleteWarehouseMap(activeMapId);
      const remainingMaps = mapList.filter((map) => map.id !== activeMapId);
      setMapList(remainingMaps);
      if (remainingMaps.length > 0) {
        hydrateMap(remainingMaps[0]);
      } else {
        setActiveMapId(null);
        setMapName("");
        setMapShapes([]);
        setMapImage({ url: null, width: null, height: null });
        setHasUnsavedChanges(false);
      }
      setMapSuccessMessage("ลบผังคลังสินค้าเรียบร้อย");
    } catch (error) {
      setMapError(formatErrorMessage(error));
    } finally {
      setMapLoading(false);
    }
  }, [activeMapId, hydrateMap, mapList]);

  const zoneSummary = useMemo(() => {
    return locations.reduce<Record<string, { total: number; volumeCm3: number; areaCm2: number }>>((acc, item) => {
      const key = item.zone || "ไม่ระบุ";
      if (!acc[key]) {
        acc[key] = { total: 0, volumeCm3: 0, areaCm2: 0 };
      }
      acc[key].total += 1;
      acc[key].volumeCm3 += getLocationVolumeCm3(item);
      const area = calculateAreaFromDimensions(item.width_cm, item.depth_cm);
      acc[key].areaCm2 += area;
      return acc;
    }, {});
  }, [locations]);

  const mapLocations = useMemo(
    () =>
      locations.map((location) => {
        const summaryParts: string[] = [];
        if (location.building?.trim()) {
          summaryParts.push(`อาคาร ${location.building.trim()}`);
        }
        if (location.zone?.trim()) {
          summaryParts.push(`โซน ${location.zone.trim()}`);
        }
        const levelDetails: string[] = [];
        if (location.rack?.trim()) {
          levelDetails.push(`ชั้นวาง ${location.rack.trim()}`);
        }
        if (location.level?.trim()) {
          levelDetails.push(`ระดับ ${location.level.trim()}`);
        }
        if (location.bin?.trim()) {
          levelDetails.push(`ช่อง ${location.bin.trim()}`);
        }
        if (levelDetails.length > 0) {
          summaryParts.push(levelDetails.join(" · "));
        }
        return {
          id: location.id,
          label: location.name || summaryParts.join(" · "),
          zone: location.zone,
        };
      }),
    [locations],
  );

  const zoneOptions = useMemo(() => {
    const zones = new Set<string>();
    locations.forEach((location) => {
      if (location.zone) {
        zones.add(location.zone.toUpperCase());
      }
    });
    return ["ทั้งหมด", ...Array.from(zones).sort((a, b) => a.localeCompare(b))];
  }, [locations]);

  const visibleLocations = useMemo(() => {
    const search = locationSearch.trim().toLowerCase();
    return locations.filter((location) => {
      const zoneMatch = zoneFilter === "ทั้งหมด" || location.zone.toUpperCase() === zoneFilter;
      if (!zoneMatch) return false;
      if (!search) return true;
      const target = [
        location.name,
        location.building ?? "",
        location.zone,
        location.aisle ?? "",
        location.rack,
        location.level,
        location.bin,
        location.code,
        location.note ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return target.includes(search);
    });
  }, [locations, locationSearch, zoneFilter]);

  function buildLocationPayload(form: LocationFormState): StorageLocationCreatePayload {
    const capacity = calculateCapacityFromDimensions(
      form.width_cm,
      form.depth_cm,
      form.height_cm,
    );
    const name = form.name.trim();
    const building = form.building?.trim() ?? "";
    const zone = form.zone.trim().toUpperCase();
    const aisle = form.aisle?.trim();
    const rack = form.rack.trim().toUpperCase();
    const level = form.level.trim().toUpperCase();
    const bin = form.bin?.trim().toUpperCase();
    const code = generateLocationCode({
      zone,
      rack,
      level,
      bin,
      name,
    });
    const resolvedCode = code || normalizeCodeValue(name) || "LOC";
    return {
      name,
      building: building || undefined,
      zone,
      aisle: aisle || undefined,
      rack,
      level,
      bin: bin || undefined,
      code: resolvedCode,
      capacity,
      note: form.note ? form.note : undefined,
      width_cm: form.width_cm || undefined,
      depth_cm: form.depth_cm || undefined,
      height_cm: form.height_cm || undefined,
      allowed_item_ids: (form.allowed_item_ids ?? []).slice(),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildLocationPayload(formState);
    setLocationSaving(true);
    setLocationError(null);
    setLocationSuccessMessage(null);
    try {
      const created = await createStorageLocation(payload);
      const normalized = mapLocationResponse(created);
      setLocations((prev) => [normalized, ...prev]);
      setLocationSuccessMessage("สร้างตำแหน่งจัดเก็บเรียบร้อย");
      setEditingLocationId(null);
      setEditFormState(null);
      setFormItemQuery("");
      setFormState({
        name: "",
        building: "",
        zone: "",
        aisle: "",
        rack: "",
        level: "",
        bin: undefined,
        capacity: 0,
        note: "",
        width_cm: undefined,
        depth_cm: undefined,
        height_cm: undefined,
        allowed_item_ids: [],
      });
    } catch (error) {
      setLocationError(formatErrorMessage(error));
    } finally {
      setLocationSaving(false);
    }
  }

  async function handleRemove(id: string) {
    const confirmed = window.confirm("ต้องการลบตำแหน่งนี้ออกจากระบบหรือไม่?");
    if (!confirmed) {
      return;
    }
    setLocationSaving(true);
    setLocationError(null);
    setLocationSuccessMessage(null);
    try {
      await deleteStorageLocation(id);
      setLocations((prev) => prev.filter((item) => item.id !== id));
      setMapShapes((prev) => {
        let changed = false;
        const next = prev.map((shape) => {
          if (shape.locationId === id) {
            changed = true;
            return { ...shape, locationId: undefined };
          }
          return shape;
        });
        if (changed) {
          setHasUnsavedChanges(true);
          setMapSuccessMessage(null);
        }
        return next;
      });
      if (editingLocationId === id) {
        setEditingLocationId(null);
        setEditFormState(null);
        setEditItemQuery("");
        setFormItemQuery("");
        setFormState({
          name: "",
          building: "",
          zone: "",
          aisle: "",
          rack: "",
          level: "",
          bin: undefined,
          capacity: 0,
        note: "",
        width_cm: undefined,
        depth_cm: undefined,
        height_cm: undefined,
        allowed_item_ids: [],
      });
      }
      setLocationSuccessMessage("ลบตำแหน่งเรียบร้อย");
    } catch (error) {
      setLocationError(formatErrorMessage(error));
    } finally {
      setLocationSaving(false);
    }
  }

  function handleEdit(location: StorageLocation) {
    setZoneFilter("ทั้งหมด");
    setLocationSearch("");
    setEditingLocationId(location.id);
    setEditFormState({
      name: location.name,
       building: location.building ?? "",
      zone: location.zone,
      aisle: location.aisle,
      rack: location.rack,
      level: location.level,
      bin: location.bin,
      capacity:
        calculateCapacityFromDimensions(location.width_cm, location.depth_cm, location.height_cm) || location.capacity,
      note: location.note ?? "",
      width_cm: location.width_cm ?? undefined,
      depth_cm: location.depth_cm ?? undefined,
      height_cm: location.height_cm ?? undefined,
      allowed_item_ids: location.allowedItems.slice(),
    });
    setEditItemQuery("");
  }

  function updateEditForm<K extends keyof LocationFormState>(field: K, value: LocationFormState[K]) {
    setEditFormState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value } as LocationFormState;
      if (field === "width_cm" || field === "depth_cm" || field === "height_cm") {
        next.capacity = calculateCapacityFromDimensions(next.width_cm, next.depth_cm, next.height_cm);
      }
      return next;
    });
  }

  function closeEditModal() {
    setEditingLocationId(null);
    setEditFormState(null);
    setEditItemQuery("");
  }

  async function handleUpdateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLocationId || !editFormState) return;
    const payload = buildLocationPayload(editFormState);
    setLocationSaving(true);
    setLocationError(null);
    setLocationSuccessMessage(null);
    try {
      const updated = await updateStorageLocation(editingLocationId, payload);
      const normalized = mapLocationResponse(updated);
      setLocations((prev) =>
        prev.map((location) => (location.id === editingLocationId ? normalized : location)),
      );
      setLocationSuccessMessage("อัปเดตตำแหน่งเรียบร้อย");
      closeEditModal();
    } catch (error) {
      setLocationError(formatErrorMessage(error));
    } finally {
      setLocationSaving(false);
    }
  }

  function formatLocationDescriptor(source: {
    building?: string | null;
    zone: string;
    rack: string;
    level: string;
    bin?: string | null;
  }): string {
    const summary: string[] = [];
    if (source.building && source.building.trim()) {
      summary.push(`อาคาร ${source.building.trim()}`);
    }
    if (source.zone?.trim()) {
      summary.push(`โซน ${source.zone.trim()}`);
    }
    const levelDetails: string[] = [];
    if (source.rack?.trim()) {
      levelDetails.push(source.rack.trim());
    }
    if (source.level?.trim()) {
      levelDetails.push(source.level.trim());
    }
    if (levelDetails.length > 0) {
      summary.push(`ชั้น ${levelDetails.join("-")}`);
    }
    if (source.bin?.trim()) {
      summary.push(`ช่อง ${source.bin.trim()}`);
    }
    return summary.join(" · ") || "-";
  }

  const getItemSuggestions = useCallback(
    (query: string) => {
      const normalized = query.trim().toLowerCase();
      const source = normalized
        ? mapItems.filter((item) => {
            const name = item.name.toLowerCase();
            const sku = item.sku?.toLowerCase() ?? "";
            return name.includes(normalized) || sku.includes(normalized) || item.id.toLowerCase().includes(normalized);
          })
        : mapItems;
      return source.slice(0, 6);
    },
    [mapItems],
  );

  const formItemSuggestions = useMemo(() => getItemSuggestions(formItemQuery), [formItemQuery, getItemSuggestions]);
  const editItemSuggestions = useMemo(
    () => getItemSuggestions(editItemQuery),
    [editItemQuery, getItemSuggestions],
  );

  function resolveItemLabel(itemId: string): string {
    const info = itemLookup.get(itemId);
    if (!info) {
      return itemId;
    }
    if (info.sku) {
      return `${info.name} (${info.sku})`;
    }
    return info.name;
  }

  function formatAllowedItemsPreview(itemIds: string[]): string {
    if (!itemIds || itemIds.length === 0) {
      return "ยังไม่กำหนดสินค้า";
    }
    if (itemIds.length <= 3) {
      return itemIds.map((id) => resolveItemLabel(id)).join(", ");
    }
    return `${itemIds
      .slice(0, 2)
      .map((id) => resolveItemLabel(id))
      .join(", ")} +${itemIds.length - 2}`;
  }

  function handleAddAllowedItem(target: "form" | "edit", itemId: string) {
    if (!itemId) return;
    if (target === "form") {
      setFormState((prev) => {
        const list = prev.allowed_item_ids ?? [];
        if (list.includes(itemId)) {
          return prev;
        }
        return {
          ...prev,
          allowed_item_ids: [...list, itemId],
        };
      });
      setFormItemQuery("");
    } else {
      setEditFormState((prev) => {
        if (!prev) return prev;
        const list = prev.allowed_item_ids ?? [];
        if (list.includes(itemId)) {
          return prev;
        }
        return {
          ...prev,
          allowed_item_ids: [...list, itemId],
        };
      });
      setEditItemQuery("");
    }
  }

  function handleAddAllowedItemByQuery(target: "form" | "edit") {
    const query = target === "form" ? formItemQuery : editItemQuery;
    const suggestions = getItemSuggestions(query);
    if (suggestions.length === 0) {
      setLocationError("ไม่พบสินค้าที่ต้องการเพิ่ม กรุณากรอกชื่อหรือ SKU ให้ถูกต้อง");
      return;
    }
    handleAddAllowedItem(target, suggestions[0].id);
    setLocationError(null);
  }

  function handleRemoveAllowedItem(target: "form" | "edit", itemId: string) {
    if (target === "form") {
      setFormState((prev) => ({
        ...prev,
        allowed_item_ids: (prev.allowed_item_ids ?? []).filter((id) => id !== itemId),
      }));
    } else {
      setEditFormState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          allowed_item_ids: (prev.allowed_item_ids ?? []).filter((id) => id !== itemId),
        };
      });
    }
  }

  const handleOpenTableModal = useCallback(() => {
    const drafts: Record<string, string[]> = {};
    const queries: Record<string, string> = {};
    locations.forEach((location) => {
      drafts[location.id] = location.allowedItems.slice();
      queries[location.id] = "";
    });
    setTableDrafts(drafts);
    setTableQueries(queries);
    setTableSelection(new Set());
    setIsTableModalOpen(true);
  }, [locations]);

  function handleTableQueryChange(locationId: string, value: string) {
    setTableQueries((prev) => ({
      ...prev,
      [locationId]: value,
    }));
  }

  function handleTableAddItem(locationId: string, itemId: string) {
    if (!itemId) return;
    setTableDrafts((prev) => {
      const current = prev[locationId] ?? [];
      if (current.includes(itemId)) {
        return prev;
      }
      return {
        ...prev,
        [locationId]: [...current, itemId],
      };
    });
    setTableQueries((prev) => ({
      ...prev,
      [locationId]: "",
    }));
  }

  function handleTableAddItemByQuery(locationId: string) {
    const query = tableQueries[locationId] ?? "";
    const suggestions = getItemSuggestions(query);
    if (suggestions.length === 0) {
      setLocationError("ไม่พบสินค้าที่ต้องการเพิ่ม กรุณากรอกชื่อหรือ SKU ให้ถูกต้อง");
      return;
    }
    handleTableAddItem(locationId, suggestions[0].id);
    setLocationError(null);
  }

  function handleTableRemoveItem(locationId: string, itemId: string) {
    setTableDrafts((prev) => ({
      ...prev,
      [locationId]: (prev[locationId] ?? []).filter((id) => id !== itemId),
    }));
  }

  function toggleTableSelection(locationId: string) {
    setTableSelection((prev) => {
      const next = new Set(prev);
      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }
      return next;
    });
  }

  function handleSelectAllInView(checked: boolean) {
    if (!checked) {
      setTableSelection(new Set());
      return;
    }
    setTableSelection(new Set(visibleLocations.map((location) => location.id)));
  }

  const handleBulkDeleteSelection = useCallback(() => {
    if (tableSelection.size === 0) {
      return;
    }
    if (!window.confirm(`ต้องการลบ ${tableSelection.size} ตำแหน่งหรือไม่?`)) {
      return;
    }
    setLocationError(null);
    setLocationSuccessMessage(null);
    const idsToDelete = Array.from(tableSelection);
    Promise.all(idsToDelete.map((id) => deleteStorageLocation(id)))
      .then(() => {
        setLocations((prev) => prev.filter((location) => !tableSelection.has(location.id)));
        setTableSelection(new Set());
        setTableDrafts((prev) => {
          const next = { ...prev };
          idsToDelete.forEach((id) => delete next[id]);
          return next;
        });
        setTableQueries((prev) => {
          const next = { ...prev };
          idsToDelete.forEach((id) => delete next[id]);
          return next;
        });
        setLocationSuccessMessage(`ลบตำแหน่ง ${idsToDelete.length} รายการเรียบร้อย`);
      })
      .catch((error) => {
        setLocationError(formatErrorMessage(error));
      });
  }, [tableSelection, deleteStorageLocation, setLocations]);

  function handleInlineDelete(locationId: string) {
    if (!window.confirm("ต้องการลบตำแหน่งนี้หรือไม่?")) {
      return;
    }
    setLocationError(null);
    setLocationSuccessMessage(null);
    deleteStorageLocation(locationId)
      .then(() => {
        setLocations((prev) => prev.filter((location) => location.id !== locationId));
        setTableDrafts((prev) => {
          const next = { ...prev };
          delete next[locationId];
          return next;
        });
        setTableQueries((prev) => {
          const next = { ...prev };
          delete next[locationId];
          return next;
        });
        setTableSelection((prev) => {
          const next = new Set(prev);
          next.delete(locationId);
          return next;
        });
        setLocationSuccessMessage("ลบตำแหน่งเรียบร้อย");
      })
      .catch((error) => setLocationError(formatErrorMessage(error)));
  }

  const tableChanges = useMemo(() => {
    const updates: Array<{ id: string; allowed_item_ids: string[] }> = [];
    locations.forEach((location) => {
      const draft = tableDrafts[location.id];
      if (!draft) {
        return;
      }
      if (!areStringArraysEqual(draft, location.allowedItems)) {
        updates.push({ id: location.id, allowed_item_ids: draft.slice() });
      }
    });
    return updates;
  }, [locations, tableDrafts]);

  async function handleSaveTableChanges() {
    if (tableChanges.length === 0) {
      setIsTableModalOpen(false);
      return;
    }
    setTableSaving(true);
    setLocationError(null);
    try {
      for (const change of tableChanges) {
        const updated = await updateStorageLocation(change.id, change);
        const normalized = mapLocationResponse(updated);
        setLocations((prev) => prev.map((location) => (location.id === change.id ? normalized : location)));
      }
      setLocationSuccessMessage(`บันทึกตารางเรียบร้อย (${tableChanges.length} รายการ)`);
      setIsTableModalOpen(false);
    } catch (error) {
      setLocationError(formatErrorMessage(error));
    } finally {
      setTableSaving(false);
    }
  }

  const handleDownloadTemplate = useCallback(() => {
    if (typeof window === "undefined") return;
    const csv = buildLocationTemplateCsv();
    const fileName = `locations-template-${new Date().toISOString().slice(0, 10)}.csv`;
    triggerCsvDownload(fileName, csv);
  }, []);

  const handleOpenTemplateUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleTemplateUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setLocationError(null);
      setLocationSuccessMessage(null);
      setLocationInfoMessage(null);
      try {
        const text = await file.text();
        const parsed = parseLocationTemplate(text, LOCATION_TEMPLATE_HEADERS);
        if (parsed.warnings.length > 0) {
          setLocationInfoMessage(parsed.warnings.join("\n"));
        }
        const existingByCode = new Map<string, StorageLocation>();
        locations.forEach((location) => {
          existingByCode.set(location.code.toUpperCase(), location);
        });
        const newRecords: BulkImportRecord[] = [];
        const duplicateRecords: DuplicateImportRecord[] = [];
        parsed.records.forEach((record) => {
          const codeKey = record.payload.code.toUpperCase();
          const existing = existingByCode.get(codeKey);
          if (existing) {
            duplicateRecords.push({ ...record, existing });
          } else {
            newRecords.push(record);
          }
        });
        if (duplicateRecords.length > 0) {
          setBulkImportState({
            fileName: file.name,
            totalRows: parsed.records.length,
            newRecords,
            duplicateRecords,
            selectedDuplicateCodes: new Set<string>(),
          });
        } else {
          await runBulkImport(newRecords, [], 0);
        }
      } catch (error) {
        setLocationError(error instanceof Error ? error.message : "ไม่สามารถอ่านไฟล์ได้");
      }
    },
    [locations],
  );

  async function runBulkImport(
    newRecords: BulkImportRecord[],
    duplicatesToUpdate: DuplicateImportRecord[],
    duplicatesTotal: number,
  ) {
    if (newRecords.length === 0 && duplicatesToUpdate.length === 0) {
      if (duplicatesTotal > 0) {
        setLocationSuccessMessage(`ข้าม ${duplicatesTotal} รายการที่มีรหัสซ้ำ`);
      } else {
        setLocationError("ไม่พบข้อมูลใหม่จากไฟล์ที่อัปโหลด");
      }
      return;
    }
    setBulkImportProcessing(true);
    const failures: string[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    try {
      for (const record of newRecords) {
        try {
          const created = await createStorageLocation(record.payload);
          const normalized = mapLocationResponse(created);
          setLocations((prev) => [normalized, ...prev]);
          createdCount += 1;
        } catch (error) {
          failures.push(`แถว ${record.rowNumber}: ${formatErrorMessage(error)}`);
        }
      }
      for (const record of duplicatesToUpdate) {
        try {
          const updated = await updateStorageLocation(record.existing.id, record.payload);
          const normalized = mapLocationResponse(updated);
          setLocations((prev) => prev.map((location) => (location.id === record.existing.id ? normalized : location)));
          updatedCount += 1;
        } catch (error) {
          failures.push(`แถว ${record.rowNumber}: ${formatErrorMessage(error)}`);
        }
      }
    } finally {
      setBulkImportProcessing(false);
    }
    const skippedCount = Math.max(0, duplicatesTotal - duplicatesToUpdate.length);
    const summary: string[] = [];
    if (createdCount) summary.push(`เพิ่มใหม่ ${createdCount}`);
    if (updatedCount) summary.push(`อัปเดต ${updatedCount}`);
    if (skippedCount) summary.push(`ข้าม ${skippedCount}`);
    if (summary.length > 0) {
      setLocationSuccessMessage(`ผลการนำเข้า: ${summary.join(" · ")}`);
    }
    if (failures.length > 0) {
      setLocationError(failures.slice(0, 8).join("\n"));
    }
    setLocationInfoMessage(null);
  }

  function toggleDuplicateSelection(code: string) {
    setBulkImportState((prev) => {
      if (!prev) return prev;
      const normalized = code.toUpperCase();
      const nextSelected = new Set(prev.selectedDuplicateCodes);
      if (nextSelected.has(normalized)) {
        nextSelected.delete(normalized);
      } else {
        nextSelected.add(normalized);
      }
      return { ...prev, selectedDuplicateCodes: nextSelected };
    });
  }

  function handleSelectAllDuplicates(checked: boolean) {
    setBulkImportState((prev) => {
      if (!prev) return prev;
      if (!checked) {
        return { ...prev, selectedDuplicateCodes: new Set<string>() };
      }
      const nextSelected = new Set(
        prev.duplicateRecords.map((record) => record.payload.code.toUpperCase()),
      );
      return { ...prev, selectedDuplicateCodes: nextSelected };
    });
  }

  async function handleConfirmBulkImport() {
    if (!bulkImportState) return;
    const selectedDuplicates = bulkImportState.duplicateRecords.filter((record) =>
      bulkImportState.selectedDuplicateCodes.has(record.payload.code.toUpperCase()),
    );
    await runBulkImport(bulkImportState.newRecords, selectedDuplicates, bulkImportState.duplicateRecords.length);
    setBulkImportState(null);
  }

  function handleCancelBulkImport() {
    if (bulkImportProcessing) {
      return;
    }
    setBulkImportState(null);
    setLocationInfoMessage(null);
  }

  return (
    <>
      <section className="grid gap-8 lg:grid-cols-[420px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold">สร้างตำแหน่งจัดเก็บ</h2>
            <p className="text-xs text-slate-500">
              นิยามโซน/ชั้นวาง เพื่อช่วยให้ทีมคลังสามารถจัดหมวดหมู่และสแกนหาได้รวดเร็ว
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                title="ดาวน์โหลด Template (.csv)"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100"
              >
                <span className="sr-only">ดาวน์โหลด Template (.csv)</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 2a1 1 0 0 1 1 1v7.586l2.293-2.293a1 1 0 0 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4A1 1 0 1 1 6.707 8.293L9 10.586V3a1 1 0 0 1 1-1Z" />
                  <path d="M4 13a1 1 0 0 1 1 1v2h10v-2a1 1 0 1 1 2 0v2.5A1.5 1.5 0 0 1 15.5 18h-11A1.5 1.5 0 0 1 3 16.5V14a1 1 0 0 1 1-1Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleOpenTemplateUpload}
                title="อัปโหลด Location จาก Template"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                <span className="sr-only">อัปโหลด Location จาก Template</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 18a1 1 0 0 1-1-1v-7.586L6.707 11.707a1 1 0 1 1-1.414-1.414l4-4a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1-1.414 1.414L11 9.414V17a1 1 0 0 1-1 1Z" />
                  <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9A1.5 1.5 0 0 1 16 4.5V7a1 1 0 1 1-2 0V4.999L6 5V7a1 1 0 1 1-2 0Z" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => void handleTemplateUpload(event)}
              />
            </div>
          </header>
          {locationError ? (
            <div className="mx-6 mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
              {locationError}
            </div>
          ) : null}
          {locationSuccessMessage ? (
            <div className="mx-6 mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
              {locationSuccessMessage}
            </div>
          ) : null}
          {locationInfoMessage ? (
            <div className="mx-6 mt-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              {locationInfoMessage}
            </div>
          ) : null}
          <form className="grid gap-4 px-6 py-6" onSubmit={(event) => void handleSubmit(event)}>
            <label className="flex flex-col gap-1 text-sm">
              ชื่อ Location
              <input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="เช่น จุดรับสินค้า A1"
                className="rounded-md border border-slate-200 px-3 py-2"
                required
              />
              <span className="text-xs text-slate-500">
                ตั้งชื่อให้ง่ายต่อการสื่อสาร เช่น ชั้น R1-L1 ช่อง B1
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                อาคาร
                <input
                  value={formState.building ?? ""}
                  onChange={(event) => setFormState((prev) => ({ ...prev, building: event.target.value }))}
                  placeholder="เช่น อาคาร A"
                  className="rounded-md border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                โซน
                <input
                  value={formState.zone}
                  onChange={(event) => setFormState((prev) => ({ ...prev, zone: event.target.value }))}
                  placeholder="เช่น A หรือ C"
                  className="rounded-md border border-slate-200 px-3 py-2"
                  required
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                ชั้นวาง
                <input
                  value={formState.rack}
                  onChange={(event) => setFormState((prev) => ({ ...prev, rack: event.target.value }))}
                  placeholder="R1"
                  className="rounded-md border border-slate-200 px-3 py-2"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                ระดับ
                <input
                  value={formState.level}
                  onChange={(event) => setFormState((prev) => ({ ...prev, level: event.target.value }))}
                  placeholder="L1"
                  className="rounded-md border border-slate-200 px-3 py-2"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                ช่อง
                <input
                  value={formState.bin ?? ""}
                  onChange={(event) => setFormState((prev) => ({ ...prev, bin: event.target.value || undefined }))}
                  placeholder="B2"
                  className="rounded-md border border-slate-200 px-3 py-2"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              ความจุรวม (ลบ.ซม.)
              <input
                type="number"
                min={0}
                value={formState.capacity}
                readOnly
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
              />
              <span className="text-xs text-slate-500">
                ระบบคำนวณจาก กว้าง × ลึก × สูง (หน่วยเป็นลบ.ซม.)
              </span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                กว้าง (ซม.)
                <input
                  type="number"
                  min={0}
                  value={formState.width_cm ?? ""}
                  onChange={(event) =>
                    setFormState((prev) => {
                      const widthValue = event.target.value ? Number(event.target.value) : undefined;
                      const capacity = calculateCapacityFromDimensions(
                        widthValue,
                        prev.depth_cm,
                        prev.height_cm,
                      );
                      return {
                        ...prev,
                        width_cm: widthValue,
                        capacity,
                      };
                    })
                  }
                  className="rounded-md border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                ลึก (ซม.)
                <input
                  type="number"
                  min={0}
                  value={formState.depth_cm ?? ""}
                  onChange={(event) =>
                    setFormState((prev) => {
                      const depthValue = event.target.value ? Number(event.target.value) : undefined;
                      const capacity = calculateCapacityFromDimensions(
                        prev.width_cm,
                        depthValue,
                        prev.height_cm,
                      );
                      return {
                        ...prev,
                        depth_cm: depthValue,
                        capacity,
                      };
                    })
                  }
                  className="rounded-md border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                สูง (ซม.)
                <input
                  type="number"
                  min={0}
                  value={formState.height_cm ?? ""}
                  onChange={(event) =>
                    setFormState((prev) => {
                      const heightValue = event.target.value ? Number(event.target.value) : undefined;
                      const capacity = calculateCapacityFromDimensions(
                        prev.width_cm,
                        prev.depth_cm,
                        heightValue,
                      );
                      return {
                        ...prev,
                        height_cm: heightValue,
                        capacity,
                      };
                    })
                  }
                  className="rounded-md border border-slate-200 px-3 py-2"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              หมายเหตุ
              <textarea
                value={formState.note ?? ""}
                onChange={(event) => setFormState((prev) => ({ ...prev, note: event.target.value }))}
                rows={2}
                className="rounded-md border border-slate-200 px-3 py-2"
              />
            </label>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>สินค้าที่สามารถจัดเก็บ (เลือกได้หลายรายการ)</span>
                <span className="text-xs text-slate-400">
                  เลือกได้ {formState.allowed_item_ids?.length ?? 0} รายการ
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  value={formItemQuery}
                  onChange={(event) => setFormItemQuery(event.target.value)}
                  onFocus={() => setIsFormItemDropdownVisible(true)}
                  onBlur={() => setIsFormItemDropdownVisible(false)}
                  placeholder="ค้นหาด้วยชื่อสินค้า หรือ SKU"
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => handleAddAllowedItemByQuery("form")}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                >
                  เพิ่ม
                </button>
              </div>
              {isFormItemDropdownVisible && formItemSuggestions.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  {formItemSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddAllowedItem("form", item.id)}
                      onMouseDown={(event) => event.preventDefault()}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className="text-[10px] uppercase text-slate-400">{item.sku ?? item.id}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(formState.allowed_item_ids ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">
                    ยังไม่ได้เลือกสินค้า ระบบจะใช้ข้อมูลจากผังเพื่อกำหนดสินค้าอัตโนมัติ
                  </p>
                ) : (
                  (formState.allowed_item_ids ?? []).map((itemId) => (
                    <span
                      key={itemId}
                      className="flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800"
                    >
                      {resolveItemLabel(itemId)}
                      <button
                        type="button"
                        onClick={() => handleRemoveAllowedItem("form", itemId)}
                        className="text-sky-600 hover:text-sky-900"
                        aria-label={`ลบ ${resolveItemLabel(itemId)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingLocationId(null);
                  setEditFormState(null);
                  setFormItemQuery("");
                  setFormState({
                    name: "",
                    building: "",
                    zone: "",
                    aisle: "",
                    rack: "",
                    level: "",
                    bin: undefined,
                    capacity: 0,
                    note: "",
                    width_cm: undefined,
                    depth_cm: undefined,
                    height_cm: undefined,
                    allowed_item_ids: [],
                  });
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                ล้างฟอร์ม
              </button>
              <button
                type="submit"
                disabled={locationSaving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {locationSaving ? "กำลังบันทึก..." : "บันทึกตำแหน่ง"}
              </button>
            </div>
          </form>
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">ตำแหน่งที่มีในระบบ</h3>
                <span className="text-xs text-slate-500">
                  {locationsLoading ? "กำลังโหลด..." : `${visibleLocations.length} รายการ`}
                </span>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                <input
                  value={locationSearch}
                  onChange={(event) => setLocationSearch(event.target.value)}
                  placeholder="ค้นหาตามโซน/ช่อง/หมายเหตุ/รหัส Location"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    value={zoneFilter}
                    onChange={(event) => setZoneFilter(event.target.value)}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    {zoneOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "ทั้งหมด" ? "ทุกโซน" : `โซน ${option}`}
                      </option>
                    ))}
                  </select>
                  {(locationSearch || zoneFilter !== "ทั้งหมด") && (
                    <button
                      type="button"
                      onClick={() => {
                        setLocationSearch("");
                        setZoneFilter("ทั้งหมด");
                      }}
                      className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                    >
                      รีเซ็ต
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={handleOpenTableModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
              >
                เปิดมุมมองตาราง
              </button>
            </div>
            {visibleLocations.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                {locations.length === 0
                  ? "ยังไม่มีตำแหน่งที่บันทึกไว้ เริ่มจากการกรอกฟอร์มด้านบนเพื่อสร้างตำแหน่งใหม่"
                  : "ไม่พบตำแหน่งที่ตรงกับเงื่อนไขการค้นหา"}
              </p>
            ) : (
              <div className="mt-3 space-y-5">
                {visibleLocations.map((location) => {
                  const isEditing = editingLocationId === location.id;
                  return (
                    <article
                      key={location.id}
                    className={`rounded-lg border px-4 py-5 text-xs shadow-sm transition ${
                      isEditing ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{location.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {location.building ? `อาคาร ${location.building} · ` : ""}
                            โซน {location.zone} ·{" "}
                            {["ชั้นวาง " + location.rack, `ระดับ ${location.level}`, location.bin ? `ช่อง ${location.bin}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                    </div>
                        <div className="flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleEdit(location)}
                            className="text-slate-500 transition hover:text-slate-700"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemove(location.id)}
                            disabled={locationSaving}
                            className="text-red-500 transition hover:text-red-600 disabled:opacity-60"
                          >
                            ลบ
                          </button>
                        </div>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-slate-600">
                        <div>
                          <dt className="text-[11px] uppercase tracking-wide text-slate-400">ขนาด (กว้าง×ลึก×สูง)</dt>
                          <dd>
                            {(location.width_cm ?? "-")} × {(location.depth_cm ?? "-")} × {(location.height_cm ?? "-")} ซม.
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-2 text-[10px] text-slate-500">
                        {location.allowedItems.length > 0
                          ? `สินค้า: ${formatAllowedItemsPreview(location.allowedItems)}`
                          : "ยังไม่กำหนดสินค้า"}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">ภาพรวมตามโซน</h3>
                <p className="text-xs text-slate-500">
                  ช่วยวางแผนความจุและแยกพื้นที่พิเศษ เช่น โซนควบคุมอุณหภูมิ
                </p>
              </div>
            </header>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(zoneSummary).map(([zone, stats]) => (
              <article
                key={zone}
                className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="text-sm font-semibold">โซน {zone}</div>
                <div className="text-xs text-slate-500">จำนวนช่องจัดเก็บ {stats.total} ช่อง</div>
                <div className="grid grid-cols-[max-content_max-content_auto] items-baseline gap-x-2 text-[10px] font-semibold">
                  <span className="text-slate-500">ปริมาตร</span>
                  <span className="text-slate-400">:</span>
                  <span className="text-emerald-700">
                    {formatMetric(stats.volumeCm3 / 1_000_000, { maximumFractionDigits: 2 })} m
                    <sup>3</sup>
                  </span>
                </div>
                <div className="grid grid-cols-[max-content_max-content_auto] items-baseline gap-x-2 text-[10px] font-semibold">
                  <span className="text-slate-500">พื้นที่</span>
                  <span className="text-slate-400">:</span>
                  <span className="text-sky-600">
                    {formatMetric(stats.areaCm2 / 10_000, { maximumFractionDigits: 2 })} m
                    <sup>2</sup>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-200 px-6 py-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">ผังคลังสินค้า (Interactive Map)</h3>
                    <p className="text-xs text-slate-500">
                      นำเข้าภาพผังคลังสินค้าแล้ววาดโซนจัดเก็บเป็น Polyline เพื่อผูกกับ Location
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {mapList.length === 0 ? (
                      <span className="text-xs text-slate-500">ยังไม่มีผังที่บันทึกไว้</span>
                    ) : (
                      mapList.map((map, index) => {
                        const label = (map.name?.trim() ?? "") || `ผัง #${index + 1}`;
                        const isActive = map.id === activeMapId;
                        return (
                          <button
                            key={map.id}
                            type="button"
                            onClick={() => handleSelectMap(map.id)}
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              isActive
                                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })
                    )}
                    <button
                      type="button"
                      onClick={handleStartNewMap}
                      className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
                    >
                      + สร้างผังใหม่
                    </button>
                    {activeMapId ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (activeMapId) {
                            void handleDuplicateMap(activeMapId);
                          }
                        }}
                        className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs text-amber-800 transition hover:border-amber-400 hover:bg-amber-200"
                      >
                        คัดลอกผังปัจจุบัน
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col items-start gap-2 text-xs md:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    {mapLoading ? <span className="text-slate-500">กำลังโหลดผัง...</span> : null}
                    {hasUnsavedChanges ? <span className="text-amber-600">มีการเปลี่ยนแปลงยังไม่บันทึก</span> : null}
                    {mapSuccessMessage ? <span className="text-emerald-600">{mapSuccessMessage}</span> : null}
                    {mapImageUploading ? <span className="text-slate-500">กำลังอัปโหลดผังคลังสินค้า...</span> : null}
                    {mapError ? <span className="text-red-600">{mapError}</span> : null}
                    {itemsLoading ? <span className="text-slate-500">กำลังโหลดรายการสินค้า...</span> : null}
                    {itemsError ? (
                      <span className="text-red-600">โหลดรายการสินค้าไม่สำเร็จ กำลังใช้ข้อมูลตัวอย่าง</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 md:items-end md:justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSaveMap()}
                      disabled={
                        isSavingMap ||
                        mapLoading ||
                        mapImageUploading ||
                        !mapImage.url ||
                        !mapImage.width ||
                        !mapImage.height ||
                        !mapName.trim()
                      }
                      className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isSavingMap ? "กำลังบันทึก..." : activeMapId ? "บันทึกการแก้ไขผัง" : "บันทึกผังใหม่"}
                    </button>
                    {activeMapId ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteMap()}
                        disabled={mapLoading || isSavingMap}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            d="M5.5 6.5H14.5L13.9 15.1C13.8 16.2 12.9 17 11.8 17H8.2C7.1 17 6.2 16.2 6.1 15.1L5.5 6.5Z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path d="M8.5 9.5V13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M11.5 9.5V13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M4 6.5H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path
                            d="M7.5 6.5V4.5C7.5 4.1 7.8 3.8 8.2 3.8H11.8C12.2 3.8 12.5 4.1 12.5 4.5V6.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        ลบผังนี้
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </header>
            <div className="px-6 py-6">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <label className="flex flex-col gap-1 text-xs md:w-64">
                  ชื่อผังคลังสินค้า
                  <input
                    value={mapName}
                    onChange={(event) => handleMapNameChange(event.target.value)}
                    placeholder="เช่น ผังโซน A ชั้น 1"
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <div className="text-xs text-slate-500">
                  {activeMapId
                    ? `มีพื้นที่ที่กำหนดไว้ทั้งหมด ${mapShapes.length} รายการ`
                    : "บันทึกผังเพื่อสร้างรหัสอ้างอิงและพื้นที่"}
                </div>
              </div>
              <WarehouseMapEditor
                key={activeMapId ?? "new-map"}
                locations={mapLocations}
                items={mapItems}
                shapes={mapShapes}
                onShapesChange={handleShapesChange}
                imageUrl={mapImage.url}
                imageSize={
                  mapImage.width && mapImage.height
                    ? { width: mapImage.width, height: mapImage.height }
                    : null
                }
                onImageChange={(payload) => void handleEditorImageChange(payload)}
                lockedLocationMap={lockedLocationMap}
                onTransferLockedLocation={handleTransferLockedLocation}
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">มุมมองแบบการ์ด</h3>
                <p className="text-xs text-slate-500">
                  กล่องสีแทนโซนและช่องจัดเก็บสำหรับดูความจุรวมแบบรวดเร็ว (ไม่ผูกกับแผนที่)
                </p>
              </div>
            </header>
            <div className="px-6 py-6">
              <WarehouseLayout locations={locations} />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">ตำแหน่งล่าสุด</h3>
                <p className="text-xs text-slate-500">
                  รายการตำแหน่งจัดเก็บที่สร้างล่าสุดจะอยู่ด้านบนสุด
                </p>
              </div>
            </header>
            <div className="divide-y divide-slate-200">
              {locations.length === 0 ? (
                <p className="px-6 py-8 text-sm text-slate-500">ยังไม่มีตำแหน่งที่สร้างไว้</p>
              ) : (
                locations.map((location) => {
                  return (
                    <article
                      key={location.id}
                      className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{location.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {location.building ? `อาคาร ${location.building} · ` : ""}
                          โซน {location.zone} ·{" "}
                          {["ชั้น " + location.rack, `ระดับ ${location.level}`, location.bin ? `ช่อง ${location.bin}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        {location.width_cm || location.depth_cm || location.height_cm ? (
                          <div className="text-[10px] text-slate-500">
                            ขนาด {location.width_cm ?? "-"}×{location.depth_cm ?? "-"}×{location.height_cm ?? "-"} ซม.
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemove(location.id)}
                        disabled={locationSaving}
                        className="self-start rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 md:self-auto"
                      >
                        ลบตำแหน่ง
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </section>

      {isTableModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-5xl rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">มุมมองตารางตำแหน่งจัดเก็บ</h3>
                <p className="text-xs text-slate-500">
                  ดูรายละเอียดทั้งหมดในรูปแบบตาราง ปรับแก้หรือลบได้จากที่นี่
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="text-slate-400 transition hover:text-slate-600"
                aria-label="ปิดมุมมองตาราง"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={
                            tableSelection.size > 0 &&
                            visibleLocations.every((location) => tableSelection.has(location.id))
                          }
                          onChange={(event) => handleSelectAllInView(event.target.checked)}
                        />
                      </th>
                      <th className="px-4 py-2 text-left">Location</th>
                      <th className="px-4 py-2 text-left">โซน/ตำแหน่ง</th>
                      <th className="px-4 py-2 text-left">ความจุ</th>
                      <th className="px-4 py-2 text-left">สินค้า (Allowed)</th>
                      <th className="px-4 py-2 text-right">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleLocations.map((location) => (
                      <tr key={location.id} className="bg-white">
                        <td className="px-2 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={tableSelection.has(location.id)}
                            onChange={() => toggleTableSelection(location.id)}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-slate-900">{location.name}</div>
                          <div className="text-xs text-slate-500">{location.code}</div>
                        </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        {[
                          location.building ? `อาคาร ${location.building}` : null,
                          `โซน ${location.zone}`,
                          location.rack ? `ชั้น ${location.rack}` : null,
                          location.level ? `ระดับ ${location.level}` : null,
                          location.bin ? `ช่อง ${location.bin}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        {formatMetric(location.capacity)} ชิ้น
                        <div className="text-[10px] text-slate-400">
                          {(location.width_cm ?? "-")}×{(location.depth_cm ?? "-")}×{(location.height_cm ?? "-")} ซม.
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2">
                            <input
                              value={tableQueries[location.id] ?? ""}
                              onChange={(event) => handleTableQueryChange(location.id, event.target.value)}
                              placeholder="ค้นหาชื่อหรือ SKU"
                              className="flex-1 rounded-md border border-slate-200 px-2 py-1"
                            />
                            <button
                              type="button"
                              onClick={() => handleTableAddItemByQuery(location.id)}
                              className="rounded-md border border-slate-200 px-3 py-1 text-slate-600 hover:bg-slate-100"
                            >
                              เพิ่ม
                            </button>
                          </div>
                          {tableQueries[location.id] && getItemSuggestions(tableQueries[location.id]).length > 0 ? (
                            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                              {getItemSuggestions(tableQueries[location.id]).map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleTableAddItem(location.id, item.id)}
                                  className="flex w-full items-center justify-between px-2 py-1 text-left text-[11px] text-slate-600 hover:bg-slate-50"
                                >
                                  <span className="font-semibold text-slate-900">{item.name}</span>
                                  <span className="uppercase text-slate-400">{item.sku ?? item.id}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-1">
                            {(tableDrafts[location.id] ?? []).length === 0 ? (
                              <span className="text-slate-400">ยังไม่กำหนด</span>
                            ) : (
                              (tableDrafts[location.id] ?? []).map((itemId) => (
                                <span
                                  key={itemId}
                                  className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700"
                                >
                                  {resolveItemLabel(itemId)}
                                  <button
                                    type="button"
                                    onClick={() => handleTableRemoveItem(location.id, itemId)}
                                    className="text-slate-500 hover:text-slate-800"
                                    aria-label={`ลบ ${resolveItemLabel(itemId)}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      </td>
                        <td className="px-4 py-3 align-top text-right text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => handleInlineDelete(location.id)}
                            disabled={locationSaving}
                            className="text-red-500 hover:text-red-600 disabled:opacity-60"
                          >
                            ลบ
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              {tableSelection.size > 0 ? (
                <button
                  type="button"
                  onClick={handleBulkDeleteSelection}
                  disabled={tableSaving}
                  className="mr-auto rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  ลบ {tableSelection.size} รายการ
                </button>
              ) : (
                <span className="mr-auto text-xs text-slate-400">เลือกหลายรายการเพื่อจัดการพร้อมกัน</span>
              )}
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTableChanges()}
                disabled={tableSaving || tableChanges.length === 0}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                {tableSaving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkImportState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">ยืนยันการทับข้อมูลที่ซ้ำ</h3>
                <p className="text-xs text-slate-500">
                  ไฟล์ {bulkImportState.fileName} มีข้อมูลทั้งหมด {bulkImportState.totalRows} แถว ·
                  พร้อมสร้างใหม่ {bulkImportState.newRecords.length} รายการ · พบซ้ำ{" "}
                  {bulkImportState.duplicateRecords.length} รายการ
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancelBulkImport}
                className="text-slate-400 transition hover:text-slate-600"
                disabled={bulkImportProcessing}
              >
                ✕
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={
                    bulkImportState.duplicateRecords.length > 0 &&
                    bulkImportState.selectedDuplicateCodes.size ===
                      bulkImportState.duplicateRecords.length
                  }
                  onChange={(event) => handleSelectAllDuplicates(event.target.checked)}
                  disabled={bulkImportProcessing || bulkImportState.duplicateRecords.length === 0}
                />
                เลือกทั้งหมด
              </label>
              <span>
                หากไม่เลือก ระบบจะข้าม {bulkImportState.duplicateRecords.length -
                  bulkImportState.selectedDuplicateCodes.size} รายการที่ซ้ำ
              </span>
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              {bulkImportState.duplicateRecords.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">ไม่มีรหัสซ้ำ สามารถกดตกลงเพื่อบันทึกข้อมูลใหม่</p>
              ) : (
                <ul className="divide-y divide-slate-200">
                  {bulkImportState.duplicateRecords.map((record) => {
                    const code = record.payload.code.toUpperCase();
                    const checked = bulkImportState.selectedDuplicateCodes.has(code);
                    return (
                      <li key={`${code}-${record.existing.id}`} className="flex items-start gap-3 px-4 py-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => toggleDuplicateSelection(code)}
                          disabled={bulkImportProcessing}
                        />
                        <div className="flex flex-1 flex-col gap-1 text-xs text-slate-600">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900">รหัส {code}</span>
                            <span className="text-slate-500">แถวที่ {record.rowNumber}</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-md bg-emerald-50 p-3">
                              <div className="text-[11px] font-semibold uppercase text-emerald-700">ข้อมูลใหม่</div>
                              <div className="text-sm font-semibold text-emerald-900">{record.payload.name}</div>
                              <div>{formatLocationDescriptor(record.payload)}</div>
                            </div>
                            <div className="rounded-md bg-slate-50 p-3">
                              <div className="text-[11px] font-semibold uppercase text-slate-500">ข้อมูลเดิม</div>
                              <div className="text-sm font-semibold text-slate-900">{record.existing.name}</div>
                              <div>{formatLocationDescriptor(record.existing)}</div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>
                รายการใหม่ทั้งหมดจะถูกสร้างทันทีเมื่อกด{" "}
                <strong className="text-slate-700">ตกลง</strong>
              </span>
              {bulkImportProcessing ? <span>กำลังนำเข้าข้อมูล...</span> : null}
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelBulkImport}
                disabled={bulkImportProcessing}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmBulkImport()}
                disabled={bulkImportProcessing}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {bulkImportProcessing ? "กำลังบันทึก..." : "ตกลง"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingLocationId && editFormState ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900">แก้ไขตำแหน่งจัดเก็บ</h3>
            <p className="mb-4 text-xs text-slate-500">ปรับรายละเอียดตำแหน่งและบันทึกเพื่ออัปเดตข้อมูล</p>
            <form className="grid gap-4" onSubmit={(event) => void handleUpdateLocation(event)}>
              <label className="flex flex-col gap-1 text-sm">
                ชื่อ Location
                <input
                  value={editFormState.name}
                  onChange={(event) => updateEditForm("name", event.target.value)}
                  className="rounded-md border border-slate-200 px-3 py-2"
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  อาคาร
                  <input
                    value={editFormState.building ?? ""}
                    onChange={(event) => updateEditForm("building", event.target.value)}
                    className="rounded-md border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  โซน
                  <input
                    value={editFormState.zone}
                    onChange={(event) => updateEditForm("zone", event.target.value)}
                    className="rounded-md border border-slate-200 px-3 py-2"
                    required
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  ชั้นวาง
                  <input
                    value={editFormState.rack}
                    onChange={(event) => updateEditForm("rack", event.target.value)}
                    className="rounded-md border border-slate-200 px-3 py-2"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  ระดับ
                  <input
                    value={editFormState.level}
                    onChange={(event) => updateEditForm("level", event.target.value)}
                    className="rounded-md border border-slate-200 px-3 py-2"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  ช่อง
                  <input
                    value={editFormState.bin ?? ""}
                    onChange={(event) => updateEditForm("bin", event.target.value || undefined)}
                    className="rounded-md border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                ความจุรวม (ลบ.ซม.)
                <input
                  type="number"
                  value={editFormState.capacity}
                  readOnly
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  กว้าง (ซม.)
                  <input
                    type="number"
                    min={0}
                    value={editFormState.width_cm ?? ""}
                    onChange={(event) => {
                      const value = event.target.value ? Number(event.target.value) : undefined;
                      updateEditForm("width_cm", value);
                    }}
                    className="rounded-md border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  ลึก (ซม.)
                  <input
                    type="number"
                    min={0}
                    value={editFormState.depth_cm ?? ""}
                    onChange={(event) => {
                      const value = event.target.value ? Number(event.target.value) : undefined;
                      updateEditForm("depth_cm", value);
                    }}
                    className="rounded-md border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  สูง (ซม.)
                  <input
                    type="number"
                    min={0}
                    value={editFormState.height_cm ?? ""}
                    onChange={(event) => {
                      const value = event.target.value ? Number(event.target.value) : undefined;
                      updateEditForm("height_cm", value);
                    }}
                    className="rounded-md border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                หมายเหตุ
                <textarea
                  value={editFormState.note ?? ""}
                  onChange={(event) => updateEditForm("note", event.target.value)}
                  rows={2}
                  className="rounded-md border border-slate-200 px-3 py-2"
                />
              </label>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>สินค้าที่สามารถจัดเก็บ</span>
                  <span className="text-xs text-slate-400">
                    เลือกแล้ว {editFormState.allowed_item_ids?.length ?? 0} รายการ
                  </span>
                </div>
                <div className="flex gap-2">
                <input
                  value={editItemQuery}
                  onChange={(event) => setEditItemQuery(event.target.value)}
                  onFocus={() => setIsEditItemDropdownVisible(true)}
                  onBlur={() => setIsEditItemDropdownVisible(false)}
                  placeholder="ค้นหาด้วยชื่อสินค้า หรือ SKU"
                  className="flex-1 rounded-md border border-slate-200 px-3 py-2"
                />
                <button
                  type="button"
                    onClick={() => handleAddAllowedItemByQuery("edit")}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    เพิ่ม
                  </button>
                </div>
                {isEditItemDropdownVisible && editItemSuggestions.length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    {editItemSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddAllowedItem("edit", item.id)}
                        onMouseDown={(event) => event.preventDefault()}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                      >
                        <span className="font-semibold text-slate-900">{item.name}</span>
                        <span className="text-[10px] uppercase text-slate-400">{item.sku ?? item.id}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {(editFormState.allowed_item_ids ?? []).length === 0 ? (
                    <p className="text-xs text-slate-500">ยังไม่ได้เลือกสินค้า</p>
                  ) : (
                    (editFormState.allowed_item_ids ?? []).map((itemId) => (
                      <span
                        key={itemId}
                        className="flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800"
                      >
                        {resolveItemLabel(itemId)}
                        <button
                          type="button"
                          onClick={() => handleRemoveAllowedItem("edit", itemId)}
                          className="text-sky-600 hover:text-sky-900"
                          aria-label={`ลบ ${resolveItemLabel(itemId)}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={locationSaving}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {locationSaving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );

}

function mapAreaToShape(
  area: WarehouseMapAreaPayload,
  locationLookup?: Map<string, StorageLocation>,
): LocationShape {
  const location = area.location_id ? locationLookup?.get(area.location_id) : undefined;
  const allowedItemsFromLocation =
    location && location.allowedItems.length > 0 ? location.allowedItems.slice() : undefined;
  return {
    id: area.id ?? randomId(),
    label: area.label ?? undefined,
    locationId: area.location_id ?? undefined,
    zone: area.zone ?? undefined,
    allowedItems:
      allowedItemsFromLocation ??
      (Array.isArray(area.allowed_item_ids) ? area.allowed_item_ids.slice() : []),
    points: Array.isArray(area.points)
      ? area.points.map((value) => {
          const numeric = Number(value);
          return Math.min(1, Math.max(0, Number.isFinite(numeric) ? numeric : 0));
        })
      : [],
  };
}

function shapeToMapAreaPayload(shape: LocationShape): WarehouseMapAreaPayload {
  return {
    id: shape.id,
    label: shape.label ?? null,
    location_id: shape.locationId ?? null,
    zone: shape.zone ?? null,
    allowed_item_ids: (shape.allowedItems ?? []).slice(),
    points: shape.points.map((value) => {
      const clamped = Math.min(1, Math.max(0, value));
      return Number(clamped.toFixed(6));
    }),
  };
}

function formatErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: unknown; status?: number } }).response;
    if (response?.data && typeof response.data === "object" && "detail" in response.data) {
      const detail = (response.data as { detail?: unknown }).detail;
      if (typeof detail === "string") {
        return detail;
      }
    }
    if (response?.status) {
      return `คำขอล้มเหลว (สถานะ ${response.status})`;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "เกิดข้อผิดพลาดไม่ทราบสาเหตุ";
}

function WarehouseLayout({ locations }: { locations: StorageLocation[] }) {
  const layout = useMemo(() => {
    const grouped = locations.reduce<Record<string, StorageLocation[]>>((acc, location) => {
      const zone = location.zone || "ไม่ระบุ";
      if (!acc[zone]) {
        acc[zone] = [];
      }
      acc[zone].push(location);
      return acc;
    }, {});

    const sortedEntries: Array<[string, StorageLocation[]]> = Object.entries(grouped).map(([zone, items]) => [
      zone,
      [...items].sort((a, b) => {
        const ai = `${a.building ?? ""}-${a.zone}-${a.rack}-${a.level}-${a.bin ?? ""}`;
        const bi = `${b.building ?? ""}-${b.zone}-${b.rack}-${b.level}-${b.bin ?? ""}`;
        return ai.localeCompare(bi, "th");
      }),
    ]);

    sortedEntries.sort((a, b) => a[0].localeCompare(b[0], "th"));

    return {
      entries: sortedEntries,
    };
  }, [locations]);

  if (!locations.length) {
    return <p className="text-sm text-slate-500">ยังไม่มีตำแหน่งสำหรับสร้างผังภาพรวม</p>;
  }

  return (
    <div className="grid gap-6">
      {layout.entries.map(([zone, zoneLocations], index) => {
        const zoneStyle = ZONE_STYLES[index % ZONE_STYLES.length];
        return (
          <div key={zone} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">โซน {zone}</h4>
              <span className="text-xs text-slate-500">ทั้งหมด {zoneLocations.length} ช่อง</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {zoneLocations.map((location) => {
                const volumeCapacity = getLocationVolumeCm3(location);
                const usedVolume = typeof location.used_volume_cm3 === "number" ? location.used_volume_cm3 : 0;
                const capacityRatio =
                  volumeCapacity > 0 ? Math.min(100, Math.round((usedVolume / volumeCapacity) * 100)) : 0;
                const fillWidth = volumeCapacity > 0 ? Math.max(4, capacityRatio) : 4;
                const detailParts: string[] = [];
                if (location.building?.trim()) {
                  detailParts.push(`อาคาร ${location.building.trim()}`);
                }
                if (location.zone?.trim()) {
                  detailParts.push(`โซน ${location.zone.trim()}`);
                }
                if (location.rack?.trim()) {
                  detailParts.push(`ชั้นวาง ${location.rack.trim()}`);
                }
                if (location.level?.trim()) {
                  detailParts.push(`ระดับ ${location.level.trim()}`);
                }
                if (location.bin?.trim()) {
                  detailParts.push(`ช่อง ${location.bin.trim()}`);
                }
                const detailLine = detailParts.join(" · ");
                return (
                  <div
                    key={location.id}
                    className={`relative flex h-full flex-col rounded-lg border px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${zoneStyle}`}
                  >
                    <div className="flex-1 space-y-2">
                      <div className="text-sm font-semibold text-slate-900">{location.name}</div>
                      {location.code ? (
                        <div className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
                          {location.code}
                        </div>
                      ) : null}
                      {detailLine ? <div className="text-[10px] text-slate-700">{detailLine}</div> : null}
                      {location.note ? (
                        <div className="text-[11px] text-slate-700">{location.note}</div>
                      ) : null}
                    </div>
                    <div className="mt-3">
                      <div className="h-2 w-full rounded-full bg-white/40">
                        <div
                          style={{ width: `${fillWidth}%` }}
                          className="h-2 rounded-full bg-white/90"
                          aria-hidden
                        />
                      </div>
                      <p className="mt-1 mb-[2px] text-[10px] uppercase tracking-wide text-slate-600">
                        ความจุสัมพัทธ์ {capacityRatio}%
                        {volumeCapacity > 0
                          ? ` · ${formatMetric(usedVolume)} / ${formatMetric(volumeCapacity)} ลบ.ซม.`
                          : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildLocationTemplateCsv(): string {
  const sampleRow: Record<TemplateHeader, string> = {
    name: "จุดรับสินค้า A1",
    building: "อาคารหลัก",
    zone: "A",
    aisle: "01",
    rack: "R1",
    level: "L1",
    bin: "B1",
    width_cm: "100",
    depth_cm: "80",
    height_cm: "60",
    capacity: "",
    note: "หมายเหตุเพิ่มเติม",
  };
  const rows = [Array.from(LOCATION_TEMPLATE_HEADERS), LOCATION_TEMPLATE_HEADERS.map((header) => sampleRow[header] ?? "")];
  return rows
    .map((row) => row.map((value) => escapeCsvValue(value ?? "")).join(","))
    .join("\r\n");
}

function triggerCsvDownload(fileName: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string): string {
  if (value.includes('"')) {
    value = value.replace(/"/g, '""');
  }
  if (value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value}"`;
  }
  return value;
}

function parseLocationTemplate(
  content: string,
  expectedHeaders: readonly TemplateHeader[],
): { records: BulkImportRecord[]; warnings: string[] } {
  const { headers, rows } = parseCsvContent(content);
  if (headers.length === 0) {
    throw new Error("ไฟล์ไม่มีส่วนหัว (header)");
  }
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  const missing = expectedHeaders.filter((header) => !normalizedHeaders.includes(header.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`Template ขาดคอลัมน์: ${missing.join(", ")}`);
  }
  const headerIndexMap = normalizedHeaders.reduce<Record<string, number>>((acc, header, index) => {
    acc[header] = index;
    return acc;
  }, {});
  const recordMap = new Map<string, BulkImportRecord>();
  const errors: string[] = [];
  const warnings: string[] = [];
  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const normalizedRow: Record<string, string> = {};
    expectedHeaders.forEach((header) => {
      const idx = headerIndexMap[header];
      normalizedRow[header] = idx !== undefined ? (row[idx] ?? "").trim() : "";
    });
    const hasValue = Object.values(normalizedRow).some((value) => value.trim().length > 0);
    if (!hasValue) {
      return;
    }
    try {
      const payload = buildPayloadFromTemplateRow(normalizedRow);
      const codeKey = payload.code.toUpperCase();
      const record: BulkImportRecord = { payload: { ...payload, code: codeKey }, rowNumber };
      if (recordMap.has(codeKey)) {
        const previous = recordMap.get(codeKey);
        warnings.push(
          `รหัส ${codeKey} ปรากฏหลายครั้งในไฟล์ (ล่าสุดใช้แถว ${rowNumber} แทนแถว ${previous?.rowNumber ?? "เดิม"})`,
        );
      }
      recordMap.set(codeKey, record);
    } catch (error) {
      errors.push(`แถว ${rowNumber}: ${error instanceof Error ? error.message : "ข้อมูลไม่ถูกต้อง"}`);
    }
  });
  if (errors.length > 0) {
    throw new Error(errors.slice(0, 10).join("\n"));
  }
  const records = Array.from(recordMap.values());
  if (records.length === 0) {
    throw new Error("ไม่พบข้อมูลที่สามารถนำเข้าได้");
  }
  return { records, warnings };
}

function parseCsvContent(content: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  const text = content.replace(/^\ufeff/, "");
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else {
      currentField += char;
    }
  }
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  const filtered = rows.filter((row) => row.some((value) => value.trim().length > 0));
  if (filtered.length === 0) {
    return { headers: [], rows: [] };
  }
  const [headerRow, ...dataRows] = filtered;
  return {
    headers: headerRow.map((value) => value.trim()),
    rows: dataRows,
  };
}

function buildPayloadFromTemplateRow(row: Record<string, string>): StorageLocationCreatePayload {
  const name = row.name?.trim();
  if (!name) {
    throw new Error("ต้องระบุคอลัมน์ name");
  }
  const zone = (row.zone ?? "").trim().toUpperCase();
  if (!zone) {
    throw new Error("ต้องระบุคอลัมน์ zone");
  }
  const rack = (row.rack ?? "").trim().toUpperCase();
  if (!rack) {
    throw new Error("ต้องระบุคอลัมน์ rack");
  }
  const level = (row.level ?? "").trim().toUpperCase();
  if (!level) {
    throw new Error("ต้องระบุคอลัมน์ level");
  }
  const bin = row.bin?.trim() ? row.bin.trim().toUpperCase() : undefined;
  const building = row.building?.trim() || undefined;
  const aisle = row.aisle?.trim() || undefined;
  const width = parseNumberField(row.width_cm, "width_cm");
  const depth = parseNumberField(row.depth_cm, "depth_cm");
  const height = parseNumberField(row.height_cm, "height_cm");
  let capacity = calculateCapacityFromDimensions(width, depth, height);
  if (!capacity) {
    capacity = parseNumberField(row.capacity, "capacity") ?? 0;
  }
  capacity = Math.max(0, Math.round(capacity));
  const generatedCode =
    generateLocationCode({
      zone,
      rack,
      level,
      bin,
      name,
    }) ||
    normalizeCodeValue(name) ||
    "LOC";
  const code = generatedCode.toUpperCase();
  return {
    name,
    building,
    zone,
    aisle,
    rack,
    level,
    bin,
    code,
    capacity,
    note: row.note?.trim() || undefined,
    width_cm: width,
    depth_cm: depth,
    height_cm: height,
    allowed_item_ids: [],
  };
}

function parseNumberField(value: string | undefined, field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`คอลัมน์ ${field} ต้องเป็นตัวเลข`);
  }
  return parsed;
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const normalizedLeft = left.map((value) => value.trim()).sort();
  const normalizedRight = right.map((value) => value.trim()).sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
