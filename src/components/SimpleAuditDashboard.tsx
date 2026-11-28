import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConstructionProject, GpsCoordinate, InputLocationPoint, PostType } from '../types';
import {
  getProjectSettings,
  formatChainage,
  parseChainage,
  calculateDistanceMeters,
  getUnitLabels,
  isAreaUnit,
  isLengthUnit,
} from '../utils/geo';
import { computeMeasurements, roundTo } from '../utils/calculations';
import { StaticMapScope } from '../utils/staticMap';
import { 
  Plus, 
  Minus, 
  Download,
  Settings,
  Building2,
  RotateCcw,
  FileSpreadsheet,
  ChevronDown,
  ChevronsUpDown,
  Save,
  FileText,
  MapPin,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { exportProjectToExcel, exportProjectToPdf } from '../utils/export';

interface SimpleAuditDashboardProps {
  project: ConstructionProject;
  onUpdateProject: (updated: ConstructionProject) => void;
  onPatchProject?: (projectId: string, updater: (latest: ConstructionProject) => ConstructionProject) => void;
  savedProjects: ConstructionProject[];
  onSwitchProject: (p: ConstructionProject) => void;
  onOpenSiteManager: () => void;
  onOpenSettings: () => void;
  onOpenReport?: (scope?: StaticMapScope) => void;
  onCaptureGps?: () => Promise<GpsCoordinate | undefined>;
  currentGps?: { lat: number; lng: number; accuracy?: number };
}

export const SimpleAuditDashboard: React.FC<SimpleAuditDashboardProps> = ({
  project,
  onUpdateProject,
  onPatchProject,
  savedProjects,
  onSwitchProject,
  onOpenSiteManager,
  onOpenSettings,
  onOpenReport,
  onCaptureGps,
  currentGps,
}) => {
  const settings = useMemo(() => getProjectSettings(project), [project]);
  const { items, customItems } = settings;
  const enabledCustomItems = useMemo(() => customItems.filter(c => c.enabled), [customItems]);

  const [bulkAngleQty, setBulkAngleQty] = useState<string>('10');
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>({ toolbar: false });
  const [fullscreenCardId, setFullscreenCardId] = useState<string | null>(null);
  const [auditNotesDraft, setAuditNotesDraft] = useState<string>(project.auditNotes ?? '');

  const rrmSec = project.rrmWalls[0];
  const roadSec = project.roadSections[0];

  const [roadWidthText, setRoadWidthText] = useState(roadSec?.widthEntries?.join(', ') ?? (roadSec?.widthMeters !== undefined ? String(roadSec.widthMeters) : ''));
  const [roadDepthText, setRoadDepthText] = useState(roadSec?.depthEntries?.join(', ') ?? (roadSec?.earthworkCutDepthMeters !== undefined ? String(roadSec.earthworkCutDepthMeters) : ''));
  const [rrmWidthText, setRrmWidthText] = useState(rrmSec?.topWidthEntries?.join(', ') ?? (rrmSec?.topWidthMeters !== undefined ? String(rrmSec.topWidthMeters) : ''));
  const [rrmHeightText, setRrmHeightText] = useState(rrmSec?.heightEntries?.join(', ') ?? (rrmSec?.heightMeters !== undefined ? String(rrmSec.heightMeters) : ''));

  useEffect(() => {
    const rrm = project.rrmWalls[0];
    const road = project.roadSections[0];
    setRoadWidthText(road?.widthEntries?.join(', ') ?? (road?.widthMeters !== undefined ? String(road.widthMeters) : ''));
    setRoadDepthText(road?.depthEntries?.join(', ') ?? (road?.earthworkCutDepthMeters !== undefined ? String(road.earthworkCutDepthMeters) : ''));
    setRrmWidthText(rrm?.topWidthEntries?.join(', ') ?? (rrm?.topWidthMeters !== undefined ? String(rrm.topWidthMeters) : ''));
    setRrmHeightText(rrm?.heightEntries?.join(', ') ?? (rrm?.heightMeters !== undefined ? String(rrm.heightMeters) : ''));
    setFullscreenCardId(null);
    setCollapsedFields({ toolbar: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const draftProjectRef = useRef(project);
  if (draftProjectRef.current.id === project.id) {
    draftProjectRef.current = project;
  }
  const auditNotesDraftRef = useRef(auditNotesDraft);
  auditNotesDraftRef.current = auditNotesDraft;
  const onPatchProjectRef = useRef(onPatchProject);
  onPatchProjectRef.current = onPatchProject;
  const onUpdateProjectRef = useRef(onUpdateProject);
  onUpdateProjectRef.current = onUpdateProject;

  const flushAuditNotes = useCallback(() => {
    const targetProject = draftProjectRef.current;
    const draft = auditNotesDraftRef.current;
    if (draft === (targetProject.auditNotes ?? '')) return;

    if (onPatchProjectRef.current) {
      onPatchProjectRef.current(targetProject.id, (latest) => ({
        ...latest,
        auditNotes: draft,
        updatedAt: Date.now(),
      }));
    } else {
      onUpdateProjectRef.current({
        ...targetProject,
        auditNotes: draft,
        updatedAt: Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    if (draftProjectRef.current.id !== project.id) {
      flushAuditNotes();
      draftProjectRef.current = project;
    }
    setAuditNotesDraft(project.auditNotes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.auditNotes, flushAuditNotes]);

  useEffect(() => {
    const savedValue = project.auditNotes ?? '';
    if (auditNotesDraft === savedValue) return;
    const timer = window.setTimeout(() => {
      flushAuditNotes();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [auditNotesDraft, project.id, project.auditNotes, flushAuditNotes]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushAuditNotes();
      }
    };
    window.addEventListener('pagehide', flushAuditNotes);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushAuditNotes);
      document.removeEventListener('visibilitychange', handleVisibility);
      flushAuditNotes();
    };
  }, [flushAuditNotes]);

  const { lengthUnit, areaUnit, volumeUnit } = useMemo(() => getUnitLabels(settings), [settings]);
  const meshUnitIsArea = isAreaUnit(items.chainLinkMesh.unit);
  const rrmUnitIsLength = isLengthUnit(items.rrmWall.unit);

  const allFieldIds: string[] = [
    ...(items.anglePosts.enabled ? ['angle_post'] : []),
    ...(items.intermediatePosts.enabled ? ['intermediate_post'] : []),
    ...(items.strutPosts.enabled ? ['strut_post'] : []),
    ...(items.gatePosts.enabled ? ['gate_post'] : []),
    ...(items.chainLinkMesh.enabled ? ['chainLinkMesh'] : []),
    ...(items.rrmWall.enabled ? ['rrmWall'] : []),
    ...(items.roadMeasurement.enabled ? ['roadMeasurement'] : []),
    ...(items.sideDrain.enabled ? ['sideDrain'] : []),
    ...enabledCustomItems.map(c => c.id),
    'auditNotes',
  ];

  useEffect(() => {
    if (!fullscreenCardId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenCardId(null);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreenCardId]);

  // Keep all fields collapsed by default except 'toolbar' (Field Measurement Worksheet)
  const isFieldCollapsed = (id: string) => {
    if (id === 'toolbar') {
      return collapsedFields.toolbar === true;
    }
    return collapsedFields[id] !== false;
  };

  const toggleField = (id: string) => {
    const currentlyCollapsed = isFieldCollapsed(id);
    setCollapsedFields(prev => ({ ...prev, [id]: !currentlyCollapsed }));
  };

  const toggleFullScreen = (id: string) => {
    setFullscreenCardId(prev => {
      if (prev === id) return null;
      setCollapsedFields(c => ({ ...c, [id]: false }));
      return id;
    });
  };

  const getCardContainerClass = (id: string, extra = '') =>
    fullscreenCardId === id
      ? 'fixed inset-0 z-[45] bg-white p-5 sm:p-8 overflow-y-auto flex flex-col gap-4 transition-all'
      : `bg-white rounded-xl p-5 border border-slate-200 flex flex-col gap-4 transition-all ${extra}`.trim();

  const allCollapsed = allFieldIds.length > 0 && allFieldIds.every(id => isFieldCollapsed(id));
  const handleToggleAllFields = () => {
    const next: Record<string, boolean> = {};
    const targetState = !allCollapsed;
    allFieldIds.forEach(id => {
      next[id] = targetState;
    });
    setCollapsedFields(prev => ({ ...prev, ...next }));
  };

  const updateCounts = (updates: Partial<ConstructionProject>) => {
    if (onPatchProject) {
      onPatchProject(project.id, (latest) => ({
        ...latest,
        ...updates,
        updatedAt: Date.now(),
      }));
    } else {
      onUpdateProject({
        ...project,
        ...updates,
        updatedAt: Date.now(),
      });
    }
  };

  const lastCaptureRef = useRef<{ fieldKey: string; time: number } | null>(null);
  const captureInFlightRef = useRef<Set<string>>(new Set());

  const captureLocationForInput = useCallback(
    async (fieldKey: string, fieldLabel: string, valueSummary?: string) => {
      const now = Date.now();
      if (
        lastCaptureRef.current &&
        lastCaptureRef.current.fieldKey === fieldKey &&
        now - lastCaptureRef.current.time < 4000
      ) {
        return;
      }
      if (captureInFlightRef.current.has(fieldKey)) return;

      lastCaptureRef.current = { fieldKey, time: now };
      captureInFlightRef.current.add(fieldKey);
      const targetProjectId = project.id;

      try {
        const gps = onCaptureGps
          ? await onCaptureGps()
          : currentGps
          ? { lat: currentGps.lat, lng: currentGps.lng, accuracy: currentGps.accuracy, timestamp: Date.now() }
          : undefined;

        if (!gps) return;

        const applyLocationPatch = (latest: ConstructionProject): ConstructionProject => {
          const capturedAt = gps.timestamp || Date.now();
          const existingPins: InputLocationPoint[] = latest.inputLocations ? [...latest.inputLocations] : [];
          const latestSameIdx = existingPins.reduce(
            (foundIdx, item, idx) => (item.fieldKey === fieldKey ? idx : foundIdx),
            -1
          );

          if (latestSameIdx >= 0) {
            const prevPin = existingPins[latestSameIdx];
            const dist = calculateDistanceMeters(
              prevPin.gps.lat,
              prevPin.gps.lng,
              gps.lat,
              gps.lng
            );
            if (capturedAt - prevPin.capturedAt < 10000 && dist < 2) {
              existingPins[latestSameIdx] = {
                ...prevPin,
                gps,
                capturedAt,
                ...(valueSummary ? { valueSummary } : {}),
              };
            } else {
              existingPins.push({
                id: `pin-${capturedAt}-${Math.random().toString(36).slice(2, 6)}`,
                fieldKey,
                fieldLabel,
                valueSummary,
                gps,
                capturedAt,
              });
            }
          } else {
            existingPins.push({
              id: `pin-${capturedAt}-${Math.random().toString(36).slice(2, 6)}`,
              fieldKey,
              fieldLabel,
              valueSummary,
              gps,
              capturedAt,
            });
          }

          const next: ConstructionProject = {
            ...latest,
            inputLocations: existingPins,
            updatedAt: Date.now(),
            ...(!latest.siteCoordinates
              ? {
                  siteCoordinates: {
                    ...gps,
                    label: latest.location || fieldLabel,
                    source: 'gps' as const,
                  },
                }
              : {}),
          };

          if (fieldKey === 'chainLinkMesh' && next.fenceMeshSegments.length > 0) {
            const segs = [...next.fenceMeshSegments];
            segs[0] = { ...segs[0], gps };
            next.fenceMeshSegments = segs;
          } else if (fieldKey === 'rrmWall' && next.rrmWalls.length > 0) {
            const walls = [...next.rrmWalls];
            walls[0] = { ...walls[0], gps };
            next.rrmWalls = walls;
          } else if (
            (fieldKey === 'roadMeasurement' || fieldKey === 'sideDrain') &&
            next.roadSections.length > 0
          ) {
            const roads = [...next.roadSections];
            roads[0] = { ...roads[0], gps };
            next.roadSections = roads;
          } else if (fieldKey.startsWith('custom:')) {
            const customId = fieldKey.slice('custom:'.length);
            const latestSettings = getProjectSettings(next);
            next.settings = {
              ...latestSettings,
              customItems: latestSettings.customItems.map(c =>
                c.id === customId ? { ...c, gps } : c
              ),
            };
          }

          return next;
        };

        if (onPatchProject) {
          onPatchProject(targetProjectId, applyLocationPatch);
        } else if (project.id === targetProjectId) {
          onUpdateProject(applyLocationPatch(project));
        }
      } finally {
        captureInFlightRef.current.delete(fieldKey);
      }
    },
    [project, onCaptureGps, currentGps, onPatchProject, onUpdateProject]
  );

  const latestInputPinsByField = useMemo(() => {
    const map = new Map<string, InputLocationPoint>();
    const list = project.inputLocations || [];
    for (let i = 0; i < list.length; i++) {
      map.set(list[i].fieldKey, list[i]);
    }
    return map;
  }, [project.inputLocations]);

  const renderCapturedPinHint = (fieldKey: string) => {
    const pin = latestInputPinsByField.get(fieldKey);
    if (!pin) return null;
    return (
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/70 rounded-lg px-2.5 py-1.5 tabular-nums">
        <span className="inline-flex items-center gap-1.5 truncate">
          <MapPin className="w-3 h-3 text-violet-600 shrink-0" />
          <span className="font-medium text-slate-700 truncate">Map pin captured</span>
        </span>
        <span className="font-mono text-slate-700 shrink-0">
          {pin.gps.lat.toFixed(5)}&deg;, {pin.gps.lng.toFixed(5)}&deg;
        </span>
      </div>
    );
  };

  const m = useMemo(() => computeMeasurements(project), [project]);
  const anglePostsCount = m.totalAngle;
  const interPostsCount = m.totalIntermed;
  const strutPostsCount = m.totalStrut;
  const gatePostsCount = m.totalGate;
  const totalEnabledPosts = m.totalPosts;

  const totalMeshLength = m.meshLen;
  const meshWidth = m.meshWidth;
  const meshArea = m.meshArea;

  const rrmHeight = m.rrmHeight;
  const rrmWidth = m.rrmWidth;
  const rrmLen = roundTo(m.rrmLen, 2);
  const totalRrmVol = m.rrmVol;

  const roadLen = m.roadLen;
  const roadChainageStart = m.chainageStart;
  const roadChainageEnd = m.chainageEnd;
  const roadStartGps = roadSec?.startGps;
  const roadEndGps = roadSec?.endGps;
  const roadWidth = m.roadWidth;
  const roadDepth = m.roadDepth;
  const roadArea = m.roadArea;
  const roadVol = m.roadVol;
  const sideDrainLen = m.sideDrainLen;

  const handleAdjustPost = (postType: PostType, delta: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const countToChange = Math.abs(Math.trunc(delta));
    if (countToChange === 0) return;

    let nextPosts = project.fencePosts;
    if (delta > 0) {
      const baseTime = Date.now();
      const added = Array.from({ length: countToChange }, (_, i) => ({
        id: `post-${baseTime}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        postNumber: nextPosts.length + i + 1,
        postType,
        heightMeters: settings.defaultPostHeight,
        gps: currentGps ? { lat: currentGps.lat, lng: currentGps.lng, accuracy: currentGps.accuracy } : undefined,
        createdAt: baseTime,
      }));
      nextPosts = [...nextPosts, ...added];
    } else if (nextPosts.length > 0) {
      let remainingToRemove = countToChange;
      const reversedKept: typeof nextPosts = [];
      for (let i = nextPosts.length - 1; i >= 0; i--) {
        if (remainingToRemove > 0 && nextPosts[i].postType === postType) {
          remainingToRemove -= 1;
        } else {
          reversedKept.push(nextPosts[i]);
        }
      }
      reversedKept.reverse();
      nextPosts = reversedKept;
    }
    updateCounts({ fencePosts: nextPosts });
  };

  const handleSetMesh = (newLen: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const safeLen = roundTo(Math.max(0, newLen), 4);
    const current = [...project.fenceMeshSegments];
    if (current.length === 0) {
      current.push({
        id: `mesh-${Date.now()}`,
        segmentName: 'Main Boundary Span',
        lengthMeters: safeLen,
        meshHeightMeters: settings.defaultMeshHeight,
        meshGauge: '10 Gauge',
        barbedWireStrands: 3,
        hasTensionWire: true,
        gps: currentGps ? { lat: currentGps.lat, lng: currentGps.lng, accuracy: currentGps.accuracy, timestamp: Date.now() } : undefined,
        createdAt: Date.now(),
      });
    } else {
      current[0] = { ...current[0], lengthMeters: safeLen };
      if (current.length > 1) {
        for (let i = 1; i < current.length; i++) {
          current[i] = { ...current[i], lengthMeters: 0 };
        }
      }
    }
    updateCounts({ fenceMeshSegments: current });
  };

  const handleSetMeshWidth = (newWidth: number) => {
    const safeW = roundTo(Math.max(0, Number.isFinite(newWidth) ? newWidth : 0), 4);
    const current = [...project.fenceMeshSegments];
    if (current.length === 0) {
      current.push({
        id: `mesh-${Date.now()}`,
        segmentName: 'Main Boundary Span',
        lengthMeters: 0,
        meshHeightMeters: safeW,
        meshGauge: '10 Gauge',
        barbedWireStrands: 3,
        hasTensionWire: true,
        gps: currentGps ? { lat: currentGps.lat, lng: currentGps.lng, accuracy: currentGps.accuracy, timestamp: Date.now() } : undefined,
        createdAt: Date.now(),
      });
    } else {
      current[0] = { ...current[0], meshHeightMeters: safeW };
    }
    updateCounts({ fenceMeshSegments: current });
  };

  const ensureRrmWall = () => {
    if (project.rrmWalls.length > 0) return [...project.rrmWalls];
    return [{
      id: `rrm-${Date.now()}`,
      sectionName: 'Foundation Plinth Wall',
      lengthMeters: 0,
      heightMeters: settings.defaultRrmHeight || 0.6,
      topWidthMeters: 0.38,
      bottomWidthMeters: 0.38,
      gps: currentGps ? { lat: currentGps.lat, lng: currentGps.lng, accuracy: currentGps.accuracy, timestamp: Date.now() } : undefined,
      createdAt: Date.now(),
    }];
  };

  const handleSetRrmDimensions = (updates: {
    lengthMeters?: number;
    widthMeters?: number;
    heightMeters?: number;
  }) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const current = ensureRrmWall();
    const safeWidth = updates.widthMeters !== undefined ? roundTo(Math.max(0, updates.widthMeters), 4) : undefined;
    const safeHeight = updates.heightMeters !== undefined ? roundTo(Math.max(0, updates.heightMeters), 4) : undefined;
    if (safeWidth !== undefined) setRrmWidthText(String(safeWidth));
    if (safeHeight !== undefined) setRrmHeightText(String(safeHeight));
    current[0] = {
      ...current[0],
      ...(updates.lengthMeters !== undefined ? { lengthMeters: roundTo(Math.max(0, updates.lengthMeters), 4) } : {}),
      ...(safeWidth !== undefined
        ? {
            topWidthMeters: safeWidth,
            bottomWidthMeters: safeWidth,
            topWidthEntries: undefined,
            bottomWidthEntries: undefined,
          }
        : {}),
      ...(safeHeight !== undefined ? { heightMeters: safeHeight, heightEntries: undefined } : {}),
    };
    if (updates.lengthMeters !== undefined && current.length > 1) {
      for (let i = 1; i < current.length; i++) {
        current[i] = { ...current[i], lengthMeters: 0 };
      }
    }
    updateCounts({ rrmWalls: current });
  };

  const ensureRoadSection = () => {
    if (project.roadSections.length > 0) return [...project.roadSections];
    return [{
      id: `road-${Date.now()}`,
      sectionName: 'Access Road Alignment',
      chainageStart: '0+000',
      chainageEnd: '0+000',
      lengthMeters: 0,
      widthMeters: settings.defaultRoadWidth,
      subBaseThicknessMm: 150,
      wmmThicknessMm: 200,
      primeCoatRequired: true,
      acThicknessMm: 50,
      earthworkCutDepthMeters: 0,
      sideDrainLengthMeters: 0,
      gps: currentGps ? { lat: currentGps.lat, lng: currentGps.lng, accuracy: currentGps.accuracy, timestamp: Date.now() } : undefined,
      createdAt: Date.now(),
    }];
  };

  const handleSetRoadLen = (newLen: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const safeLen = roundTo(Math.max(0, newLen), 4);
    const current = ensureRoadSection();
    const startNum = parseChainage(current[0].chainageStart) ?? 0;
    current[0] = {
      ...current[0],
      lengthMeters: safeLen,
      chainageEnd: formatChainage(startNum + safeLen),
    };
    if (current.length > 1) {
      for (let i = 1; i < current.length; i++) {
        current[i] = { ...current[i], lengthMeters: 0 };
      }
    }
    updateCounts({ roadSections: current });
  };

  const handleSetRoadChainageStart = (val: string) => {
    const current = ensureRoadSection();
    const startNum = parseChainage(val);
    let nextLen = current[0].lengthMeters;
    let nextEnd = current[0].chainageEnd;

    if (startNum !== null) {
      if (current[0].lengthMeters > 0) {
        nextEnd = formatChainage(startNum + current[0].lengthMeters);
      } else {
        const endNum = parseChainage(current[0].chainageEnd);
        if (endNum !== null && endNum >= startNum) {
          nextLen = Number((endNum - startNum).toFixed(2));
        } else {
          nextEnd = formatChainage(startNum);
        }
      }
    }

    current[0] = {
      ...current[0],
      chainageStart: val,
      chainageEnd: nextEnd,
      lengthMeters: nextLen,
    };
    if (current.length > 1) {
      for (let i = 1; i < current.length; i++) {
        current[i] = { ...current[i], lengthMeters: 0 };
      }
    }
    updateCounts({ roadSections: current });
  };

  const handleSetRoadChainageEnd = (val: string) => {
    const current = ensureRoadSection();
    const endNum = parseChainage(val);
    const startNum = parseChainage(current[0].chainageStart) ?? 0;
    let nextLen = current[0].lengthMeters;

    if (endNum !== null && endNum >= startNum) {
      nextLen = Number((endNum - startNum).toFixed(2));
    }

    current[0] = {
      ...current[0],
      chainageEnd: val,
      lengthMeters: nextLen,
    };
    if (current.length > 1) {
      for (let i = 1; i < current.length; i++) {
        current[i] = { ...current[i], lengthMeters: 0 };
      }
    }
    updateCounts({ roadSections: current });
  };

  const handleSetRoadWidth = (w: number) => {
    const safeW = roundTo(Math.max(0, Number.isFinite(w) ? w : 0), 4);
    setRoadWidthText(String(safeW));
    const current = ensureRoadSection();
    current[0] = { ...current[0], widthMeters: safeW, widthEntries: undefined };
    updateCounts({ roadSections: current });
  };

  const handleSetRoadDepth = (d: number) => {
    const safeD = roundTo(Math.max(0, Number.isFinite(d) ? d : 0), 4);
    setRoadDepthText(String(safeD));
    const current = ensureRoadSection();
    current[0] = { ...current[0], earthworkCutDepthMeters: safeD, depthEntries: undefined };
    updateCounts({ roadSections: current });
  };

  const handleSetRoadWidthEntries = (inputStr: string) => {
    setRoadWidthText(inputStr);
    const parsed = inputStr
      .split(/[,\s]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n) && n >= 0);
    const avg = parsed.length > 0 ? parsed.reduce((a, b) => a + b, 0) / parsed.length : settings.defaultRoadWidth;
    const current = ensureRoadSection();
    current[0] = {
      ...current[0],
      widthMeters: Number(avg.toFixed(2)),
      widthEntries: parsed.length > 0 ? parsed : undefined,
    };
    updateCounts({ roadSections: current });
  };

  const handleSetRoadDepthEntries = (inputStr: string) => {
    setRoadDepthText(inputStr);
    const parsed = inputStr
      .split(/[,\s]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n) && n >= 0);
    const avg = parsed.length > 0 ? parsed.reduce((a, b) => a + b, 0) / parsed.length : 0;
    const current = ensureRoadSection();
    current[0] = {
      ...current[0],
      earthworkCutDepthMeters: Number(avg.toFixed(3)),
      depthEntries: parsed.length > 0 ? parsed : undefined,
    };
    updateCounts({ roadSections: current });
  };

  const handleSetRrmWidthEntries = (inputStr: string) => {
    setRrmWidthText(inputStr);
    const parsed = inputStr
      .split(/[,\s]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n) && n >= 0);
    const avg = parsed.length > 0 ? parsed.reduce((a, b) => a + b, 0) / parsed.length : 0.38;
    const current = ensureRrmWall();
    current[0] = {
      ...current[0],
      topWidthMeters: Number(avg.toFixed(2)),
      bottomWidthMeters: Number(avg.toFixed(2)),
      topWidthEntries: parsed.length > 0 ? parsed : undefined,
      bottomWidthEntries: parsed.length > 0 ? parsed : undefined,
    };
    updateCounts({ rrmWalls: current });
  };

  const handleSetRrmHeightEntries = (inputStr: string) => {
    setRrmHeightText(inputStr);
    const parsed = inputStr
      .split(/[,\s]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n) && n >= 0);
    const avg = parsed.length > 0 ? parsed.reduce((a, b) => a + b, 0) / parsed.length : settings.defaultRrmHeight;
    const current = ensureRrmWall();
    current[0] = {
      ...current[0],
      heightMeters: Number(avg.toFixed(2)),
      heightEntries: parsed.length > 0 ? parsed : undefined,
    };
    updateCounts({ rrmWalls: current });
  };

  const handleCaptureRoadGps = (which: 'start' | 'end') => {
    if (!currentGps) return;
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const current = ensureRoadSection();
    const coord = {
      lat: currentGps.lat,
      lng: currentGps.lng,
      accuracy: currentGps.accuracy,
      timestamp: Date.now(),
    };
    current[0] = {
      ...current[0],
      ...(which === 'start' ? { startGps: coord } : { endGps: coord }),
    };
    updateCounts({ roadSections: current });
  };

  const handleClearRoadGps = (which: 'start' | 'end') => {
    const current = ensureRoadSection();
    current[0] = {
      ...current[0],
      ...(which === 'start' ? { startGps: undefined } : { endGps: undefined }),
    };
    updateCounts({ roadSections: current });
  };

  const handleSetSideDrain = (newLen: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const safeLen = roundTo(Math.max(0, newLen), 4);
    const current = ensureRoadSection();
    current[0] = { ...current[0], sideDrainLengthMeters: safeLen };
    if (current.length > 1) {
      for (let i = 1; i < current.length; i++) {
        current[i] = { ...current[i], sideDrainLengthMeters: 0 };
      }
    }
    updateCounts({ roadSections: current });
  };

  const handleSetCustomItemQty = (itemId: string, newQty: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const safeQty = roundTo(Math.max(0, newQty), 4);
    const updatedCustom = settings.customItems.map(c =>
      c.id === itemId ? { ...c, quantity: safeQty } : c
    );
    updateCounts({
      settings: {
        ...settings,
        customItems: updatedCustom,
      },
    });
  };

  const handleSaveAuditNotes = (nextNotes = auditNotesDraft) => {
    const savedValue = project.auditNotes ?? '';
    if (nextNotes === savedValue) return;
    updateCounts({ auditNotes: nextNotes });
  };

  const handleSaveRecordedData = () => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    updateCounts({ auditNotes: auditNotesDraft });
  };

  const renderAuditNotesCard = () => {
    const collapsed = isFieldCollapsed('auditNotes');
    const savedNotes = project.auditNotes ?? '';
    const hasUnsavedChanges = auditNotesDraft !== savedNotes;
    const trimmed = auditNotesDraft.trim();
    const summaryText = trimmed
      ? trimmed.length > 90
        ? `${trimmed.slice(0, 90)}…`
        : trimmed
      : 'No audit notes recorded';

    return (
      <div className={getCardContainerClass('auditNotes', 'md:col-span-2')}>
        {renderCardHeader(
          'auditNotes',
          'Audit Notes',
          'notes',
          summaryText,
          'Record site conditions, weather, material quality observations, or field discrepancies.'
        )}

        {!collapsed && (
          <div className="space-y-3 pt-1">
            <div className="relative">
              <textarea
                rows={3}
                value={auditNotesDraft}
                onFocus={() => void captureLocationForInput('auditNotes', 'Audit Notes', auditNotesDraft.trim().slice(0, 40) || undefined)}
                onClick={() => void captureLocationForInput('auditNotes', 'Audit Notes', auditNotesDraft.trim().slice(0, 40) || undefined)}
                onChange={(e) => setAuditNotesDraft(e.target.value)}
                onBlur={() => handleSaveAuditNotes(auditNotesDraft)}
                placeholder="Enter field observations, site conditions, access issues, or notes for the audit record..."
                aria-label="Audit Notes"
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition resize-y min-h-[104px]"
              />
            </div>
            {renderCapturedPinHint('auditNotes')}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{auditNotesDraft.length} characters</span>
                <span aria-hidden="true">&middot;</span>
                <span className={hasUnsavedChanges ? 'font-semibold text-amber-700' : 'text-emerald-700 font-medium'}>
                  {hasUnsavedChanges ? 'Unsaved changes' : savedNotes ? 'Saved with project' : 'Ready'}
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {auditNotesDraft.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuditNotesDraft('');
                      if (savedNotes !== '') {
                        updateCounts({ auditNotes: '' });
                      }
                    }}
                    className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl transition inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                    title="Clear notes"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSaveAuditNotes(auditNotesDraft)}
                  disabled={!hasUnsavedChanges}
                  className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 flex-1 sm:flex-none"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Notes</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const anyStandardEnabled = Object.values(items).some(i => i.enabled);
  const anyEnabled = anyStandardEnabled || enabledCustomItems.length > 0;

  const inputClass =
    'w-full px-3 py-2 min-h-[42px] bg-white border border-slate-200 rounded-lg text-base sm:text-sm font-semibold text-slate-900 tabular-nums focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition';

  const renderCardHeader = (
    fieldId: string,
    title: string,
    unitLabel: string,
    collapsedSummary: string,
    description: string
  ) => {
    const collapsed = isFieldCollapsed(fieldId);
    const isFullscreen = fullscreenCardId === fieldId;
    return (
      <div className="w-full flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => toggleField(fieldId)}
          aria-expanded={!collapsed}
          className="min-w-0 flex-1 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xl"
        >
          <div className="flex items-baseline flex-wrap gap-x-2.5 gap-y-0.5">
            <h3 className="font-bold text-slate-900 text-base group-hover:text-slate-700 transition">
              {title}
            </h3>
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Unit &middot; <span className="font-mono text-slate-700">{unitLabel}</span>
            </span>
          </div>
          {collapsed ? (
            <p className="text-xs font-semibold text-slate-700 mt-1 tabular-nums truncate">
              {collapsedSummary}
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
          )}
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
          <button
            type="button"
            onClick={() => toggleFullScreen(fieldId)}
            aria-label={isFullscreen ? `Exit full screen for ${title}` : `Extend ${title} to full screen`}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Restore card size (Esc)' : 'Extend to full screen'}
            className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              isFullscreen
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => toggleField(fieldId)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            title={collapsed ? 'Expand card' : 'Collapse card'}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}
            />
          </button>
        </div>
      </div>
    );
  };

  const renderPostCounterCard = (
    postType: PostType,
    title: string,
    description: string,
    count: number,
    unit: string,
    enableBulk = false
  ) => {
    const collapsed = isFieldCollapsed(postType);
    return (
      <div
        key={postType}
        className={getCardContainerClass(postType)}
      >
        {renderCardHeader(postType, title, unit, `Counted: ${count} ${unit}`, description)}

        {!collapsed && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between bg-slate-50/90 p-3.5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  void captureLocationForInput(postType, title, `${Math.max(0, count - 1)} ${unit}`);
                  handleAdjustPost(postType, -1);
                }}
                aria-label={`Decrease ${title}`}
                className="w-12 h-12 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition duration-150 flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="text-center px-3">
                <div className="text-4xl font-extrabold text-slate-900 tabular-nums tracking-tight">{count}</div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">{unit} counted</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void captureLocationForInput(postType, title, `${count + 1} ${unit}`);
                  handleAdjustPost(postType, 1);
                }}
                aria-label={`Increase ${title}`}
                className="w-12 h-12 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl shadow-xs transition duration-150 flex items-center justify-center active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {enableBulk && (
              <div className="space-y-2.5 pt-1">
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 25, 50].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => {
                        void captureLocationForInput(postType, title, `${count + qty} ${unit}`);
                        handleAdjustPost(postType, qty);
                      }}
                      className="min-h-[40px] py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 text-xs font-semibold rounded-lg tabular-nums active:scale-[0.97] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                    >
                      +{qty}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={bulkAngleQty}
                    onFocus={() => void captureLocationForInput(postType, `${title} (Bulk Qty)`, `${count} ${unit}`)}
                    onClick={() => void captureLocationForInput(postType, `${title} (Bulk Qty)`, `${count} ${unit}`)}
                    onChange={(e) => setBulkAngleQty(e.target.value)}
                    placeholder="Qty"
                    aria-label="Bulk post quantity"
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const qty = parseInt(bulkAngleQty, 10);
                      if (qty > 0) {
                        void captureLocationForInput(postType, title, `${count + qty} ${unit}`);
                        handleAdjustPost(postType, qty);
                      }
                    }}
                    className="min-h-[42px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition duration-150 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Bulk</span>
                  </button>
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={() => handleAdjustPost(postType, -count)}
                      className="min-h-[44px] min-w-[44px] p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl transition flex items-center justify-center shrink-0"
                      title="Reset to 0"
                      aria-label={`Reset ${title} to 0`}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {renderCapturedPinHint(postType)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-4 max-w-5xl mx-auto">
      
      {/* Field Workstation Toolbar Card */}
      <div
        className={
          fullscreenCardId === 'toolbar'
            ? 'fixed inset-0 z-[45] bg-white p-5 sm:p-8 overflow-y-auto space-y-4 transition-all'
            : 'bg-white rounded-xl p-5 border border-slate-200 space-y-4 transition-all'
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => toggleField('toolbar')}
              aria-expanded={!isFieldCollapsed('toolbar')}
              className="min-w-0 flex-1 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded-lg"
            >
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate group-hover:text-slate-700 transition">
                Field Measurement Worksheet
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
                <span className="font-medium text-slate-700">{project.name}</span>
                <span aria-hidden="true">&middot;</span>
                <span className="capitalize">{settings.unitSystem} units</span>
                <span aria-hidden="true">&middot;</span>
                <span className="tabular-nums text-slate-600">
                  {totalEnabledPosts} posts &middot; {totalMeshLength} {items.chainLinkMesh.unit} mesh &middot; {roadLen} {items.roadMeasurement.unit} road
                </span>
              </div>
            </button>

            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <button
                type="button"
                onClick={() => toggleFullScreen('toolbar')}
                aria-label={fullscreenCardId === 'toolbar' ? 'Exit full screen for Field Measurement Worksheet' : 'Extend Field Measurement Worksheet to full screen'}
                aria-pressed={fullscreenCardId === 'toolbar'}
                title={fullscreenCardId === 'toolbar' ? 'Restore card size (Esc)' : 'Extend to full screen'}
                className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                  fullscreenCardId === 'toolbar'
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {fullscreenCardId === 'toolbar' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => toggleField('toolbar')}
                aria-expanded={!isFieldCollapsed('toolbar')}
                aria-label={isFieldCollapsed('toolbar') ? 'Expand Field Measurement Worksheet' : 'Collapse Field Measurement Worksheet'}
                title={isFieldCollapsed('toolbar') ? 'Expand card' : 'Collapse card'}
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isFieldCollapsed('toolbar') ? '-rotate-90' : 'rotate-0'}`}
                />
              </button>
            </div>
          </div>

          {!isFieldCollapsed('toolbar') && (
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 w-full lg:w-auto">
                <select
                  value={project.id}
                  onChange={(e) => {
                    const found = savedProjects.find(p => p.id === e.target.value);
                    if (found) onSwitchProject(found);
                  }}
                  aria-label="Select site"
                  className="flex-1 sm:flex-none min-w-0 min-h-[40px] px-3 py-1.5 bg-slate-50 text-slate-800 text-sm sm:text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:border-slate-900"
                >
                  {Array.from(new Map(savedProjects.map((p) => [p.id, p])).values()).map(p => (
                    <option key={p.id} value={p.id}>Site: {p.name}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={onOpenSiteManager}
                  className="min-h-[40px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sites</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="min-h-[40px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Units &amp; Items</span>
                </button>

                {anyEnabled && (
                  <button
                    type="button"
                    onClick={handleToggleAllFields}
                    className="min-h-[40px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                    title={allCollapsed ? 'Expand all measurement fields' : 'Collapse all measurement fields'}
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                    <span>{allCollapsed ? 'Expand All' : 'Collapse All'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => exportProjectToExcel(project)}
                  className="min-h-[40px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  title="Export Excel CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => (onOpenReport ? onOpenReport('all') : exportProjectToPdf(project, currentGps))}
                  className="min-h-[40px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>PDF Report</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveRecordedData}
                  className="col-span-2 sm:col-span-1 min-h-[40px] px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.98]"
                  title="Save all recorded measurements and notes"
                >
                  <Save className="w-3.5 h-3.5 text-amber-400" />
                  <span>Save Data</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {!anyEnabled ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/90 space-y-4">
          <p className="text-slate-600 text-sm font-medium">
            No measurement items are currently enabled for this site.
          </p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[44px] px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            <span>Configure Necessary Items &amp; Units</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          
          {items.anglePosts.enabled && renderPostCounterCard(
            'angle_post',
            'Angle Post',
            'Count single posts or add a bulk batch.',
            anglePostsCount,
            items.anglePosts.unit,
            true
          )}

          {items.intermediatePosts.enabled && renderPostCounterCard(
            'intermediate_post',
            'Intermediate Posts',
            'Tap to count intermediate line posts along fence spans.',
            interPostsCount,
            items.intermediatePosts.unit
          )}

          {items.strutPosts.enabled && renderPostCounterCard(
            'strut_post',
            'Strut Posts',
            'Tap to count diagonal support strut posts at corners and ends.',
            strutPostsCount,
            items.strutPosts.unit
          )}

          {items.gatePosts.enabled && renderPostCounterCard(
            'gate_post',
            'Gate Posts',
            'Tap to count entry and exit gate posts.',
            gatePostsCount,
            items.gatePosts.unit
          )}

          {/* Chain-Link Mesh */}
          {items.chainLinkMesh.enabled && (
            <div className={getCardContainerClass('chainLinkMesh')}>
              {renderCardHeader(
                'chainLinkMesh',
                'Chain-Link Mesh',
                items.chainLinkMesh.unit,
                `Length: ${totalMeshLength.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${items.chainLinkMesh.unit} · Width: ${meshWidth}${lengthUnit} · Area: ${meshArea.toFixed(2)} ${areaUnit}`,
                'Enter mesh length and width/height, or tap quick length buttons.'
              )}

              {!isFieldCollapsed('chainLinkMesh') && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between bg-slate-50/90 p-4 rounded-xl">
                    <div className="text-center w-full">
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                        {meshUnitIsArea
                          ? meshArea.toFixed(2)
                          : totalMeshLength.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                        <span className="text-base font-medium text-slate-500">{items.chainLinkMesh.unit}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-1 tabular-nums">
                        Length: {totalMeshLength.toLocaleString(undefined, { maximumFractionDigits: 2 })} {meshUnitIsArea ? lengthUnit : items.chainLinkMesh.unit} &middot; Width: {meshWidth}{lengthUnit} &middot; Area: {meshArea.toFixed(2)} {areaUnit}
                      </div>
                    </div>
                    {totalMeshLength > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSetMesh(0)}
                        className="min-h-[44px] min-w-[44px] p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition flex items-center justify-center flex-shrink-0"
                        title="Reset length to 0"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Length ({meshUnitIsArea ? lengthUnit : items.chainLinkMesh.unit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        value={totalMeshLength}
                        onFocus={() => void captureLocationForInput('chainLinkMesh', 'Chain-Link Mesh Length', `${totalMeshLength} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('chainLinkMesh', 'Chain-Link Mesh Length', `${totalMeshLength} ${lengthUnit}`)}
                        onChange={(e) => handleSetMesh(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Width / Height ({lengthUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0"
                        value={meshWidth}
                        onFocus={() => void captureLocationForInput('chainLinkMesh', 'Chain-Link Mesh Width', `${meshWidth} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('chainLinkMesh', 'Chain-Link Mesh Width', `${meshWidth} ${lengthUnit}`)}
                        onChange={(e) => handleSetMeshWidth(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {(items.chainLinkMesh.quickSteps || [1, 5, 10, 50]).slice(0, 4).map((step, idx) => (
                      <button
                        key={`${step}-${idx}`}
                        type="button"
                        onClick={() => {
                          void captureLocationForInput('chainLinkMesh', 'Chain-Link Mesh Length', `${totalMeshLength + step} ${lengthUnit}`);
                          handleSetMesh(totalMeshLength + step);
                        }}
                        className="min-h-[40px] py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 text-xs font-semibold rounded-lg tabular-nums active:scale-[0.97] transition duration-150"
                      >
                        +{step}{meshUnitIsArea ? lengthUnit : items.chainLinkMesh.unit}
                      </button>
                    ))}
                  </div>
                  {renderCapturedPinHint('chainLinkMesh')}
                </div>
              )}
            </div>
          )}

          {/* RRM Foundation Wall (Length, Width & Height) */}
          {items.rrmWall.enabled && (
            <div className={getCardContainerClass('rrmWall')}>
              {renderCardHeader(
                'rrmWall',
                'RMM wall',
                items.rrmWall.unit,
                `${rrmUnitIsLength ? `Length: ${rrmLen}` : `Volume: ${totalRrmVol.toFixed(2)}`} ${items.rrmWall.unit} · L: ${rrmLen}${lengthUnit} × W: ${rrmWidth}${lengthUnit} × H: ${rrmHeight}${lengthUnit}`,
                'Enter length, width, and height to compute wall masonry volume.'
              )}

              {!isFieldCollapsed('rrmWall') && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between bg-slate-50/90 p-4 rounded-xl">
                    <div className="text-center w-full">
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                        {rrmUnitIsLength ? rrmLen.toFixed(2) : totalRrmVol.toFixed(2)}{' '}
                        <span className="text-base font-medium text-slate-500">{items.rrmWall.unit}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-1 tabular-nums">
                        L: {rrmLen}{lengthUnit} &middot; W: {rrmWidth}{lengthUnit} &middot; H: {rrmHeight}{lengthUnit} &middot; Vol: {totalRrmVol.toFixed(2)} {volumeUnit}
                      </div>
                    </div>
                    {rrmLen > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSetRrmDimensions({ lengthMeters: 0 })}
                        className="min-h-[44px] min-w-[44px] p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition flex items-center justify-center flex-shrink-0"
                        title="Reset length to 0"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 truncate">
                        Length ({lengthUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        value={rrmLen}
                        onFocus={() => void captureLocationForInput('rrmWall', 'RMM Wall Length', `${rrmLen} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('rrmWall', 'RMM Wall Length', `${rrmLen} ${lengthUnit}`)}
                        onChange={(e) => handleSetRrmDimensions({ lengthMeters: parseFloat(e.target.value) || 0 })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 truncate">
                        Width ({lengthUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        min="0"
                        value={rrmWidth}
                        onFocus={() => void captureLocationForInput('rrmWall', 'RMM Wall Width', `${rrmWidth} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('rrmWall', 'RMM Wall Width', `${rrmWidth} ${lengthUnit}`)}
                        onChange={(e) => handleSetRrmDimensions({ widthMeters: parseFloat(e.target.value) || 0 })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1 truncate">
                        Height ({lengthUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        min="0"
                        value={rrmHeight}
                        onFocus={() => void captureLocationForInput('rrmWall', 'RMM Wall Height', `${rrmHeight} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('rrmWall', 'RMM Wall Height', `${rrmHeight} ${lengthUnit}`)}
                        onChange={(e) => handleSetRrmDimensions({ heightMeters: parseFloat(e.target.value) || 0 })}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(items.rrmWall.quickSteps || [1, 5, 10]).slice(0, 4).map((step, idx) => (
                      <button
                        key={`${step}-${idx}`}
                        type="button"
                        onClick={() => {
                          void captureLocationForInput('rrmWall', 'RMM Wall Length', `${rrmLen + step} ${lengthUnit}`);
                          handleSetRrmDimensions({ lengthMeters: rrmLen + step });
                        }}
                        className="min-h-[40px] py-2 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 text-xs font-semibold rounded-lg tabular-nums whitespace-nowrap active:scale-[0.97] transition duration-150"
                      >
                        +{step}{lengthUnit}<span className="hidden sm:inline"> Length</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Width Multi-Samples ({lengthUnit}) <span className="text-[10px] text-slate-400 font-normal">(Comma-separated)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0.38, 0.40, 0.36"
                        value={rrmWidthText}
                        onFocus={() => void captureLocationForInput('rrmWall', 'RMM Wall Width Samples', rrmWidthText || `${rrmWidth} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('rrmWall', 'RMM Wall Width Samples', rrmWidthText || `${rrmWidth} ${lengthUnit}`)}
                        onChange={(e) => handleSetRrmWidthEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                      {rrmSec?.topWidthEntries && rrmSec.topWidthEntries.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                          {rrmSec.topWidthEntries.length} sample{rrmSec.topWidthEntries.length === 1 ? '' : 's'} &middot; Avg: <span className="font-semibold text-slate-800">{rrmWidth} {lengthUnit}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Height Multi-Samples ({lengthUnit}) <span className="text-[10px] text-slate-400 font-normal">(Comma-separated)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0.6, 0.65, 0.58"
                        value={rrmHeightText}
                        onFocus={() => void captureLocationForInput('rrmWall', 'RMM Wall Height Samples', rrmHeightText || `${rrmHeight} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('rrmWall', 'RMM Wall Height Samples', rrmHeightText || `${rrmHeight} ${lengthUnit}`)}
                        onChange={(e) => handleSetRrmHeightEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                      {rrmSec?.heightEntries && rrmSec.heightEntries.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                          {rrmSec.heightEntries.length} sample{rrmSec.heightEntries.length === 1 ? '' : 's'} &middot; Avg: <span className="font-semibold text-slate-800">{rrmHeight} {lengthUnit}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {renderCapturedPinHint('rrmWall')}
                </div>
              )}
            </div>
          )}

          {/* Road Measurement (Length, Breadth/Width & Depth) */}
          {items.roadMeasurement.enabled && (
            <div className={getCardContainerClass('roadMeasurement', 'md:col-span-2')}>
              {renderCardHeader(
                'roadMeasurement',
                'Road Measurement',
                items.roadMeasurement.unit,
                `Ch. ${roadChainageStart || '0+000'} – ${roadChainageEnd || formatChainage(roadLen)} · Length: ${roadLen} ${items.roadMeasurement.unit} · Width: ${roadWidth}${lengthUnit} · Area: ${roadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${areaUnit}`,
                'Enter road chainage (start/end), length, breadth/width, and optional depth. Surface area and volume update live.'
              )}

              {!isFieldCollapsed('roadMeasurement') && (
                <div className="space-y-4 pt-1">
                  <div className="bg-slate-50/90 p-3.5 sm:p-4 rounded-xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
                      <span className="text-xs font-medium text-slate-500">Chainage Range</span>
                      <span className="text-sm sm:text-base font-bold font-mono text-slate-900 tabular-nums">
                        {roadChainageStart || '0+000'} &rarr; {roadChainageEnd || formatChainage(roadLen)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-center">
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Length</div>
                        <div className="text-xl sm:text-3xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                          {roadLen} <span className="text-xs sm:text-sm font-medium text-slate-500">{items.roadMeasurement.unit}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Breadth / Width</div>
                        <div className="text-xl sm:text-3xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                          {roadWidth} <span className="text-xs sm:text-sm font-medium text-slate-500">{lengthUnit}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Total Area</div>
                        <div className="text-xl sm:text-3xl font-extrabold text-emerald-600 tabular-nums mt-0.5">
                          {roadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-xs sm:text-sm font-medium text-slate-500">{areaUnit}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Volume</div>
                        <div className="text-xl sm:text-3xl font-extrabold text-indigo-600 tabular-nums mt-0.5">
                          {roadVol.toFixed(2)} <span className="text-xs sm:text-sm font-medium text-slate-500">{volumeUnit}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Chainage Start
                      </label>
                      <input
                        type="text"
                        inputMode="text"
                        placeholder="0+000"
                        value={roadChainageStart}
                        onFocus={() => void captureLocationForInput('roadMeasurement', 'Road Chainage Start', roadChainageStart)}
                        onClick={() => void captureLocationForInput('roadMeasurement', 'Road Chainage Start', roadChainageStart)}
                        onChange={(e) => handleSetRoadChainageStart(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Chainage End
                      </label>
                      <input
                        type="text"
                        inputMode="text"
                        placeholder="0+250"
                        value={roadChainageEnd}
                        onFocus={() => void captureLocationForInput('roadMeasurement', 'Road Chainage End', roadChainageEnd)}
                        onClick={() => void captureLocationForInput('roadMeasurement', 'Road Chainage End', roadChainageEnd)}
                        onChange={(e) => handleSetRoadChainageEnd(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Length ({items.roadMeasurement.unit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="1"
                        min="0"
                        value={roadLen}
                        onFocus={() => void captureLocationForInput('roadMeasurement', 'Road Length', `${roadLen} ${items.roadMeasurement.unit}`)}
                        onClick={() => void captureLocationForInput('roadMeasurement', 'Road Length', `${roadLen} ${items.roadMeasurement.unit}`)}
                        onChange={(e) => handleSetRoadLen(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Breadth / Width ({lengthUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        value={roadWidth}
                        onFocus={() => void captureLocationForInput('roadMeasurement', 'Road Width', `${roadWidth} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('roadMeasurement', 'Road Width', `${roadWidth} ${lengthUnit}`)}
                        onChange={(e) => handleSetRoadWidth(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Depth / Thickness ({lengthUnit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        min="0"
                        value={roadDepth}
                        onFocus={() => void captureLocationForInput('roadMeasurement', 'Road Depth', `${roadDepth} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('roadMeasurement', 'Road Depth', `${roadDepth} ${lengthUnit}`)}
                        onChange={(e) => handleSetRoadDepth(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {(items.roadMeasurement.quickSteps || [10, 50, 100, 500]).slice(0, 4).map((step, idx) => (
                      <button
                        key={`${step}-${idx}`}
                        type="button"
                        onClick={() => {
                          void captureLocationForInput('roadMeasurement', 'Road Length', `${roadLen + step} ${items.roadMeasurement.unit}`);
                          handleSetRoadLen(roadLen + step);
                        }}
                        className="min-h-[40px] py-2 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 text-xs font-semibold rounded-lg tabular-nums whitespace-nowrap active:scale-[0.97] transition duration-150"
                      >
                        +{step}{items.roadMeasurement.unit}<span className="hidden sm:inline"> Length</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Width Multi-Samples ({lengthUnit}) <span className="text-[10px] text-slate-400 font-normal">(Comma-separated chainage widths)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 3.5, 3.6, 3.4"
                        value={roadWidthText}
                        onFocus={() => void captureLocationForInput('roadMeasurement', 'Road Width Samples', roadWidthText || `${roadWidth} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('roadMeasurement', 'Road Width Samples', roadWidthText || `${roadWidth} ${lengthUnit}`)}
                        onChange={(e) => handleSetRoadWidthEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                      {roadSec?.widthEntries && roadSec.widthEntries.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                          {roadSec.widthEntries.length} sample{roadSec.widthEntries.length === 1 ? '' : 's'} &middot; Avg: <span className="font-semibold text-slate-800">{roadWidth} {lengthUnit}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Depth Multi-Samples ({lengthUnit}) <span className="text-[10px] text-slate-400 font-normal">(Comma-separated excavation depths)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0.3, 0.35, 0.28"
                        value={roadDepthText}
                        onFocus={() => void captureLocationForInput('roadMeasurement', 'Road Depth Samples', roadDepthText || `${roadDepth} ${lengthUnit}`)}
                        onClick={() => void captureLocationForInput('roadMeasurement', 'Road Depth Samples', roadDepthText || `${roadDepth} ${lengthUnit}`)}
                        onChange={(e) => handleSetRoadDepthEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                      {roadSec?.depthEntries && roadSec.depthEntries.length > 0 && (
                        <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                          {roadSec.depthEntries.length} sample{roadSec.depthEntries.length === 1 ? '' : 's'} &middot; Avg: <span className="font-semibold text-slate-800">{roadDepth} {lengthUnit}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  {renderCapturedPinHint('roadMeasurement')}

                  {/* Road Alignment GPS Capture */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-slate-500">Start GPS ({roadChainageStart || '0+000'})</div>
                        <div className="text-xs font-mono font-semibold text-slate-800 tabular-nums truncate">
                          {roadStartGps ? `${roadStartGps.lat.toFixed(6)}, ${roadStartGps.lng.toFixed(6)}` : 'Not captured'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCaptureRoadGps('start')}
                          disabled={!currentGps}
                          className="min-h-[38px] px-2.5 py-1.5 bg-white hover:bg-emerald-50 disabled:opacity-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                          title={currentGps ? 'Capture current GPS as Road Start' : 'Enable GPS in header first'}
                        >
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{roadStartGps ? 'Update' : 'Capture'}</span>
                        </button>
                        {roadStartGps && (
                          <button
                            type="button"
                            onClick={() => handleClearRoadGps('start')}
                            aria-label="Clear road start GPS"
                            className="min-h-[38px] min-w-[34px] flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-slate-500">End GPS ({roadChainageEnd || formatChainage(roadLen)})</div>
                        <div className="text-xs font-mono font-semibold text-slate-800 tabular-nums truncate">
                          {roadEndGps ? `${roadEndGps.lat.toFixed(6)}, ${roadEndGps.lng.toFixed(6)}` : 'Not captured'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCaptureRoadGps('end')}
                          disabled={!currentGps}
                          className="min-h-[38px] px-2.5 py-1.5 bg-white hover:bg-emerald-50 disabled:opacity-50 border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition"
                          title={currentGps ? 'Capture current GPS as Road End' : 'Enable GPS in header first'}
                        >
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{roadEndGps ? 'Update' : 'Capture'}</span>
                        </button>
                        {roadEndGps && (
                          <button
                            type="button"
                            onClick={() => handleClearRoadGps('end')}
                            aria-label="Clear road end GPS"
                            className="min-h-[38px] min-w-[34px] flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Road Side Drain Length */}
          {items.sideDrain.enabled && (
            <div className={getCardContainerClass('sideDrain')}>
              {renderCardHeader(
                'sideDrain',
                'Road Side Drain',
                items.sideDrain.unit,
                `Total: ${sideDrainLen.toLocaleString()} ${items.sideDrain.unit}`,
                'Record measured roadside drainage length.'
              )}

              {!isFieldCollapsed('sideDrain') && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between bg-slate-50/90 p-4 rounded-xl">
                    <div className="text-center w-full">
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums">
                        {sideDrainLen.toLocaleString()} <span className="text-base font-medium text-slate-500">{items.sideDrain.unit}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-1">Total side drain</div>
                    </div>
                  </div>

                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="0"
                    value={sideDrainLen}
                    onFocus={() => void captureLocationForInput('sideDrain', 'Road Side Drain', `${sideDrainLen} ${items.sideDrain.unit}`)}
                    onClick={() => void captureLocationForInput('sideDrain', 'Road Side Drain', `${sideDrainLen} ${items.sideDrain.unit}`)}
                    onChange={(e) => handleSetSideDrain(parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />

                  <div className="grid grid-cols-4 gap-2">
                    {(items.sideDrain.quickSteps || [10, 25, 50, 100]).slice(0, 4).map((step, idx) => (
                      <button
                        key={`${step}-${idx}`}
                        type="button"
                        onClick={() => {
                          void captureLocationForInput('sideDrain', 'Road Side Drain', `${sideDrainLen + step} ${items.sideDrain.unit}`);
                          handleSetSideDrain(sideDrainLen + step);
                        }}
                        className="min-h-[40px] py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 text-xs font-semibold rounded-lg tabular-nums whitespace-nowrap active:scale-[0.97] transition duration-150"
                      >
                        +{step}{items.sideDrain.unit}
                      </button>
                    ))}
                  </div>
                  {renderCapturedPinHint('sideDrain')}
                </div>
              )}
            </div>
          )}

          {/* Custom Necessary Items */}
          {enabledCustomItems.map((item) => (
            <div key={item.id} className={getCardContainerClass(item.id)}>
              {renderCardHeader(
                item.id,
                item.name,
                item.unit,
                `Measured: ${item.quantity} ${item.unit} (${item.category})`,
                `Custom ${item.category} item measured in ${item.unit}.`
              )}

              {!isFieldCollapsed(item.id) && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between bg-slate-50/90 p-3.5 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = Math.max(0, item.quantity - (item.quickSteps[0] || 1));
                        void captureLocationForInput(`custom:${item.id}`, item.name, `${nextVal} ${item.unit}`);
                        handleSetCustomItemQty(item.id, nextVal);
                      }}
                      aria-label={`Decrease ${item.name}`}
                      className="w-12 h-12 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-red-50 hover:text-red-600 transition flex items-center justify-center active:scale-95"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <div className="text-center px-3">
                      <div className="text-3xl font-extrabold text-slate-900 tabular-nums">
                        {item.quantity} <span className="text-sm font-medium text-slate-500">{item.unit}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium">Measured</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = item.quantity + (item.quickSteps[0] || 1);
                        void captureLocationForInput(`custom:${item.id}`, item.name, `${nextVal} ${item.unit}`);
                        handleSetCustomItemQty(item.id, nextVal);
                      }}
                      aria-label={`Increase ${item.name}`}
                      className="w-12 h-12 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl transition flex items-center justify-center active:scale-95"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={item.quantity}
                    onFocus={() => void captureLocationForInput(`custom:${item.id}`, item.name, `${item.quantity} ${item.unit}`)}
                    onClick={() => void captureLocationForInput(`custom:${item.id}`, item.name, `${item.quantity} ${item.unit}`)}
                    onChange={(e) => handleSetCustomItemQty(item.id, parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />

                  {item.quickSteps.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {item.quickSteps.slice(0, 3).map((step, idx) => (
                        <button
                          key={`${step}-${idx}`}
                          type="button"
                          onClick={() => {
                            const nextVal = item.quantity + step;
                            void captureLocationForInput(`custom:${item.id}`, item.name, `${nextVal} ${item.unit}`);
                            handleSetCustomItemQty(item.id, nextVal);
                          }}
                          className="min-h-[40px] py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-900 text-xs font-semibold rounded-lg tabular-nums active:scale-[0.97] transition duration-150"
                        >
                          +{step} {item.unit}
                        </button>
                      ))}
                    </div>
                  )}
                  {renderCapturedPinHint(`custom:${item.id}`)}
                </div>
              )}
            </div>
          ))}

          {/* Audit Notes */}
          {renderAuditNotesCard()}

        </div>
      )}

      {!anyEnabled && renderAuditNotesCard()}

    </div>
  );
};
