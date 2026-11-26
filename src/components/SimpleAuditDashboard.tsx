import React, { useState, useEffect } from 'react';
import { ConstructionProject, PostType } from '../types';
import { getProjectSettings, formatChainage, parseChainage } from '../utils/geo';
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
  X
} from 'lucide-react';
import { exportProjectToExcel, exportProjectToPdf } from '../utils/export';

interface SimpleAuditDashboardProps {
  project: ConstructionProject;
  onUpdateProject: (updated: ConstructionProject) => void;
  savedProjects: ConstructionProject[];
  onSwitchProject: (p: ConstructionProject) => void;
  onOpenSiteManager: () => void;
  onOpenSettings: () => void;
  currentGps?: { lat: number; lng: number; accuracy?: number };
}

export const SimpleAuditDashboard: React.FC<SimpleAuditDashboardProps> = ({
  project,
  onUpdateProject,
  savedProjects,
  onSwitchProject,
  onOpenSiteManager,
  onOpenSettings,
  currentGps,
}) => {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustomItems = customItems.filter(c => c.enabled);

  const [bulkAngleQty, setBulkAngleQty] = useState<string>('10');
  const [collapsedFields, setCollapsedFields] = useState<Record<string, boolean>>({});
  const [auditNotesDraft, setAuditNotesDraft] = useState<string>(project.auditNotes ?? '');

  useEffect(() => {
    setAuditNotesDraft(project.auditNotes ?? '');
  }, [project.id, project.auditNotes]);

  useEffect(() => {
    const savedValue = project.auditNotes ?? '';
    if (auditNotesDraft === savedValue) return;
    const timer = window.setTimeout(() => {
      onUpdateProject({
        ...project,
        auditNotes: auditNotesDraft,
        updatedAt: Date.now(),
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [auditNotesDraft, project, onUpdateProject]);

  const lengthUnit = settings.unitSystem === 'imperial' ? 'ft' : 'm';
  const areaUnit = settings.unitSystem === 'imperial' ? 'ft²' : 'm²';
  const volumeUnit = settings.unitSystem === 'imperial' ? 'ft³' : 'm³';

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

  const isFieldCollapsed = (id: string) => Boolean(collapsedFields[id]);
  const toggleField = (id: string) => {
    setCollapsedFields(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const allCollapsed = allFieldIds.length > 0 && allFieldIds.every(id => collapsedFields[id]);
  const handleToggleAllFields = () => {
    if (allCollapsed) {
      setCollapsedFields({});
    } else {
      const next: Record<string, boolean> = {};
      allFieldIds.forEach(id => {
        next[id] = true;
      });
      setCollapsedFields(next);
    }
  };

  const updateCounts = (updates: Partial<ConstructionProject>) => {
    onUpdateProject({
      ...project,
      ...updates,
      updatedAt: Date.now(),
    });
  };

  // Post counts
  const anglePostsCount = project.fencePosts.filter(p => p.postType === 'angle_post').length;
  const interPostsCount = project.fencePosts.filter(p => p.postType === 'intermediate_post').length;
  const strutPostsCount = project.fencePosts.filter(p => p.postType === 'strut_post').length;
  const gatePostsCount = project.fencePosts.filter(p => p.postType === 'gate_post').length;
  const totalEnabledPosts =
    (items.anglePosts.enabled ? anglePostsCount : 0) +
    (items.intermediatePosts.enabled ? interPostsCount : 0) +
    (items.strutPosts.enabled ? strutPostsCount : 0) +
    (items.gatePosts.enabled ? gatePostsCount : 0);

  // Mesh, RRM, Road, Side Drain
  const totalMeshLength = project.fenceMeshSegments.reduce((a, c) => a + c.lengthMeters, 0);
  const meshWidth = project.fenceMeshSegments[0]?.meshHeightMeters ?? settings.defaultMeshHeight;
  const rrmSec = project.rrmWalls[0];
  const rrmHeightEntries = rrmSec?.heightEntries ?? [rrmSec?.heightMeters ?? settings.defaultRrmHeight];
  const rrmHeight = rrmHeightEntries.length > 0 ? rrmHeightEntries.reduce((a, b) => a + b, 0) / rrmHeightEntries.length : (rrmSec?.heightMeters ?? settings.defaultRrmHeight);

  const rrmTopWidthEntries = rrmSec?.topWidthEntries ?? [rrmSec?.topWidthMeters ?? 0.38];
  const rrmTopWidth = rrmTopWidthEntries.length > 0 ? rrmTopWidthEntries.reduce((a, b) => a + b, 0) / rrmTopWidthEntries.length : 0.38;

  const rrmBotWidthEntries = rrmSec?.bottomWidthEntries ?? [rrmSec?.bottomWidthMeters ?? 0.38];
  const rrmBotWidth = rrmBotWidthEntries.length > 0 ? rrmBotWidthEntries.reduce((a, b) => a + b, 0) / rrmBotWidthEntries.length : 0.38;

  const rrmWidth = Number(((rrmTopWidth + rrmBotWidth) / 2).toFixed(2));
  const rrmLen = Number(project.rrmWalls.reduce((a, c) => a + c.lengthMeters, 0).toFixed(2));
  const totalRrmVol = project.rrmWalls.reduce(
    (a, c) => {
      const topW = (c.topWidthEntries && c.topWidthEntries.length > 0) ? c.topWidthEntries.reduce((x, y) => x + y, 0) / c.topWidthEntries.length : c.topWidthMeters;
      const botW = (c.bottomWidthEntries && c.bottomWidthEntries.length > 0) ? c.bottomWidthEntries.reduce((x, y) => x + y, 0) / c.bottomWidthEntries.length : c.bottomWidthMeters;
      const h = (c.heightEntries && c.heightEntries.length > 0) ? c.heightEntries.reduce((x, y) => x + y, 0) / c.heightEntries.length : c.heightMeters;
      return a + c.lengthMeters * h * ((topW + botW) / 2);
    },
    0
  );

  const roadSec = project.roadSections[0];
  const roadLen = project.roadSections.reduce((a, c) => a + c.lengthMeters, 0);
  const roadChainageStart = roadSec?.chainageStart ?? '0+000';
  const roadChainageEnd = roadSec?.chainageEnd ?? formatChainage(roadLen);
  const roadStartGps = roadSec?.startGps;
  const roadEndGps = roadSec?.endGps;

  const roadWidthEntries = roadSec?.widthEntries ?? [roadSec?.widthMeters ?? settings.defaultRoadWidth];
  const roadWidth = roadWidthEntries.length > 0 ? roadWidthEntries.reduce((a, b) => a + b, 0) / roadWidthEntries.length : (roadSec?.widthMeters ?? settings.defaultRoadWidth);

  const roadDepthEntries = roadSec?.depthEntries ?? [roadSec?.earthworkCutDepthMeters ?? 0];
  const roadDepth = roadDepthEntries.length > 0 ? roadDepthEntries.reduce((a, b) => a + b, 0) / roadDepthEntries.length : (roadSec?.earthworkCutDepthMeters ?? 0);

  const sideDrainLen = project.roadSections.reduce((a, c) => a + (c.sideDrainLengthMeters || 0), 0);

  const handleAdjustPost = (postType: PostType, delta: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const current = [...project.fencePosts];
    const countToChange = Math.abs(Math.trunc(delta));
    if (countToChange === 0) return;

    if (delta > 0) {
      const baseTime = Date.now();
      for (let i = 0; i < countToChange; i++) {
        current.push({
          id: `post-${baseTime}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          postNumber: current.length + 1,
          postType,
          heightMeters: settings.defaultPostHeight,
          gps: currentGps ? { lat: currentGps.lat, lng: currentGps.lng, accuracy: currentGps.accuracy } : undefined,
          createdAt: baseTime,
        });
      }
    } else if (current.length > 0) {
      for (let i = 0; i < countToChange; i++) {
        const idx = current.map(p => p.postType).lastIndexOf(postType);
        if (idx === -1) break;
        current.splice(idx, 1);
      }
    }
    updateCounts({ fencePosts: current });
  };

  const handleSetMesh = (newLen: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const safeLen = Math.max(0, newLen);
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
    const safeW = Math.max(0, newWidth);
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
    const safeWidth = updates.widthMeters !== undefined ? Math.max(0, updates.widthMeters) : undefined;
    current[0] = {
      ...current[0],
      ...(updates.lengthMeters !== undefined ? { lengthMeters: Math.max(0, updates.lengthMeters) } : {}),
      ...(safeWidth !== undefined ? { topWidthMeters: safeWidth, bottomWidthMeters: safeWidth } : {}),
      ...(updates.heightMeters !== undefined ? { heightMeters: Math.max(0, updates.heightMeters) } : {}),
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
      createdAt: Date.now(),
    }];
  };

  const handleSetRoadLen = (newLen: number) => {
    if (window.navigator?.vibrate) window.navigator.vibrate(35);
    const safeLen = Math.max(0, newLen);
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
    const safeW = Math.max(0, w);
    const current = ensureRoadSection();
    current[0] = { ...current[0], widthMeters: safeW };
    updateCounts({ roadSections: current });
  };

  const handleSetRoadDepth = (d: number) => {
    const safeD = Math.max(0, d);
    const current = ensureRoadSection();
    current[0] = { ...current[0], earthworkCutDepthMeters: safeD };
    updateCounts({ roadSections: current });
  };

  const handleSetRoadWidthEntries = (inputStr: string) => {
    const parsed = inputStr
      .split(/[,,\s]+/)
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
    const parsed = inputStr
      .split(/[,,\s]+/)
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
    const parsed = inputStr
      .split(/[,,\s]+/)
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
    const parsed = inputStr
      .split(/[,,\s]+/)
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
    const safeLen = Math.max(0, newLen);
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
    const safeQty = Math.max(0, newQty);
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
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 md:col-span-2 flex flex-col gap-4 transition-all">
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
                onChange={(e) => setAuditNotesDraft(e.target.value)}
                onBlur={() => handleSaveAuditNotes(auditNotesDraft)}
                placeholder="Enter field observations, site conditions, access issues, or notes for the audit record..."
                aria-label="Audit Notes"
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition resize-y min-h-[104px]"
              />
            </div>

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
    'w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm font-semibold text-slate-900 tabular-nums focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition';

  const renderCardHeader = (
    fieldId: string,
    title: string,
    unitLabel: string,
    collapsedSummary: string,
    description: string
  ) => {
    const collapsed = isFieldCollapsed(fieldId);
    return (
      <button
        type="button"
        onClick={() => toggleField(fieldId)}
        aria-expanded={!collapsed}
        className="w-full text-left flex items-start justify-between gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-xl"
      >
        <div className="min-w-0 flex-1">
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
        </div>
        <span
          className="mt-0.5 w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0 transition"
          aria-hidden="true"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}
          />
        </span>
      </button>
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
        className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col gap-4 transition-all"
      >
        {renderCardHeader(postType, title, unit, `Counted: ${count} ${unit}`, description)}

        {!collapsed && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between bg-slate-50/90 p-3.5 rounded-xl">
              <button
                type="button"
                onClick={() => handleAdjustPost(postType, -1)}
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
                onClick={() => handleAdjustPost(postType, 1)}
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
                      onClick={() => handleAdjustPost(postType, qty)}
                      className="min-h-[44px] py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl tabular-nums active:scale-[0.97] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
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
                    onChange={(e) => setBulkAngleQty(e.target.value)}
                    placeholder="Qty"
                    aria-label="Bulk post quantity"
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const qty = parseInt(bulkAngleQty, 10);
                      if (qty > 0) handleAdjustPost(postType, qty);
                    }}
                    className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition duration-150 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-4 max-w-4xl mx-auto">
      
      {/* Field Workstation Toolbar Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 space-y-4 text-[9px]">
        <div className="flex flex-col gap-3.5">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
              Field Measurement Worksheet
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
              <span>{project.name}</span>
              <span aria-hidden="true">&middot;</span>
              <span className="capitalize">{settings.unitSystem} units</span>
              <span aria-hidden="true">&middot;</span>
              <span className="tabular-nums font-medium text-slate-700">
                {totalEnabledPosts} posts &middot; {totalMeshLength} {items.chainLinkMesh.unit} mesh &middot; {roadLen} {items.roadMeasurement.unit} road
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={project.id}
                onChange={(e) => {
                  const found = savedProjects.find(p => p.id === e.target.value);
                  if (found) onSwitchProject(found);
                }}
                aria-label="Select site"
                className="flex-1 sm:flex-none min-w-0 min-h-[44px] px-3 py-2 bg-slate-50 text-slate-800 text-base sm:text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              >
                {savedProjects.map(p => (
                  <option key={p.id} value={p.id}>Site: {p.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={onOpenSiteManager}
                className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Building2 className="w-4 h-4 text-slate-600" />
                <span>Sites</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="min-h-[44px] px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Settings className="w-4 h-4" />
                <span>Units &amp; Items</span>
              </button>

              {anyEnabled && (
                <button
                  type="button"
                  onClick={handleToggleAllFields}
                  className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  title={allCollapsed ? 'Expand all measurement fields' : 'Collapse all measurement fields'}
                >
                  <ChevronsUpDown className="w-4 h-4 text-slate-600" />
                  <span>{allCollapsed ? 'Expand All' : 'Collapse All'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => exportProjectToExcel(project)}
                className="min-h-[44px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                title="Export Excel CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={() => exportProjectToPdf(project)}
                className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={handleSaveRecordedData}
                className="col-span-2 sm:col-span-1 min-h-[44px] px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold rounded-xl transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 active:scale-[0.98]"
                title="Save all recorded measurements and notes"
              >
                <Save className="w-4 h-4" />
                <span>Save Data</span>
              </button>
            </div>
          </div>
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
            'Angle Posts (Corner / End)',
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
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col gap-4 transition-all">
              {renderCardHeader(
                'chainLinkMesh',
                'Chain-Link Mesh',
                items.chainLinkMesh.unit,
                `Length: ${totalMeshLength.toLocaleString()} ${items.chainLinkMesh.unit} · Width: ${meshWidth}${lengthUnit} · Area: ${(totalMeshLength * meshWidth).toFixed(1)} ${areaUnit}`,
                'Enter mesh length and width/height, or tap quick length buttons.'
              )}

              {!isFieldCollapsed('chainLinkMesh') && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between bg-slate-50/90 p-4 rounded-xl">
                    <div className="text-center w-full">
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                        {totalMeshLength.toLocaleString()} <span className="text-base font-medium text-slate-500">{items.chainLinkMesh.unit}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-1 tabular-nums">
                        Width: {meshWidth}{lengthUnit} &middot; Area: {(totalMeshLength * meshWidth).toFixed(1)} {areaUnit}
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
                        Length ({items.chainLinkMesh.unit})
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        value={totalMeshLength}
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
                        onChange={(e) => handleSetMeshWidth(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {(items.chainLinkMesh.quickSteps || [1, 5, 10, 50]).slice(0, 4).map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => handleSetMesh(totalMeshLength + step)}
                        className="min-h-[44px] py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl tabular-nums active:scale-[0.97] transition duration-150"
                      >
                        +{step}{items.chainLinkMesh.unit}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RRM Foundation Wall (Length, Width & Height) */}
          {items.rrmWall.enabled && (
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col gap-4 transition-all">
              {renderCardHeader(
                'rrmWall',
                'RRM Foundation Wall',
                items.rrmWall.unit,
                `Volume: ${totalRrmVol.toFixed(2)} ${items.rrmWall.unit} · L: ${rrmLen}${lengthUnit} × W: ${rrmWidth}${lengthUnit} × H: ${rrmHeight}${lengthUnit}`,
                'Enter length, width, and height to compute wall masonry volume.'
              )}

              {!isFieldCollapsed('rrmWall') && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between bg-slate-50/90 p-4 rounded-xl">
                    <div className="text-center w-full">
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                        {totalRrmVol.toFixed(2)} <span className="text-base font-medium text-slate-500">{items.rrmWall.unit}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-1 tabular-nums">
                        L: {rrmLen}{lengthUnit} &middot; W: {rrmWidth}{lengthUnit} &middot; H: {rrmHeight}{lengthUnit}
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
                        onChange={(e) => handleSetRrmDimensions({ heightMeters: parseFloat(e.target.value) || 0 })}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(items.rrmWall.quickSteps || [1, 5, 10]).slice(0, 4).map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => handleSetRrmDimensions({ lengthMeters: rrmLen + step })}
                        className="min-h-[44px] py-2 px-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl tabular-nums whitespace-nowrap active:scale-[0.97] transition duration-150"
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
                        value={rrmSec?.topWidthEntries ? rrmSec.topWidthEntries.join(', ') : ''}
                        onChange={(e) => handleSetRrmWidthEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Height Multi-Samples ({lengthUnit}) <span className="text-[10px] text-slate-400 font-normal">(Comma-separated)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0.6, 0.65, 0.58"
                        value={rrmSec?.heightEntries ? rrmSec.heightEntries.join(', ') : ''}
                        onChange={(e) => handleSetRrmHeightEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Road Measurement (Length, Breadth/Width & Depth) */}
          {items.roadMeasurement.enabled && (
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 md:col-span-2 flex flex-col gap-4 transition-all">
              {renderCardHeader(
                'roadMeasurement',
                'Road Measurement',
                items.roadMeasurement.unit,
                `Ch. ${roadChainageStart || '0+000'} – ${roadChainageEnd || formatChainage(roadLen)} · Length: ${roadLen} ${items.roadMeasurement.unit} · Width: ${roadWidth}${lengthUnit} · Area: ${(roadLen * roadWidth).toLocaleString()} ${areaUnit}`,
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
                          {(roadLen * roadWidth).toLocaleString()} <span className="text-xs sm:text-sm font-medium text-slate-500">{areaUnit}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Volume</div>
                        <div className="text-xl sm:text-3xl font-extrabold text-indigo-600 tabular-nums mt-0.5">
                          {(roadLen * roadWidth * roadDepth).toFixed(1)} <span className="text-xs sm:text-sm font-medium text-slate-500">{volumeUnit}</span>
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
                        onChange={(e) => handleSetRoadDepth(parseFloat(e.target.value) || 0)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {(items.roadMeasurement.quickSteps || [10, 50, 100, 500]).slice(0, 4).map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => handleSetRoadLen(roadLen + step)}
                        className="min-h-[44px] py-2.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl tabular-nums whitespace-nowrap active:scale-[0.97] transition duration-150"
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
                        value={roadSec?.widthEntries ? roadSec.widthEntries.join(', ') : ''}
                        onChange={(e) => handleSetRoadWidthEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Depth Multi-Samples ({lengthUnit}) <span className="text-[10px] text-slate-400 font-normal">(Comma-separated excavation depths)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 0.3, 0.35, 0.28"
                        value={roadSec?.depthEntries ? roadSec.depthEntries.join(', ') : ''}
                        onChange={(e) => handleSetRoadDepthEntries(e.target.value)}
                        className={`${inputClass} font-mono`}
                      />
                    </div>
                  </div>

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
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col gap-4 transition-all">
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
                    onChange={(e) => handleSetSideDrain(parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />

                  <div className="grid grid-cols-4 gap-2">
                    {(items.sideDrain.quickSteps || [10, 25, 50, 100]).slice(0, 4).map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => handleSetSideDrain(sideDrainLen + step)}
                        className="min-h-[44px] py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl tabular-nums whitespace-nowrap active:scale-[0.97] transition duration-150"
                      >
                        +{step}{items.sideDrain.unit}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Custom Necessary Items */}
          {enabledCustomItems.map((item) => (
            <div key={item.id} className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col gap-4 transition-all">
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
                      onClick={() => handleSetCustomItemQty(item.id, item.quantity - (item.quickSteps[0] || 1))}
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
                      onClick={() => handleSetCustomItemQty(item.id, item.quantity + (item.quickSteps[0] || 1))}
                      aria-label={`Increase ${item.name}`}
                      className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition flex items-center justify-center active:scale-95"
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
                    onChange={(e) => handleSetCustomItemQty(item.id, parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />

                  {item.quickSteps.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {item.quickSteps.slice(0, 3).map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => handleSetCustomItemQty(item.id, item.quantity + step)}
                          className="min-h-[44px] py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl tabular-nums active:scale-[0.97] transition duration-150"
                        >
                          +{step} {item.unit}
                        </button>
                      ))}
                    </div>
                  )}
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
