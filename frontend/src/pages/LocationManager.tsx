import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LocationShape, WarehouseItem } from "../components/WarehouseMapEditor";
import { WarehouseMapEditor } from "../components/WarehouseMapEditor";
import {
  createWarehouseMap,
  deleteWarehouseMap,
  fetchItems,
  fetchWarehouseMaps,
  updateWarehouseMap,
  uploadAttachment,
} from "../services/api";
import type {
  WarehouseMapAreaPayload,
  WarehouseMapResponse,
  WarehouseMapCreatePayload,
  WarehouseMapUpdatePayload,
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
}

type LocationFormState = Omit<StorageLocation, "id" | "code">;

const ZONE_STYLES = [
  "border-emerald-300 bg-emerald-100 text-emerald-900",
  "border-sky-300 bg-sky-100 text-sky-900",
  "border-amber-300 bg-amber-100 text-amber-900",
  "border-rose-300 bg-rose-100 text-rose-900",
  "border-indigo-300 bg-indigo-100 text-indigo-900",
] as const;

const LOCATIONS_STORAGE_KEY = "location-manager.locations";

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

type LocationCodeSource = Partial<Pick<StorageLocation, "zone" | "rack" | "level" | "bin" | "name">>;

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
}));

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
  const [locations, setLocations] = useState<StorageLocation[]>(demoLocations);
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
    setMapShapes(map.areas.map(mapAreaToShape));
    setHasUnsavedChanges(false);
    setMapError(null);
    setMapSuccessMessage(null);
    setMapImageUploading(false);
  }, []);

  useEffect(() => {
    if (locationsHydrated) {
      return;
    }
    if (typeof window === "undefined") {
      setLocationsHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(LOCATIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sanitized = parsed
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
              const rack = typeof item.rack === "string" ? item.rack.trim().toUpperCase() : "";
              const level = typeof item.level === "string" ? item.level.trim().toUpperCase() : "";
              const binValue = typeof item.bin === "string" ? item.bin.trim().toUpperCase() : undefined;
              const codeCandidate =
                typeof item.code === "string" && item.code.trim()
                  ? item.code.trim()
                  : generateLocationCode({
                      zone: item.zone,
                      rack,
                      level,
                      bin: binValue,
                      name: item.name,
                    }) || normalizeCodeValue(item.name) || "LOC";
              return {
                ...item,
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
              } satisfies StorageLocation;
            });
          if (sanitized.length > 0) {
            setLocations(sanitized);
          }
        }
      }
    } catch {
      // swallow malformed storage and continue with defaults
    } finally {
      setLocationsHydrated(true);
    }
  }, [locationsHydrated]);

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
    loadMaps();
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
    loadItems();
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
  }, [activeMapId, hydrateMap, mapImage, mapImageUploading, mapName, mapShapes]);

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
      locationId,
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
    [mapList, setMapError, setMapList, setMapSuccessMessage],
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

  function buildLocationPayload(form: LocationFormState): Omit<StorageLocation, "id"> {
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
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildLocationPayload(formState);

    setLocations((prev) => [
      {
        id: randomId(),
        ...payload,
      },
      ...prev,
    ]);

    setEditingLocationId(null);
    setEditFormState(null);
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
    });
  }

  function handleRemove(id: string) {
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
      });
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
    });
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
  }

  function handleUpdateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLocationId || !editFormState) return;
    const payload = buildLocationPayload(editFormState);
    setLocations((prev) =>
      prev.map((location) =>
        location.id === editingLocationId
          ? {
              ...location,
              ...payload,
            }
          : location,
      ),
    );
    setMapSuccessMessage("อัปเดตตำแหน่งเรียบร้อย");
    closeEditModal();
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
          </header>
          <form className="grid gap-4 px-6 py-6" onSubmit={handleSubmit}>
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
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingLocationId(null);
                  setEditFormState(null);
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
                  });
                }}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                ล้างฟอร์ม
              </button>
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                บันทึกตำแหน่ง
              </button>
            </div>
          </form>
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">ตำแหน่งที่มีในระบบ</h3>
                <span className="text-xs text-slate-500">{visibleLocations.length} รายการ</span>
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
                            onClick={() => handleRemove(location.id)}
                            className="text-red-500 transition hover:text-red-600"
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
                        onClick={() => handleDuplicateMap(activeMapId)}
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
                      onClick={handleSaveMap}
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
                        onClick={handleDeleteMap}
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
                onImageChange={handleEditorImageChange}
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
                        onClick={() => handleRemove(location.id)}
                        className="self-start rounded-md border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 md:self-auto"
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
            <form className="grid gap-4" onSubmit={handleUpdateLocation}>
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
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );

}

function mapAreaToShape(area: WarehouseMapAreaPayload): LocationShape {
  return {
    id: area.id ?? randomId(),
    label: area.label ?? undefined,
    locationId: area.location_id ?? undefined,
    zone: area.zone ?? undefined,
    allowedItems: Array.isArray(area.allowed_item_ids) ? area.allowed_item_ids.slice() : [],
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

    const sortedEntries = Object.entries(grouped).map(([zone, items]) => [
      zone,
      [...items].sort((a, b) => {
        const ai = `${a.building ?? ""}-${a.zone}-${a.rack}-${a.level}-${a.bin ?? ""}`;
        const bi = `${b.building ?? ""}-${b.zone}-${b.rack}-${b.level}-${b.bin ?? ""}`;
        return ai.localeCompare(bi, "th");
      }),
    ]) as Array<[string, StorageLocation[]]>;

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
                const capacityRatio = 0;
                const fillWidth = Math.max(4, capacityRatio);
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
