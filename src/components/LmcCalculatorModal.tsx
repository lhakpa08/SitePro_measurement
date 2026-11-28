import React, { useEffect, useMemo, useState } from 'react';
import { ConstructionProject } from '../types';
import {
  buildSiteLmcLines,
  calculateLmcConsumption,
  exportLmcScheduleToCsv,
  LMC_BHUTAN_CATALOG,
  LMC_MATERIAL_SPECS,
  LmcCategory,
  LmcLineInput,
  LmcMaterialKey,
} from '../utils/lmcBhutan';
import { printHtmlViaHiddenFrame } from '../utils/export';
import {
  Calculator,
  FileSpreadsheet,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

interface LmcCalculatorModalProps {
  project: ConstructionProject;
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: LmcCategory[] = [
  'Stone Masonry',
  'Concrete Works',
  'Brick & Block',
  'Plastering & Pointing',
  'Fencing Works',
  'Road & Drain',
];

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const LmcCalculatorModal: React.FC<LmcCalculatorModalProps> = ({
  project,
  isOpen,
  onClose,
}) => {
  const [mode, setMode] = useState<'site' | 'manual'>('site');
  const [includeWastage5Pct, setIncludeWastage5Pct] = useState<boolean>(true);
  const [showCostEstimate, setShowCostEstimate] = useState<boolean>(false);
  const [customRatesNu, setCustomRatesNu] = useState<Partial<Record<LmcMaterialKey, number>>>({});

  // Site preset options (selectable mixes/layers for site measurements)
  const [rrmItemId, setRrmItemId] = useState<string>('rrm_1_5');
  const [roadItemId, setRoadItemId] = useState<string>('road_gsb');
  const [siteLines, setSiteLines] = useState<LmcLineInput[]>([]);

  // Manual estimator lines + quick L x B x H helper
  const [manualLines, setManualLines] = useState<LmcLineInput[]>([
    { id: 'manual-1', itemId: 'pcc_1_2_4', quantity: 10, enabled: true },
  ]);
  const [newCategory, setNewCategory] = useState<LmcCategory>('Concrete Works');
  const [newItemId, setNewItemId] = useState<string>('pcc_1_2_4');
  const [newQty, setNewQty] = useState<string>('10');
  const [useDimHelper, setUseDimHelper] = useState<boolean>(false);
  const [dimL, setDimL] = useState<string>('10');
  const [dimB, setDimB] = useState<string>('0.6');
  const [dimH, setDimH] = useState<string>('1.0');

  useEffect(() => {
    if (!isOpen) return;
    const generated = buildSiteLmcLines(project, { rrmItemId, roadItemId });
    setSiteLines(generated);
    if (generated.length === 0) {
      setMode('manual');
    } else {
      setMode('site');
    }
  }, [isOpen, project.id]);

  // Re-sync RRM / Road presets when user switches mortar ratio or road layer in Site mode
  const handleResyncSiteMeasurements = (nextRrmId = rrmItemId, nextRoadId = roadItemId) => {
    const generated = buildSiteLmcLines(project, {
      rrmItemId: nextRrmId,
      roadItemId: nextRoadId,
    });
    setSiteLines(generated);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const filteredCatalog = useMemo(
    () => LMC_BHUTAN_CATALOG.filter((item) => item.category === newCategory),
    [newCategory]
  );

  useEffect(() => {
    const first = filteredCatalog[0];
    if (first && !filteredCatalog.some((c) => c.id === newItemId)) {
      setNewItemId(first.id);
    }
  }, [filteredCatalog, newItemId]);

  const selectedAddSpec = useMemo(
    () => LMC_BHUTAN_CATALOG.find((c) => c.id === newItemId) ?? LMC_BHUTAN_CATALOG[0],
    [newItemId]
  );

  const computedDimQty = useMemo(() => {
    const l = parseFloat(dimL) || 0;
    const b = parseFloat(dimB) || 0;
    const h = parseFloat(dimH) || 0;
    if (selectedAddSpec.unit === 'm²') return Math.max(0, Number((l * b).toFixed(3)));
    if (selectedAddSpec.unit === 'm³') return Math.max(0, Number((l * b * h).toFixed(3)));
    return Math.max(0, Number(l.toFixed(3)));
  }, [dimL, dimB, dimH, selectedAddSpec.unit]);

  const activeLines = mode === 'site' ? siteLines : manualLines;

  const result = useMemo(
    () => calculateLmcConsumption(activeLines, includeWastage5Pct, customRatesNu),
    [activeLines, includeWastage5Pct, customRatesNu]
  );

  if (!isOpen) return null;

  const updateLine = (
    setter: React.Dispatch<React.SetStateAction<LmcLineInput[]>>,
    lineId: string,
    patch: Partial<LmcLineInput>
  ) => {
    setter((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  };

  const handleAddManualLine = () => {
    const qty = useDimHelper ? computedDimQty : parseFloat(newQty);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setManualLines((prev) => [
      ...prev,
      {
        id,
        itemId: newItemId,
        quantity: qty,
        enabled: true,
        sourceLabel: useDimHelper
          ? selectedAddSpec.unit === 'm³'
            ? `${dimL} × ${dimB} × ${dimH} m`
            : selectedAddSpec.unit === 'm²'
            ? `${dimL} × ${dimB} m`
            : `${dimL} m`
          : undefined,
      },
    ]);
  };

  const handlePrintSchedule = () => {
    const matKeys = (Object.keys(result.totalMaterials) as LmcMaterialKey[]).filter(
      (k) => (result.totalMaterials[k] ?? 0) > 0
    );
    const matRowsHtml = matKeys
      .map((key) => {
        const spec = LMC_MATERIAL_SPECS[key];
        const qty = result.totalMaterials[key] ?? 0;
        const fmtQty =
          key === 'bricksNos' || key === 'blocksNos' || key === 'msPostsNos'
            ? Math.ceil(qty).toLocaleString()
            : qty.toFixed(key === 'cementBags' ? 2 : 3);
        const rate = key === 'cementTonnes' ? '—' : (customRatesNu[key] ?? spec.defaultRateNu ?? 0).toFixed(2);
        const cost = key === 'cementTonnes' ? '—' : (result.materialCostsNu[key] ?? 0).toFixed(2);
        return `
          <tr>
            <td style="font-family:monospace;color:#475569;">${escapeHtml(spec.bsrCode)}</td>
            <td><strong>${escapeHtml(spec.label)}</strong></td>
            <td style="text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">${fmtQty}</td>
            <td style="text-align:center;">${escapeHtml(spec.unit)}</td>
            ${
              showCostEstimate
                ? `<td style="text-align:right;font-variant-numeric:tabular-nums;">${rate}</td>
                   <td style="text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${cost}</td>`
                : ''
            }
          </tr>
        `;
      })
      .join('');

    const itemRowsHtml = result.itemsBreakdown
      .map(
        (b, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td style="font-family:monospace;color:#475569;">${escapeHtml(b.spec.bsrCode)}</td>
          <td><strong>${escapeHtml(b.spec.name)}</strong>${b.sourceLabel ? `<div style="font-size:10px;color:#64748b;">${escapeHtml(b.sourceLabel)}</div>` : ''}</td>
          <td style="text-align:right;font-weight:700;">${b.quantity.toFixed(2)} ${escapeHtml(b.spec.unit)}</td>
          <td style="text-align:right;">${(b.materials.cementBags ?? 0).toFixed(2)}</td>
          <td style="text-align:right;">${(b.materials.sandCum ?? 0).toFixed(3)}</td>
          <td style="text-align:right;">${(b.materials.aggregateCum ?? 0).toFixed(3)}</td>
          <td style="text-align:right;">${(b.materials.stoneBoulderCum ?? 0).toFixed(3)}</td>
        </tr>
      `
      )
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>LMC Bhutan Material Consumption - ${escapeHtml(project.name)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
  h1 { font-size: 17px; margin: 0 0 4px 0; }
  .meta { font-size: 11px; color: #475569; margin-bottom: 16px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 2px solid #0f172a; padding-bottom: 4px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-size: 11px; font-weight: 700; }
  .summary-grid { display: flex; gap: 16px; margin-bottom: 14px; }
  .summary-box { border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 4px; flex: 1; background: #f8fafc; }
  .k { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; }
  .v { font-size: 14px; font-weight: 800; margin-top: 2px; }
</style>
</head>
<body>
  <h1>Bhutan LMC Construction Material &amp; Labour Consumption Schedule</h1>
  <div class="meta">
    Site: <strong>${escapeHtml(project.name)}</strong> &middot;
    Location: ${escapeHtml(project.location || 'Bhutan')} &middot;
    Reference: MoIT / BSR Labour &amp; Materials Coefficients (LMC) &middot;
    Wastage Allowance: <strong>${result.wastagePct}%</strong> &middot;
    Date: ${new Date().toLocaleDateString()}
  </div>

  <div class="summary-grid">
    <div class="summary-box"><div class="k">Cement (50 kg)</div><div class="v">${(result.totalMaterials.cementBags ?? 0).toFixed(2)} bags</div></div>
    <div class="summary-box"><div class="k">Sand</div><div class="v">${(result.totalMaterials.sandCum ?? 0).toFixed(3)} m³</div></div>
    <div class="summary-box"><div class="k">Crushed Aggregate</div><div class="v">${(result.totalMaterials.aggregateCum ?? 0).toFixed(3)} m³</div></div>
    <div class="summary-box"><div class="k">Stone / Boulders</div><div class="v">${(result.totalMaterials.stoneBoulderCum ?? 0).toFixed(3)} m³</div></div>
    <div class="summary-box"><div class="k">Total Labour</div><div class="v">${result.totalLabour.totalManDays.toFixed(1)} days</div></div>
  </div>

  <h2>1. Consolidated Material Requirement</h2>
  <table>
    <thead>
      <tr>
        <th style="width:72px;">BSR Code</th>
        <th>Material Description</th>
        <th style="text-align:right;width:110px;">Quantity</th>
        <th style="text-align:center;width:65px;">Unit</th>
        ${showCostEstimate ? '<th style="text-align:right;width:85px;">Rate (Nu.)</th><th style="text-align:right;width:105px;">Est. Cost (Nu.)</th>' : ''}
      </tr>
    </thead>
    <tbody>${matRowsHtml || '<tr><td colspan="6">No material items calculated.</td></tr>'}</tbody>
    ${
      showCostEstimate && result.estimatedMaterialCostNu > 0
        ? `<tfoot><tr><td colspan="5" style="text-align:right;font-weight:700;">Total Estimated Material Cost (Nu.)</td><td style="text-align:right;font-weight:800;">Nu. ${result.estimatedMaterialCostNu.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr></tfoot>`
        : ''
    }
  </table>

  <h2>2. Labour Requirement (Man-Days)</h2>
  <table>
    <thead>
      <tr><th>Mason (Grade I / II)</th><th>Fitter / Mesh Fixer</th><th>Unskilled Labour (Coolie)</th><th>Total Man-Days</th></tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${result.totalLabour.masonDays.toFixed(2)}</strong> days</td>
        <td><strong>${result.totalLabour.fitterDays.toFixed(2)}</strong> days</td>
        <td><strong>${result.totalLabour.unskilledDays.toFixed(2)}</strong> days</td>
        <td><strong>${result.totalLabour.totalManDays.toFixed(2)}</strong> days</td>
      </tr>
    </tbody>
  </table>

  <h2>3. Work Item Breakdown</h2>
  <table>
    <thead>
      <tr>
        <th style="width:30px;text-align:center;">#</th>
        <th style="width:65px;">BSR Code</th>
        <th>Work Description</th>
        <th style="text-align:right;width:95px;">Work Qty</th>
        <th style="text-align:right;width:78px;">Cement (bags)</th>
        <th style="text-align:right;width:72px;">Sand (m³)</th>
        <th style="text-align:right;width:72px;">Agg. (m³)</th>
        <th style="text-align:right;width:72px;">Stone (m³)</th>
      </tr>
    </thead>
    <tbody>${itemRowsHtml}</tbody>
  </table>
</body>
</html>`;
    printHtmlViaHiddenFrame(html);
  };

  const materialKeysWithQty = (Object.keys(result.totalMaterials) as LmcMaterialKey[]).filter(
    (k) => (result.totalMaterials[k] ?? 0) > 0
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lmc-modal-title"
    >
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Bhutan MoIT / BSR Standards</span>
              <span aria-hidden="true">&middot;</span>
              <span>Labour &amp; Material Coefficients (LMC)</span>
            </div>
            <h2
              id="lmc-modal-title"
              className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-0.5 flex items-center gap-2"
            >
              <Calculator className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="truncate">Material Consumption Calculator (LMC Bhutan)</span>
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close LMC Material Calculator"
            className="w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switch & BSR Controls Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex items-center p-1 bg-slate-200/80 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setMode('site')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap ${
                mode === 'site'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              From Site Measurements ({siteLines.length})
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition whitespace-nowrap ${
                mode === 'manual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Manual / Quick Estimator ({manualLines.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeWastage5Pct}
                onChange={(e) => setIncludeWastage5Pct(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>+5% Wastage (BSR/LMC Rule)</span>
            </label>

            <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCostEstimate}
                onChange={(e) => setShowCostEstimate(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>Estimate Cost (Nu.)</span>
            </label>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Input Section */}
          {mode === 'site' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      RRM Wall Mortar Mix (LMC)
                    </label>
                    <select
                      value={rrmItemId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setRrmItemId(next);
                        handleResyncSiteMeasurements(next, roadItemId);
                      }}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
                    >
                      <option value="rrm_1_4">SM0005 · RRM in Cement Mortar 1:4</option>
                      <option value="rrm_1_5">SM0006 · RRM in Cement Mortar 1:5</option>
                      <option value="rrm_1_6">SM0007 · RRM in Cement Mortar 1:6</option>
                      <option value="dry_stone_soling">SM0071 · Dry Stone Soling / Packing</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Road Pavement / Base Layer (LMC)
                    </label>
                    <select
                      value={roadItemId}
                      onChange={(e) => {
                        const next = e.target.value;
                        setRoadItemId(next);
                        handleResyncSiteMeasurements(rrmItemId, next);
                      }}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
                    >
                      <option value="road_gsb">RW0010 · Granular Sub-Base (GSB) (m³)</option>
                      <option value="road_wmm">RW0020 · Wet Mix Macadam (WMM) (m³)</option>
                      <option value="pcc_1_2_4">CW0104 · Concrete Road PCC 1:2:4 (m³)</option>
                      <option value="road_premix_20mm">RW0035 · 20mm Premix Carpet (m²)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleResyncSiteMeasurements()}
                  className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sync Site Data</span>
                </button>
              </div>

              {siteLines.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-3">
                  <p className="text-sm font-medium text-slate-700">
                    No physical quantities are recorded on the active site ({project.name}) yet.
                  </p>
                  <p className="text-xs text-slate-500">
                    Record RRM walls, fence posts, chain-link mesh, or road sections on the worksheet, or switch to the Manual Estimator to calculate any Bhutan LMC item directly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Open Manual Estimator</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <th className="py-2.5 px-3 w-10 text-center">Use</th>
                        <th className="py-2.5 px-3 w-20">BSR Code</th>
                        <th className="py-2.5 px-3">LMC Work Specification</th>
                        <th className="py-2.5 px-3">Measured Site Source</th>
                        <th className="py-2.5 px-3 text-right w-36">Calc Qty (SI Metric)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 tabular-nums">
                      {siteLines.map((line) => {
                        const spec = LMC_BHUTAN_CATALOG.find((c) => c.id === line.itemId);
                        if (!spec) return null;
                        return (
                          <tr key={line.id} className={!line.enabled ? 'opacity-50 bg-slate-50' : 'bg-white'}>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={line.enabled}
                                onChange={(e) =>
                                  updateLine(setSiteLines, line.id, { enabled: e.target.checked })
                                }
                                aria-label={`Include ${spec.name}`}
                                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600">{spec.bsrCode}</td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900">{spec.name}</div>
                              <div className="text-[11px] text-slate-500">{spec.description}</div>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{line.sourceLabel || 'Site measurement'}</td>
                            <td className="py-2 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    updateLine(setSiteLines, line.id, {
                                      quantity: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="w-24 px-2 py-1 text-right font-semibold bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                                />
                                <span className="text-slate-600 font-medium w-8 text-left">{spec.unit}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add Work Item Form */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Category (BSR Chapter)
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as LmcCategory)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      LMC Work Item
                    </label>
                    <select
                      value={newItemId}
                      onChange={(e) => setNewItemId(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
                    >
                      {filteredCatalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.bsrCode} · {item.name} ({item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Qty ({selectedAddSpec.unit})
                      </label>
                      {(selectedAddSpec.unit === 'm³' || selectedAddSpec.unit === 'm²') && (
                        <button
                          type="button"
                          onClick={() => setUseDimHelper((v) => !v)}
                          className="text-[11px] font-semibold text-amber-700 hover:underline"
                        >
                          {useDimHelper ? 'Direct Qty' : 'Use L×B×H'}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={useDimHelper}
                      value={useDimHelper ? computedDimQty : newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 bg-white disabled:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 tabular-nums focus:outline-none focus:border-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddManualLine}
                      className="w-full min-h-[40px] px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>

                {useDimHelper && (selectedAddSpec.unit === 'm³' || selectedAddSpec.unit === 'm²') && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Length (m)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={dimL}
                        onChange={(e) => setDimL(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-semibold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Width / Breadth (m)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={dimB}
                        onChange={(e) => setDimB(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-semibold tabular-nums"
                      />
                    </div>
                    {selectedAddSpec.unit === 'm³' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Height / Depth (m)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={dimH}
                          onChange={(e) => setDimH(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-semibold tabular-nums"
                        />
                      </div>
                    )}
                    <div className="flex items-end pb-1 text-xs font-semibold text-slate-700 tabular-nums">
                      Computed: {computedDimQty} {selectedAddSpec.unit}
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Lines List */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3 w-10 text-center">Use</th>
                      <th className="py-2.5 px-3 w-20">BSR Code</th>
                      <th className="py-2.5 px-3">Work Item</th>
                      <th className="py-2.5 px-3 text-right w-40">Quantity</th>
                      <th className="py-2.5 px-3 text-center w-14">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 tabular-nums">
                    {manualLines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-500">
                          No work items added yet. Choose a Bhutan LMC item above and click Add Item.
                        </td>
                      </tr>
                    ) : (
                      manualLines.map((line) => {
                        const spec = LMC_BHUTAN_CATALOG.find((c) => c.id === line.itemId);
                        if (!spec) return null;
                        return (
                          <tr key={line.id} className={!line.enabled ? 'opacity-50 bg-slate-50' : 'bg-white'}>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={line.enabled}
                                onChange={(e) =>
                                  updateLine(setManualLines, line.id, { enabled: e.target.checked })
                                }
                                aria-label={`Include ${spec.name}`}
                                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600">{spec.bsrCode}</td>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900">{spec.name}</div>
                              <div className="text-[11px] text-slate-500">
                                {spec.category}
                                {line.sourceLabel ? ` · ${line.sourceLabel}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={line.quantity}
                                  onChange={(e) =>
                                    updateLine(setManualLines, line.id, {
                                      quantity: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="w-24 px-2 py-1 text-right font-semibold bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                                />
                                <span className="text-slate-600 font-medium w-8 text-left">{spec.unit}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setManualLines((prev) => prev.filter((l) => l.id !== line.id))
                                }
                                aria-label={`Remove ${spec.name}`}
                                className="w-8 h-8 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Consolidated Material & Labour Output Section */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Total Material &amp; Labour Consumption (LMC Bhutan)
              </h3>
              <span className="text-xs text-slate-500">
                {result.wastagePct > 0
                  ? 'Includes +5% standard BSR/LMC material wastage'
                  : 'Net theoretical LMC quantities (0% wastage)'}
              </span>
            </div>

            {/* Key Material Highlights Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 tabular-nums">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs font-medium text-slate-500">Cement (50 kg Bags)</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {(result.totalMaterials.cementBags ?? 0).toFixed(2)} <span className="text-xs font-medium text-slate-600">bags</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {(result.totalMaterials.cementTonnes ?? 0).toFixed(3)} tonnes
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs font-medium text-slate-500">Sand (Fine Agg.)</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {(result.totalMaterials.sandCum ?? 0).toFixed(3)} <span className="text-xs font-medium text-slate-600">m³</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">BSR Code MT0043</div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs font-medium text-slate-500">Crushed Aggregate</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {(result.totalMaterials.aggregateCum ?? 0).toFixed(3)} <span className="text-xs font-medium text-slate-600">m³</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">20mm / 40mm graded</div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs font-medium text-slate-500">Hard Stone / Boulders</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {(result.totalMaterials.stoneBoulderCum ?? 0).toFixed(3)} <span className="text-xs font-medium text-slate-600">m³</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">BSR Code MT0060</div>
              </div>

              <div className="p-3.5 bg-slate-900 text-white rounded-lg col-span-2 sm:col-span-1">
                <div className="text-xs font-medium text-slate-300">Total Labour Effort</div>
                <div className="text-lg font-bold text-amber-400 mt-1">
                  {result.totalLabour.totalManDays.toFixed(1)} <span className="text-xs font-medium text-slate-300">days</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Mason {result.totalLabour.masonDays.toFixed(1)} · Unskilled {result.totalLabour.unskilledDays.toFixed(1)}
                </div>
              </div>
            </div>

            {/* Detailed Consolidated Material Table */}
            {materialKeysWithQty.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3 w-24">BSR Code</th>
                      <th className="py-2.5 px-3">Material Description</th>
                      <th className="py-2.5 px-3 text-right w-32">Required Qty</th>
                      <th className="py-2.5 px-3 text-center w-20">Unit</th>
                      {showCostEstimate && (
                        <>
                          <th className="py-2.5 px-3 text-right w-32">Dzongkhag Rate (Nu.)</th>
                          <th className="py-2.5 px-3 text-right w-36">Est. Cost (Nu.)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 tabular-nums">
                    {materialKeysWithQty.map((key) => {
                      const spec = LMC_MATERIAL_SPECS[key];
                      const qty = result.totalMaterials[key] ?? 0;
                      const formattedQty =
                        key === 'bricksNos' || key === 'blocksNos' || key === 'msPostsNos'
                          ? Math.ceil(qty).toLocaleString()
                          : qty.toFixed(key === 'cementBags' ? 2 : 3);
                      const rate = customRatesNu[key] ?? spec.defaultRateNu ?? 0;
                      const cost = result.materialCostsNu[key] ?? 0;
                      return (
                        <tr key={key} className="bg-white hover:bg-slate-50/70">
                          <td className="py-2 px-3 font-mono text-slate-600">{spec.bsrCode}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{spec.label}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">{formattedQty}</td>
                          <td className="py-2 px-3 text-center text-slate-600">{spec.unit}</td>
                          {showCostEstimate && (
                            <>
                              <td className="py-2 px-3 text-right">
                                {key === 'cementTonnes' ? (
                                  <span className="text-slate-400">via bags</span>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={rate}
                                    onChange={(e) =>
                                      setCustomRatesNu((prev) => ({
                                        ...prev,
                                        [key]: Math.max(0, parseFloat(e.target.value) || 0),
                                      }))
                                    }
                                    aria-label={`Rate for ${spec.label}`}
                                    className="w-24 px-2 py-1 text-right font-semibold bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-900"
                                  />
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-slate-900">
                                {key === 'cementTonnes'
                                  ? '—'
                                  : `Nu. ${cost.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  {showCostEstimate && result.estimatedMaterialCostNu > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-800 font-bold text-slate-900 tabular-nums">
                        <td colSpan={5} className="py-2.5 px-3 text-right uppercase text-[11px] tracking-wider">
                          Estimated Total Material Cost
                        </td>
                        <td className="py-2.5 px-3 text-right text-sm">
                          Nu.{' '}
                          {result.estimatedMaterialCostNu.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                Select or add at least one active work item with a positive quantity to compute LMC material consumption.
              </div>
            )}

            {/* Item-wise Breakdown Table */}
            {result.itemsBreakdown.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Item-Wise LMC Coefficient Breakdown
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs tabular-nums">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <th className="py-2 px-3">Work Item</th>
                        <th className="py-2 px-3 text-right">Work Qty</th>
                        <th className="py-2 px-3 text-right">Cement (bags)</th>
                        <th className="py-2 px-3 text-right">Sand (m³)</th>
                        <th className="py-2 px-3 text-right">Aggregate (m³)</th>
                        <th className="py-2 px-3 text-right">Stone (m³)</th>
                        <th className="py-2 px-3 text-right">Labour (days)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {result.itemsBreakdown.map((b) => {
                        const rowLabour = b.labour.masonDays + b.labour.fitterDays + b.labour.unskilledDays;
                        return (
                          <tr key={b.lineId} className="bg-white">
                            <td className="py-2 px-3">
                              <span className="font-mono text-slate-500 mr-1.5">{b.spec.bsrCode}</span>
                              <span className="font-semibold text-slate-900">{b.spec.name}</span>
                            </td>
                            <td className="py-2 px-3 text-right font-semibold">
                              {b.quantity.toFixed(2)} {b.spec.unit}
                            </td>
                            <td className="py-2 px-3 text-right">{(b.materials.cementBags ?? 0).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right">{(b.materials.sandCum ?? 0).toFixed(3)}</td>
                            <td className="py-2 px-3 text-right">{(b.materials.aggregateCum ?? 0).toFixed(3)}</td>
                            <td className="py-2 px-3 text-right">{(b.materials.stoneBoulderCum ?? 0).toFixed(3)}</td>
                            <td className="py-2 px-3 text-right font-medium text-slate-700">
                              {rowLabour.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Site: <span className="font-semibold text-slate-700">{project.name}</span> · Standard SI Metric (m / m² / m³)
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={materialKeysWithQty.length === 0}
              onClick={() => exportLmcScheduleToCsv(project.name, result, customRatesNu)}
              className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              disabled={materialKeysWithQty.length === 0}
              onClick={handlePrintSchedule}
              className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Done</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
