import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";

export interface LocationShape {
  id: string;
  points: number[]; // normalized 0..1 pairs
  label?: string;
  locationId?: string;
  zone?: string;
  allowedItems?: string[]; // Array of item IDs that can be stored in this location
}

export interface WarehouseMapLocation {
  id: string;
  label: string;
  zone?: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  description?: string;
}

interface LockedLocationInfo {
  mapId: string;
  mapName: string;
  areaId: string;
  allowedItems: string[];
}

interface TransferLockedLocationArgs {
  locationId: string;
  sourceMapId: string;
  areaId: string;
  clearItems: boolean;
  allowedItems: string[];
}

interface WarehouseMapEditorProps {
  locations: WarehouseMapLocation[];
  items: WarehouseItem[]; // Add items prop
  shapes: LocationShape[];
  onShapesChange: (shapes: LocationShape[]) => void;
  imageUrl: string | null;
  imageSize: { width: number; height: number } | null;
  onImageChange: (payload: { file: File; previewUrl: string; width: number; height: number }) => void;
  lockedLocationMap?: Map<string, LockedLocationInfo>;
  onTransferLockedLocation?: (args: TransferLockedLocationArgs) => Promise<{ allowedItems?: string[] } | void>;
}

interface HistoryState {
  past: LocationShape[][];
  future: LocationShape[][];
  syncing: boolean;
  dragSnapshot: LocationShape[] | null;
  dragMoved: boolean;
}

const CANVAS_MAX_HEIGHT = 520;
const SNAP_DISTANCE = 16;
const MAX_HISTORY_LENGTH = 20;

export function WarehouseMapEditor({
  locations,
  items,
  shapes,
  onShapesChange,
  imageUrl,
  imageSize,
  onImageChange,
  lockedLocationMap = new Map<string, LockedLocationInfo>(),
  onTransferLockedLocation,
}: WarehouseMapEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(960);
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);
  type ToolMode = "select" | "polyline" | "rectangle";
  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const isDrawing = toolMode !== "select";
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [previewPoint, setPreviewPoint] = useState<
    { normalizedX: number; normalizedY: number; displayX: number; displayY: number } | null
  >(null);
  const [hoveringStart, setHoveringStart] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; text: string }>({
    visible: false,
    x: 0,
    y: 0,
    text: "",
  });
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [rectangleStart, setRectangleStart] = useState<{ normalizedX: number; normalizedY: number } | null>(null);
  const [rectanglePreview, setRectanglePreview] = useState<{ normalizedX: number; normalizedY: number } | null>(null);
  const [dragState, setDragState] = useState<{
    shapeId: string;
    startPoints: number[];
    origin: { normalizedX: number; normalizedY: number };
  } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ normalizedX: number; normalizedY: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const locationDropdownHideTimeoutRef = useRef<number | null>(null);
  const itemDropdownHideTimeoutRef = useRef<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    type: "unbind" | "clearData" | "lockedTransfer";
    targetLocationId: string;
    targetLocationLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const clipboardRef = useRef<LocationShape | null>(null);
  const historyRef = useRef<HistoryState>({
    past: [],
    future: [],
    syncing: false,
    dragSnapshot: null,
    dragMoved: false,
  });
  const lastSnapshotRef = useRef<string>("");

const snapshotShapes = useCallback((items: LocationShape[]) => items.map(cloneShape), []);

  const pushPastSnapshot = useCallback(
    (source: LocationShape[]) => {
      const history = historyRef.current;
      const entry = snapshotShapes(source);
      if (history.past.length >= MAX_HISTORY_LENGTH) {
        history.past.shift();
      }
      history.past.push(entry);
    },
    [snapshotShapes],
  );

  const pushFutureSnapshot = useCallback(
    (source: LocationShape[]) => {
      const history = historyRef.current;
      const entry = snapshotShapes(source);
      if (history.future.length >= MAX_HISTORY_LENGTH) {
        history.future.shift();
      }
      history.future.push(entry);
    },
    [snapshotShapes],
  );

  const applyShapes = useCallback(
    (
      nextShapes: LocationShape[],
      options: { commitHistory?: boolean; preserveDrag?: boolean } = {},
    ) => {
      const { commitHistory = true, preserveDrag = false } = options;
      if (commitHistory) {
        historyRef.current.past.push(snapshotShapes(shapes));
        historyRef.current.future = [];
      }
      historyRef.current.syncing = true;
      if (!preserveDrag) {
        historyRef.current.dragSnapshot = null;
        historyRef.current.dragMoved = false;
      }
      onShapesChange(nextShapes);
    },
    [onShapesChange, shapes, snapshotShapes],
  );

  useEffect(() => {
    setPreviewImageUrl(imageUrl ?? null);
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      if (locationDropdownHideTimeoutRef.current !== null) {
        window.clearTimeout(locationDropdownHideTimeoutRef.current);
        locationDropdownHideTimeoutRef.current = null;
      }
      if (itemDropdownHideTimeoutRef.current !== null) {
        window.clearTimeout(itemDropdownHideTimeoutRef.current);
        itemDropdownHideTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function handleResize() {
      if (!containerRef.current) return;
      setContainerWidth(containerRef.current.clientWidth);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const signature = shapesSignature(shapes);
    if (historyRef.current.syncing) {
      lastSnapshotRef.current = signature;
      historyRef.current.syncing = false;
      return;
    }
    if (!lastSnapshotRef.current) {
      lastSnapshotRef.current = signature;
      return;
    }
    if (signature !== lastSnapshotRef.current) {
      historyRef.current.past = [];
      historyRef.current.future = [];
      historyRef.current.dragSnapshot = null;
      historyRef.current.dragMoved = false;
      lastSnapshotRef.current = signature;
    }
  }, [shapes]);

  const display = useMemo(() => {
    if (!imageSize) {
      return { width: containerWidth, height: CANVAS_MAX_HEIGHT, scale: 1 };
    }
    const widthScale = containerWidth / imageSize.width;
    const heightScale = CANVAS_MAX_HEIGHT / imageSize.height;
    const scale = Math.min(widthScale, heightScale);
    return {
      width: Math.max(imageSize.width * scale, 200),
      height: Math.max(imageSize.height * scale, 200),
      scale,
    };
  }, [containerWidth, imageSize]);

  const viewBoxWidth = imageSize?.width ?? 1;
  const viewBoxHeight = imageSize?.height ?? 1;

  useEffect(() => {
    if (!activeShapeId) return;
    const exists = shapes.some((shape) => shape.id === activeShapeId);
    if (!exists) {
      setActiveShapeId(null);
    }
  }, [activeShapeId, shapes]);

  const resetDrawingState = useCallback(() => {
    setCurrentPoints([]);
    setPreviewPoint(null);
    setHoveringStart(false);
    setRectangleStart(null);
    setRectanglePreview(null);
    setErrorMessage(null);
    setTooltip({ visible: false, x: 0, y: 0, text: "" });
    setDragState(null);
    historyRef.current.dragSnapshot = null;
    historyRef.current.dragMoved = false;
  }, []);

  const stopDrawing = useCallback(() => {
    setToolMode("select");
    resetDrawingState();
  }, [resetDrawingState]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!isDrawing || !imageSize) return;
      const originalPoint = getOriginalPoint(event, display.scale);
      if (imageSize.width <= 0 || imageSize.height <= 0) return;
      const normalizedX = clamp(originalPoint.originalX / imageSize.width, 0, 1);
      const normalizedY = clamp(originalPoint.originalY / imageSize.height, 0, 1);

      if (toolMode === "polyline") {
        if (event.detail >= 2) {
          finishDrawing({
            imageSize,
            points: currentPoints,
            minPointPairs: 3,
            incompleteMessage: "กรุณาวาดอย่างน้อย 3 จุดเพื่อสร้างพื้นที่",
            setErrorMessage,
            applyShapes,
            shapes,
            setActiveShapeId,
            resetDrawingState,
          });
          return;
        }
        if (hoveringStart && currentPoints.length >= 6) {
          setPreviewPoint(null);
          setTooltip({ visible: false, x: 0, y: 0, text: "" });
          setHoveringStart(false);
          finishDrawing({
            imageSize,
            points: currentPoints,
            minPointPairs: 3,
            incompleteMessage: "กรุณาวาดอย่างน้อย 3 จุดเพื่อสร้างพื้นที่",
            setErrorMessage,
            applyShapes,
            shapes,
            setActiveShapeId,
            resetDrawingState,
          });
          return;
        }
        setCurrentPoints((prev) => [...prev, normalizedX, normalizedY]);
        setPreviewPoint(null);
        setTooltip({ visible: false, x: 0, y: 0, text: "" });
        return;
      }

      if (toolMode === "rectangle") {
        if (!rectangleStart) {
          setRectangleStart({ normalizedX, normalizedY });
          setRectanglePreview({ normalizedX, normalizedY });
          setTooltip({
            visible: true,
            x: normalizedX * imageSize.width * display.scale,
            y: normalizedY * imageSize.height * display.scale,
            text: "ลากไปยังมุมตรงข้ามเพื่อสร้างสี่เหลี่ยม",
          });
          return;
        }
        const points = createRectanglePoints(rectangleStart, { normalizedX, normalizedY });
        setTooltip({ visible: false, x: 0, y: 0, text: "" });
        finishDrawing({
          imageSize,
          points,
          minPointPairs: 2,
          incompleteMessage: "กรุณาลากสองมุมเพื่อสร้างสี่เหลี่ยม",
          setErrorMessage,
          applyShapes,
          shapes,
          setActiveShapeId,
          resetDrawingState,
        });
      }
    },
    [
      currentPoints,
      display.scale,
      toolMode,
      hoveringStart,
      imageSize,
      isDrawing,
      onShapesChange,
      rectangleStart,
      resetDrawingState,
      setActiveShapeId,
      setErrorMessage,
      shapes,
    ],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      // Update mouse position for paste functionality
      if (imageSize) {
        const point = getOriginalPoint(event, display.scale);
        const normalizedX = clamp(point.originalX / imageSize.width, 0, 1);
        const normalizedY = clamp(point.originalY / imageSize.height, 0, 1);
        setMousePosition({ normalizedX, normalizedY });
      }

      if (dragState && imageSize) {
        event.preventDefault();
        const point = getOriginalPoint(event, display.scale);
        const normalizedX = clamp(point.originalX / imageSize.width, 0, 1);
        const normalizedY = clamp(point.originalY / imageSize.height, 0, 1);
        let deltaX = normalizedX - dragState.origin.normalizedX;
        let deltaY = normalizedY - dragState.origin.normalizedY;
        
        // Constrain movement to single axis when Shift is held (like Canva)
        if (event.shiftKey) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            deltaY = 0; // Lock to X-axis
          } else {
            deltaX = 0; // Lock to Y-axis
          }
        }
        
        const nextPoints = translateNormalizedPoints(dragState.startPoints, deltaX, deltaY);
        if (pointsEqual(nextPoints, dragState.startPoints)) {
          return;
        }
        const nextShapes = shapes.map((shape) =>
          shape.id === dragState.shapeId ? { ...shape, points: nextPoints } : shape,
        );
        applyShapes(nextShapes, { commitHistory: false, preserveDrag: true });
        historyRef.current.dragMoved = true;
        return;
      }
      if (!isDrawing || !imageSize) {
        setPreviewPoint(null);
        setHoveringStart(false);
        setRectanglePreview(null);
        setTooltip((prev) => (prev.visible ? { visible: false, x: 0, y: 0, text: "" } : prev));
        return;
      }

      const point = getOriginalPoint(event, display.scale);
      const normalizedX = clamp(point.originalX / imageSize.width, 0, 1);
      const normalizedY = clamp(point.originalY / imageSize.height, 0, 1);

      if (toolMode === "polyline") {
        if (currentPoints.length >= 2) {
          const startDisplayX = currentPoints[0] * imageSize.width * display.scale;
          const startDisplayY = currentPoints[1] * imageSize.height * display.scale;
          const distance = Math.hypot(
            normalizedX * imageSize.width * display.scale - startDisplayX,
            normalizedY * imageSize.height * display.scale - startDisplayY,
          );
          const withinSnap = distance <= SNAP_DISTANCE;
          setHoveringStart(withinSnap);
          if (withinSnap) {
            setPreviewPoint({
              normalizedX: currentPoints[0],
              normalizedY: currentPoints[1],
              displayX: startDisplayX,
              displayY: startDisplayY,
            });
            setTooltip({
              visible: true,
              x: normalizedX * imageSize.width * display.scale,
              y: normalizedY * imageSize.height * display.scale,
              text: "คลิกเพื่อปิดพื้นที่",
            });
          } else {
            setPreviewPoint({
              normalizedX,
              normalizedY,
              displayX: normalizedX * imageSize.width * display.scale,
              displayY: normalizedY * imageSize.height * display.scale,
            });
            setTooltip((prev) => (prev.visible ? { visible: false, x: 0, y: 0, text: "" } : prev));
          }
        } else {
          setPreviewPoint({
            normalizedX,
            normalizedY,
            displayX: normalizedX * imageSize.width * display.scale,
            displayY: normalizedY * imageSize.height * display.scale,
          });
          setTooltip((prev) => (prev.visible ? { visible: false, x: 0, y: 0, text: "" } : prev));
        }
        return;
      }

      if (toolMode === "rectangle") {
        if (!rectangleStart) {
          setRectanglePreview(null);
          return;
        }

        setRectanglePreview({ normalizedX, normalizedY });
        const startX = rectangleStart.normalizedX * imageSize.width * display.scale;
        const startY = rectangleStart.normalizedY * imageSize.height * display.scale;
        const currentX = normalizedX * imageSize.width * display.scale;
        const currentY = normalizedY * imageSize.height * display.scale;
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        if (width < 1 || height < 1) {
          setTooltip((prev) => (prev.visible ? { visible: false, x: 0, y: 0, text: "" } : prev));
        } else {
          const widthPx = Math.round(width / display.scale);
          const heightPx = Math.round(height / display.scale);
          const areaApprox = widthPx * heightPx;
          setTooltip({
            visible: true,
            x: left + width / 2,
            y: top + height / 2,
            text: `${widthPx} × ${heightPx} px (≈ ${formatArea(areaApprox)})`,
          });
        }
      }
    },
    [applyShapes, currentPoints, display.scale, dragState, toolMode, imageSize, isDrawing, rectangleStart, shapes],
  );

  const handlePointerLeave = useCallback(() => {
    if (dragState) {
      setDragState(null);
    }
    setPreviewPoint(null);
    setHoveringStart(false);
    setRectanglePreview(null);
    setTooltip((prev) => (prev.visible ? { visible: false, x: 0, y: 0, text: "" } : prev));
  }, [dragState]);

  const handlePointerUp = useCallback(() => {
    if (dragState) {
      setDragState(null);
    }
    if (historyRef.current.dragSnapshot && historyRef.current.dragMoved) {
      historyRef.current.past.push(historyRef.current.dragSnapshot);
      historyRef.current.future = [];
    }
    historyRef.current.dragSnapshot = null;
    historyRef.current.dragMoved = false;
  }, [dragState]);

  const handleContextMenu = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!isDrawing) return;
      if (toolMode === "polyline") {
        event.preventDefault();
        setCurrentPoints((prev) => (prev.length >= 2 ? prev.slice(0, -2) : []));
        setPreviewPoint(null);
        setHoveringStart(false);
        setTooltip({ visible: false, x: 0, y: 0, text: "" });
      } else if (toolMode === "rectangle") {
        if (!rectangleStart) return;
        event.preventDefault();
        setRectangleStart(null);
        setRectanglePreview(null);
        setTooltip({ visible: false, x: 0, y: 0, text: "" });
      }
    },
    [toolMode, isDrawing, rectangleStart],
  );

  const handleUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const previewUrl = await readFileAsDataUrl(file);
        const dimensions = await measureImage(previewUrl);
        setPreviewImageUrl(previewUrl);
        onImageChange({ file, previewUrl, width: dimensions.width, height: dimensions.height });
        stopDrawing();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "ไม่สามารถอ่านรูปภาพได้");
      } finally {
        event.target.value = "";
      }
    },
    [onImageChange, stopDrawing],
  );

  const handleActivateTool = useCallback(
    (mode: ToolMode) => {
      if (mode === "select") {
        setToolMode("select");
        resetDrawingState();
        return;
      }
      if (!imageSize) {
        setErrorMessage("กรุณาอัปโหลดผังคลังสินค้าก่อน");
        return;
      }
      if (toolMode === mode) {
        stopDrawing();
        return;
      }
      resetDrawingState();
      setErrorMessage(null);
      setToolMode(mode);
    },
    [imageSize, resetDrawingState, stopDrawing, toolMode],
  );

  const handleFinishDrawing = useCallback(() => {
    if (toolMode !== "polyline") return;
    finishDrawing({
      imageSize,
      points: currentPoints,
      minPointPairs: 3,
      incompleteMessage: "กรุณาวาดอย่างน้อย 3 จุดเพื่อสร้างพื้นที่",
      setErrorMessage,
      applyShapes,
      shapes,
      setActiveShapeId,
      resetDrawingState,
    });
  }, [applyShapes, currentPoints, toolMode, imageSize, resetDrawingState, setActiveShapeId, setErrorMessage, shapes]);

  const polylinePointCount = currentPoints.length;
  const drawingInstructions = useMemo(() => {
    if (toolMode === "polyline") {
          return polylinePointCount
            ? "คลิกเพื่อเพิ่มจุด, ดับเบิลคลิกเพื่อจบ, คลิกขวาเพื่อย้อนกลับ, เข้าใกล้จุดแรกเพื่อปิดพื้นที่ (กด Esc เพื่อยกเลิก)"
            : "เลือกจุดบนผังเพื่อเริ่มวาด Polyline (กด Esc เพื่อยกเลิก)";
    }
    if (toolMode === "rectangle") {
      return rectangleStart
        ? "เลื่อนเมาส์และคลิกมุมตรงข้ามเพื่อสร้างสี่เหลี่ยม หรือคลิกขวาเพื่อเริ่มใหม่ (กด Esc เพื่อยกเลิก)"
        : "คลิกมุมแรกของสี่เหลี่ยมบนผัง (กด Esc เพื่อยกเลิก)";
    }
    return "โหมดเลือก: คลิกเลือกพื้นที่เพื่อลาก ปรับ หรือคัดลอก (Ctrl+C / Ctrl+V ที่ตำแหน่งเมาส์, Ctrl+Z, Shift+Ctrl+Z, Ctrl+Y, Shift+ลาก=ล็อคแกน)";
  }, [toolMode, polylinePointCount, rectangleStart]);

  const handleShapePointerDown = useCallback(
    (shape: LocationShape, event: PointerEvent<SVGPolygonElement>) => {
      if (toolMode !== "select" || !imageSize) return;
      event.preventDefault();
      event.stopPropagation();
      const svgElement = event.currentTarget.ownerSVGElement;
      if (!svgElement) return;
      const rect = svgElement.getBoundingClientRect();
      const displayX = event.clientX - rect.left;
      const displayY = event.clientY - rect.top;
      const normalizedX = clamp((displayX / display.scale) / imageSize.width, 0, 1);
      const normalizedY = clamp((displayY / display.scale) / imageSize.height, 0, 1);
      setActiveShapeId(shape.id);
      setDragState({
        shapeId: shape.id,
        startPoints: shape.points.slice(),
        origin: { normalizedX, normalizedY },
      });
      historyRef.current.dragSnapshot = snapshotShapes(shapes);
      historyRef.current.dragMoved = false;
      historyRef.current.future = [];
    },
    [display.scale, imageSize, snapshotShapes, shapes, toolMode],
  );

  const activeShape = useMemo(() => shapes.find((shape) => shape.id === activeShapeId) ?? null, [activeShapeId, shapes]);
  const isActiveShapeBound = Boolean(activeShape?.locationId);

  const renderShapes = useMemo(() => {
    if (!imageSize) return [];
    return shapes.map((shape) => {
      const svgPoints = convertToSvg(shape.points, imageSize);
      const area = polygonArea(shape.points, imageSize);
      const centroid = polygonCentroid(shape.points, imageSize);
      return {
        shape,
        svgPoints,
        area,
        centroid,
      };
    });
  }, [imageSize, shapes]);

  const handleDuplicateShape = useCallback(() => {
    if (!activeShape) return;
    const baseShape = cloneShape(activeShape);
    const duplicatePoints = translateNormalizedPoints(baseShape.points, 0.02, 0.02);
    const newShape: LocationShape = {
      ...baseShape,
      id: createShapeId(),
      points: duplicatePoints,
      locationId: undefined,
    };
    applyShapes([newShape, ...shapes]);
    setActiveShapeId(newShape.id);
  }, [activeShape, applyShapes, setActiveShapeId, shapes]);

  const handleDeleteActiveShape = useCallback(() => {
    if (!activeShapeId) return;
    const remaining = shapes.filter((shape) => shape.id !== activeShapeId);
    if (remaining.length === shapes.length) return;
    applyShapes(remaining);
    setActiveShapeId(remaining.length ? remaining[remaining.length - 1].id : null);
  }, [activeShapeId, applyShapes, setActiveShapeId, shapes]);

  // Helper function to get bound locations
  const getBoundLocations = useCallback(() => {
    const boundMap = new Map<string, string>(); // locationId -> shapeId
    shapes.forEach(shape => {
      if (shape.locationId) {
        boundMap.set(shape.locationId, shape.id);
      }
    });
    return boundMap;
  }, [shapes]);

  // Filtered locations for autocomplete
  const filteredLocations = useMemo(() => {
    if (!searchTerm) return locations;
    return locations.filter(location => 
      location.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [locations, searchTerm]);

  const filteredItems = useMemo(() => {
    const sourceItems = Array.isArray(items) ? items : [];
    if (!itemSearchTerm) return sourceItems;
    return sourceItems.filter(item =>
      item.name.toLowerCase().includes(itemSearchTerm.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(itemSearchTerm.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(itemSearchTerm.toLowerCase()))
    );
  }, [items, itemSearchTerm]);

  const assignLocation = useCallback(
    (shapeId: string, locationId: string) => {
      const current = shapes.find((shape) => shape.id === shapeId);
      const normalized = locationId ? locationId : undefined;
      if (!current || current.locationId === normalized) return;

      const performLocationAssignment = (
        targetShapeId: string,
        targetLocationId: string | undefined,
        options: { clearExistingItems?: boolean; preserveDrag?: boolean; transferredItemsOverride?: string[] } = {},
      ) => {
        const { clearExistingItems = false, preserveDrag = false, transferredItemsOverride } = options;
        let transferredItems: string[] = transferredItemsOverride ? transferredItemsOverride.slice() : [];

        let nextShapes = shapes.slice();

        if (targetLocationId) {
          nextShapes = nextShapes.map((shape) => {
            if (shape.locationId === targetLocationId && shape.id !== targetShapeId) {
              if (!clearExistingItems && !transferredItemsOverride && shape.allowedItems && shape.allowedItems.length > 0) {
                transferredItems = shape.allowedItems.slice();
              }
              return { ...shape, locationId: undefined, allowedItems: [] };
            }
            return shape;
          });
        }

        nextShapes = nextShapes.map((shape) => {
          if (shape.id !== targetShapeId) return shape;
          const baseItems =
            transferredItems.length > 0 ? transferredItems.slice() : (shape.allowedItems ?? []).slice();
          const nextAllowedItems = targetLocationId
            ? clearExistingItems
              ? []
              : baseItems
            : [];
          return {
            ...shape,
            locationId: targetLocationId,
            allowedItems: nextAllowedItems,
          };
        });

        applyShapes(nextShapes, { commitHistory: true, preserveDrag });
        setShowItemDropdown(false);
        setItemSearchTerm("");
      };

      if (!normalized) {
        performLocationAssignment(shapeId, undefined, { clearExistingItems: true });
        return;
      }

      const boundLocations = getBoundLocations();
      const existingShapeId = boundLocations.get(locationId);
      const lockedInfo = lockedLocationMap.get(locationId);
      const executeLockedTransfer = async (clearItems: boolean, info: LockedLocationInfo) => {
        try {
          let itemsToTransfer = clearItems ? [] : info.allowedItems.slice();
          if (onTransferLockedLocation) {
            const result = await onTransferLockedLocation({
              locationId,
              sourceMapId: info.mapId,
              areaId: info.areaId,
              clearItems,
              allowedItems: info.allowedItems,
            });
            if (result && Array.isArray(result.allowedItems)) {
              itemsToTransfer = clearItems ? [] : result.allowedItems.slice();
            }
          }
          setErrorMessage(null);
          performLocationAssignment(shapeId, normalized, {
            clearExistingItems: clearItems,
            transferredItemsOverride: clearItems ? [] : itemsToTransfer,
          });
          setConfirmDialog(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : "ไม่สามารถย้าย Location จากผังอื่นได้";
          setErrorMessage(message);
          setConfirmDialog(null);
        }
      };

      if (existingShapeId && existingShapeId !== shapeId) {
        const targetLocation = locations.find((loc) => loc.id === locationId);
        if (!targetLocation) return;

        setConfirmDialog({
          show: true,
          type: "unbind",
          targetLocationId: locationId,
          targetLocationLabel: targetLocation.label,
          onConfirm: () => {
            setConfirmDialog({
              show: true,
              type: "clearData",
              targetLocationId: locationId,
              targetLocationLabel: targetLocation.label,
              onConfirm: () => {
                performLocationAssignment(shapeId, normalized, { clearExistingItems: true });
                setConfirmDialog(null);
              },
              onCancel: () => {
                performLocationAssignment(shapeId, normalized, { clearExistingItems: false });
                setConfirmDialog(null);
              },
            });
          },
          onCancel: () => {
            setConfirmDialog(null);
          },
        });
        return;
      }

      if (lockedInfo) {
        const targetLocation = locations.find((loc) => loc.id === locationId);
        const locationLabel = targetLocation?.label ?? locationId;
        setErrorMessage(null);
        setConfirmDialog({
          show: true,
          type: "lockedTransfer",
          targetLocationId: locationId,
          targetLocationLabel: `${locationLabel} (จากผัง ${lockedInfo.mapName})`,
          onConfirm: () => {
            setConfirmDialog({
              show: true,
              type: "clearData",
              targetLocationId: locationId,
              targetLocationLabel: locationLabel,
              onConfirm: () => {
                void executeLockedTransfer(true, lockedInfo);
              },
              onCancel: () => {
                void executeLockedTransfer(false, lockedInfo);
              },
            });
          },
          onCancel: () => {
            setConfirmDialog(null);
          },
        });
        return;
      }

      performLocationAssignment(shapeId, normalized);
    },
    [
      shapes,
      getBoundLocations,
      locations,
      applyShapes,
      lockedLocationMap,
      onTransferLockedLocation,
      setErrorMessage,
    ],
  );

  const toggleItemInLocation = useCallback(
    (shapeId: string, itemId: string) => {
      const shape = shapes.find((s) => s.id === shapeId);
      if (!shape || !shape.locationId) return;

      const currentItems = shape.allowedItems || [];
      const isSelected = currentItems.includes(itemId);
      
      let newAllowedItems: string[];
      if (isSelected) {
        // Remove item
        newAllowedItems = currentItems.filter(id => id !== itemId);
      } else {
        // Add item
        newAllowedItems = [...currentItems, itemId];
      }

      const nextShapes = shapes.map(s =>
        s.id === shapeId ? { ...s, allowedItems: newAllowedItems } : s
      );
      
      applyShapes(nextShapes);
    },
    [shapes, applyShapes],
  );

  const removeItemFromLocation = useCallback(
    (shapeId: string, itemId: string) => {
      const shape = shapes.find((s) => s.id === shapeId);
      if (!shape || !shape.locationId) return;

      const currentItems = shape.allowedItems || [];
      const newAllowedItems = currentItems.filter(id => id !== itemId);

      const nextShapes = shapes.map(s =>
        s.id === shapeId ? { ...s, allowedItems: newAllowedItems } : s
      );
      
      applyShapes(nextShapes);
    },
    [shapes, applyShapes],
  );

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    if (!history.past.length) return;
    history.future.push(snapshotShapes(shapes));
    const previous = history.past.pop()!;
    history.syncing = true;
    history.dragSnapshot = null;
    history.dragMoved = false;
    const restored = snapshotShapes(previous);
    onShapesChange(restored);
    setActiveShapeId((prevId) => {
      if (prevId && restored.some((shape) => shape.id === prevId)) return prevId;
      return restored.length ? restored[restored.length - 1].id : null;
    });
  }, [onShapesChange, setActiveShapeId, shapes, snapshotShapes]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    if (!history.future.length) return;
    history.past.push(snapshotShapes(shapes));
    const next = history.future.pop()!;
    history.syncing = true;
    history.dragSnapshot = null;
    history.dragMoved = false;
    const restored = snapshotShapes(next);
    onShapesChange(restored);
    setActiveShapeId((prevId) => {
      if (prevId && restored.some((shape) => shape.id === prevId)) return prevId;
      return restored.length ? restored[restored.length - 1].id : null;
    });
  }, [onShapesChange, setActiveShapeId, shapes, snapshotShapes]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const isMeta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      // Handle Escape key to cancel drawing
      if (key === "escape") {
        if (isDrawing) {
          event.preventDefault();
          stopDrawing();
          return;
        }
      }

      if (isMeta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (isMeta && key === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (toolMode !== "select") return;

      if (isMeta && key === "c") {
        if (activeShapeId) {
          const shape = shapes.find((item) => item.id === activeShapeId);
          if (shape) {
            clipboardRef.current = cloneShape(shape);
            event.preventDefault();
          }
        }
        return;
      }

      if (isMeta && key === "v") {
        if (clipboardRef.current && imageSize) {
          const pasted = cloneShape(clipboardRef.current);
          pasted.id = createShapeId();
          pasted.locationId = undefined;
          
          let pasteX = 0.02;
          let pasteY = 0.02;
          
          // Use mouse position if available and within bounds
          if (mousePosition) {
            // Calculate the bounding box of the original shape
            const originalBounds = getBoundingBox(pasted.points);
            
            // Calculate where to place the shape so its center is at mouse position
            const originalCenterX = (originalBounds.minX + originalBounds.maxX) / 2;
            const originalCenterY = (originalBounds.minY + originalBounds.maxY) / 2;
            
            // Calculate desired translation to center at mouse position
            const targetX = mousePosition.normalizedX - originalCenterX;
            const targetY = mousePosition.normalizedY - originalCenterY;
            
            // Check if the translated shape would be within bounds (0-1)
            const translatedBounds = {
              minX: originalBounds.minX + targetX,
              maxX: originalBounds.maxX + targetX,
              minY: originalBounds.minY + targetY,
              maxY: originalBounds.maxY + targetY,
            };
            
            if (translatedBounds.minX >= 0 && translatedBounds.maxX <= 1 && 
                translatedBounds.minY >= 0 && translatedBounds.maxY <= 1) {
              // Mouse position is valid, use it
              pasteX = targetX;
              pasteY = targetY;
            } else {
              // Mouse position would place shape outside bounds, use default offset
              pasteX = 0.02;
              pasteY = 0.02;
            }
          }
          
          pasted.points = translateNormalizedPoints(pasted.points, pasteX, pasteY);
          applyShapes([pasted, ...shapes]);
          setActiveShapeId(pasted.id);
          event.preventDefault();
        }
        return;
      }

      if (!activeShapeId) return;

      if (key === "delete" || key === "backspace") {
        const remaining = shapes.filter((shape) => shape.id !== activeShapeId);
        if (remaining.length !== shapes.length) {
          event.preventDefault();
          applyShapes(remaining);
          setActiveShapeId(remaining.length ? remaining[remaining.length - 1].id : null);
        }
        return;
      }

      if (!["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        return;
      }

      const step = event.shiftKey ? 0.02 : 0.01;
      let deltaX = 0;
      let deltaY = 0;
      switch (key) {
        case "arrowleft":
          deltaX = -step;
          break;
        case "arrowright":
          deltaX = step;
          break;
        case "arrowup":
          deltaY = -step;
          break;
        case "arrowdown":
          deltaY = step;
          break;
        default:
          return;
      }
      event.preventDefault();
      const targetShape = shapes.find((shape) => shape.id === activeShapeId);
      if (!targetShape) return;
      const nextPoints = translateNormalizedPoints(targetShape.points, deltaX, deltaY);
      if (pointsEqual(nextPoints, targetShape.points)) return;
      applyShapes(
        shapes.map((shape) =>
          shape.id === activeShapeId ? { ...shape, points: nextPoints } : shape,
        ),
      );
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeShapeId, applyShapes, handleRedo, handleUndo, shapes, toolMode, mousePosition, imageSize, isDrawing, stopDrawing]);

  const drawingPreviewPoints = useMemo(() => {
    if (toolMode !== "polyline" || !currentPoints.length) return [];
    if (hoveringStart && currentPoints.length >= 2) {
      return [...currentPoints, currentPoints[0], currentPoints[1]];
    }
    if (previewPoint) {
      return [...currentPoints, previewPoint.normalizedX, previewPoint.normalizedY];
    }
    return currentPoints;
  }, [currentPoints, toolMode, hoveringStart, previewPoint]);

  const rectanglePreviewRect = useMemo(() => {
    if (toolMode !== "rectangle" || !rectangleStart || !rectanglePreview || !imageSize) {
      return null;
    }
    const startX = rectangleStart.normalizedX * imageSize.width;
    const startY = rectangleStart.normalizedY * imageSize.height;
    const currentX = rectanglePreview.normalizedX * imageSize.width;
    const currentY = rectanglePreview.normalizedY * imageSize.height;
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    if (width === 0 || height === 0) {
      return null;
    }
    return { x, y, width, height };
  }, [toolMode, imageSize, rectanglePreview, rectangleStart]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          ผังคลังสินค้า (JPEG/PNG)
          <input type="file" accept="image/*" onChange={handleUpload} className="text-xs" />
        </label>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <button
            type="button"
            aria-label="เลือกพื้นที่"
            title="เลือกพื้นที่"
            aria-pressed={toolMode === "select"}
            onClick={() => handleActivateTool("select")}
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
              toolMode === "select"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <PointerIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="วาด Polyline"
            title="วาด Polyline"
            aria-pressed={toolMode === "polyline"}
            onClick={() => handleActivateTool("polyline")}
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
              toolMode === "polyline"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="วาดสี่เหลี่ยม"
            title="วาดสี่เหลี่ยม"
            aria-pressed={toolMode === "rectangle"}
            onClick={() => handleActivateTool("rectangle")}
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
              toolMode === "rectangle"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
            }`}
          >
            <RectangleIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="คัดลอกพื้นที่"
            title="คัดลอกพื้นที่"
            onClick={handleDuplicateShape}
            disabled={!activeShape}
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
              activeShape
                ? "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                : "border-slate-200 bg-slate-100 text-slate-300 cursor-not-allowed"
            }`}
          >
            <CopyIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="ลบพื้นที่นี้"
            title="ลบพื้นที่นี้"
            onClick={handleDeleteActiveShape}
            disabled={!activeShape}
            className={`flex h-8 w-8 items-center justify-center rounded-md border transition ${
              activeShape
                ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
                : "border-red-100 bg-slate-100 text-red-200 cursor-not-allowed"
            }`}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFinishDrawing}
            disabled={toolMode !== "polyline" || currentPoints.length < 6}
            className="rounded-md border border-emerald-300 bg-emerald-100 px-3 py-1 text-emerald-700 disabled:opacity-60"
          >
            บันทึกพื้นที่
          </button>
          <button
            type="button"
            onClick={stopDrawing}
            disabled={!isDrawing}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-slate-600 disabled:opacity-60"
          >
            ยกเลิก
          </button>
        </div>
        <span className="text-xs text-slate-500">{drawingInstructions}</span>
      </div>
      {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}

      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
        style={{ height: Math.max(display.height, 240) }}
      >
        <svg
          width={display.width}
          height={display.height}
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          className="h-full w-full bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerUp={handlePointerUp}
          onContextMenu={handleContextMenu}
        >
          {previewImageUrl && imageSize ? (
            <image href={previewImageUrl} width={imageSize.width} height={imageSize.height} preserveAspectRatio="xMidYMid meet" />
          ) : null}

          {renderShapes.map(({ shape, svgPoints, centroid, area }) => {
            const isActive = shape.id === activeShapeId;
            const locationId = typeof shape.locationId === "string" ? shape.locationId.trim() : shape.locationId;
            const isUnlinked = !locationId;
            const fillColor = (() => {
              if (isActive) {
                return "rgba(59, 130, 246, 0.4)";
              }
              if (isUnlinked) {
                return "rgba(248, 113, 113, 0.45)"; // red for unlinked
              }
              if (shape.zone) {
                return zoneToFill(shape.zone);
              }
              return "rgba(30, 64, 175, 0.12)";
            })();
            const strokeColor = (() => {
              if (isActive) return "#1d4ed8";
              if (isUnlinked) return "#dc2626";
              return "#0f172a";
            })();
            return (
              <g key={shape.id}>
                <polygon
                  points={pointsToString(svgPoints)}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={isActive ? 3 : 2}
                  strokeDasharray={isActive ? "4 3" : undefined}
                  onPointerDown={(event) => handleShapePointerDown(shape, event)}
                  className="cursor-pointer"
                />
                {centroid ? (
                  <text
                    x={centroid.x}
                    y={centroid.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isActive ? "13" : "12"}
                    fill={isActive ? "#1d4ed8" : strokeColor}
                    pointerEvents="none"
                    fontWeight={isActive ? "600" : undefined}
                  >
                    {formatArea(area)}
                  </text>
                ) : null}
              </g>
            );
          })}

          {toolMode === "rectangle" && rectanglePreviewRect ? (
            <rect
              x={rectanglePreviewRect.x}
              y={rectanglePreviewRect.y}
              width={rectanglePreviewRect.width}
              height={rectanglePreviewRect.height}
              fill="rgba(16, 185, 129, 0.18)"
              stroke="#16a34a"
              strokeWidth={2 / display.scale}
              strokeDasharray="6 4"
              pointerEvents="none"
            />
          ) : null}

          {toolMode === "polyline" && drawingPreviewPoints.length && imageSize ? (
            <polyline
              points={pointsToString(convertToSvg(drawingPreviewPoints, imageSize))}
              fill="none"
              stroke="#16a34a"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
          ) : null}

          {toolMode === "polyline" && currentPoints.length && imageSize
            ? currentPoints.reduce<JSX.Element[]>((acc, _value, index) => {
                if (index % 2 !== 0) return acc;
                const normalizedX = currentPoints[index];
                const normalizedY = currentPoints[index + 1];
                const svgX = normalizedX * imageSize.width;
                const svgY = normalizedY * imageSize.height;
                const isStart = index === 0;
                const radiusPx = isStart ? (hoveringStart ? 8 : 6) : 4;
                const radius = radiusPx / display.scale;
                acc.push(
                  <circle
                    key={`${svgX}-${svgY}-${index}`}
                    cx={svgX}
                    cy={svgY}
                    r={radius}
                    fill={isStart ? "#0ea5e9" : "#16a34a"}
                    stroke={isStart ? "#020617" : "#0f172a"}
                    strokeWidth={1 / display.scale}
                    pointerEvents="none"
                  />,
                );
                return acc;
              }, [])
            : null}
        </svg>
        {tooltip.visible ? (
          <div
            className="pointer-events-none absolute rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg"
            style={{ left: tooltip.x + 12, top: Math.max(tooltip.y - 32, 0) }}
          >
            {tooltip.text}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">รายละเอียดพื้นที่</h4>
          <p className="text-xs text-slate-500">
            เลือกพื้นที่บนผังเพื่อเชื่อมกับ Location และแก้ไขชื่อที่แสดง
          </p>
        </div>

        {activeShape ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              เชื่อมกับ Location
              <div className="relative">
                <input
                  type="text"
                  value={activeShape.locationId ? locations.find(loc => loc.id === activeShape.locationId)?.label || "" : searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setShowLocationDropdown(true);
                  }}
                  onFocus={() => {
                    if (locationDropdownHideTimeoutRef.current !== null) {
                      window.clearTimeout(locationDropdownHideTimeoutRef.current);
                      locationDropdownHideTimeoutRef.current = null;
                    }
                    setShowLocationDropdown(true);
                    if (activeShape.locationId) {
                      setSearchTerm("");
                    }
                  }}
                  onBlur={() => {
                    // Delay hiding to allow clicks on dropdown items
                    locationDropdownHideTimeoutRef.current = window.setTimeout(() => {
                      setShowLocationDropdown(false);
                      locationDropdownHideTimeoutRef.current = null;
                    }, 150);
                  }}
                  placeholder="ค้นหา Location..."
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                  autoComplete="off"
                />
                
                {showLocationDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    <div
                      className="px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer text-slate-500"
                      onClick={() => {
                        assignLocation(activeShape.id, "");
                        setSearchTerm("");
                        setShowLocationDropdown(false);
                      }}
                    >
                      ยังไม่เชื่อม
                    </div>
                    
                    {(() => {
                      const boundLocations = getBoundLocations();
                      return filteredLocations.map((location) => {
                        const boundShapeId = boundLocations.get(location.id);
                        const isBoundToOther = boundShapeId && boundShapeId !== activeShape.id;
                        const isBoundToCurrent = boundShapeId === activeShape.id;
                        const isLockedByOther = lockedLocationMap.has(location.id) && !isBoundToCurrent;
                        return (
                          <div
                            key={location.id}
                            className={`px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer flex justify-between items-center ${
                              isBoundToCurrent
                                ? "bg-green-50 text-green-700 font-semibold"
                                : isLockedByOther || isBoundToOther
                                  ? "bg-red-50 text-red-700"
                                  : "text-slate-700"
                            }`}
                            onClick={() => {
                              assignLocation(activeShape.id, location.id);
                              setSearchTerm("");
                              setShowLocationDropdown(false);
                            }}
                          >
                            <span>{location.label}</span>
                            <span className="text-xs">
                              {isBoundToCurrent
                                ? "(ผูกอยู่)"
                                : isLockedByOther
                                  ? "(ถูกใช้ในผังอื่น - เลือกเพื่อย้าย)"
                                : isBoundToOther
                                  ? "(ถูกใช้แล้ว)"
                                  : ""}
                            </span>
                          </div>
                        );
                      });
                    })()}
                    
                    {filteredLocations.length === 0 && searchTerm && (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        ไม่พบ Location ที่ตรงกับ "{searchTerm}"
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="text-xs text-slate-500 mt-1">
                • เขียว: ผูกกับ Object นี้อยู่<br/>
                • แดง: ถูกใช้กับ Object อื่นหรือผังอื่นแล้ว<br/>
                • ดำ: ยังไม่ถูกใช้
              </span>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              ชื่อที่แสดง (Label)
              <input
                value={activeShape.label ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === (activeShape.label ?? "")) return;
                  applyShapes(
                    shapes.map((shape) =>
                      shape.id === activeShape.id ? { ...shape, label: value } : shape,
                    ),
                  );
                }}
                placeholder="เช่น โซน A ชั้น 3 ช่อง B2"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              โซน
              <input
                value={activeShape.zone ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === (activeShape.zone ?? "")) return;
                  applyShapes(
                    shapes.map((shape) =>
                      shape.id === activeShape.id ? { ...shape, zone: value || undefined } : shape,
                    ),
                  );
                }}
                placeholder="เช่น A หรือ B"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            
            {/* Items Selection Section */}
            <div className="col-span-2">
              <label className="flex flex-col gap-1 text-xs">
                สินค้าที่สามารถเก็บได้
                <div className="relative">
                  <input
                    type="text"
                    value={itemSearchTerm}
                    onChange={(event) => {
                      if (!isActiveShapeBound) return;
                      setItemSearchTerm(event.target.value);
                      setShowItemDropdown(true);
                    }}
                    onFocus={() => {
                      if (!isActiveShapeBound) return;
                      if (itemDropdownHideTimeoutRef.current !== null) {
                        window.clearTimeout(itemDropdownHideTimeoutRef.current);
                        itemDropdownHideTimeoutRef.current = null;
                      }
                      setShowItemDropdown(true);
                    }}
                    onBlur={() => {
                      if (!isActiveShapeBound) return;
                      itemDropdownHideTimeoutRef.current = window.setTimeout(() => {
                        setShowItemDropdown(false);
                        itemDropdownHideTimeoutRef.current = null;
                      }, 150);
                    }}
                    placeholder="ค้นหาสินค้าเพื่อเพิ่ม..."
                    className={`rounded-md border px-3 py-2 text-sm ${
                      isActiveShapeBound
                        ? "border-slate-200"
                        : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                    autoComplete="off"
                    disabled={!isActiveShapeBound}
                  />
                  
                  {showItemDropdown && isActiveShapeBound && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredItems.map((item) => {
                        const currentItems = activeShape.allowedItems || [];
                        const isSelected = currentItems.includes(item.id);
                        
                        return (
                          <div
                            key={item.id}
                            className={`px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer flex justify-between items-center ${
                              isSelected ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                            }`}
                            onClick={() => {
                              toggleItemInLocation(activeShape.id, item.id);
                              setItemSearchTerm("");
                              setShowItemDropdown(false);
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{item.name}</span>
                              {item.sku && (
                                <span className="text-xs text-slate-500">SKU: {item.sku}</span>
                              )}
                              {item.category && (
                                <span className="text-xs text-slate-500">{item.category}</span>
                              )}
                            </div>
                            <span className="text-xs">
                              {isSelected ? '✓ เลือกแล้ว' : '+ เพิ่ม'}
                            </span>
                          </div>
                        );
                      })}
                      
                      {filteredItems.length === 0 && itemSearchTerm && (
                        <div className="px-3 py-2 text-sm text-slate-500">
                          ไม่พบสินค้าที่ตรงกับ "{itemSearchTerm}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!isActiveShapeBound ? (
                  <span className="text-xs text-amber-600">
                    กรุณาผูก Location กับพื้นที่นี้ก่อนจึงจะเพิ่มรายการได้
                  </span>
                ) : null}
                
                {/* Selected Items Display */}
                {activeShape.allowedItems && activeShape.allowedItems.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-slate-600 mb-1 block">
                      สินค้าที่เลือก ({activeShape.allowedItems.length} รายการ):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {activeShape.allowedItems.map((itemId) => {
                        const item = items.find(i => i.id === itemId);
                        if (!item) return null;
                        
                        return (
                          <div
                            key={itemId}
                            className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs"
                          >
                            <span>{item.name}</span>
                            <button
                              onClick={() => removeItemFromLocation(activeShape.id, itemId)}
                              className="text-blue-600 hover:text-blue-800 font-bold"
                              title="ลบออก"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                <span className="text-xs text-slate-500 mt-1">
                  เลือกสินค้าที่สามารถจัดเก็บใน Location นี้ได้ (เลือกได้หลายรายการ)
                </span>
              </label>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">เลือกพื้นที่เพื่อแก้ไขรายละเอียดหรือผูกกับ Location</p>
        )}
      </div>
      
      {/* Confirmation Dialog */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            {confirmDialog.type === "unbind" && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">ยืนยันการย้าย Location</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Location "{confirmDialog.targetLocationLabel}" ถูกผูกกับ Object อื่นอยู่แล้ว ต้องการปรับให้
                  Location นี้ผูกกับ Object ใหม่หรือไม่?
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={confirmDialog.onCancel}
                    className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={confirmDialog.onConfirm}
                    className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700"
                  >
                    ใช่ ย้าย Location
                  </button>
                </div>
              </>
            )}
            {confirmDialog.type === "clearData" && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">ลบข้อมูลสินค้าใน Location</h3>
                <p className="text-sm text-slate-600 mb-4">
                  ต้องการลบข้อมูลสินค้าที่จัดเก็บใน Location "{confirmDialog.targetLocationLabel}" หรือไม่?
                  การกระทำนี้จะเป็นการ Reset Location ใหม่ทั้งหมด
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={confirmDialog.onCancel}
                    className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    ไม่ลบข้อมูล
                  </button>
                  <button
                    onClick={confirmDialog.onConfirm}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    ใช่ ลบข้อมูลทั้งหมด
                  </button>
                </div>
              </>
            )}
            {confirmDialog.type === "lockedTransfer" && (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">ย้าย Location จากผังอื่น</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Location "{confirmDialog.targetLocationLabel}" ถูกใช้ในผังอื่นอยู่ ต้องการยกเลิกการผูกจากผังเดิมและย้ายมาผูกกับพื้นที่นี้หรือไม่?
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={confirmDialog.onCancel}
                    className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={confirmDialog.onConfirm}
                    className="px-4 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700"
                  >
                    ใช่ ย้ายจากผังเดิม
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface FinishDrawingOptions {
  imageSize: { width: number; height: number } | null;
  points: number[];
  minPointPairs?: number;
  incompleteMessage: string;
  setErrorMessage: (value: string | null) => void;
  applyShapes: (nextShapes: LocationShape[], options?: { commitHistory?: boolean }) => void;
  shapes: LocationShape[];
  setActiveShapeId: (id: string | null) => void;
  resetDrawingState: () => void;
}

function finishDrawing({
  imageSize,
  points,
  minPointPairs = 3,
  incompleteMessage,
  setErrorMessage,
  applyShapes,
  shapes,
  setActiveShapeId,
  resetDrawingState,
}: FinishDrawingOptions) {
  if (!imageSize) {
    setErrorMessage("กรุณาอัปโหลดผังคลังสินค้าก่อนเริ่มวาด");
    return;
  }
  if (points.length < minPointPairs * 2) {
    setErrorMessage(incompleteMessage);
    return;
  }
  setErrorMessage(null);
  const newShapeId = createShapeId();
  const shape: LocationShape = {
    id: newShapeId,
    points: points.map((value) => Number(value.toFixed(6))),
  };
  applyShapes([shape, ...shapes]);
  setActiveShapeId(newShapeId);
  resetDrawingState();
}

function translateNormalizedPoints(points: number[], deltaX: number, deltaY: number): number[] {
  const { dx, dy } = constrainDelta(points, deltaX, deltaY);
  const translated: number[] = [];
  for (let index = 0; index < points.length; index += 2) {
    translated.push(points[index] + dx, points[index + 1] + dy);
  }
  return translated;
}

function pointsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function constrainDelta(points: number[], deltaX: number, deltaY: number): { dx: number; dy: number } {
  let dx = deltaX;
  let dy = deltaY;

  if (deltaX > 0) {
    let maxPositive = 1;
    for (let index = 0; index < points.length; index += 2) {
      maxPositive = Math.min(maxPositive, 1 - points[index]);
    }
    dx = Math.min(deltaX, maxPositive);
  } else if (deltaX < 0) {
    let maxNegative = 1;
    for (let index = 0; index < points.length; index += 2) {
      maxNegative = Math.min(maxNegative, points[index]);
    }
    dx = Math.max(deltaX, -maxNegative);
  }

  if (deltaY > 0) {
    let maxPositive = 1;
    for (let index = 1; index < points.length; index += 2) {
      maxPositive = Math.min(maxPositive, 1 - points[index]);
    }
    dy = Math.min(deltaY, maxPositive);
  } else if (deltaY < 0) {
    let maxNegative = 1;
    for (let index = 1; index < points.length; index += 2) {
      maxNegative = Math.min(maxNegative, points[index]);
    }
    dy = Math.max(deltaY, -maxNegative);
  }

  return { dx, dy };
}

function cloneShape(shape: LocationShape): LocationShape {
  return {
    ...shape,
    points: shape.points.slice(),
  };
}

function createRectanglePoints(
  start: { normalizedX: number; normalizedY: number },
  end: { normalizedX: number; normalizedY: number },
): number[] {
  const minX = Math.min(start.normalizedX, end.normalizedX);
  const maxX = Math.max(start.normalizedX, end.normalizedX);
  const minY = Math.min(start.normalizedY, end.normalizedY);
  const maxY = Math.max(start.normalizedY, end.normalizedY);
  if (minX === maxX || minY === maxY) {
    return [];
  }
  return [minX, minY, maxX, minY, maxX, maxY, minX, maxY];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("ไม่สามารถอ่านไฟล์ได้"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("ไม่สามารถอ่านไฟล์ได้"));
    reader.readAsDataURL(file);
  });
}

function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("ไม่สามารถโหลดรูปภาพได้"));
    image.src = src;
  });
}

function convertToSvg(points: number[], imageSize: { width: number; height: number }): number[] {
  const converted: number[] = [];
  for (let index = 0; index < points.length; index += 2) {
    const normalizedX = points[index];
    const normalizedY = points[index + 1];
    converted.push(normalizedX * imageSize.width, normalizedY * imageSize.height);
  }
  return converted;
}

function pointsToString(points: number[]): string {
  const chunks: string[] = [];
  for (let index = 0; index < points.length; index += 2) {
    chunks.push(`${points[index]},${points[index + 1]}`);
  }
  return chunks.join(" ");
}

function getBoundingBox(points: number[]): { minX: number; maxX: number; minY: number; maxY: number } {
  if (points.length < 2) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  
  let minX = points[0];
  let maxX = points[0];
  let minY = points[1];
  let maxY = points[1];
  
  for (let i = 2; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  
  return { minX, maxX, minY, maxY };
}

function polygonArea(points: number[], imageSize: { width: number; height: number }): number {
  if (points.length < 6) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 2) {
    const x1 = points[index] * imageSize.width;
    const y1 = points[index + 1] * imageSize.height;
    const next = (index + 2) % points.length;
    const x2 = points[next] * imageSize.width;
    const y2 = points[next + 1] * imageSize.height;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function polygonCentroid(points: number[], imageSize: { width: number; height: number }): { x: number; y: number } | null {
  const area = polygonArea(points, imageSize);
  if (points.length < 6 || area === 0) {
    return null;
  }
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < points.length; index += 2) {
    const x1 = points[index] * imageSize.width;
    const y1 = points[index + 1] * imageSize.height;
    const next = (index + 2) % points.length;
    const x2 = points[next] * imageSize.width;
    const y2 = points[next + 1] * imageSize.height;
    const factor = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * factor;
    cy += (y1 + y2) * factor;
  }
  const multiplier = 1 / (6 * area);
  return { x: cx * multiplier, y: cy * multiplier };
}

function formatArea(area: number): string {
  if (area < 100) {
    return `${Math.round(area)} px²`;
  }
  if (area < 1000) {
    return `${Math.round(area / 10) / 10} px²`;
  }
  return `${Math.round(area / 100) / 10} kpx²`;
}

function zoneToFill(zone?: string) {
  if (!zone) return "rgba(30, 64, 175, 0.08)";
  const normalized = zone.trim().toUpperCase();
  const palette: Record<string, string> = {
    A: "rgba(34, 197, 94, 0.18)",
    B: "rgba(2, 132, 199, 0.18)",
    C: "rgba(245, 158, 11, 0.18)",
    D: "rgba(244, 63, 94, 0.18)",
    E: "rgba(99, 102, 241, 0.18)",
  };
  return palette[normalized] ?? "rgba(30, 64, 175, 0.12)";
}

function shapesSignature(items: LocationShape[]): string {
  return JSON.stringify(
    items.map((shape) => ({
      id: shape.id,
      points: shape.points,
      label: shape.label ?? null,
      locationId: shape.locationId ?? null,
      zone: shape.zone ?? null,
    })),
  );
}

function PointerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M6.25 3.75 13.5 10 6.25 16.25 6.25 11.5 3 11.5 3 8.5 6.25 8.5 6.25 3.75Z" fill="currentColor" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 11.5 13.5 16.25" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none">
      <path
        d="m3.75 13.75 9.19-9.19a1.5 1.5 0 0 1 2.12 0l1.44 1.44a1.5 1.5 0 0 1 0 2.12l-9.19 9.19-4.5.5.5-4.5Z"
        fill="currentColor"
        opacity={0.9}
      />
      <path
        d="M12.25 4.75 15.25 7.75"
        stroke="white"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RectangleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="5" width="12" height="10" rx="1.5" />
      <path d="M4 8.5h12M4 11.5h12" strokeLinecap="round" strokeOpacity={0.35} />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none">
      <rect x="7" y="7" width="9" height="9" rx="2" stroke="currentColor" strokeWidth={1.5} />
      <path
        d="M4 13V5C4 3.895 4.895 3 6 3H13"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none">
      <path
        d="M5.5 6.5H14.5L13.9 15.1C13.8 16.2 12.9 17 11.8 17H8.2C7.1 17 6.2 16.2 6.1 15.1L5.5 6.5Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 9.5V13.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M11.5 9.5V13.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M4 6.5H16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path
        d="M7.5 6.5V4.5C7.5 4.1 7.8 3.8 8.2 3.8H11.8C12.2 3.8 12.5 4.1 12.5 4.5V6.5"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function createShapeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `shape-${Math.random().toString(36).slice(2, 10)}`;
}

function getOriginalPoint(event: PointerEvent<SVGSVGElement>, scale: number) {
  const rect = event.currentTarget.getBoundingClientRect();
  const displayX = event.clientX - rect.left;
  const displayY = event.clientY - rect.top;
  return {
    originalX: displayX / scale,
    originalY: displayY / scale,
    displayX,
    displayY,
  };
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}
