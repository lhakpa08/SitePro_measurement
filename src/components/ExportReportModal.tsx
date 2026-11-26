import React, { useEffect } from 'react';
import { ConstructionProject } from '../types';
import { getProjectSettings, formatChainage } from '../utils/geo';
import { getProjectMapData, StaticMapScope } from '../utils/staticMap';
import {
  buildAllRecordedInputs,
  computeMeasurements,
  downloadStandaloneHtmlReport,
  exportChainLinkPdf,
  exportProjectToExcel,
  exportProjectToPdf,
  exportRoadPdf,
  formatAuditStatus,
} from '../utils/export';
import { cleanVariance, formatVariance, roundTo } from '../utils/calculations';
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
  const allInputs = buildAllRecordedInputs(project, scope);
  const mapData = getProjectMapData(project, scope);
  const totalMappedPts = mapData.allPoints.length + (currentGps ? 1 : 0);

  const enabledCustom = customItems.filter((c) => {
    if (!c.enabled) return false;
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

  const summaryRows: Array<{
    item: string;
    details: string;
    quantity: string;
    unit: string;
  }> = [];

  if (scope !== 'road') {
    if (items.anglePosts.enabled) {
      summaryRows.push({
        item: 'Angle Posts (Corner / End)',
        details: 'Fencing · Physical count',
        quantity: String(m.totalAngle),
        unit: items.anglePosts.unit,
      });
    }
    if (items.intermediatePosts.enabled) {
      summaryRows.push({
        item: 'Intermediate Posts',
        details: 'Fencing · Physical count',
        quantity: String(m.totalIntermed),
        unit: items.intermediatePosts.unit,
      });
    }
    if (items.strutPosts.enabled) {
      summaryRows.push({
        item: 'Strut Posts',
        details: 'Fencing · Physical count',
        quantity: String(m.totalStrut),
        unit: items.strutPosts.unit,
      });
    }
    if (items.gatePosts.enabled) {
      summaryRows.push({
        item: 'Gate Posts',
        details: 'Fencing · Physical count',
        quantity: String(m.totalGate),
        unit: items.gatePosts.unit,
      });
    }
    if (items.chainLinkMesh.enabled) {
      summaryRows.push({
        item: 'Chain-Link Mesh',
        details: `L: ${m.meshLen} ${items.chainLinkMesh.unit} × W: ${m.meshWidth} ${m.lengthUnit} (Area: ${m.meshArea.toFixed(2)} ${m.areaUnit})`,
        quantity: m.meshLen.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: items.chainLinkMesh.unit,
      });
    }
    if (items.rrmWall.enabled) {
      const wDetail =
        m.rrmWidthEntries.length > 0
          ? `W [${m.rrmWidthEntries.join(', ')}] Avg ${m.rrmWidth}`
          : `W: ${m.rrmWidth}`;
      const hDetail =
        m.rrmHeightEntries.length > 0
          ? `H [${m.rrmHeightEntries.join(', ')}] Avg ${m.rrmHeight}`
          : `H: ${m.rrmHeight}`;
      summaryRows.push({
        item: 'RMM Wall',
        details: `L: ${m.rrmLen.toFixed(2)} ${m.lengthUnit} × ${wDetail} ${m.lengthUnit} × ${hDetail} ${m.lengthUnit}`,
        quantity: m.rrmVol.toFixed(2),
        unit: items.rrmWall.unit,
      });
    }
  }

  if (scope !== 'fencing') {
    if (items.roadMeasurement.enabled) {
      const wDetail =
        m.roadWidthEntries.length > 0
          ? `W [${m.roadWidthEntries.join(', ')}] Avg ${m.roadWidth}`
          : `W: ${m.roadWidth}`;
      const dDetail =
        m.roadDepthEntries.length > 0
          ? `D [${m.roadDepthEntries.join(', ')}] Avg ${m.roadDepth}`
          : `D: ${m.roadDepth}`;
      const roadDetails =
        m.roadDepth > 0
          ? `Ch. ${m.chainageStart}–${m.chainageEnd} · L: ${m.roadLen} ${items.roadMeasurement.unit} × ${wDetail} ${m.lengthUnit} × ${dDetail} ${m.lengthUnit} · Area: ${m.roadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.areaUnit} · Vol: ${m.roadVol.toFixed(2)} ${m.volumeUnit}`
          : `Ch. ${m.chainageStart}–${m.chainageEnd} · L: ${m.roadLen} ${items.roadMeasurement.unit} × ${wDetail} ${m.lengthUnit} · Area: ${m.roadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.areaUnit}`;
      summaryRows.push({
        item: 'Road Alignment',
        details: roadDetails,
        quantity: m.roadLen.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: items.roadMeasurement.unit,
      });
    }
    if (items.sideDrain.enabled) {
      summaryRows.push({
        item: 'Road Side Drain',
        details: 'Road · Measured length',
        quantity: m.sideDrainLen.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: items.sideDrain.unit,
      });
    }
  }

  enabledCustom.forEach((c) => {
    summaryRows.push({
      item: c.name,
      details: `${c.category} · Custom item`,
      quantity: String(c.quantity),
      unit: c.unit,
    });
  });

  const totalBadges = [
    scope !== 'road' ? `Posts: ${m.totalPosts} ${m.postUnit}` : null,
    `Linear: ${m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.lengthUnit}`,
    `Area: ${m.totalAllAreas.toFixed(2)} ${m.areaUnit}`,
    `Volume: ${m.totalAllVolumes.toFixed(2)} ${m.volumeUnit}`,
    enabledCustom.length > 0 ? `Custom: ${m.totalCustomQty} items` : null,
  ].filter((v): v is string => Boolean(v));

  let nextSec = 1;
  const summarySecNum = nextSec++;
  const inputsSecNum = allInputs.length > 0 ? nextSec++ : 0;
  const mapSecNum = nextSec++;
  const auditSecNum = scope === 'all' && project.auditInfo ? nextSec++ : 0;

  const auditRows: Array<{ label: string; logged: string; verified: string; variance: string }> = [];
  if (scope === 'all' && project.auditInfo) {
    const a = project.auditInfo;
    const anyPosts =
      items.anglePosts.enabled ||
      items.intermediatePosts.enabled ||
      items.strutPosts.enabled ||
      items.gatePosts.enabled;
    if (anyPosts) {
      const vp = a.verifiedPostCount ?? m.totalPosts;
      const diff = cleanVariance(vp, m.totalPosts, 0);
      auditRows.push({
        label: 'Fence Posts Total',
        logged: `${m.totalPosts} ${m.postUnit}`,
        verified: `${vp} ${m.postUnit}`,
        variance: `${formatVariance(diff, 0)} ${m.postUnit}`,
      });
    }
    if (items.chainLinkMesh.enabled) {
      const vm = a.verifiedMeshLength ?? m.meshLen;
      const diff = cleanVariance(vm, m.meshLen, 2);
      auditRows.push({
        label: 'Chain-Link Mesh Length',
        logged: `${m.meshLen} ${items.chainLinkMesh.unit}`,
        verified: `${vm} ${items.chainLinkMesh.unit}`,
        variance: `${formatVariance(diff, 2)} ${items.chainLinkMesh.unit}`,
      });
    }
    if (items.rrmWall.enabled) {
      const vr = a.verifiedRrmVolume ?? roundTo(m.rrmVol, 2);
      const diff = cleanVariance(vr, roundTo(m.rrmVol, 2), 2);
      auditRows.push({
        label: 'RMM Wall Volume',
        logged: `${m.rrmVol.toFixed(2)} ${items.rrmWall.unit}`,
        verified: `${vr.toFixed(2)} ${items.rrmWall.unit}`,
        variance: `${diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} ${items.rrmWall.unit}`,
      });
    }
    if (items.roadMeasurement.enabled) {
      const vrd = a.verifiedRoadLength ?? m.roadLen;
      const diff = cleanVariance(vrd, m.roadLen, 2);
      auditRows.push({
        label: 'Road Length',
        logged: `${m.roadLen} ${items.roadMeasurement.unit}`,
        verified: `${vrd} ${items.roadMeasurement.unit}`,
        variance: `${formatVariance(diff, 2)} ${items.roadMeasurement.unit}`,
      });
    }
    if (items.sideDrain.enabled) {
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
      const diff = cleanVariance(vc, c.quantity, 2);
      auditRows.push({
        label: c.name,
        logged: `${c.quantity} ${c.unit}`,
        verified: `${vc} ${c.unit}`,
        variance: `${formatVariance(diff, 2)} ${c.unit}`,
      });
    });
  }

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
              Exported Report &amp; Real-Time Map &mdash; {project.name}
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

          {/* Section 1: Summary & Grand Totals Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 bg-slate-100 border-l-4 border-slate-900 px-3 py-1.5 rounded-r-lg">
              {summarySecNum}. Physical Measurement Summary &amp; Totals
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="py-2.5 px-3 font-bold w-10 text-center">#</th>
                    <th className="py-2.5 px-3 font-bold">Work Item</th>
                    <th className="py-2.5 px-3 font-bold">Dimensions / Samples / Spec</th>
                    <th className="py-2.5 px-3 font-bold text-right">Quantity</th>
                    <th className="py-2.5 px-3 font-bold text-center">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {summaryRows.length > 0 ? (
                    summaryRows.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                        <td className="py-2.5 px-3 text-center text-slate-500 tabular-nums">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{row.item}</td>
                        <td className="py-2.5 px-3 text-slate-600">{row.details}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{row.quantity}</td>
                        <td className="py-2.5 px-3 text-center text-slate-600 whitespace-nowrap">{row.unit}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">
                        No measurement items enabled for this scope.
                      </td>
                    </tr>
                  )}
                  <tr className="bg-indigo-50/70 font-extrabold text-slate-900 border-t-2 border-slate-800">
                    <td className="py-2.5 px-3 text-center">&Sigma;</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">GRAND TOTALS</td>
                    <td colSpan={3} className="py-2.5 px-3">
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
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: All Recorded Field Inputs & Multi-Samples */}
          {allInputs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 bg-slate-100 border-l-4 border-slate-900 px-3 py-1.5 rounded-r-lg">
                {inputsSecNum}. All Recorded Field Inputs &amp; Captured Locations ({allInputs.length} entries)
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="py-2.5 px-3 font-bold w-10 text-center">#</th>
                      <th className="py-2.5 px-3 font-bold">Category</th>
                      <th className="py-2.5 px-3 font-bold">Input Field</th>
                      <th className="py-2.5 px-3 font-bold">Recorded Input / Multi-Samples</th>
                      <th className="py-2.5 px-3 font-bold text-right">Computed Total / Avg</th>
                      <th className="py-2.5 px-3 font-bold">Captured GPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {allInputs.map((inp, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                        <td className="py-2 px-3 text-center text-slate-500 tabular-nums">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700 whitespace-nowrap">
                            {inp.category}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">{inp.fieldLabel}</td>
                        <td className="py-2 px-3 text-slate-700">{inp.rawInput}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{inp.computedTotal}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                          {inp.capturedGps || 'Not captured'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {scope === 'all' && project.auditNotes?.trim() && (
            <div className="bg-slate-50 border border-slate-200 border-l-4 border-l-slate-500 rounded-xl p-3.5 text-xs text-slate-700">
              <span className="font-bold text-slate-900">Site Audit Notes: </span>
              <span>{project.auditNotes.trim()}</span>
            </div>
          )}

          {/* Section 3: Real-Time Interactive Map */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 border-l-4 border-slate-900 px-3 py-1.5 rounded-r-lg">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-600" />
                <span>{mapSecNum}. Real-Time Site Map &amp; Captured Input Locations</span>
              </h3>
              {currentGps && (
                <span className="text-[11px] font-mono text-sky-700 bg-white border border-sky-200 rounded-md px-2 py-0.5 tabular-nums">
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

          {/* Section 4: Auditor Verification & Reconciliation */}
          {scope === 'all' && project.auditInfo && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 bg-slate-100 border-l-4 border-slate-900 px-3 py-1.5 rounded-r-lg">
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
        </div>
      </div>
    </div>
  );
};
