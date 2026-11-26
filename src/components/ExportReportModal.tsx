import React, { useEffect } from 'react';
import { ConstructionProject } from '../types';
import { getProjectSettings, formatChainage } from '../utils/geo';
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
import { cleanVariance, computeEntityAuditComparisons, formatVariance, roundTo } from '../utils/calculations';
import { SiteReportMap } from './SiteReportMap';
import { X, Printer, FileSpreadsheet, Globe, MapPin } from 'lucide-react';

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
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
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

  const handlePrintPdf = () => {
    if (scope === 'fencing') {
      exportChainLinkPdf(project, currentGps);
    } else if (scope === 'road') {
      exportRoadPdf(project, currentGps);
    } else {
      exportProjectToPdf(project, currentGps);
    }
  };

  const totalBadges = [
    scope !== 'road' && m.totalPosts > 0 ? `Posts: ${m.totalPosts} ${m.postUnit}` : null,
    m.totalAllLengths > 0
      ? `Linear: ${m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.lengthUnit}`
      : null,
    m.totalAllAreas > 0 ? `Area: ${m.totalAllAreas.toFixed(2)} ${m.areaUnit}` : null,
    m.totalAllVolumes > 0 ? `Volume: ${m.totalAllVolumes.toFixed(2)} ${m.volumeUnit}` : null,
    enabledCustom.length > 0 ? `Custom: ${m.totalCustomQty}` : null,
  ].filter((v): v is string => Boolean(v));

  const entityComparisons = computeEntityAuditComparisons(project, scope).filter(
    (row) =>
      row.item.nos !== undefined ||
      row.item.length !== undefined ||
      row.item.width !== undefined ||
      row.item.thickness !== undefined ||
      row.item.verifiedOverride !== undefined ||
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

  const auditRows: Array<{ label: string; logged: string; verified: string; variance: string }> = [];
  if (scope === 'all' && project.auditInfo) {
    const a = project.auditInfo;
    const anyPosts =
      items.anglePosts.enabled ||
      items.intermediatePosts.enabled ||
      items.strutPosts.enabled ||
      items.gatePosts.enabled;
    if (anyPosts && (m.totalPosts > 0 || (a.verifiedPostCount ?? 0) > 0)) {
      const vp = a.verifiedPostCount ?? m.totalPosts;
      const diff = cleanVariance(vp, m.totalPosts, 0);
      auditRows.push({
        label: 'Fence Posts Total',
        logged: `${m.totalPosts} ${m.postUnit}`,
        verified: `${vp} ${m.postUnit}`,
        variance: `${formatVariance(diff, 0)} ${m.postUnit}`,
      });
    }
    if (items.chainLinkMesh.enabled && (m.meshLen > 0 || (a.verifiedMeshLength ?? 0) > 0)) {
      const vm = a.verifiedMeshLength ?? m.meshLen;
      const diff = cleanVariance(vm, m.meshLen, 2);
      auditRows.push({
        label: 'Chain-Link Mesh Length',
        logged: `${m.meshLen} ${items.chainLinkMesh.unit}`,
        verified: `${vm} ${items.chainLinkMesh.unit}`,
        variance: `${formatVariance(diff, 2)} ${items.chainLinkMesh.unit}`,
      });
    }
    if (items.rrmWall.enabled && (m.rrmVol > 0 || (a.verifiedRrmVolume ?? 0) > 0)) {
      const vr = a.verifiedRrmVolume ?? roundTo(m.rrmVol, 2);
      const diff = cleanVariance(vr, roundTo(m.rrmVol, 2), 2);
      auditRows.push({
        label: 'RMM Wall Volume',
        logged: `${m.rrmVol.toFixed(2)} ${items.rrmWall.unit}`,
        verified: `${vr.toFixed(2)} ${items.rrmWall.unit}`,
        variance: `${diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} ${items.rrmWall.unit}`,
      });
    }
    if (items.roadMeasurement.enabled && (m.roadLen > 0 || (a.verifiedRoadLength ?? 0) > 0)) {
      const vrd = a.verifiedRoadLength ?? m.roadLen;
      const diff = cleanVariance(vrd, m.roadLen, 2);
      auditRows.push({
        label: 'Road Length',
        logged: `${m.roadLen} ${items.roadMeasurement.unit}`,
        verified: `${vrd} ${items.roadMeasurement.unit}`,
        variance: `${formatVariance(diff, 2)} ${items.roadMeasurement.unit}`,
      });
    }
    if (items.sideDrain.enabled && (m.sideDrainLen > 0 || (a.verifiedSideDrainLength ?? 0) > 0)) {
      const vsd = a.verifiedSideDrainLength ?? m.sideDrainLen;
      const diff = cleanVariance(vsd, m.sideDrainLen, 2);
      auditRows.push({
        label: 'Road Side Drain',
        logged: `${m.sideDrainLen} ${items.sideDrain.unit}`,
        verified: `${vsd} ${items.sideDrain.unit}`,
        variance: `${formatVariance(diff, 2)} ${items.sideDrain.unit}`,
      });
    }
    enabledCustom.forEach((c) => {
      const vc = a.verifiedCustomItems?.[c.id] ?? c.quantity;
      if (c.quantity > 0 || vc > 0) {
        const diff = cleanVariance(vc, c.quantity, 2);
        auditRows.push({
          label: c.name,
          logged: `${c.quantity} ${c.unit}`,
          verified: `${vc} ${c.unit}`,
          variance: `${formatVariance(diff, 2)} ${c.unit}`,
        });
      }
    });
  }

  let nextSec = 1;
  const summarySecNum = nextSec++;
  const entitySecNum = entityComparisons.length > 0 ? nextSec++ : 0;
  const auditSecNum =
    scope === 'all' &&
    project.auditInfo &&
    (auditRows.length > 0 || Boolean(project.auditInfo.generalRemarks) || Boolean(project.auditInfo.auditorName))
      ? nextSec++
      : 0;
  const mapSecNum = nextSec++;

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
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {(['all', 'fencing', 'road'] as StaticMapScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeScope(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                    scope === s
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {s === 'all' ? 'Full Audit' : s === 'fencing' ? 'Fencing Only' : 'Road Only'}
                </button>
              ))}
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
          {/* Metadata Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs">
            <div>
              <div className="text-slate-500 font-medium">Client</div>
              <div className="font-bold text-slate-900 mt-0.5 truncate">{project.clientName || 'N/A'}</div>
            </div>
            <div>
              <div className="text-slate-500 font-medium">Location</div>
              <div className="font-bold text-slate-900 mt-0.5 truncate">{project.location || 'N/A'}</div>
            </div>
            <div>
              <div className="text-slate-500 font-medium">Unit System</div>
              <div className="font-bold text-slate-900 mt-0.5 uppercase">{settings.unitSystem}</div>
            </div>
            <div>
              <div className="text-slate-500 font-medium">Audit Status</div>
              <div className="font-bold text-slate-900 mt-0.5">{formatAuditStatus(project.auditInfo?.auditStatus)}</div>
            </div>
            {project.entityName && (
              <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Executing Entity</span>
                <span className="font-bold text-slate-900">{project.entityName}</span>
              </div>
            )}
          </div>

          {/* Grand Totals Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 border-t-4 border-t-slate-900 rounded-xl p-3.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Posts</div>
              <div className="text-xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                {m.totalPosts} <span className="text-xs font-semibold text-slate-500">{m.postUnit}</span>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 border-t-4 border-t-slate-900 rounded-xl p-3.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Linear Length</div>
              <div className="text-xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                {m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                <span className="text-xs font-semibold text-slate-500">{m.lengthUnit}</span>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 border-t-4 border-t-emerald-600 rounded-xl p-3.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Total Area / Volume</div>
              <div className="text-lg font-extrabold text-emerald-700 tabular-nums mt-0.5">
                {m.totalAllAreas.toFixed(2)} {m.areaUnit} &middot; {m.totalAllVolumes.toFixed(2)} {m.volumeUnit}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 border-t-4 border-t-violet-600 rounded-xl p-3.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Mapped GPS Points</div>
              <div className="text-xl font-extrabold text-violet-700 tabular-nums mt-0.5">
                {totalMappedPts} <span className="text-xs font-semibold text-slate-500">pts</span>
              </div>
            </div>
          </div>

          {/* Section 1: Unified Physical Measurement Summary (Recorded Items Only) */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1.5">
              {summarySecNum}. Physical Measurement Summary ({measuredRows.length} Recorded Item
              {measuredRows.length === 1 ? '' : 's'})
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="py-2.5 px-3 font-bold w-10 text-center">#</th>
                    <th className="py-2.5 px-3 font-bold">Work Item</th>
                    <th className="py-2.5 px-3 font-bold">Inputs / Dimensions / Multi-Samples</th>
                    <th className="py-2.5 px-3 font-bold text-right">Quantity</th>
                    <th className="py-2.5 px-3 font-bold text-center">Unit</th>
                    <th className="py-2.5 px-3 font-bold">Captured GPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {measuredRows.length > 0 ? (
                    measuredRows.map((row, idx) => (
                      <tr key={`${row.item}-${idx}`} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                        <td className="py-2.5 px-3 text-center text-slate-500 tabular-nums">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{row.item}</div>
                          <div className="text-[11px] text-slate-500">{row.category}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.details}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {row.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600 whitespace-nowrap">{row.unit}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                          {row.capturedGps}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-5 text-center text-slate-500">
                        No measurement items with inputted data yet.
                      </td>
                    </tr>
                  )}
                  {totalBadges.length > 0 && (
                    <tr className="bg-indigo-50/70 font-extrabold text-slate-900 border-t-2 border-slate-800">
                      <td className="py-2.5 px-3 text-center">&Sigma;</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">GRAND TOTALS</td>
                      <td colSpan={4} className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {totalBadges.map((badge, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-white border border-slate-300 text-[11px] font-bold text-slate-900 tabular-nums"
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {scope === 'all' && project.auditNotes?.trim() && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700">
              <span className="font-bold text-slate-900">Site Audit Notes: </span>
              <span>{project.auditNotes.trim()}</span>
            </div>
          )}

          {/* Section 2: Entity Measurements vs. Audit Verification & Variances (Recorded Only) */}
          {entityComparisons.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-1.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  {entitySecNum}. Entity Measurements vs. Audit Verification &amp; Variances
                  {project.entityName ? ` (${project.entityName})` : ''}
                </h3>
                {hasAnyRates && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                      Claimed: <strong className="text-slate-900 font-mono">${totalEntityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                    <span className="bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded-md border border-indigo-200">
                      Verified: <strong className="text-indigo-950 font-mono">${totalAuditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border font-mono ${
                        (totalAmountVariance ?? 0) < 0
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : (totalAmountVariance ?? 0) > 0
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      Cost Var: <strong>{totalAmountVariance !== null ? formatVariance(totalAmountVariance, 2) : '—'}</strong>
                    </span>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 px-2.5 font-bold text-center w-8 bg-slate-100 text-slate-700" rowSpan={2}>
                        #
                      </th>
                      <th className="py-2 px-3 font-bold bg-slate-100 text-slate-700 min-w-[130px]" rowSpan={2}>
                        Work Item
                      </th>
                      <th className="py-2 px-2 font-bold text-right bg-slate-100 text-slate-700 w-16" rowSpan={2}>
                        Rate
                      </th>
                      <th className="py-1.5 px-2 font-bold text-center bg-slate-100 text-slate-800 border-l border-r border-slate-200" colSpan={6}>
                        Entity Claimed Measurement (MB)
                      </th>
                      <th className="py-1.5 px-2 font-bold text-center bg-indigo-50/80 text-indigo-900 border-r border-indigo-200" colSpan={6}>
                        Audit Field Verified Measurement
                      </th>
                      <th className="py-2 px-2.5 font-bold text-right bg-slate-100 text-slate-700 w-24" rowSpan={2}>
                        Qty Var.
                      </th>
                      <th className="py-2 px-2.5 font-bold text-right bg-slate-100 text-slate-700 w-24" rowSpan={2}>
                        Cost Var.
                      </th>
                      <th className="py-2 px-2.5 font-bold bg-slate-100 text-slate-700 w-24" rowSpan={2}>
                        Status
                      </th>
                    </tr>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <th className="py-1 px-1.5 text-right bg-slate-50 border-l border-slate-200 w-10">Nos</th>
                      <th className="py-1 px-1.5 text-right bg-slate-50 w-11">L</th>
                      <th className="py-1 px-1.5 text-right bg-slate-50 w-11">W</th>
                      <th className="py-1 px-1.5 text-right bg-slate-50 w-11">T</th>
                      <th className="py-1 px-1.5 text-right bg-slate-100 font-bold text-slate-900 border-r border-slate-200 w-16">
                        Qty
                      </th>
                      <th className="py-1 px-1.5 text-right bg-slate-100 font-bold text-slate-900 border-r border-slate-200 w-20">
                        Amount
                      </th>
                      <th className="py-1 px-1.5 text-right bg-indigo-50/40 text-indigo-950 w-10">Nos</th>
                      <th className="py-1 px-1.5 text-right bg-indigo-50/40 text-indigo-950 w-11">L</th>
                      <th className="py-1 px-1.5 text-right bg-indigo-50/40 text-indigo-950 w-11">W</th>
                      <th className="py-1 px-1.5 text-right bg-indigo-50/40 text-indigo-950 w-11">T</th>
                      <th className="py-1 px-1.5 text-right bg-indigo-100/70 font-extrabold text-indigo-900 border-r border-indigo-200 w-16">
                        Qty
                      </th>
                      <th className="py-1 px-1.5 text-right bg-indigo-100/70 font-extrabold text-indigo-900 border-r border-indigo-200 w-20">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 tabular-nums">
                    {entityComparisons.map((row, idx) => {
                      const unit = row.auditUnit || row.item.unit;
                      const statusLabel =
                        row.status === 'matched'
                          ? 'Matched'
                          : row.status === 'shortfall'
                          ? 'Shortfall (Overclaimed)'
                          : row.status === 'excess'
                          ? 'Excess Verified'
                          : 'Pending Audit';

                      const rateText = row.rate !== undefined ? `${row.rate}` : '—';
                      const entityAmtText =
                        row.entityAmount !== null
                          ? row.entityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—';
                      const auditAmtText =
                        row.auditAmount !== null
                          ? row.auditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : row.rate !== undefined
                          ? 'Pending'
                          : '—';

                      return (
                        <tr key={row.item.id} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                          <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {row.item.itemName || row.auditLabel}
                            {row.item.remarks && (
                              <div className="text-[11px] font-normal text-slate-500">{row.item.remarks}</div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-700">{rateText}</td>
                          <td className="py-2 px-1 text-right border-l border-slate-200">{row.item.nos ?? '—'}</td>
                          <td className="py-2 px-1 text-right">{row.item.length ?? '—'}</td>
                          <td className="py-2 px-1 text-right">{row.item.width ?? '—'}</td>
                          <td className="py-2 px-1 text-right">{row.item.thickness ?? '—'}</td>
                          <td className="py-2 px-1.5 text-right font-bold text-slate-900 whitespace-nowrap bg-slate-50/40">
                            {row.entityQty} <span className="text-[10px] font-normal text-slate-500">{unit}</span>
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap border-r border-slate-200 bg-slate-100/40">
                            {entityAmtText}
                          </td>
                          <td className="py-2 px-1 text-right bg-indigo-50/20 text-indigo-950 font-medium">
                            {row.auditDims.nos ?? '—'}
                          </td>
                          <td className="py-2 px-1 text-right bg-indigo-50/20 text-indigo-950 font-medium">
                            {row.auditDims.length ?? '—'}
                          </td>
                          <td className="py-2 px-1 text-right bg-indigo-50/20 text-indigo-950 font-medium">
                            {row.auditDims.width ?? '—'}
                          </td>
                          <td className="py-2 px-1 text-right bg-indigo-50/20 text-indigo-950 font-medium">
                            {row.auditDims.thickness ?? '—'}
                          </td>
                          <td className="py-2 px-1.5 text-right font-bold text-indigo-700 whitespace-nowrap bg-indigo-50/40">
                            {row.auditQty !== null ? `${row.auditQty}` : 'Pending'}{' '}
                            <span className="text-[10px] font-normal text-indigo-500">{unit}</span>
                          </td>
                          <td className="py-2 px-1.5 text-right font-mono font-bold text-indigo-800 whitespace-nowrap border-r border-indigo-200 bg-indigo-100/40">
                            {auditAmtText}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-bold whitespace-nowrap ${
                              row.variance === null
                                ? 'text-slate-500'
                                : row.variance < 0
                                ? 'text-red-600'
                                : row.variance > 0
                                ? 'text-blue-600'
                                : 'text-emerald-700'
                            }`}
                          >
                            {row.variance === null
                              ? 'Pending'
                              : `${formatVariance(row.variance, 2)} ${unit}${
                                  row.variancePct !== null && row.variance !== 0
                                    ? ` (${row.variancePct > 0 ? `+${row.variancePct}` : row.variancePct}%)`
                                    : ''
                                }`}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-mono font-bold whitespace-nowrap ${
                              row.amountVariance === null
                                ? 'text-slate-500'
                                : row.amountVariance < 0
                                ? 'text-red-600'
                                : row.amountVariance > 0
                                ? 'text-blue-600'
                                : 'text-emerald-700'
                            }`}
                          >
                            {row.amountVariance !== null ? formatVariance(row.amountVariance, 2) : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-slate-700 whitespace-nowrap text-[11px]">{statusLabel}</td>
                        </tr>
                      );
                    })}
                    {hasAnyRates && (
                      <tr className="bg-indigo-50/70 font-extrabold text-slate-900 border-t-2 border-slate-800 tabular-nums">
                        <td className="py-2 px-2 text-center">&Sigma;</td>
                        <td colSpan={6} className="py-2 px-3 text-slate-900 uppercase text-[11px] tracking-wide">
                          Total Financial Value &amp; Audit Recovery
                        </td>
                        <td className="py-2 px-1.5 text-right font-mono font-bold text-slate-900">
                          {totalEntityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td colSpan={5} className="py-2 px-1"></td>
                        <td className="py-2 px-1.5 text-right font-mono font-bold text-indigo-900">
                          {totalAuditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-2"></td>
                        <td
                          className={`py-2 px-2 text-right font-mono font-bold ${
                            (totalAmountVariance ?? 0) < 0
                              ? 'text-red-600'
                              : (totalAmountVariance ?? 0) > 0
                              ? 'text-blue-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {totalAmountVariance !== null ? formatVariance(totalAmountVariance, 2) : '—'}
                        </td>
                        <td className="py-2 px-2"></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 3: Auditor Verification & Reconciliation */}
          {auditSecNum > 0 && project.auditInfo && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 border-b border-slate-300 pb-1.5">
                {auditSecNum}. Auditor Verification &amp; Reconciliation
              </h3>
              {auditRows.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="py-2 px-3 font-bold">Item</th>
                        <th className="py-2 px-3 font-bold text-right">Logged</th>
                        <th className="py-2 px-3 font-bold text-right">Verified</th>
                        <th className="py-2 px-3 font-bold text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {auditRows.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{row.label}</td>
                          <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">{row.logged}</td>
                          <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">{row.verified}</td>
                          <td className="py-2 px-3 text-right font-bold tabular-nums whitespace-nowrap">{row.variance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    <strong className="text-slate-700">Auditor:</strong>{' '}
                    <span className="font-semibold text-slate-900">{project.auditInfo.auditorName || 'Pending Assignment'}</span>
                  </span>
                  <span>
                    <strong className="text-slate-700">Audit Date:</strong>{' '}
                    <span className="font-semibold text-slate-900">{project.auditInfo.auditDate}</span>
                  </span>
                </div>
                {project.auditInfo.generalRemarks && (
                  <p className="text-slate-600">
                    <strong className="text-slate-700">Remarks:</strong> {project.auditInfo.generalRemarks}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Section 4: Real-Time Site Map & Captured Input Locations */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 pb-1.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-600" />
                <span>{mapSecNum}. Real-Time Site Map &amp; Captured Input Locations</span>
              </h3>
              {currentGps && (
                <span className="text-[11px] font-mono text-sky-700 bg-sky-50 border border-sky-200 rounded-md px-2 py-0.5 tabular-nums">
                  Live GPS: {currentGps.lat.toFixed(6)}, {currentGps.lng.toFixed(6)}
                </span>
              )}
            </div>

            <SiteReportMap
              project={project}
              currentGps={currentGps}
              onUpdateProject={onUpdateProject}
              scope={scope}
              readOnly
            />

            {(mapData.inputLocations.length > 0 || mapData.roadStart || mapData.roadEnd || mapData.sitePin || currentGps) && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl mt-3">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="py-2 px-3 font-bold">Map Pin</th>
                      <th className="py-2 px-3 font-bold">Coordinates (Lat, Lng)</th>
                      <th className="py-2 px-3 font-bold">Details / Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {mapData.sitePin && (
                      <tr>
                        <td className="py-2 px-3 font-semibold text-rose-700">Site Anchor (S)</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          {mapData.sitePin.lat.toFixed(6)}, {mapData.sitePin.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{project.location || 'Pinned Site Location'}</td>
                      </tr>
                    )}
                    {currentGps && (
                      <tr>
                        <td className="py-2 px-3 font-semibold text-sky-700">Live Surveyor GPS (G)</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          {currentGps.lat.toFixed(6)}, {currentGps.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          Real-time device position{currentGps.accuracy ? ` (±${Math.round(currentGps.accuracy)}m)` : ''}
                        </td>
                      </tr>
                    )}
                    {scope !== 'fencing' && mapData.roadStart && (
                      <tr>
                        <td className="py-2 px-3 font-semibold text-emerald-700">Road Start (A)</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          {mapData.roadStart.lat.toFixed(6)}, {mapData.roadStart.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          Chainage {project.roadSections[0]?.chainageStart || '0+000'}
                        </td>
                      </tr>
                    )}
                    {scope !== 'fencing' && mapData.roadEnd && (
                      <tr>
                        <td className="py-2 px-3 font-semibold text-emerald-700">Road End (B)</td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                          {mapData.roadEnd.lat.toFixed(6)}, {mapData.roadEnd.lng.toFixed(6)}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          Chainage {project.roadSections[0]?.chainageEnd || formatChainage(project.roadSections[0]?.lengthMeters || 0)}
                        </td>
                      </tr>
                    )}
                    {mapData.inputLocations.map((loc, idx) => (
                      <tr key={loc.id}>
                        <td className="py-2 px-3 font-semibold text-violet-700">
                          Input Pin #{idx + 1}: {loc.fieldLabel}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
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
        </div>
      </div>
    </div>
  );
};
