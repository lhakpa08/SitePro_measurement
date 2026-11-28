import React, { useEffect, useMemo, useState } from 'react';
import { ConstructionProject } from '../types';
import { getProjectSettings, formatChainage, isAreaUnit, isLengthUnit } from '../utils/geo';
import { getProjectMapData, StaticMapScope } from '../utils/staticMap';
import {
  buildMeasuredSummaryRows,
  computeMeasurements,
  downloadStandaloneHtmlReport,
  exportChainLinkPdf,
  exportProjectToExcel,
  exportProjectToPdf,
  exportRoadPdf,
  formatAuditStatus,
} from '../utils/export';
import {
  cleanVariance,
  computeEntityAuditComparisons,
  formatDiffLabel,
  formatVariance,
  roundTo,
} from '../utils/calculations';
import { SiteReportMap } from './SiteReportMap';
import {
  X,
  Printer,
  FileSpreadsheet,
  Globe,
  MapPin,
  FileText,
  ShieldCheck,
  Award,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ConstructionProject;
  onUpdateProject: (updated: ConstructionProject) => void;
  scope: StaticMapScope;
  onChangeScope: (scope: StaticMapScope) => void;
  currentGps?: { lat: number; lng: number; accuracy?: number };
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  scope,
  onChangeScope,
  currentGps,
}) => {
  const [reportView, setReportView] = useState<'simple' | 'detailed'>('simple');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const settings = useMemo(() => getProjectSettings(project), [project]);
  const { items, customItems } = settings;

  const computed = useMemo(() => {
    if (!isOpen) return null;

    const m = computeMeasurements(project, scope);
    const measuredRows = buildMeasuredSummaryRows(project, scope);
    const mapData = getProjectMapData(project, scope);
    const totalMappedPts = mapData.allPoints.length + (currentGps ? 1 : 0);

    const enabledCustom = customItems.filter((c) => {
      if (!c.enabled || !(c.quantity > 0)) return false;
      if (scope === 'fencing') return c.category === 'fencing';
      if (scope === 'road') return c.category === 'road';
      return true;
    });

    const entityComparisons = computeEntityAuditComparisons(project, scope).filter(
      (row) =>
        row.item.nos !== undefined ||
        row.item.length !== undefined ||
        row.item.width !== undefined ||
        row.item.thickness !== undefined ||
        row.item.auditNos !== undefined ||
        row.item.auditLength !== undefined ||
        row.item.auditWidth !== undefined ||
        row.item.auditThickness !== undefined ||
        row.item.verifiedOverride !== undefined ||
        (row.item.rate !== undefined && row.item.rate > 0) ||
        row.entityQty > 0
    );

    const hasAnyRates = entityComparisons.some((r) => r.rate !== undefined && r.rate > 0);
    const totalEntityAmount = roundTo(
      entityComparisons.reduce((sum, r) => sum + (r.entityAmount ?? 0), 0),
      2
    );
    const totalAuditAmount = roundTo(
      entityComparisons.reduce((sum, r) => sum + (r.auditAmount ?? 0), 0),
      2
    );
    let netOutcome: 'excess' | 'underpayment' | 'matched' = 'matched';
    let netDiff = 0;
    if (totalEntityAmount > totalAuditAmount) {
      netOutcome = 'excess';
      netDiff = roundTo(totalEntityAmount - totalAuditAmount, 2);
    } else if (totalAuditAmount > totalEntityAmount) {
      netOutcome = 'underpayment';
      netDiff = roundTo(totalAuditAmount - totalEntityAmount, 2);
    }

    const auditVarianceRows: Array<{ label: string; logged: string; verified: string; variance: string }> = [];
    if (scope === 'all' && project.auditInfo) {
      const a = project.auditInfo;
      const anyPosts =
        items.anglePosts.enabled ||
        items.intermediatePosts.enabled ||
        items.strutPosts.enabled ||
        items.gatePosts.enabled;
      if (anyPosts && a.verifiedPostCount !== undefined) {
        const diff = cleanVariance(a.verifiedPostCount, m.totalPosts, 0);
        if (diff !== 0) {
          auditVarianceRows.push({
            label: 'Fence Posts Total',
            logged: `${m.totalPosts} ${m.postUnit}`,
            verified: `${a.verifiedPostCount} ${m.postUnit}`,
            variance: `${formatVariance(diff, 0)} ${m.postUnit}`,
          });
        }
      }
      const meshUnitIsArea = isAreaUnit(items.chainLinkMesh.unit);
      const loggedMesh = roundTo(meshUnitIsArea ? m.meshArea : m.meshLen, 2);
      if (items.chainLinkMesh.enabled && a.verifiedMeshLength !== undefined) {
        const diff = cleanVariance(a.verifiedMeshLength, loggedMesh, 2);
        if (diff !== 0) {
          auditVarianceRows.push({
            label: meshUnitIsArea ? 'Chain-Link Mesh Area' : 'Chain-Link Mesh Length',
            logged: `${loggedMesh} ${items.chainLinkMesh.unit}`,
            verified: `${a.verifiedMeshLength} ${items.chainLinkMesh.unit}`,
            variance: `${formatVariance(diff, 2)} ${items.chainLinkMesh.unit}`,
          });
        }
      }
      const rrmUnitIsLength = isLengthUnit(items.rrmWall.unit);
      const loggedRrm = roundTo(rrmUnitIsLength ? m.rrmLen : m.rrmVol, 2);
      if (items.rrmWall.enabled && a.verifiedRrmVolume !== undefined) {
        const diff = cleanVariance(a.verifiedRrmVolume, loggedRrm, 2);
        if (diff !== 0) {
          auditVarianceRows.push({
            label: rrmUnitIsLength ? 'RMM Wall Length' : 'RMM Wall Volume',
            logged: `${loggedRrm.toFixed(2)} ${items.rrmWall.unit}`,
            verified: `${a.verifiedRrmVolume.toFixed(2)} ${items.rrmWall.unit}`,
            variance: `${formatVariance(diff, 2)} ${items.rrmWall.unit}`,
          });
        }
      }
      if (items.roadMeasurement.enabled && a.verifiedRoadLength !== undefined) {
        const diff = cleanVariance(a.verifiedRoadLength, m.roadLen, 2);
        if (diff !== 0) {
          auditVarianceRows.push({
            label: 'Road Length',
            logged: `${m.roadLen} ${items.roadMeasurement.unit}`,
            verified: `${a.verifiedRoadLength} ${items.roadMeasurement.unit}`,
            variance: `${formatVariance(diff, 2)} ${items.roadMeasurement.unit}`,
          });
        }
      }
      if (items.sideDrain.enabled && a.verifiedSideDrainLength !== undefined) {
        const diff = cleanVariance(a.verifiedSideDrainLength, m.sideDrainLen, 2);
        if (diff !== 0) {
          auditVarianceRows.push({
            label: 'Road Side Drain',
            logged: `${m.sideDrainLen} ${items.sideDrain.unit}`,
            verified: `${a.verifiedSideDrainLength} ${items.sideDrain.unit}`,
            variance: `${formatVariance(diff, 2)} ${items.sideDrain.unit}`,
          });
        }
      }
      enabledCustom.forEach((c) => {
        const vc = a.verifiedCustomItems?.[c.id];
        if (vc !== undefined) {
          const diff = cleanVariance(vc, c.quantity, 2);
          if (diff !== 0) {
            auditVarianceRows.push({
              label: c.name,
              logged: `${c.quantity} ${c.unit}`,
              verified: `${vc} ${c.unit}`,
              variance: `${formatVariance(diff, 2)} ${c.unit}`,
            });
          }
        }
      });
    }

    const kpiCards: Array<{ label: string; value: string; accentClass: string; valueClass?: string }> = [];
    if (scope !== 'road' && m.totalPosts > 0) {
      kpiCards.push({
        label: 'Total Posts',
        value: `${m.totalPosts} ${m.postUnit}`,
        accentClass: 'border-t-slate-900',
      });
    }
    if (m.totalAllLengths > 0) {
      kpiCards.push({
        label: 'Total Linear Length',
        value: `${m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.lengthUnit}`,
        accentClass: 'border-t-slate-900',
      });
    }
    if (m.totalAllAreas > 0) {
      kpiCards.push({
        label: 'Total Surface Area',
        value: `${m.totalAllAreas.toFixed(2)} ${m.areaUnit}`,
        accentClass: 'border-t-emerald-600',
        valueClass: 'text-emerald-700',
      });
    }
    if (m.totalAllVolumes > 0) {
      kpiCards.push({
        label: 'Total Volume',
        value: `${m.totalAllVolumes.toFixed(2)} ${m.volumeUnit}`,
        accentClass: 'border-t-emerald-600',
        valueClass: 'text-emerald-700',
      });
    }
    if (m.totalCustomQty > 0) {
      kpiCards.push({
        label: 'Custom Works Total',
        value: m.totalCustomQty.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        accentClass: 'border-t-indigo-600',
        valueClass: 'text-indigo-700',
      });
    }
    if (totalMappedPts > 0) {
      kpiCards.push({
        label: 'Mapped GPS Points',
        value: `${totalMappedPts} pts`,
        accentClass: 'border-t-violet-600',
        valueClass: 'text-violet-700',
      });
    }

    return {
      m,
      measuredRows,
      mapData,
      kpiCards,
      entityComparisons,
      hasAnyRates,
      totalEntityAmount,
      totalAuditAmount,
      netOutcome,
      netDiff,
      auditVarianceRows,
    };
  }, [isOpen, project, scope, currentGps, customItems, items]);

  if (!isOpen || !computed) return null;

  const {
    m,
    measuredRows,
    mapData,
    kpiCards,
    entityComparisons,
    hasAnyRates,
    totalEntityAmount,
    totalAuditAmount,
    netOutcome,
    netDiff,
    auditVarianceRows,
  } = computed;

  const handlePrintPdf = () => {
    if (scope === 'fencing') {
      exportChainLinkPdf(project, currentGps);
    } else if (scope === 'road') {
      exportRoadPdf(project, currentGps);
    } else {
      exportProjectToPdf(project, currentGps);
    }
  };

  const hasAuditNotes = scope === 'all' && Boolean(project.auditNotes?.trim());
  const hasAuditorRemarks = scope === 'all' && Boolean(project.auditInfo?.generalRemarks?.trim());
  const showAuditSection =
    scope === 'all' && (auditVarianceRows.length > 0 || hasAuditNotes || hasAuditorRemarks);

  let nextSec = 1;
  const summarySecNum = nextSec++;
  const entitySecNum = entityComparisons.length > 0 ? nextSec++ : 0;
  const auditSecNum = showAuditSection ? nextSec++ : 0;
  const mapSecNum = nextSec++;

  const formatCompactDims = (
    nos?: number,
    length?: number,
    width?: number,
    thickness?: number
  ): string => {
    const parts: string[] = [];
    if (nos !== undefined) parts.push(`Nos:${nos}`);
    if (length !== undefined) parts.push(`L:${length}`);
    if (width !== undefined) parts.push(`W:${width}`);
    if (thickness !== undefined) parts.push(`T:${thickness}`);
    return parts.join(' × ');
  };

  const getStatusBadgeClasses = (status: string): string => {
    if (status === 'matched') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'excess' || status === 'shortfall') return 'bg-red-50 text-red-700 border-red-200';
    if (status === 'underpayment') return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Exported Report & Real-Time Map"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Sticky Modal Header & Export Actions */}
        <div className="bg-slate-900 text-white px-4 py-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold truncate">
              Site Report &amp; Real-Time Map &mdash; {project.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <div className="flex items-center gap-1">
                {(['all', 'fencing', 'road'] as StaticMapScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChangeScope(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                      scope === s
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s === 'all' ? 'Full Site' : s === 'fencing' ? 'Fencing' : 'Road'}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-700 hidden sm:block" />

              <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => setReportView('simple')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    reportView === 'simple'
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  <span>Simple Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportView('detailed')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    reportView === 'detailed'
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Detailed MB</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="min-h-[38px] px-3.5 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={() => downloadStandaloneHtmlReport(project, scope, currentGps)}
              className="min-h-[38px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition"
              title="Download standalone HTML report with interactive real-time map"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>HTML Map Report</span>
            </button>

            <button
              type="button"
              onClick={() => exportProjectToExcel(project, scope)}
              className="min-h-[38px] px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Excel CSV</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close report preview"
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Report Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Document Header & Project Profile Table */}
          <div className="bg-white border-2 border-slate-900 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-slate-900 text-white px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xs shrink-0">
                  MB
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-amber-400">
                    Official Inspection &amp; Measurement Record
                  </div>
                  <h3 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
                    Physical Measurement &amp; Technical Audit Report
                  </h3>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                <span className="px-2.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-semibold capitalize">
                  Scope: {scope === 'all' ? 'Full Site Audit' : scope === 'fencing' ? 'Fencing Only' : 'Road Only'}
                </span>
                <span className="px-2.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono font-semibold">
                  Units: {settings.unitSystem.toUpperCase()}
                </span>
              </div>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <tbody className="divide-y divide-slate-200">
                <tr className="divide-y sm:divide-y-0 sm:divide-x divide-slate-200 flex flex-col sm:table-row">
                  <td className="p-3 sm:w-1/2 bg-slate-50/60">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Project / Work Name
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{project.name}</div>
                  </td>
                  <td className="p-3 sm:w-1/2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Client / Department
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5">{project.clientName || 'N/A'}</div>
                  </td>
                </tr>
                <tr className="divide-y sm:divide-y-0 sm:divide-x divide-slate-200 flex flex-col sm:table-row">
                  <td className="p-3 sm:w-1/2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Site Location / Coordinates
                    </div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5">{project.location || 'N/A'}</div>
                  </td>
                  <td className="p-3 sm:w-1/2 bg-slate-50/60">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Executing Agency / Contractor
                    </div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5">
                      {project.entityName || 'General Contractor / In-house'}
                    </div>
                  </td>
                </tr>
                <tr className="divide-y sm:divide-y-0 sm:divide-x divide-slate-200 flex flex-col sm:table-row">
                  <td className="p-3 sm:w-1/2 bg-slate-50/60">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Inspecting Technical Auditor
                    </div>
                    <div className="text-xs font-semibold text-slate-900 mt-0.5">
                      {project.auditInfo?.auditorName || 'Pending Assignment'}
                      {project.auditInfo?.auditDate ? ` · Audit Date: ${project.auditInfo.auditDate}` : ''}
                    </div>
                  </td>
                  <td className="p-3 sm:w-1/2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Audit Compliance Status
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          project.auditInfo?.auditStatus === 'fully_compliant'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : project.auditInfo?.auditStatus === 'verified_with_variance'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{formatAuditStatus(project.auditInfo?.auditStatus)}</span>
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {reportView === 'simple' ? (
            <>
              {/* Executive Summary Key Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {m.totalAllLengths > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Linear Span</div>
                    <div className="text-base font-extrabold text-slate-900 mt-1 tabular-nums">
                      {m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                      <span className="text-xs font-semibold text-slate-600">{m.lengthUnit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">Linear alignment</div>
                  </div>
                )}
                {m.totalAllAreas > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Surface Area</div>
                    <div className="text-base font-extrabold text-emerald-700 mt-1 tabular-nums">
                      {m.totalAllAreas.toFixed(2)}{' '}
                      <span className="text-xs font-semibold text-emerald-600">{m.areaUnit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">Mesh &amp; carriageway</div>
                  </div>
                )}
                {m.totalAllVolumes > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Volume</div>
                    <div className="text-base font-extrabold text-emerald-700 mt-1 tabular-nums">
                      {m.totalAllVolumes.toFixed(2)}{' '}
                      <span className="text-xs font-semibold text-emerald-600">{m.volumeUnit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">RMM wall &amp; earthwork</div>
                  </div>
                )}
                {scope !== 'road' && m.totalPosts > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fence Posts</div>
                    <div className="text-base font-extrabold text-slate-900 mt-1 tabular-nums">
                      {m.totalPosts}{' '}
                      <span className="text-xs font-semibold text-slate-600">{m.postUnit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                      {project.auditInfo?.verifiedPostCount !== undefined
                        ? `Verified: ${project.auditInfo.verifiedPostCount} posts`
                        : 'Field post count'}
                    </div>
                  </div>
                )}
                {hasAnyRates && (
                  <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Financial Audit</div>
                    <div className="text-base font-extrabold text-indigo-950 mt-1 tabular-nums">
                      {netOutcome === 'matched'
                        ? 'Full Match'
                        : netOutcome === 'excess'
                        ? `-${netDiff.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : `+${netDiff.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </div>
                    <div className="text-[10px] text-indigo-600 mt-0.5 font-medium capitalize truncate">
                      {netOutcome === 'matched' ? '0.00 difference' : `${netOutcome} claim`}
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Physical Measurement & Field Verification Register */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-700" />
                    <span>Physical Measurement &amp; Field Verification Register</span>
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {measuredRows.length} Recorded Item{measuredRows.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="py-2.5 px-3 text-center w-10">#</th>
                        <th className="py-2.5 px-3 w-48">Work Item</th>
                        <th className="py-2.5 px-3">Specification &amp; Dimensions</th>
                        <th className="py-2.5 px-3 text-right w-28">Quantity</th>
                        <th className="py-2.5 px-3 text-center w-20">Unit</th>
                        <th className="py-2.5 px-3 w-40">GPS Station</th>
                        <th className="py-2.5 px-3 text-center w-28">Field Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 tabular-nums">
                      {measuredRows.length > 0 ? (
                        measuredRows.map((row, idx) => (
                          <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                            <td className="py-2 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-900">{row.item}</div>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 mt-0.5">
                                {row.category}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{row.details}</td>
                            <td className="py-2 px-3 text-right font-bold text-slate-900">{row.quantity}</td>
                            <td className="py-2 px-3 text-center font-medium text-slate-600">{row.unit}</td>
                            <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">{row.capturedGps}</td>
                            <td className="py-2 px-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Verified</span>
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            No measurements recorded for this site yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {measuredRows.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-800 text-xs">
                          <td className="py-2.5 px-3 text-center font-mono">&Sigma;</td>
                          <td colSpan={2} className="py-2.5 px-3 uppercase text-[11px] tracking-wider">
                            Summary Totals
                          </td>
                          <td colSpan={4} className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {scope !== 'road' && m.totalPosts > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-slate-900">
                                  Posts: {m.totalPosts} {m.postUnit}
                                </span>
                              )}
                              {m.totalAllLengths > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-slate-900">
                                  Linear: {m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                                  {m.lengthUnit}
                                </span>
                              )}
                              {m.totalAllAreas > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-emerald-800">
                                  Area: {m.totalAllAreas.toFixed(2)} {m.areaUnit}
                                </span>
                              )}
                              {m.totalAllVolumes > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-emerald-800">
                                  Volume: {m.totalAllVolumes.toFixed(2)} {m.volumeUnit}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Item-wise Audit Reconciliation & Cost Statement */}
              {entityComparisons.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                      Item-wise Audit Reconciliation &amp; Cost Variance{project.entityName ? ` (${project.entityName})` : ''}
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {entityComparisons.length} Reconciled Item{entityComparisons.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3 text-center w-10">#</th>
                          <th className="py-2.5 px-3 min-w-[140px]">Work Item Description</th>
                          <th className="py-2.5 px-3 text-center w-16">Unit</th>
                          {hasAnyRates && <th className="py-2.5 px-3 text-right w-20">Rate</th>}
                          <th className="py-2.5 px-3 text-right w-28">Entity Claimed</th>
                          <th className="py-2.5 px-3 text-right bg-indigo-50 text-indigo-950 w-28">Audit Verified</th>
                          <th className="py-2.5 px-3 text-right w-28">Quantity Var.</th>
                          {hasAnyRates && <th className="py-2.5 px-3 text-right w-28">Cost Var.</th>}
                          <th className="py-2.5 px-3 text-center w-28">Compliance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 tabular-nums">
                        {entityComparisons.map((row, idx) => {
                          const unit = row.auditUnit || row.item.unit;
                          const diffInfo = formatDiffLabel(row.status, row.variance, unit, row.amountVariance);
                          const qtyVarText =
                            row.variance === null
                              ? '—'
                              : `${formatVariance(row.variance, 2)}${
                                  row.variancePct !== null && row.variance !== 0
                                    ? ` (${row.variancePct > 0 ? `+${row.variancePct}` : row.variancePct}%)`
                                    : ''
                                }`;
                          const costVarText =
                            row.amountVariance === null
                              ? '—'
                              : row.amountVariance === 0
                              ? '0.00'
                              : `${row.amountVariance > 0 ? '+' : '-'}${Math.abs(row.amountVariance).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`;

                          return (
                            <tr key={row.item.id} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-bold text-slate-900">{row.item.itemName || row.auditLabel}</td>
                              <td className="py-2.5 px-3 text-center font-medium text-slate-600">{unit}</td>
                              {hasAnyRates && (
                                <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                  {row.rate !== undefined ? row.rate : '—'}
                                </td>
                              )}
                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">{row.entityQty}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-indigo-950 bg-indigo-50/40">
                                {row.auditQty !== null ? row.auditQty : 'Pending'}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-bold ${diffInfo.colorClass}`}>
                                {qtyVarText}
                              </td>
                              {hasAnyRates && (
                                <td className={`py-2.5 px-3 text-right font-mono font-bold ${diffInfo.colorClass}`}>
                                  {costVarText}
                                </td>
                              )}
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${getStatusBadgeClasses(
                                    row.status
                                  )}`}
                                >
                                  {diffInfo.badgeLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {hasAnyRates && (
                        <tfoot>
                          <tr className="bg-indigo-50/80 font-extrabold text-slate-900 border-t-2 border-slate-800 tabular-nums">
                            <td className="py-2.5 px-3 text-center font-mono">&Sigma;</td>
                            <td colSpan={2} className="py-2.5 px-3 uppercase text-[11px] tracking-wider">
                              Total Financial Reconciliation
                            </td>
                            <td className="py-2.5 px-3"></td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {totalEntityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-950">
                              {totalAuditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3"></td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono font-bold ${
                                netOutcome === 'excess'
                                  ? 'text-red-700'
                                  : netOutcome === 'underpayment'
                                  ? 'text-blue-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {netDiff === 0
                                ? '0.00'
                                : `${netOutcome === 'underpayment' ? '+' : '-'}${netDiff.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}`}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${getStatusBadgeClasses(
                                  netOutcome
                                )}`}
                              >
                                {netOutcome === 'excess' ? 'Excess' : netOutcome === 'underpayment' ? 'Underpayment' : 'Matched'}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* Auditor Observations & Remarks (if present) */}
              {(hasAuditNotes || hasAuditorRemarks) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-2 text-slate-700">
                  {hasAuditNotes && (
                    <div className="flex items-start gap-2">
                      <div className="font-bold text-slate-900 min-w-[120px] shrink-0">Site Field Notes:</div>
                      <div className="text-slate-800 leading-relaxed">{project.auditNotes!.trim()}</div>
                    </div>
                  )}
                  {hasAuditorRemarks && (
                    <div className="flex items-start gap-2 pt-1 border-t border-slate-200">
                      <div className="font-bold text-slate-900 min-w-[120px] shrink-0">
                        Auditor Observations{project.auditInfo?.auditDate ? ` (${project.auditInfo.auditDate})` : ''}:
                      </div>
                      <div className="text-slate-800 leading-relaxed">{project.auditInfo!.generalRemarks!.trim()}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Executive Summary & Scope Abstract Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-700" />
                <span>Executive Summary &amp; Scope Abstract</span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {measuredRows.length} Measured Work Item{measuredRows.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-12 text-center">Ref</th>
                    <th className="py-2.5 px-3 w-40">Discipline / Scope</th>
                    <th className="py-2.5 px-3">Component Description</th>
                    <th className="py-2.5 px-3 text-right w-36">Physical Total</th>
                    <th className="py-2.5 px-3 text-center w-20">Unit</th>
                    <th className="py-2.5 px-3">Field Verification Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {scope !== 'road' && m.totalPosts > 0 && (
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">E1</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">Fence Enclosure</td>
                      <td className="py-2 px-3 text-slate-600">Physical post count across all installed post types</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums">{m.totalPosts}</td>
                      <td className="py-2 px-3 text-center text-slate-600 font-medium">{m.postUnit}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {project.auditInfo?.verifiedPostCount !== undefined
                          ? `Auditor verified: ${project.auditInfo.verifiedPostCount} ${m.postUnit}`
                          : 'Pending on-site audit verification'}
                      </td>
                    </tr>
                  )}
                  {m.totalAllLengths > 0 && (
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">E2</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">Linear Infrastructure</td>
                      <td className="py-2 px-3 text-slate-600">Total linear span (Mesh + RMM Wall + Road + Side Drain)</td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums">
                        {m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-600 font-medium">{m.lengthUnit}</td>
                      <td className="py-2 px-3 text-slate-600">Full linear alignment verified against field stations</td>
                    </tr>
                  )}
                  {m.totalAllAreas > 0 && (
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">E3</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">Surface Area</td>
                      <td className="py-2 px-3 text-slate-600">Total surface coverage (Chain-Link Mesh + Road Carriageway)</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700 tabular-nums">
                        {m.totalAllAreas.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-600 font-medium">{m.areaUnit}</td>
                      <td className="py-2 px-3 text-slate-600">Calculated from length × average width measurements</td>
                    </tr>
                  )}
                  {m.totalAllVolumes > 0 && (
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">E4</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">Masonry &amp; Earthwork</td>
                      <td className="py-2 px-3 text-slate-600">Total cubic content (RMM wall volume + Road earthwork cut/fill)</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-700 tabular-nums">
                        {m.totalAllVolumes.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-600 font-medium">{m.volumeUnit}</td>
                      <td className="py-2 px-3 text-slate-600">Calculated from multi-point width/depth dimension samples</td>
                    </tr>
                  )}
                  {m.totalCustomQty > 0 && (
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">E5</td>
                      <td className="py-2 px-3 font-semibold text-slate-900">Custom Work Items</td>
                      <td className="py-2 px-3 text-slate-600">Project-specific custom civil &amp; ancillary works</td>
                      <td className="py-2 px-3 text-right font-bold text-indigo-700 tabular-nums">
                        {m.totalCustomQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-600 font-medium">units</td>
                      <td className="py-2 px-3 text-slate-600">Reconciled with custom work items register</td>
                    </tr>
                  )}
                  {hasAnyRates && (
                    <tr className="bg-indigo-50/40 font-semibold hover:bg-indigo-50/60">
                      <td className="py-2 px-3 text-center font-mono text-indigo-900">E6</td>
                      <td className="py-2 px-3 font-bold text-indigo-950">Financial Reconciliation</td>
                      <td className="py-2 px-3 text-indigo-900">
                        Entity claimed value vs. auditor verified valuation
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-indigo-950 tabular-nums">
                        {totalAuditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2 px-3 text-center text-indigo-800">currency</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${
                            netOutcome === 'excess'
                              ? 'text-red-700'
                              : netOutcome === 'underpayment'
                              ? 'text-blue-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {netOutcome === 'excess' &&
                            `Excess claim: -${netDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          {netOutcome === 'underpayment' &&
                            `Underpayment due: +${netDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          {netOutcome === 'matched' && 'Full financial compliance (0.00 difference)'}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 1: Detailed Physical Measurement Book (MB) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                {summarySecNum}. Physical Measurement Summary (Measurement Book Register)
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">
                {measuredRows.length} Recorded Item{measuredRows.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-48">Work Item &amp; Category</th>
                    <th className="py-2.5 px-3">Specification &amp; Field Dimension Breakdown</th>
                    <th className="py-2.5 px-3 text-right w-32">Measured Qty</th>
                    <th className="py-2.5 px-3 text-center w-20">Unit</th>
                    <th className="py-2.5 px-3 w-40">GPS Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {measuredRows.length > 0 ? (
                    measuredRows.map((row, idx) => (
                      <tr key={`${row.item}-${idx}`} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                        <td className="py-2.5 px-3 text-center text-slate-500 tabular-nums">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{row.item}</div>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 mt-0.5">
                            {row.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{row.details}</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                          {row.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600 font-medium whitespace-nowrap">{row.unit}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                          {row.capturedGps}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        No measurement items recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
                {measuredRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
                      <td className="py-2.5 px-3 text-center font-mono">&Sigma;</td>
                      <td className="py-2.5 px-3 uppercase tracking-wider text-[11px]">Subtotal Summary</td>
                      <td colSpan={4} className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          {scope !== 'road' && m.totalPosts > 0 && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-slate-900">
                              Posts: {m.totalPosts} {m.postUnit}
                            </span>
                          )}
                          {m.totalAllLengths > 0 && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-slate-900">
                              Linear: {m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })} {m.lengthUnit}
                            </span>
                          )}
                          {m.totalAllAreas > 0 && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-emerald-800">
                              Area: {m.totalAllAreas.toFixed(2)} {m.areaUnit}
                            </span>
                          )}
                          {m.totalAllVolumes > 0 && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-bold text-emerald-800">
                              Volume: {m.totalAllVolumes.toFixed(2)} {m.volumeUnit}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Section 2: Entity Claimed vs. Audit Verified Reconciliation */}
          {entityComparisons.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  {entitySecNum}. Item-wise Measurement Reconciliation &amp; Cost Variance Statement
                  {project.entityName ? ` (${project.entityName})` : ''}
                </h3>
                <span className="text-[11px] font-semibold text-slate-500">
                  {entityComparisons.length} Reconciled Item{entityComparisons.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    {hasAnyRates ? (
                      <>
                        <tr className="bg-slate-100 text-slate-800 border-b border-slate-200">
                          <th className="py-2.5 px-2.5 font-bold text-center w-8" rowSpan={2}>#</th>
                          <th className="py-2.5 px-3 font-bold min-w-[150px]" rowSpan={2}>Work Item Description</th>
                          <th className="py-2.5 px-2 font-bold text-right w-16" rowSpan={2}>Rate</th>
                          <th
                            className="py-1.5 px-3 font-bold text-center bg-slate-100 text-slate-900 border-l border-r border-slate-200"
                            colSpan={2}
                          >
                            Entity Claimed Measurement (MB)
                          </th>
                          <th
                            className="py-1.5 px-3 font-bold text-center bg-indigo-50 text-indigo-950 border-r border-indigo-200"
                            colSpan={2}
                          >
                            Field Audit Verification
                          </th>
                          <th className="py-1.5 px-3 font-bold text-center bg-slate-100 text-slate-900" colSpan={3}>
                            Reconciliation &amp; Variance Analysis
                          </th>
                        </tr>
                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-semibold">
                          <th className="py-1.5 px-2.5 text-right border-l border-slate-200 min-w-[110px]">Dimensions &amp; Qty</th>
                          <th className="py-1.5 px-2 text-right border-r border-slate-200 w-24">Claimed Amt</th>
                          <th className="py-1.5 px-2.5 text-right bg-indigo-50/50 text-indigo-950 min-w-[110px]">Verified Qty</th>
                          <th className="py-1.5 px-2 text-right bg-indigo-50/50 text-indigo-950 border-r border-indigo-200 w-24">Verified Amt</th>
                          <th className="py-1.5 px-2 text-right w-24">Qty Var.</th>
                          <th className="py-1.5 px-2 text-right w-24">Cost Var.</th>
                          <th className="py-1.5 px-2 text-center w-24">Status</th>
                        </tr>
                      </>
                    ) : (
                      <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
                        <th className="py-2.5 px-2.5 text-center w-8">#</th>
                        <th className="py-2.5 px-3 min-w-[160px]">Work Item Description</th>
                        <th className="py-2.5 px-2 text-center w-16">Unit</th>
                        <th className="py-2.5 px-3 text-right min-w-[130px]">Entity Claimed (Dimensions &amp; Qty)</th>
                        <th className="py-2.5 px-3 text-right bg-indigo-50 text-indigo-950 min-w-[130px]">
                          Audit Verified (Dimensions &amp; Qty)
                        </th>
                        <th className="py-2.5 px-2.5 text-right w-32">Quantity Variance</th>
                        <th className="py-2.5 px-2.5 text-center w-28">Compliance Status</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-slate-200 tabular-nums">
                    {entityComparisons.map((row, idx) => {
                      const unit = row.auditUnit || row.item.unit;
                      const diffInfo = formatDiffLabel(row.status, row.variance, unit, row.amountVariance);
                      const entityDimsText = formatCompactDims(
                        row.item.nos,
                        row.item.length,
                        row.item.width,
                        row.item.thickness
                      );
                      const auditDimsText = formatCompactDims(
                        row.auditDims.nos,
                        row.auditDims.length,
                        row.auditDims.width,
                        row.auditDims.thickness
                      );
                      const qtyVarText =
                        row.variance === null
                          ? '—'
                          : `${formatVariance(row.variance, 3)}${
                              row.variancePct !== null && row.variance !== 0
                                ? ` (${row.variancePct > 0 ? `+${row.variancePct}` : row.variancePct}%)`
                                : ''
                            }`;
                      const rateText = row.rate !== undefined ? `${row.rate}` : '—';
                      const entityAmtText =
                        row.entityAmount !== null
                          ? row.entityAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—';
                      const auditAmtText =
                        row.auditAmount !== null
                          ? row.auditAmount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : row.rate !== undefined
                          ? 'Pending'
                          : '—';
                      const costVarText =
                        row.amountVariance === null
                          ? '—'
                          : row.amountVariance === 0
                          ? '0.00'
                          : `${row.amountVariance > 0 ? '+' : '-'}${Math.abs(row.amountVariance).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`;

                      return (
                        <tr key={row.item.id} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="py-2.5 px-2 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{row.item.itemName || row.auditLabel}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {unit}
                              {row.item.remarks ? ` · ${row.item.remarks}` : ''}
                            </div>
                          </td>
                          {!hasAnyRates && <td className="py-2.5 px-2 text-center text-slate-600 font-medium">{unit}</td>}
                          {hasAnyRates && <td className="py-2.5 px-2 text-right font-mono text-slate-700">{rateText}</td>}
                          <td className="py-2.5 px-2.5 text-right">
                            <div className="font-bold text-slate-900">{row.entityQty}</div>
                            {entityDimsText && (
                              <div className="text-[10px] font-mono text-slate-500 bg-slate-100 inline-block px-1 py-0.2 rounded mt-0.5">
                                {entityDimsText}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right bg-indigo-50/40">
                            <div className="font-bold text-indigo-900">
                              {row.auditQty !== null ? `${row.auditQty}` : 'Pending'}
                            </div>
                            {auditDimsText && (
                              <div className="text-[10px] font-mono text-indigo-700 bg-indigo-100/60 inline-block px-1 py-0.2 rounded mt-0.5">
                                {auditDimsText}
                              </div>
                            )}
                          </td>
                          {hasAnyRates && (
                            <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-900">
                              {entityAmtText}
                            </td>
                          )}
                          {hasAnyRates && (
                            <td className="py-2.5 px-2 text-right font-mono font-semibold text-indigo-900 bg-indigo-50/40">
                              {auditAmtText}
                            </td>
                          )}
                          <td className={`py-2.5 px-2.5 text-right font-bold whitespace-nowrap ${diffInfo.colorClass}`}>
                            {qtyVarText}
                          </td>
                          {hasAnyRates && (
                            <td className={`py-2.5 px-2 text-right font-mono font-bold whitespace-nowrap ${diffInfo.colorClass}`}>
                              {costVarText}
                            </td>
                          )}
                          <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${getStatusBadgeClasses(
                                row.status
                              )}`}
                            >
                              {diffInfo.badgeLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {hasAnyRates && (
                    <tfoot>
                      <tr className="bg-indigo-50/80 font-extrabold text-slate-900 border-t-2 border-slate-800 tabular-nums">
                        <td className="py-2.5 px-2 text-center font-mono">&Sigma;</td>
                        <td colSpan={4} className="py-2.5 px-3 text-slate-900 uppercase text-[11px] tracking-wider">
                          Total Financial Reconciliation
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                          {totalEntityAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-indigo-900">
                          {totalAuditAmount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2.5 px-2"></td>
                        <td
                          className={`py-2.5 px-2 text-right font-mono font-bold whitespace-nowrap ${
                            netOutcome === 'excess'
                              ? 'text-red-700'
                              : netOutcome === 'underpayment'
                              ? 'text-blue-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {netDiff === 0
                            ? '0.00'
                            : `${netOutcome === 'underpayment' ? '+' : '-'}${netDiff.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`}
                        </td>
                        <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${getStatusBadgeClasses(
                              netOutcome
                            )}`}
                          >
                            {netOutcome === 'excess'
                              ? 'Excess'
                              : netOutcome === 'underpayment'
                              ? 'Underpayment'
                              : 'Matched'}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Section 3: Auditor Verification Variances & Remarks */}
          {auditSecNum > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  {auditSecNum}. Auditor Verification Variances &amp; Inspection Observations
                </h3>
                <span className="text-[11px] font-semibold text-slate-500">
                  {auditVarianceRows.length > 0 ? `${auditVarianceRows.length} Discrepanc${auditVarianceRows.length === 1 ? 'y' : 'ies'} Logged` : 'Compliance Endorsement'}
                </span>
              </div>

              {auditVarianceRows.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <th className="py-2 px-3">Component Description</th>
                        <th className="py-2 px-3 text-right w-32">Field Logged (MB)</th>
                        <th className="py-2 px-3 text-right w-32">Physically Verified</th>
                        <th className="py-2 px-3 text-right w-32">Net Variance (Δ)</th>
                        <th className="py-2 px-3 text-center w-28">Audit Finding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 tabular-nums">
                      {auditVarianceRows.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="py-2 px-3 font-bold text-slate-900">{row.label}</td>
                          <td className="py-2 px-3 text-right text-slate-700 whitespace-nowrap">{row.logged}</td>
                          <td className="py-2 px-3 text-right font-bold text-indigo-900 whitespace-nowrap">{row.verified}</td>
                          <td className="py-2 px-3 text-right font-extrabold text-red-600 whitespace-nowrap">{row.variance}</td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Discrepancy
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(hasAuditNotes || hasAuditorRemarks) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-2 text-slate-700">
                  {hasAuditNotes && (
                    <div className="flex items-start gap-2">
                      <div className="font-bold text-slate-900 min-w-[120px] shrink-0">Site Field Notes:</div>
                      <div className="text-slate-800 leading-relaxed">{project.auditNotes!.trim()}</div>
                    </div>
                  )}
                  {hasAuditorRemarks && (
                    <div className="flex items-start gap-2 pt-1 border-t border-slate-200">
                      <div className="font-bold text-slate-900 min-w-[120px] shrink-0">
                        Auditor Observations{project.auditInfo?.auditDate ? ` (${project.auditInfo.auditDate})` : ''}:
                      </div>
                      <div className="text-slate-800 leading-relaxed">{project.auditInfo!.generalRemarks!.trim()}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

          {/* Section 4: Real-Time Site Map & Geospatial Survey Station Register */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-1.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-600" />
                <span>{mapSecNum}. Site Location &amp; Real-Time Geospatial Map</span>
              </h3>
              {currentGps && (
                <span className="text-[11px] font-mono text-sky-700 bg-sky-50 border border-sky-200 rounded-md px-2 py-0.5 tabular-nums">
                  Live GPS: {currentGps.lat.toFixed(6)}, {currentGps.lng.toFixed(6)}
                </span>
              )}
            </div>

            <SiteReportMap
              key={`report-map-${project.id}`}
              project={project}
              currentGps={currentGps}
              onUpdateProject={onUpdateProject}
              scope={scope}
              readOnly
            />

            {(mapData.inputLocations.length > 0 ||
              mapData.roadStart ||
              mapData.roadEnd ||
              mapData.sitePin ||
              mapData.gpsPosts.length > 0 ||
              currentGps) && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl mt-3 bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-2 px-3 text-center w-16">Station</th>
                      <th className="py-2 px-3 w-48">Feature Reference</th>
                      <th className="py-2 px-3 w-48">Coordinates (Lat, Lng)</th>
                      <th className="py-2 px-3">Field Notes &amp; Survey Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {mapData.sitePin && (
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200">
                            S
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">Site Anchor Station</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {mapData.sitePin.lat.toFixed(6)}, {mapData.sitePin.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{project.location || 'Pinned site location'}</td>
                      </tr>
                    )}
                    {currentGps && (
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200">
                            G
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">Live Surveyor Device GPS</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {currentGps.lat.toFixed(6)}, {currentGps.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          Device GPS{currentGps.accuracy ? ` (±${Math.round(currentGps.accuracy)}m)` : ''}
                        </td>
                      </tr>
                    )}
                    {scope !== 'fencing' && mapData.roadStart && (
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                            A
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">Road Alignment Start</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {mapData.roadStart.lat.toFixed(6)}, {mapData.roadStart.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          Ch. {project.roadSections[0]?.chainageStart || '0+000'}
                        </td>
                      </tr>
                    )}
                    {scope !== 'fencing' && mapData.roadEnd && (
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                            B
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">Road Alignment End</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {mapData.roadEnd.lat.toFixed(6)}, {mapData.roadEnd.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          Ch. {project.roadSections[0]?.chainageEnd || formatChainage(project.roadSections[0]?.lengthMeters || 0)}
                        </td>
                      </tr>
                    )}
                    {scope !== 'road' && mapData.gpsPosts.length > 0 && (
                      <tr className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200">
                            P1–P{mapData.gpsPosts.length}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">Fence Boundary Posts</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {mapData.gpsPosts.length === 1
                            ? `${mapData.gpsPosts[0].gps.lat.toFixed(6)}, ${mapData.gpsPosts[0].gps.lng.toFixed(6)}`
                            : `${mapData.gpsPosts[0].gps.lat.toFixed(6)}, ${mapData.gpsPosts[0].gps.lng.toFixed(6)} → ${mapData.gpsPosts[mapData.gpsPosts.length - 1].gps.lat.toFixed(6)}, ${mapData.gpsPosts[mapData.gpsPosts.length - 1].gps.lng.toFixed(6)}`}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {mapData.gpsPosts.length} of {project.fencePosts.length} posts mapped
                        </td>
                      </tr>
                    )}
                    {mapData.inputLocations.map((loc, idx) => (
                      <tr key={loc.id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-center">
                          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-violet-700 bg-violet-50 border border-violet-200">
                            I{idx + 1}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">{loc.fieldLabel}</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {loc.gps.lat.toFixed(6)}, {loc.gps.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {loc.valueSummary ? `${loc.valueSummary} · ` : ''}
                          {new Date(loc.capturedAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 5: Official Certification & Endorsement Sign-off */}
          <div className="space-y-2.5 pt-2">
            <div className="border border-slate-300 rounded-xl bg-slate-50/60 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-4 h-4 text-slate-700" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Certificate of Physical Measurement &amp; Technical Audit
                </h4>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                We hereby certify that the physical measurements, dimensions, and specifications detailed in this report have been physically verified on-site using GPS geospatial tagging and standard measurement book procedures. The quantities and variances stated herein represent an accurate and authentic record of work executed at the site.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-200 text-xs">
                <div>
                  <div className="font-bold text-slate-900 mb-8">Prepared By:</div>
                  <div className="border-t border-slate-400 pt-1 text-slate-700 font-semibold">
                    Site Engineer / Surveyor
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Signature &amp; Date</div>
                </div>

                <div>
                  <div className="font-bold text-slate-900 mb-8">Verified &amp; Endorsed By:</div>
                  <div className="border-t border-slate-400 pt-1 text-slate-700 font-semibold">
                    {project.auditInfo?.auditorName || 'Technical Auditor'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {project.auditInfo?.auditDate ? `Inspected on ${project.auditInfo.auditDate}` : 'Official Signature & Seal'}
                  </div>
                </div>

                <div>
                  <div className="font-bold text-slate-900 mb-8">Accepted By:</div>
                  <div className="border-t border-slate-400 pt-1 text-slate-700 font-semibold">
                    {project.entityName || 'Executing Agency / Contractor'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Representative Signature</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
