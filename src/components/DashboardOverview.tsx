import React, { useState, useEffect, useMemo } from 'react';
import { ConstructionProject } from '../types';
import { getProjectSettings, getUnitLabels, isAreaUnit, isLengthUnit } from '../utils/geo';
import { computeMeasurements, computeEntityAuditComparisons } from '../utils/calculations';
import { AppTab } from '../utils/deviceStorage';
import { exportProjectToExcel, exportProjectToPdf, exportChainLinkPdf, exportRoadPdf } from '../utils/export';
import { StaticMapScope } from '../utils/staticMap';
import { AuditorVerificationModule } from './AuditorVerificationModule';
import { EntityComparisonModule } from './EntityComparisonModule';
import { SiteReportMap } from './SiteReportMap';
import { 
  Fence, 
  Route, 
  Layers, 
  ArrowRight, 
  ShieldCheck,
  Settings,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  MapPin,
  Maximize2,
  Minimize2,
  Scale
} from 'lucide-react';

interface DashboardOverviewProps {
  project: ConstructionProject;
  setActiveTab: (tab: AppTab) => void;
  onUpdateProject: (updated: ConstructionProject) => void;
  onPatchProject?: (
    projectId: string,
    updater: (latest: ConstructionProject) => ConstructionProject
  ) => void;
  onOpenSettings: () => void;
  onOpenReport?: (scope?: StaticMapScope) => void;
  currentGps?: { lat: number; lng: number; accuracy?: number };
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  project,
  setActiveTab,
  onUpdateProject,
  onPatchProject,
  onOpenSettings,
  onOpenReport,
  currentGps,
}) => {
  const settings = useMemo(() => getProjectSettings(project), [project]);
  const { items, customItems } = settings;
  const enabledCustom = useMemo(() => customItems.filter(c => c.enabled), [customItems]);
  const { lengthUnit, areaUnit } = useMemo(() => getUnitLabels(settings), [settings]);
  const meshUnitIsArea = isAreaUnit(items.chainLinkMesh.unit);
  const rrmUnitIsLength = isLengthUnit(items.rrmWall.unit);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [fullscreenSectionId, setFullscreenSectionId] = useState<string | null>(null);

  useEffect(() => {
    setFullscreenSectionId(null);
  }, [project.id]);

  useEffect(() => {
    if (!fullscreenSectionId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenSectionId(null);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreenSectionId]);

  const defaultCollapsedSections = new Set(['reportMap', 'entityComparison', 'auditorRecord']);
  const isSectionCollapsed = (key: string) =>
    defaultCollapsedSections.has(key)
      ? collapsedSections[key] !== false
      : collapsedSections[key] === true;
  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !isSectionCollapsed(key) }));
  };

  const toggleFullScreen = (key: string) => {
    setFullscreenSectionId(prev => {
      if (prev === key) return null;
      setCollapsedSections(c => ({ ...c, [key]: false }));
      return key;
    });
  };

  const getSectionClass = (key: string, baseClass: string) =>
    fullscreenSectionId === key
      ? 'fixed inset-0 z-[45] bg-white p-5 sm:p-8 overflow-y-auto transition-all'
      : `${baseClass} transition-all`;

  const m = useMemo(() => computeMeasurements(project), [project]);
  const entitySummary = useMemo(() => {
    const entityComparisons = computeEntityAuditComparisons(project, 'all');
    return {
      total: entityComparisons.length,
      excess: entityComparisons.filter(r => r.status === 'excess' || (r.status as string) === 'shortfall').length,
      underpayment: entityComparisons.filter(r => r.status === 'underpayment').length,
      matched: entityComparisons.filter(r => r.status === 'matched').length,
    };
  }, [project]);
  const totalAnglePosts = m.totalAngle;
  const totalIntermediatePosts = m.totalIntermed;
  const totalStrutPosts = m.totalStrut;
  const totalGatePosts = m.totalGate;
  const totalPostsCount = m.totalPosts;
  const postUnit = m.postUnit;

  const totalMeshLength = m.meshLen;
  const totalRrmVolume = m.rrmVol;

  const totalRoadLength = m.roadLen;
  const roadChainageStart = m.chainageStart;
  const roadChainageEnd = m.chainageEnd;
  const roadWidth = m.roadWidth;
  const totalRoadArea = m.roadArea;
  const totalSideDrain = m.sideDrainLen;

  const auditStatus = project.auditInfo?.auditStatus || 'pending';

  const fencingCustom = enabledCustom.filter(c => c.category === 'fencing');
  const roadAndGeneralCustom = enabledCustom.filter(c => c.category === 'road' || c.category === 'general');

  const postBreakdownParts: string[] = [];
  if (items.anglePosts.enabled) postBreakdownParts.push(`${totalAnglePosts} angle`);
  if (items.intermediatePosts.enabled) postBreakdownParts.push(`${totalIntermediatePosts} intermed.`);
  if (items.strutPosts.enabled) postBreakdownParts.push(`${totalStrutPosts} strut`);
  if (items.gatePosts.enabled) postBreakdownParts.push(`${totalGatePosts} gate`);

  return (
    <div className="space-y-4 sm:space-y-6 pb-4">
      
      {/* Overview Header Card */}
      <div className={getSectionClass('overviewHeader', 'bg-white rounded-xl p-5 sm:p-6 border border-slate-200')}>
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => toggleSection('overviewHeader')}
              aria-expanded={!isSectionCollapsed('overviewHeader')}
              className="min-w-0 flex-1 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded-lg"
            >
              <div className="text-xs font-medium text-slate-500 mb-1">
                Site Overview &middot; Audit Summary
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 group-hover:text-slate-700 transition">
                {project.name}
              </h2>
              {!isSectionCollapsed('overviewHeader') && (
                <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mt-1.5 max-w-2xl">
                  Review measured quantities across fencing and road works, sign off physical site verification, or customize predetermined units and necessary items.
                </p>
              )}
            </button>

            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
              <button
                type="button"
                onClick={() => toggleFullScreen('overviewHeader')}
                aria-label={fullscreenSectionId === 'overviewHeader' ? 'Exit full screen for Site Overview' : 'Extend Site Overview to full screen'}
                aria-pressed={fullscreenSectionId === 'overviewHeader'}
                title={fullscreenSectionId === 'overviewHeader' ? 'Restore card size (Esc)' : 'Extend to full screen'}
                className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition ${
                  fullscreenSectionId === 'overviewHeader'
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {fullscreenSectionId === 'overviewHeader' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => toggleSection('overviewHeader')}
                aria-expanded={!isSectionCollapsed('overviewHeader')}
                aria-label="Toggle Site Overview"
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('overviewHeader') ? '-rotate-90' : 'rotate-0'}`}
                />
              </button>
            </div>
          </div>

          {!isSectionCollapsed('overviewHeader') && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-3 border-t border-slate-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-2 transition whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Open Auditor</span>
                <ArrowRight className="w-3.5 h-3.5 hidden sm:inline" />
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>Units &amp; Items</span>
              </button>

              <button
                type="button"
                onClick={() => exportProjectToExcel(project)}
                className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={() => (onOpenReport ? onOpenReport('all') : exportProjectToPdf(project, currentGps))}
                className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Export PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Metric 1: Fence Posts */}
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className="text-left bg-white rounded-xl p-4 sm:p-5 border border-slate-200 hover:border-slate-400 transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-medium text-slate-500 truncate">Total Fence Posts</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition shrink-0">
              <Fence className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums mb-1">
            {totalPostsCount} <span className="text-xs sm:text-sm font-medium text-slate-500">{postUnit}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 truncate tabular-nums">
            {postBreakdownParts.length > 0 ? postBreakdownParts.join(' · ') : 'No post types active'}
          </div>
        </button>

        {/* Metric 2: Mesh & RRM */}
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className="text-left bg-white rounded-xl p-4 sm:p-5 border border-slate-200 hover:border-slate-400 transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-medium text-slate-500 truncate">Fence Mesh &amp; RRM</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition shrink-0">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums mb-1">
            {(meshUnitIsArea ? m.meshArea : totalMeshLength).toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
            <span className="text-xs sm:text-sm font-medium text-slate-500">{items.chainLinkMesh.unit}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 truncate tabular-nums">
            RRM &middot;{' '}
            <span className="font-semibold text-slate-700">
              {(rrmUnitIsLength ? m.rrmLen : totalRrmVolume).toFixed(2)} {items.rrmWall.unit}
            </span>
          </div>
        </button>

        {/* Metric 3: Road Construction */}
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className="text-left bg-white rounded-xl p-4 sm:p-5 border border-slate-200 hover:border-slate-400 transition group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-medium text-slate-500 truncate">Road Alignment</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition shrink-0">
              <Route className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums mb-1">
            {totalRoadLength.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-xs sm:text-sm font-medium text-slate-500">{items.roadMeasurement.unit}</span>
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 truncate tabular-nums">
            Ch. <span className="font-mono font-semibold text-slate-700">{roadChainageStart}–{roadChainageEnd}</span> &middot; {totalRoadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} {areaUnit}
          </div>
        </button>

        {/* Metric 4: Audit Status */}
        <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-medium text-slate-500 truncate">Audit Status</span>
            <div className={`p-1.5 rounded-lg shrink-0 ${
              auditStatus === 'fully_compliant'
                ? 'bg-emerald-50 text-emerald-600'
                : auditStatus === 'verified_with_variance'
                ? 'bg-amber-50 text-amber-600'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {auditStatus === 'fully_compliant' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : auditStatus === 'verified_with_variance' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </div>
          </div>
          <div className="text-base sm:text-xl font-bold text-slate-900 mb-1 truncate">
            {auditStatus === 'fully_compliant'
              ? 'Fully Compliant'
              : auditStatus === 'verified_with_variance'
              ? 'Variance Noted'
              : 'Pending Audit'}
          </div>
          <div className="text-[11px] sm:text-xs text-slate-500 truncate">
            {project.auditInfo?.auditorName || 'No auditor assigned yet'}
          </div>
        </div>

      </div>

      {/* Quick Summary Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
        
        {/* Chain-Link Fence Material Breakdown */}
        <div className={getSectionClass('fencingBreakdown', 'bg-white rounded-xl p-5 border border-slate-200')}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-2">
            <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => toggleSection('fencingBreakdown')}
                aria-expanded={!isSectionCollapsed('fencingBreakdown')}
                className="flex items-center gap-3 text-left min-w-0 flex-1 group"
              >
                <div className="p-2 bg-amber-50 text-amber-700 rounded-xl flex-shrink-0">
                  <Fence className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 group-hover:text-slate-700 transition text-sm sm:text-base truncate">
                    Chain-Link &amp; Fencing Breakdown
                  </h3>
                  {isSectionCollapsed('fencingBreakdown') && (
                    <p className="text-xs text-slate-500 tabular-nums truncate">
                      {totalPostsCount} {postUnit} &middot; {(meshUnitIsArea ? m.meshArea : totalMeshLength).toLocaleString(undefined, { maximumFractionDigits: 2 })} {items.chainLinkMesh.unit} mesh &middot; {(rrmUnitIsLength ? m.rrmLen : totalRrmVolume).toFixed(2)} {items.rrmWall.unit} RRM
                    </p>
                  )}
                </div>
              </button>

              <div className="sm:hidden flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleFullScreen('fencingBreakdown')}
                  aria-label={fullscreenSectionId === 'fencingBreakdown' ? 'Exit full screen for Chain-Link & Fencing Breakdown' : 'Extend Chain-Link & Fencing Breakdown to full screen'}
                  aria-pressed={fullscreenSectionId === 'fencingBreakdown'}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                    fullscreenSectionId === 'fencingBreakdown'
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {fullscreenSectionId === 'fencingBreakdown' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection('fencingBreakdown')}
                  aria-expanded={!isSectionCollapsed('fencingBreakdown')}
                  aria-label="Toggle Chain-Link & Fencing Breakdown"
                  className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('fencingBreakdown') ? '-rotate-90' : 'rotate-0'}`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 pl-11 sm:pl-0">
              <button
                type="button"
                onClick={() => (onOpenReport ? onOpenReport('fencing') : exportChainLinkPdf(project, currentGps))}
                className="min-h-[40px] sm:min-h-[36px] text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-1.5 rounded-lg transition whitespace-nowrap shrink-0"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className="min-h-[40px] sm:min-h-[36px] text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1.5 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>Measure</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleFullScreen('fencingBreakdown')}
                aria-label={fullscreenSectionId === 'fencingBreakdown' ? 'Exit full screen for Chain-Link & Fencing Breakdown' : 'Extend Chain-Link & Fencing Breakdown to full screen'}
                aria-pressed={fullscreenSectionId === 'fencingBreakdown'}
                title={fullscreenSectionId === 'fencingBreakdown' ? 'Restore card size (Esc)' : 'Extend to full screen'}
                className={`hidden sm:flex w-8 h-8 rounded-lg items-center justify-center transition ${
                  fullscreenSectionId === 'fencingBreakdown'
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {fullscreenSectionId === 'fencingBreakdown' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => toggleSection('fencingBreakdown')}
                aria-expanded={!isSectionCollapsed('fencingBreakdown')}
                aria-label="Toggle Chain-Link & Fencing Breakdown"
                className="hidden sm:flex w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 items-center justify-center transition"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('fencingBreakdown') ? '-rotate-90' : 'rotate-0'}`}
                />
              </button>
            </div>
          </div>

          {!isSectionCollapsed('fencingBreakdown') && (
            <div className="divide-y divide-slate-100 mt-4">
              {items.anglePosts.enabled && (
                <div className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">Angle Posts (Corner / End)</span>
                  <span className="font-bold text-slate-900 tabular-nums">{totalAnglePosts} {items.anglePosts.unit}</span>
                </div>
              )}
              {items.intermediatePosts.enabled && (
                <div className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">Intermediate Posts</span>
                  <span className="font-bold text-slate-900 tabular-nums">{totalIntermediatePosts} {items.intermediatePosts.unit}</span>
                </div>
              )}
              {items.strutPosts.enabled && (
                <div className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">Strut Posts</span>
                  <span className="font-bold text-slate-900 tabular-nums">{totalStrutPosts} {items.strutPosts.unit}</span>
                </div>
              )}
              {items.gatePosts.enabled && (
                <div className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">Gate Posts</span>
                  <span className="font-bold text-slate-900 tabular-nums">{totalGatePosts} {items.gatePosts.unit}</span>
                </div>
              )}
              {items.chainLinkMesh.enabled && (
                <div className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">
                    {meshUnitIsArea ? 'Chain-Link Mesh Area' : 'Chain-Link Mesh Length'}
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {(meshUnitIsArea ? m.meshArea : totalMeshLength).toLocaleString(undefined, { maximumFractionDigits: 2 })} {items.chainLinkMesh.unit}
                  </span>
                </div>
              )}
              {items.rrmWall.enabled && (
                <div className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">
                    {rrmUnitIsLength ? 'RRM Plinth Wall Length' : 'RRM Plinth Wall Masonry Volume'}
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {(rrmUnitIsLength ? m.rrmLen : totalRrmVolume).toFixed(2)} {items.rrmWall.unit}
                  </span>
                </div>
              )}
              {fencingCustom.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">{c.name}</span>
                  <span className="font-bold text-slate-900 tabular-nums">{c.quantity} {c.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Road Construction & General Items Breakdown */}
        <div className={getSectionClass('roadBreakdown', 'bg-white rounded-xl p-5 border border-slate-200')}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-2">
            <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => toggleSection('roadBreakdown')}
                aria-expanded={!isSectionCollapsed('roadBreakdown')}
                className="flex items-center gap-3 text-left min-w-0 flex-1 group"
              >
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl flex-shrink-0">
                  <Route className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 group-hover:text-slate-700 transition text-sm sm:text-base truncate">
                    Road &amp; Additional Site Items
                  </h3>
                  {isSectionCollapsed('roadBreakdown') && (
                    <p className="text-xs text-slate-500 tabular-nums truncate">
                      Ch. {roadChainageStart}–{roadChainageEnd} &middot; {totalRoadLength.toLocaleString(undefined, { maximumFractionDigits: 2 })} {items.roadMeasurement.unit} &middot; {totalRoadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} {areaUnit} &middot; Drain: {totalSideDrain.toLocaleString(undefined, { maximumFractionDigits: 2 })} {items.sideDrain.unit}
                    </p>
                  )}
                </div>
              </button>

              <div className="sm:hidden flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleFullScreen('roadBreakdown')}
                  aria-label={fullscreenSectionId === 'roadBreakdown' ? 'Exit full screen for Road & Additional Site Items' : 'Extend Road & Additional Site Items to full screen'}
                  aria-pressed={fullscreenSectionId === 'roadBreakdown'}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                    fullscreenSectionId === 'roadBreakdown'
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {fullscreenSectionId === 'roadBreakdown' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection('roadBreakdown')}
                  aria-expanded={!isSectionCollapsed('roadBreakdown')}
                  aria-label="Toggle Road & Additional Site Items"
                  className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('roadBreakdown') ? '-rotate-90' : 'rotate-0'}`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 pl-11 sm:pl-0">
              <button
                type="button"
                onClick={() => (onOpenReport ? onOpenReport('road') : exportRoadPdf(project, currentGps))}
                className="min-h-[40px] sm:min-h-[36px] text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3.5 py-1.5 rounded-lg transition whitespace-nowrap shrink-0"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className="min-h-[40px] sm:min-h-[36px] text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2 py-1.5 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>Measure</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleFullScreen('roadBreakdown')}
                aria-label={fullscreenSectionId === 'roadBreakdown' ? 'Exit full screen for Road & Additional Site Items' : 'Extend Road & Additional Site Items to full screen'}
                aria-pressed={fullscreenSectionId === 'roadBreakdown'}
                title={fullscreenSectionId === 'roadBreakdown' ? 'Restore card size (Esc)' : 'Extend to full screen'}
                className={`hidden sm:flex w-8 h-8 rounded-lg items-center justify-center transition ${
                  fullscreenSectionId === 'roadBreakdown'
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {fullscreenSectionId === 'roadBreakdown' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => toggleSection('roadBreakdown')}
                aria-expanded={!isSectionCollapsed('roadBreakdown')}
                aria-label="Toggle Road & Additional Site Items"
                className="hidden sm:flex w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 items-center justify-center transition"
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('roadBreakdown') ? '-rotate-90' : 'rotate-0'}`}
                />
              </button>
            </div>
          </div>

          {!isSectionCollapsed('roadBreakdown') && (
            <div className="divide-y divide-slate-100 mt-4">
              {items.roadMeasurement.enabled && (
                <>
                  <div className="flex justify-between items-center py-2.5 text-sm">
                    <span className="text-slate-600">Road Chainage</span>
                    <span className="font-bold font-mono text-slate-900 tabular-nums">{roadChainageStart} &rarr; {roadChainageEnd}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 text-sm">
                    <span className="text-slate-600">Road Alignment Length</span>
                    <span className="font-bold text-slate-900 tabular-nums">{totalRoadLength.toLocaleString(undefined, { maximumFractionDigits: 2 })} {items.roadMeasurement.unit}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 text-sm">
                    <span className="text-slate-600">Road Breadth / Width</span>
                    <span className="font-bold text-slate-900 tabular-nums">{roadWidth} {lengthUnit}</span>
                  </div>
                  <div className="flex justify-between items-center py-2.5 text-sm">
                    <span className="text-slate-600">Total Road Surface Area</span>
                    <span className="font-bold text-emerald-700 tabular-nums">{totalRoadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} {areaUnit}</span>
                  </div>
                </>
              )}
              {items.sideDrain.enabled && (
                <div className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">Road Side Drain Length</span>
                  <span className="font-bold text-slate-900 tabular-nums">{totalSideDrain.toLocaleString(undefined, { maximumFractionDigits: 2 })} {items.sideDrain.unit}</span>
                </div>
              )}
              {roadAndGeneralCustom.map((c) => (
                <div key={c.id} className="flex justify-between items-center py-2.5 text-sm">
                  <span className="text-slate-600">{c.name}</span>
                  <span className="font-bold text-slate-900 tabular-nums">{c.quantity} {c.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Site Location & Accurate Report Map */}
      <div className={getSectionClass('reportMap', 'bg-white rounded-xl p-5 border border-slate-200')}>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => toggleSection('reportMap')}
            aria-expanded={!isSectionCollapsed('reportMap')}
            className="flex items-center gap-3 text-left min-w-0 flex-1 group"
          >
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl flex-shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 group-hover:text-slate-700 transition text-sm sm:text-base truncate">
                Site Location &amp; Accurate Report Map
              </h3>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {project.siteCoordinates
                  ? `${project.siteCoordinates.lat.toFixed(6)}°, ${project.siteCoordinates.lng.toFixed(6)}° · Included in PDF exports`
                  : project.location
                  ? `${project.location} · Pin exact coordinates for PDF report map`
                  : 'Search address, lock GPS, or tap map to embed accurate map in PDF exports'}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleFullScreen('reportMap')}
              aria-label={fullscreenSectionId === 'reportMap' ? 'Exit full screen for Site Location & Accurate Report Map' : 'Extend Site Location & Accurate Report Map to full screen'}
              aria-pressed={fullscreenSectionId === 'reportMap'}
              title={fullscreenSectionId === 'reportMap' ? 'Restore card size (Esc)' : 'Extend to full screen'}
              className={`w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition ${
                fullscreenSectionId === 'reportMap'
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {fullscreenSectionId === 'reportMap' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => toggleSection('reportMap')}
              aria-expanded={!isSectionCollapsed('reportMap')}
              aria-label="Toggle Site Location & Accurate Report Map"
              className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 transition"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('reportMap') ? '-rotate-90' : 'rotate-0'}`}
              />
            </button>
          </div>
        </div>

        {!isSectionCollapsed('reportMap') && (
          <div className="mt-4">
            <SiteReportMap
              key={`map-${project.id}`}
              project={project}
              currentGps={currentGps}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}
      </div>

      {/* Entity Measurements vs. Audit Verification Section */}
      <div className={getSectionClass('entityComparison', 'bg-white rounded-xl p-5 border border-slate-200')}>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => toggleSection('entityComparison')}
            aria-expanded={!isSectionCollapsed('entityComparison')}
            className="flex items-center gap-3 text-left min-w-0 flex-1 group"
          >
            <div className="p-2 bg-slate-100 text-slate-700 rounded-lg flex-shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 group-hover:text-slate-700 transition text-sm sm:text-base truncate">
                Entity Measurements vs. Audit Verification &amp; Variances
              </h3>
              <p className="text-xs text-slate-500 truncate mt-0.5 tabular-nums">
                {entitySummary.total === 0
                  ? 'Add entity-claimed Nos, Length, Width & Thickness to compare against audit verification'
                  : `${entitySummary.total} item${entitySummary.total === 1 ? '' : 's'} · ${entitySummary.matched} matched · ${entitySummary.excess} excess${entitySummary.underpayment > 0 ? ` · ${entitySummary.underpayment} underpayment` : ''}`}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('entity')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition whitespace-nowrap"
            >
              <span>Open Tab</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleFullScreen('entityComparison')}
              aria-label={fullscreenSectionId === 'entityComparison' ? 'Exit full screen for Entity Comparison' : 'Extend Entity Comparison to full screen'}
              aria-pressed={fullscreenSectionId === 'entityComparison'}
              title={fullscreenSectionId === 'entityComparison' ? 'Restore card size (Esc)' : 'Extend to full screen'}
              className={`w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition ${
                fullscreenSectionId === 'entityComparison'
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {fullscreenSectionId === 'entityComparison' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => toggleSection('entityComparison')}
              aria-expanded={!isSectionCollapsed('entityComparison')}
              aria-label="Toggle Entity Measurements Comparison"
              className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 transition"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('entityComparison') ? '-rotate-90' : 'rotate-0'}`}
              />
            </button>
          </div>
        </div>

        {!isSectionCollapsed('entityComparison') && (
          <div className="mt-4">
            <EntityComparisonModule
              key={`overview-entity-${project.id}`}
              project={project}
              onUpdateProject={onUpdateProject}
              onPatchProject={onPatchProject}
            />
          </div>
        )}
      </div>

      {/* Auditor Verification & Inspection Section on Overview */}
      <div className={getSectionClass('auditorRecord', 'pt-1 space-y-3')}>
        <div className="w-full flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => toggleSection('auditorRecord')}
            aria-expanded={!isSectionCollapsed('auditorRecord')}
            className="min-h-[44px] flex-1 flex items-center justify-between gap-2 text-slate-700 hover:text-slate-900 text-xs font-bold py-1 group text-left"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Auditor Verification &amp; Site Inspection Record</span>
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => toggleFullScreen('auditorRecord')}
              aria-label={fullscreenSectionId === 'auditorRecord' ? 'Exit full screen for Auditor Verification' : 'Extend Auditor Verification to full screen'}
              aria-pressed={fullscreenSectionId === 'auditorRecord'}
              title={fullscreenSectionId === 'auditorRecord' ? 'Restore card size (Esc)' : 'Extend to full screen'}
              className={`w-9 h-9 sm:w-7 sm:h-7 rounded-lg border flex items-center justify-center transition ${
                fullscreenSectionId === 'auditorRecord'
                  ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-800'
                  : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
            >
              {fullscreenSectionId === 'auditorRecord' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => toggleSection('auditorRecord')}
              aria-expanded={!isSectionCollapsed('auditorRecord')}
              aria-label="Toggle Auditor Verification & Site Inspection Record"
              className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 transition"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${isSectionCollapsed('auditorRecord') ? '-rotate-90' : 'rotate-0'}`}
              />
            </button>
          </div>
        </div>

        {!isSectionCollapsed('auditorRecord') && (
          <AuditorVerificationModule
            key={`overview-auditor-${project.id}`}
            project={project}
            onUpdateProject={onUpdateProject}
            embedded
          />
        )}
      </div>

    </div>
  );
};
