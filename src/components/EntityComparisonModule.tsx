import React, { useMemo } from 'react';
import {
  ConstructionProject,
  EntityCalcBasis,
  EntityComparisonTarget,
  EntityMeasurementItem,
} from '../types';
import {
  getProjectSettings,
  getUnitForBasis,
  getUnitLabels,
  isAreaUnit,
  isLengthUnit,
  isVolumeUnit,
} from '../utils/geo';
import {
  buildPresetEntityItems,
  computeEntityAuditComparisons,
  formatVariance,
  roundTo,
} from '../utils/calculations';
import {
  Plus,
  Trash2,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Scale,
  Copy,
  RefreshCw,
} from 'lucide-react';

interface EntityComparisonModuleProps {
  project: ConstructionProject;
  onUpdateProject: (updated: ConstructionProject) => void;
  onPatchProject?: (
    projectId: string,
    updater: (latest: ConstructionProject) => ConstructionProject
  ) => void;
  onCaptureLocation?: (fieldKey: string, fieldLabel: string, valueSummary?: string) => void;
  embedded?: boolean;
}

const BASIS_OPTIONS: Array<{ value: EntityCalcBasis; label: string }> = [
  { value: 'auto', label: 'Auto (Nos × L × W × T)' },
  { value: 'nos', label: 'Nos Only' },
  { value: 'length', label: 'Length (Nos × L)' },
  { value: 'area', label: 'Area (Nos × L × W)' },
  { value: 'volume', label: 'Volume (Nos × L × W × T)' },
];

export const EntityComparisonModule: React.FC<EntityComparisonModuleProps> = ({
  project,
  onUpdateProject,
  onPatchProject,
  onCaptureLocation,
  embedded = false,
}) => {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustom = customItems.filter((c) => c.enabled);
  const { lengthUnit, areaUnit, volumeUnit } = getUnitLabels(settings);

  const entityItems = project.entityMeasurements ?? [];
  const comparisons = useMemo(() => computeEntityAuditComparisons(project, 'all'), [project]);

  const applyProjectUpdate = (
    updater: (latest: ConstructionProject) => ConstructionProject
  ) => {
    if (onPatchProject) {
      onPatchProject(project.id, updater);
    } else {
      onUpdateProject(updater(project));
    }
  };

  const handleEntityNameChange = (name: string) => {
    applyProjectUpdate((latest) => ({
      ...latest,
      entityName: name,
      updatedAt: Date.now(),
    }));
  };

  const handleLoadSiteItems = () => {
    const presets = buildPresetEntityItems(project);
    applyProjectUpdate((latest) => {
      const existing = latest.entityMeasurements ?? [];
      const additions = presets.filter((preset) => {
        if (preset.linkedTarget === 'custom') {
          return !existing.some(
            (e) => e.linkedTarget === 'custom' && e.linkedCustomId === preset.linkedCustomId
          );
        }
        return !existing.some((e) => e.linkedTarget === preset.linkedTarget);
      });
      if (additions.length === 0) return latest;
      return {
        ...latest,
        entityMeasurements: [...existing, ...additions],
        updatedAt: Date.now(),
      };
    });
  };

  const handleAddRow = () => {
    const now = Date.now();
    const newItem: EntityMeasurementItem = {
      id: `ent-${now}-${Math.random().toString(36).slice(2, 6)}`,
      itemName: '',
      linkedTarget: 'none',
      unit: items.rrmWall.unit || volumeUnit,
      nos: 1,
      calcBasis: 'auto',
      updatedAt: now,
    };
    applyProjectUpdate((latest) => ({
      ...latest,
      entityMeasurements: [...(latest.entityMeasurements ?? []), newItem],
      updatedAt: now,
    }));
  };

  const handleUpdateRow = (id: string, patch: Partial<EntityMeasurementItem>) => {
    const now = Date.now();
    applyProjectUpdate((latest) => ({
      ...latest,
      entityMeasurements: (latest.entityMeasurements ?? []).map((row) =>
        row.id === id ? { ...row, ...patch, updatedAt: now } : row
      ),
      updatedAt: now,
    }));
  };

  const handleDeleteRow = (id: string) => {
    applyProjectUpdate((latest) => ({
      ...latest,
      entityMeasurements: (latest.entityMeasurements ?? []).filter((row) => row.id !== id),
      updatedAt: Date.now(),
    }));
  };

  const handleCopyEntityToAudit = (item: EntityMeasurementItem) => {
    handleUpdateRow(item.id, {
      auditNos: item.nos,
      auditLength: item.length,
      auditWidth: item.width,
      auditThickness: item.thickness,
      auditManualOverride: true,
    });
  };

  const handleResetRowToField = (itemId: string) => {
    handleUpdateRow(itemId, {
      auditNos: undefined,
      auditLength: undefined,
      auditWidth: undefined,
      auditThickness: undefined,
      verifiedOverride: undefined,
      auditManualOverride: false,
    });
  };

  const handleSyncAllFromFieldWorks = () => {
    const now = Date.now();
    applyProjectUpdate((latest) => {
      const list = latest.entityMeasurements ?? [];
      return {
        ...latest,
        entityMeasurements: list.map((item) => {
          const isLinked = Boolean(item.linkedTarget && item.linkedTarget !== 'none');
          if (!isLinked) return item;
          return {
            ...item,
            auditNos: undefined,
            auditLength: undefined,
            auditWidth: undefined,
            auditThickness: undefined,
            verifiedOverride: undefined,
            auditManualOverride: false,
            updatedAt: now,
          };
        }),
        updatedAt: now,
      };
    });
  };

  const handleAuditDimChange = (
    row: (typeof comparisons)[number],
    field: 'auditNos' | 'auditLength' | 'auditWidth' | 'auditThickness',
    val: number | undefined
  ) => {
    const item = row.item;
    const isLinked = Boolean(item.linkedTarget && item.linkedTarget !== 'none');
    if (!isLinked) {
      handleUpdateRow(item.id, { [field]: val });
      return;
    }
    const baseNos = item.auditManualOverride ? item.auditNos : row.auditDims.nos;
    const baseLength = item.auditManualOverride ? item.auditLength : row.auditDims.length;
    const baseWidth = item.auditManualOverride ? item.auditWidth : row.auditDims.width;
    const baseThickness = item.auditManualOverride ? item.auditThickness : row.auditDims.thickness;
    handleUpdateRow(item.id, {
      auditNos: field === 'auditNos' ? val : baseNos,
      auditLength: field === 'auditLength' ? val : baseLength,
      auditWidth: field === 'auditWidth' ? val : baseWidth,
      auditThickness: field === 'auditThickness' ? val : baseThickness,
      auditManualOverride: true,
    });
  };

  const handleBasisChange = (row: EntityMeasurementItem, nextBasis: EntityCalcBasis) => {
    const nextUnit = getUnitForBasis(nextBasis, lengthUnit, areaUnit, volumeUnit, row.unit);
    handleUpdateRow(row.id, {
      calcBasis: nextBasis,
      unit: nextUnit,
    });
  };

  const handleTargetSelect = (row: EntityMeasurementItem, selectValue: string) => {
    if (selectValue.startsWith('custom:')) {
      const customId = selectValue.slice(7);
      const custom = enabledCustom.find((c) => c.id === customId);
      handleUpdateRow(row.id, {
        linkedTarget: 'custom',
        linkedCustomId: customId,
        calcBasis: custom && isLengthUnit(custom.unit) ? 'length' : 'nos',
        unit: custom?.unit || row.unit,
        itemName: row.itemName.trim() ? row.itemName : custom?.name || row.itemName,
        auditNos: undefined,
        auditLength: undefined,
        auditWidth: undefined,
        auditThickness: undefined,
        verifiedOverride: undefined,
        auditManualOverride: false,
      });
      return;
    }

    const target = selectValue as EntityComparisonTarget;
    let nextUnit = row.unit;
    let nextBasis: EntityCalcBasis = row.calcBasis || 'auto';
    let defaultTitle = '';

    if (target === 'angle_post') {
      nextUnit = items.anglePosts.unit;
      nextBasis = 'nos';
      defaultTitle = 'Angle Post';
    } else if (target === 'intermediate_post') {
      nextUnit = items.intermediatePosts.unit;
      nextBasis = 'nos';
      defaultTitle = 'Intermediate Posts';
    } else if (target === 'strut_post') {
      nextUnit = items.strutPosts.unit;
      nextBasis = 'nos';
      defaultTitle = 'Strut Posts';
    } else if (target === 'gate_post') {
      nextUnit = items.gatePosts.unit;
      nextBasis = 'nos';
      defaultTitle = 'Gate Posts';
    } else if (target === 'total_posts') {
      nextUnit = items.anglePosts.unit || 'pcs';
      nextBasis = 'nos';
      defaultTitle = 'Total Fence Posts';
    } else if (target === 'chainLinkMesh') {
      nextUnit = items.chainLinkMesh.unit;
      nextBasis = isAreaUnit(items.chainLinkMesh.unit) ? 'area' : 'length';
      defaultTitle = 'Chain-Link Mesh';
    } else if (target === 'rrmWall') {
      nextUnit = items.rrmWall.unit;
      nextBasis = isLengthUnit(items.rrmWall.unit) ? 'length' : 'volume';
      defaultTitle = 'RMM Wall';
    } else if (target === 'roadMeasurement') {
      nextUnit = items.roadMeasurement.unit;
      nextBasis = isVolumeUnit(items.roadMeasurement.unit)
        ? 'volume'
        : isAreaUnit(items.roadMeasurement.unit)
        ? 'area'
        : 'length';
      defaultTitle = 'Road Alignment';
    } else if (target === 'sideDrain') {
      nextUnit = items.sideDrain.unit;
      nextBasis = 'length';
      defaultTitle = 'Road Side Drain';
    }

    handleUpdateRow(row.id, {
      linkedTarget: target,
      linkedCustomId: undefined,
      unit: nextUnit,
      calcBasis: nextBasis,
      itemName: row.itemName.trim() ? row.itemName : defaultTitle,
      ...(target !== 'none'
        ? {
            auditNos: undefined,
            auditLength: undefined,
            auditWidth: undefined,
            auditThickness: undefined,
            verifiedOverride: undefined,
            auditManualOverride: false,
          }
        : {}),
    });
  };

  const parseOptionalNum = (raw: string): number | undefined => {
    if (raw.trim() === '') return undefined;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return parsed;
  };

  const getSelectValue = (row: EntityMeasurementItem): string => {
    if (row.linkedTarget === 'custom' && row.linkedCustomId) {
      return `custom:${row.linkedCustomId}`;
    }
    return row.linkedTarget || 'none';
  };

  const stats = useMemo(() => {
    const matched = comparisons.filter((r) => r.status === 'matched').length;
    const excess = comparisons.filter(
      (r) => r.status === 'excess' || (r.status as string) === 'shortfall'
    ).length;
    const underpayment = comparisons.filter((r) => r.status === 'underpayment').length;
    const pending = comparisons.filter((r) => r.status === 'pending').length;

    const unitTotals = new Map<
      string,
      { unit: string; entityTotal: number; auditTotal: number; hasAudit: boolean }
    >();
    comparisons.forEach((r) => {
      const unit = r.auditUnit || r.item.unit || 'units';
      const existing = unitTotals.get(unit) || {
        unit,
        entityTotal: 0,
        auditTotal: 0,
        hasAudit: false,
      };
      existing.entityTotal = roundTo(existing.entityTotal + r.entityQty, 2);
      if (r.auditQty !== null) {
        existing.auditTotal = roundTo(existing.auditTotal + r.auditQty, 2);
        existing.hasAudit = true;
      }
      unitTotals.set(unit, existing);
    });

    const hasAnyRates = comparisons.some((r) => r.rate !== undefined && r.rate > 0);
    const totalEntityAmount = roundTo(
      comparisons.reduce((sum, r) => sum + (r.entityAmount ?? 0), 0),
      2
    );
    const totalAuditAmount = roundTo(
      comparisons.reduce((sum, r) => sum + (r.auditAmount ?? 0), 0),
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

    return {
      total: comparisons.length,
      matched,
      excess,
      underpayment,
      pending,
      hasAnyRates,
      totalEntityAmount,
      totalAuditAmount,
      netOutcome,
      netDiff,
      unitTotals: Array.from(unitTotals.values()),
    };
  }, [comparisons]);

  const inputBase =
    'w-full px-2.5 py-1.5 min-h-[38px] bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-lg text-xs sm:text-sm text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-slate-950 dark:focus:border-amber-400 focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-amber-400/25 transition';

  const auditInputBase =
    'w-full px-2.5 py-1.5 min-h-[38px] bg-white dark:bg-slate-950 border border-indigo-300 dark:border-indigo-500/70 rounded-lg text-xs sm:text-sm font-semibold text-indigo-950 dark:text-amber-300 placeholder:text-slate-400 dark:placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-indigo-700 dark:focus:border-amber-400 focus:ring-2 focus:ring-indigo-500/15 dark:focus:ring-amber-400/25 transition';

  const captureHint = (row: EntityMeasurementItem, fieldSuffix: string, label: string, val?: number) => {
    if (!onCaptureLocation) return;
    onCaptureLocation(
      `entity:${row.id}:${fieldSuffix}`,
      `${row.itemName || 'Item'} · ${label}`,
      val !== undefined ? `${val}` : undefined
    );
  };

  const renderStatusMeta = (
    status: string,
    variance: number | null,
    variancePct: number | null,
    unit: string
  ) => {
    if (status === 'pending' || variance === null) {
      return (
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Pending Audit</span>
        </div>
      );
    }

    const pctSuffix =
      variancePct !== null && variance !== 0
        ? ` (${variancePct > 0 ? `+${variancePct}` : variancePct}%)`
        : '';

    if (status === 'matched' || variance === 0) {
      return (
        <div className="text-right">
          <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">0 {unit}</div>
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>Matched</span>
          </div>
        </div>
      );
    }

    const absQty = Math.abs(variance);
    const qtyText = Number.isInteger(absQty) ? String(absQty) : absQty.toFixed(2);

    if (status === 'excess' || status === 'shortfall') {
      return (
        <div className="text-right">
          <div className="text-sm font-bold text-rose-700 dark:text-rose-400 tabular-nums">
            {qtyText} {unit}
            <span className="text-[11px] font-medium text-rose-600 dark:text-rose-300">{pctSuffix}</span>
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/70 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-700">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>Excess</span>
          </div>
        </div>
      );
    }

    return (
      <div className="text-right">
        <div className="text-sm font-bold text-sky-700 dark:text-sky-400 tabular-nums">
          {qtyText} {unit}
          <span className="text-[11px] font-medium text-sky-600 dark:text-sky-300">{pctSuffix}</span>
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/70 px-1.5 py-0.5 rounded border border-sky-300 dark:border-sky-700">
          <TrendingUp className="w-3 h-3 shrink-0" />
          <span>Underpayment</span>
        </div>
      </div>
    );
  };

  const renderDimensionVariancesPills = (row: (typeof comparisons)[number]) => {
    const diffs: string[] = [];
    if (row.dimensionVariances.nos !== undefined && row.dimensionVariances.nos !== 0) {
      diffs.push(`ΔNos: ${formatVariance(row.dimensionVariances.nos, 0)}`);
    }
    if (row.dimensionVariances.length !== undefined && row.dimensionVariances.length !== 0) {
      diffs.push(`ΔL: ${formatVariance(row.dimensionVariances.length, 2)}${lengthUnit}`);
    }
    if (row.dimensionVariances.width !== undefined && row.dimensionVariances.width !== 0) {
      diffs.push(`ΔW: ${formatVariance(row.dimensionVariances.width, 2)}${lengthUnit}`);
    }
    if (row.dimensionVariances.thickness !== undefined && row.dimensionVariances.thickness !== 0) {
      diffs.push(`ΔT: ${formatVariance(row.dimensionVariances.thickness, 3)}${lengthUnit}`);
    }
    if (diffs.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1 justify-end">
        {diffs.map((d, i) => (
          <span
            key={i}
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 tabular-nums"
          >
            {d}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {/* Controls & Entity Name Bar */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 pb-3 border-b border-slate-300 dark:border-slate-700">
        <div className="w-full lg:max-w-sm">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Executing Entity / Contractor Name
          </label>
          <input
            type="text"
            value={project.entityName ?? ''}
            onChange={(e) => handleEntityNameChange(e.target.value)}
            placeholder="e.g. Contractor / Executing Agency"
            className="w-full px-3 py-2 min-h-[42px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-600 dark:focus:border-amber-400 focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-amber-400/25 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSiteItems}
            className="min-h-[40px] px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            title="Populate entity rows from active project items"
          >
            <ListChecks className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            <span>Load Site Items</span>
          </button>

          {entityItems.some((e) => e.linkedTarget && e.linkedTarget !== 'none' && e.auditManualOverride) && (
            <button
              type="button"
              onClick={handleSyncAllFromFieldWorks}
              className="min-h-[40px] px-3.5 py-2 bg-white dark:bg-emerald-950/60 hover:bg-emerald-50 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
              title="Reset overridden Audit values to extract live from Field Measurement Works"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>Sync Audit from Field Works</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleAddRow}
            className="min-h-[40px] px-4 py-2 bg-slate-950 dark:bg-amber-400 hover:bg-slate-800 dark:hover:bg-amber-300 text-white dark:text-slate-950 text-xs font-bold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
          >
            <Plus className="w-4 h-4 text-amber-400 dark:text-slate-950" />
            <span>Add Measurement Item</span>
          </button>
        </div>
      </div>

      {/* Summary Strip (Quantities & Financial Totals) */}
      {comparisons.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
              <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">Items Compared</div>
              <div className="text-lg font-extrabold text-slate-950 dark:text-white tabular-nums mt-0.5">
                {stats.total}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
              <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">Matched Items</div>
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                {stats.matched}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
              <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">Excess (Entity Higher)</div>
              <div className="text-lg font-extrabold text-rose-700 dark:text-rose-400 tabular-nums mt-0.5">
                {stats.excess}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-300/80 dark:border-slate-700 rounded-xl px-3.5 py-2.5">
              <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">Underpayment (Audit More)</div>
              <div className="text-lg font-extrabold text-sky-700 dark:text-sky-400 tabular-nums mt-0.5">
                {stats.underpayment} <span className="text-xs font-medium text-slate-600 dark:text-slate-300">· {stats.pending} pending</span>
              </div>
            </div>
          </div>

          {stats.hasAnyRates && (
            <div
              className={`grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl p-3.5 border ${
                stats.netOutcome === 'excess'
                  ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700'
                  : stats.netOutcome === 'underpayment'
                  ? 'bg-sky-50/70 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Total Claimed Value (Entity MB)
                </div>
                <div className="text-base sm:text-lg font-extrabold text-slate-950 dark:text-white tabular-nums mt-0.5">
                  {stats.totalEntityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Total Verified Value (Audit MB)
                </div>
                <div className="text-base sm:text-lg font-extrabold text-indigo-950 dark:text-amber-300 tabular-nums mt-0.5">
                  {stats.totalAuditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Total Financial Outcome
                </div>
                <div
                  className={`text-base sm:text-lg font-extrabold tabular-nums mt-0.5 ${
                    stats.netOutcome === 'excess'
                      ? 'text-rose-700 dark:text-rose-400'
                      : stats.netOutcome === 'underpayment'
                      ? 'text-sky-700 dark:text-sky-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {stats.netOutcome === 'excess' && (
                    <span>{stats.netDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Excess)</span>
                  )}
                  {stats.netOutcome === 'underpayment' && (
                    <span>{stats.netDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Underpayment)</span>
                  )}
                  {stats.netOutcome === 'matched' && (
                    <span>0.00 (Matched)</span>
                  )}
                </div>
                <div className="text-[10.5px] text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                  {stats.netOutcome === 'excess' && 'Entity measurement is higher → Excess claimed'}
                  {stats.netOutcome === 'underpayment' && 'Audit measurement is more → Underpayment to entity'}
                  {stats.netOutcome === 'matched' && 'Entity and audit measurements match'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {entityItems.length === 0 ? (
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-indigo-700 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Scale className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-sm font-bold text-slate-950 dark:text-white">
              No Entity &amp; Audit Measurements Recorded Yet
            </h4>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              Every item includes <strong>Entity Measurements</strong>, <strong>Audit Verification</strong>, and <strong>Unit Rate</strong> to automatically calculate quantities, financial amounts, and variances.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleLoadSiteItems}
              className="min-h-[42px] px-4 py-2 bg-slate-950 dark:bg-amber-400 hover:bg-slate-800 dark:hover:bg-amber-300 text-white dark:text-slate-950 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition"
            >
              <ListChecks className="w-4 h-4" />
              <span>Load Site Items</span>
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              className="min-h-[42px] px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Item</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile / Small-Screen Cards (Zero Horizontal Scroll) */}
          <div className="xl:hidden space-y-4">
            {comparisons.map((row, idx) => {
              const item = row.item;
              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3.5 space-y-3.5 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-300 tabular-nums">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={item.itemName}
                          onChange={(e) => handleUpdateRow(item.id, { itemName: e.target.value })}
                          placeholder="Work item name (e.g. RMM Wall)"
                          aria-label={`Item ${idx + 1} name`}
                          className={`${inputBase} font-semibold`}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                            Compare Against Audit Item
                          </label>
                          <select
                            value={getSelectValue(item)}
                            onChange={(e) => handleTargetSelect(item, e.target.value)}
                            className={inputBase}
                          >
                            <option value="none">Standalone / Manual Audit</option>
                            <option value="angle_post">Angle Post (Audit)</option>
                            <option value="intermediate_post">Intermediate Posts (Audit)</option>
                            <option value="strut_post">Strut Posts (Audit)</option>
                            <option value="gate_post">Gate Posts (Audit)</option>
                            <option value="total_posts">Total Fence Posts (Audit)</option>
                            <option value="chainLinkMesh">Chain-Link Mesh (Audit)</option>
                            <option value="rrmWall">RMM Wall (Audit)</option>
                            <option value="roadMeasurement">Road Alignment (Audit)</option>
                            <option value="sideDrain">Road Side Drain (Audit)</option>
                            {enabledCustom.map((c) => (
                              <option key={c.id} value={`custom:${c.id}`}>
                                Custom: {c.name} ({c.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                              Basis
                            </label>
                            <select
                              value={item.calcBasis || 'auto'}
                              onChange={(e) =>
                                handleBasisChange(item, e.target.value as EntityCalcBasis)
                              }
                              className={inputBase}
                            >
                              {BASIS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                              Unit
                            </label>
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => handleUpdateRow(item.id, { unit: e.target.value })}
                              placeholder="m³ / m"
                              className={inputBase}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                              Rate / Unit
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              value={item.rate ?? ''}
                              onFocus={() => captureHint(item, 'rate', 'Rate', item.rate)}
                              onClick={() => captureHint(item, 'rate', 'Rate', item.rate)}
                              onChange={(e) =>
                                handleUpdateRow(item.id, {
                                  rate: parseOptionalNum(e.target.value),
                                })
                              }
                              placeholder="0.00"
                              className={`${inputBase} font-bold text-right`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteRow(item.id)}
                      aria-label={`Remove ${item.itemName || 'item'}`}
                      className="min-h-[38px] min-w-[38px] rounded-lg text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 flex items-center justify-center shrink-0 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Section A: Entity Claimed Measurement */}
                  <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-300/80 dark:border-slate-700 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        1. Entity Claimed Measurement
                      </span>
                      <div className="text-right">
                        <div className="text-xs font-extrabold text-slate-950 dark:text-white tabular-nums">
                          Qty: {row.entityQty} {row.auditUnit || item.unit}
                        </div>
                        {row.entityAmount !== null && (
                          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                            Amount: {row.entityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                          Nos
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.nos ?? ''}
                          onFocus={() => captureHint(item, 'nos', 'Nos', item.nos)}
                          onClick={() => captureHint(item, 'nos', 'Nos', item.nos)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, { nos: parseOptionalNum(e.target.value) })
                          }
                          placeholder="1"
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                          Length ({lengthUnit})
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.length ?? ''}
                          onFocus={() => captureHint(item, 'length', 'Length', item.length)}
                          onClick={() => captureHint(item, 'length', 'Length', item.length)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, { length: parseOptionalNum(e.target.value) })
                          }
                          placeholder="0.00"
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                          Width ({lengthUnit})
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.width ?? ''}
                          onFocus={() => captureHint(item, 'width', 'Width', item.width)}
                          onClick={() => captureHint(item, 'width', 'Width', item.width)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, { width: parseOptionalNum(e.target.value) })
                          }
                          placeholder="0.00"
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                          Thick. ({lengthUnit})
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.thickness ?? ''}
                          onFocus={() => captureHint(item, 'thickness', 'Thickness', item.thickness)}
                          onClick={() => captureHint(item, 'thickness', 'Thickness', item.thickness)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, {
                              thickness: parseOptionalNum(e.target.value),
                            })
                          }
                          placeholder="0.00"
                          className={inputBase}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section B: Audit Verified Measurement */}
                  {(() => {
                    const isLinked = Boolean(item.linkedTarget && item.linkedTarget !== 'none');
                    const isManualOverride = Boolean(item.auditManualOverride);
                    const isAutoExtracted = isLinked && !isManualOverride;
                    const dispAuditNos = isAutoExtracted
                      ? row.auditDims.nos ?? ''
                      : item.auditNos ?? '';
                    const dispAuditLen = isAutoExtracted
                      ? row.auditDims.length ?? ''
                      : item.auditLength ?? '';
                    const dispAuditWid = isAutoExtracted
                      ? row.auditDims.width ?? ''
                      : item.auditWidth ?? '';
                    const dispAuditThk = isAutoExtracted
                      ? row.auditDims.thickness ?? ''
                      : item.auditThickness ?? '';

                    return (
                      <div className="bg-indigo-50/50 dark:bg-indigo-950/35 border border-indigo-300 dark:border-indigo-700/70 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                              2. Audit Verified Measurement
                            </span>
                            {isAutoExtracted && (
                              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                &middot; From Field
                              </span>
                            )}
                            {isLinked && isManualOverride && (
                              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                                &middot; Manual override
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isLinked && isManualOverride ? (
                              <button
                                type="button"
                                onClick={() => handleResetRowToField(item.id)}
                                className="px-2 py-0.5 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-[10px] font-semibold rounded inline-flex items-center gap-1 transition"
                                title="Re-extract live from Field Measurement Works"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Sync Field</span>
                              </button>
                            ) : !isLinked ? (
                              <button
                                type="button"
                                onClick={() => handleCopyEntityToAudit(item)}
                                className="px-2 py-0.5 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-300 text-[10px] font-semibold rounded inline-flex items-center gap-1 transition"
                                title="Copy entity values to audit"
                              >
                                <Copy className="w-3 h-3" />
                                <span>Copy Entity</span>
                              </button>
                            ) : null}
                            <div className="text-right">
                              <div className="text-xs font-extrabold text-indigo-800 dark:text-amber-300 tabular-nums">
                                Qty: {row.auditQty !== null ? `${row.auditQty} ${row.auditUnit || item.unit}` : 'Pending'}
                              </div>
                              {row.auditAmount !== null && (
                                <div className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 tabular-nums">
                                  Amount: {row.auditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10.5px] font-semibold text-indigo-950 dark:text-indigo-200 mb-0.5">
                              Audit Nos
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              value={dispAuditNos}
                              onFocus={() => captureHint(item, 'audit:nos', 'Audit Nos', typeof dispAuditNos === 'number' ? dispAuditNos : undefined)}
                              onClick={() => captureHint(item, 'audit:nos', 'Audit Nos', typeof dispAuditNos === 'number' ? dispAuditNos : undefined)}
                              onChange={(e) =>
                                handleAuditDimChange(row, 'auditNos', parseOptionalNum(e.target.value))
                              }
                              placeholder={row.auditDims.nos !== undefined ? String(row.auditDims.nos) : '1'}
                              className={auditInputBase}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-indigo-950 dark:text-indigo-200 mb-0.5">
                              Audit Length ({lengthUnit})
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              value={dispAuditLen}
                              onFocus={() => captureHint(item, 'audit:length', 'Audit Length', typeof dispAuditLen === 'number' ? dispAuditLen : undefined)}
                              onClick={() => captureHint(item, 'audit:length', 'Audit Length', typeof dispAuditLen === 'number' ? dispAuditLen : undefined)}
                              onChange={(e) =>
                                handleAuditDimChange(row, 'auditLength', parseOptionalNum(e.target.value))
                              }
                              placeholder={row.auditDims.length !== undefined ? String(row.auditDims.length) : '0.00'}
                              className={auditInputBase}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-indigo-950 dark:text-indigo-200 mb-0.5">
                              Audit Width ({lengthUnit})
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              value={dispAuditWid}
                              onFocus={() => captureHint(item, 'audit:width', 'Audit Width', typeof dispAuditWid === 'number' ? dispAuditWid : undefined)}
                              onClick={() => captureHint(item, 'audit:width', 'Audit Width', typeof dispAuditWid === 'number' ? dispAuditWid : undefined)}
                              onChange={(e) =>
                                handleAuditDimChange(row, 'auditWidth', parseOptionalNum(e.target.value))
                              }
                              placeholder={row.auditDims.width !== undefined ? String(row.auditDims.width) : '0.00'}
                              className={auditInputBase}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-semibold text-indigo-950 dark:text-indigo-200 mb-0.5">
                              Audit Thick. ({lengthUnit})
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              value={dispAuditThk}
                              onFocus={() => captureHint(item, 'audit:thickness', 'Audit Thickness', typeof dispAuditThk === 'number' ? dispAuditThk : undefined)}
                              onClick={() => captureHint(item, 'audit:thickness', 'Audit Thickness', typeof dispAuditThk === 'number' ? dispAuditThk : undefined)}
                              onChange={(e) =>
                                handleAuditDimChange(row, 'auditThickness', parseOptionalNum(e.target.value))
                              }
                              placeholder={row.auditDims.thickness !== undefined ? String(row.auditDims.thickness) : '0.00'}
                              className={auditInputBase}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Section C: Variance & Audit Status */}
                  <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-300/80 dark:border-slate-700 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Qty Variance:
                        </span>
                        {row.amountVariance !== null && (
                          <div
                            className={`text-xs font-bold tabular-nums mt-0.5 ${
                              row.status === 'excess' || (row.status as string) === 'shortfall'
                                ? 'text-rose-700 dark:text-rose-400'
                                : row.status === 'underpayment'
                                ? 'text-sky-700 dark:text-sky-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            Cost Var: {row.status === 'excess' || (row.status as string) === 'shortfall'
                              ? `${Math.abs(row.amountVariance).toFixed(2)} Excess`
                              : row.status === 'underpayment'
                              ? `${Math.abs(row.amountVariance).toFixed(2)} Underpayment`
                              : '0.00 Matched'}
                          </div>
                        )}
                      </div>
                      <div>
                        {renderStatusMeta(
                          row.status,
                          row.variance,
                          row.variancePct,
                          row.auditUnit || item.unit
                        )}
                      </div>
                    </div>

                    {renderDimensionVariancesPills(row)}

                    <input
                      type="text"
                      value={item.remarks ?? ''}
                      onChange={(e) => handleUpdateRow(item.id, { remarks: e.target.value })}
                      placeholder="Remarks / MB chainage note (optional)..."
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 dark:focus:border-amber-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Dual-Measurement Table with Rate & Calculated Quantities/Amounts */}
          <div className="hidden xl:block overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700">
                  <th className="py-2.5 px-3 w-8 text-center bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200" rowSpan={2}>
                    #
                  </th>
                  <th className="py-2.5 px-3 min-w-[180px] bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200" rowSpan={2}>
                    Work Item &amp; Target Link
                  </th>
                  <th className="py-2 px-2 w-24 text-right bg-amber-100/70 dark:bg-amber-950/60 text-amber-950 dark:text-amber-300 font-bold border-l border-r border-slate-300 dark:border-slate-700" rowSpan={2}>
                    Rate / Unit
                  </th>
                  <th className="py-2 px-2 text-center bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-white border-r border-slate-300 dark:border-slate-700" colSpan={5}>
                    Entity Claimed Measurement (MB)
                  </th>
                  <th className="py-2 px-2 text-center bg-indigo-100/70 dark:bg-indigo-950/60 font-bold text-indigo-950 dark:text-indigo-200 border-r border-indigo-300 dark:border-indigo-700" colSpan={5}>
                    Audit Field Verified Measurement
                  </th>
                  <th className="py-2.5 px-3 text-right bg-slate-100 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 w-36" rowSpan={2}>
                    Variance (Audit − Entity)
                  </th>
                  <th className="py-2.5 px-2 w-10 text-center bg-slate-100 dark:bg-slate-800" rowSpan={2}></th>
                </tr>
                <tr className="border-b border-slate-300 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {/* Entity Sub-cols */}
                  <th className="py-1.5 px-1.5 w-12 text-right bg-slate-50 dark:bg-slate-800/80">Nos</th>
                  <th className="py-1.5 px-1.5 w-16 text-right bg-slate-50 dark:bg-slate-800/80">L ({lengthUnit})</th>
                  <th className="py-1.5 px-1.5 w-16 text-right bg-slate-50 dark:bg-slate-800/80">W ({lengthUnit})</th>
                  <th className="py-1.5 px-1.5 w-16 text-right bg-slate-50 dark:bg-slate-800/80">T ({lengthUnit})</th>
                  <th className="py-1.5 px-2 w-24 text-right bg-slate-100 dark:bg-slate-800 font-bold text-slate-950 dark:text-white border-r border-slate-300 dark:border-slate-700">
                    Claimed Qty &amp; Amount
                  </th>
                  {/* Audit Sub-cols */}
                  <th className="py-1.5 px-1.5 w-12 text-right bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200">Nos</th>
                  <th className="py-1.5 px-1.5 w-16 text-right bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200">L ({lengthUnit})</th>
                  <th className="py-1.5 px-1.5 w-16 text-right bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200">W ({lengthUnit})</th>
                  <th className="py-1.5 px-1.5 w-16 text-right bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200">T ({lengthUnit})</th>
                  <th className="py-1.5 px-2 w-24 text-right bg-indigo-100/80 dark:bg-indigo-950/70 font-extrabold text-indigo-950 dark:text-amber-300 border-r border-indigo-300 dark:border-indigo-700">
                    Verified Qty &amp; Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/80 tabular-nums">
                {comparisons.map((row, idx) => {
                  const item = row.item;
                  return (
                    <tr key={item.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 text-center text-xs text-slate-500 dark:text-slate-300 font-mono pt-3.5">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 space-y-1">
                        <input
                          type="text"
                          value={item.itemName}
                          onChange={(e) => handleUpdateRow(item.id, { itemName: e.target.value })}
                          placeholder="Item description"
                          className={`${inputBase} font-semibold`}
                        />
                        <div className="flex gap-1">
                          <select
                            value={getSelectValue(item)}
                            onChange={(e) => handleTargetSelect(item, e.target.value)}
                            aria-label="Linked audit target"
                            className="w-1/2 px-1.5 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-md text-[11px] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-600 dark:focus:border-amber-400"
                          >
                            <option value="none">Standalone</option>
                            <option value="angle_post">Angle Post</option>
                            <option value="intermediate_post">Intermediate Posts</option>
                            <option value="strut_post">Strut Posts</option>
                            <option value="gate_post">Gate Posts</option>
                            <option value="total_posts">Total Fence Posts</option>
                            <option value="chainLinkMesh">Chain-Link Mesh</option>
                            <option value="rrmWall">RMM Wall</option>
                            <option value="roadMeasurement">Road Alignment</option>
                            <option value="sideDrain">Road Side Drain</option>
                            {enabledCustom.map((c) => (
                              <option key={c.id} value={`custom:${c.id}`}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={item.calcBasis || 'auto'}
                            onChange={(e) =>
                              handleBasisChange(item, e.target.value as EntityCalcBasis)
                            }
                            aria-label="Calculation basis"
                            className="w-[30%] px-1 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-md text-[11px] text-slate-800 dark:text-slate-100 capitalize focus:outline-none focus:border-indigo-600 dark:focus:border-amber-400"
                          >
                            <option value="auto">Auto</option>
                            <option value="nos">Nos</option>
                            <option value="length">Length</option>
                            <option value="area">Area</option>
                            <option value="volume">Volume</option>
                          </select>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleUpdateRow(item.id, { unit: e.target.value })}
                            placeholder="Unit"
                            aria-label="Measurement unit"
                            title="Unit (auto-synced with basis or editable)"
                            className="w-[20%] px-1.5 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-md text-[11px] font-mono text-center text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 dark:focus:border-amber-400"
                          />
                        </div>
                        <input
                          type="text"
                          value={item.remarks ?? ''}
                          onChange={(e) => handleUpdateRow(item.id, { remarks: e.target.value })}
                          placeholder="MB chainage / note..."
                          className="w-full px-2 py-0.5 bg-transparent border-b border-slate-300 dark:border-slate-600 text-[11px] text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 dark:focus:border-amber-400"
                        />
                      </td>

                      {/* Rate Column */}
                      <td className="py-2 px-2 border-l border-r border-slate-300 dark:border-slate-700 bg-amber-50/30 dark:bg-amber-950/20">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.rate ?? ''}
                          onFocus={() => captureHint(item, 'rate', 'Rate', item.rate)}
                          onClick={() => captureHint(item, 'rate', 'Rate', item.rate)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, {
                              rate: parseOptionalNum(e.target.value),
                            })
                          }
                          placeholder="0.00"
                          className={`${inputBase} font-bold text-right bg-amber-50/70 dark:bg-slate-950 border-amber-300 dark:border-amber-500/60 text-amber-950 dark:text-amber-300`}
                        />
                        <div className="text-[10px] text-slate-600 dark:text-slate-300 text-right mt-1 truncate">
                          per {row.auditUnit || item.unit}
                        </div>
                      </td>

                      {/* Entity Inputs */}
                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.nos ?? ''}
                          onFocus={() => captureHint(item, 'nos', 'Nos', item.nos)}
                          onClick={() => captureHint(item, 'nos', 'Nos', item.nos)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, { nos: parseOptionalNum(e.target.value) })
                          }
                          placeholder="1"
                          className={inputBase}
                        />
                      </td>
                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.length ?? ''}
                          onFocus={() => captureHint(item, 'length', 'Length', item.length)}
                          onClick={() => captureHint(item, 'length', 'Length', item.length)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, { length: parseOptionalNum(e.target.value) })
                          }
                          placeholder="0.00"
                          className={inputBase}
                        />
                      </td>
                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.width ?? ''}
                          onFocus={() => captureHint(item, 'width', 'Width', item.width)}
                          onClick={() => captureHint(item, 'width', 'Width', item.width)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, { width: parseOptionalNum(e.target.value) })
                          }
                          placeholder="0.00"
                          className={inputBase}
                        />
                      </td>
                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          value={item.thickness ?? ''}
                          onFocus={() => captureHint(item, 'thickness', 'Thickness', item.thickness)}
                          onClick={() => captureHint(item, 'thickness', 'Thickness', item.thickness)}
                          onChange={(e) =>
                            handleUpdateRow(item.id, {
                              thickness: parseOptionalNum(e.target.value),
                            })
                          }
                          placeholder="0.00"
                          className={inputBase}
                        />
                      </td>
                      <td className="py-2 px-2 text-right border-r border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
                        <div className="font-extrabold text-slate-950 dark:text-white text-xs sm:text-sm pt-1">
                          {row.entityQty}{' '}
                          <span className="text-[10px] font-normal text-slate-600 dark:text-slate-300">
                            {row.auditUnit || item.unit}
                          </span>
                        </div>
                        {row.entityAmount !== null && (
                          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                            Amt: {row.entityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>

                      {/* Audit Inputs (Live-extracted from Field Measurement Works when linked) */}
                      {(() => {
                        const isLinked = Boolean(item.linkedTarget && item.linkedTarget !== 'none');
                        const isManualOverride = Boolean(item.auditManualOverride);
                        const isAutoExtracted = isLinked && !isManualOverride;
                        const dispAuditNos = isAutoExtracted
                          ? row.auditDims.nos ?? ''
                          : item.auditNos ?? '';
                        const dispAuditLen = isAutoExtracted
                          ? row.auditDims.length ?? ''
                          : item.auditLength ?? '';
                        const dispAuditWid = isAutoExtracted
                          ? row.auditDims.width ?? ''
                          : item.auditWidth ?? '';
                        const dispAuditThk = isAutoExtracted
                          ? row.auditDims.thickness ?? ''
                          : item.auditThickness ?? '';

                        return (
                          <>
                            <td className="py-2 px-1.5 bg-indigo-50/25 dark:bg-indigo-950/20">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={dispAuditNos}
                                onFocus={() => captureHint(item, 'audit:nos', 'Audit Nos', typeof dispAuditNos === 'number' ? dispAuditNos : undefined)}
                                onClick={() => captureHint(item, 'audit:nos', 'Audit Nos', typeof dispAuditNos === 'number' ? dispAuditNos : undefined)}
                                onChange={(e) =>
                                  handleAuditDimChange(row, 'auditNos', parseOptionalNum(e.target.value))
                                }
                                placeholder={row.auditDims.nos !== undefined ? String(row.auditDims.nos) : '1'}
                                className={auditInputBase}
                              />
                            </td>
                            <td className="py-2 px-1.5 bg-indigo-50/25 dark:bg-indigo-950/20">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={dispAuditLen}
                                onFocus={() => captureHint(item, 'audit:length', 'Audit Length', typeof dispAuditLen === 'number' ? dispAuditLen : undefined)}
                                onClick={() => captureHint(item, 'audit:length', 'Audit Length', typeof dispAuditLen === 'number' ? dispAuditLen : undefined)}
                                onChange={(e) =>
                                  handleAuditDimChange(row, 'auditLength', parseOptionalNum(e.target.value))
                                }
                                placeholder={row.auditDims.length !== undefined ? String(row.auditDims.length) : '0.00'}
                                className={auditInputBase}
                              />
                            </td>
                            <td className="py-2 px-1.5 bg-indigo-50/25 dark:bg-indigo-950/20">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={dispAuditWid}
                                onFocus={() => captureHint(item, 'audit:width', 'Audit Width', typeof dispAuditWid === 'number' ? dispAuditWid : undefined)}
                                onClick={() => captureHint(item, 'audit:width', 'Audit Width', typeof dispAuditWid === 'number' ? dispAuditWid : undefined)}
                                onChange={(e) =>
                                  handleAuditDimChange(row, 'auditWidth', parseOptionalNum(e.target.value))
                                }
                                placeholder={row.auditDims.width !== undefined ? String(row.auditDims.width) : '0.00'}
                                className={auditInputBase}
                              />
                            </td>
                            <td className="py-2 px-1.5 bg-indigo-50/25 dark:bg-indigo-950/20">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={dispAuditThk}
                                onFocus={() => captureHint(item, 'audit:thickness', 'Audit Thickness', typeof dispAuditThk === 'number' ? dispAuditThk : undefined)}
                                onClick={() => captureHint(item, 'audit:thickness', 'Audit Thickness', typeof dispAuditThk === 'number' ? dispAuditThk : undefined)}
                                onChange={(e) =>
                                  handleAuditDimChange(row, 'auditThickness', parseOptionalNum(e.target.value))
                                }
                                placeholder={row.auditDims.thickness !== undefined ? String(row.auditDims.thickness) : '0.00'}
                                className={auditInputBase}
                              />
                            </td>
                            <td className="py-2 px-2 text-right border-r border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/35">
                              <div className="flex items-center justify-between gap-1 pt-1">
                                {isLinked && isManualOverride ? (
                                  <button
                                    type="button"
                                    onClick={() => handleResetRowToField(item.id)}
                                    title="Re-extract live from Field Measurement Works"
                                    className="p-1 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                  </button>
                                ) : !isLinked ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyEntityToAudit(item)}
                                    title="Copy Entity Claimed dimensions into Audit fields"
                                    className="p-1 rounded text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  ) : (
                                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    Field
                                  </span>
                                )}
                                <div className="font-extrabold text-indigo-800 dark:text-amber-300 text-xs sm:text-sm">
                                  {row.auditQty !== null ? row.auditQty : 'Pending'}{' '}
                                  <span className="text-[10px] font-normal text-indigo-600 dark:text-indigo-300">
                                    {row.auditUnit || item.unit}
                                  </span>
                                </div>
                              </div>
                              {row.auditAmount !== null && (
                                <div className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 mt-0.5">
                                  Amt: {row.auditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                            </td>
                          </>
                        );
                      })()}

                      {/* Variance & Status */}
                      <td className="py-2.5 px-3 text-right">
                        {renderStatusMeta(
                          row.status,
                          row.variance,
                          row.variancePct,
                          row.auditUnit || item.unit
                        )}
                        {row.amountVariance !== null && (
                          <div
                            className={`text-xs font-bold tabular-nums mt-0.5 ${
                              row.status === 'excess' || (row.status as string) === 'shortfall'
                                ? 'text-rose-700 dark:text-rose-400'
                                : row.status === 'underpayment'
                                ? 'text-sky-700 dark:text-sky-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            Cost Var: {row.status === 'excess' || (row.status as string) === 'shortfall'
                              ? `${Math.abs(row.amountVariance).toFixed(2)} Excess`
                              : row.status === 'underpayment'
                              ? `${Math.abs(row.amountVariance).toFixed(2)} Underpayment`
                              : '0.00 Matched'}
                          </div>
                        )}
                        {renderDimensionVariancesPills(row)}
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(item.id)}
                          aria-label={`Remove ${item.itemName || 'item'}`}
                          className="w-8 h-8 rounded-lg text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 inline-flex items-center justify-center transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Unit-Grouped Net Variance Totals */}
          {stats.unitTotals.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Net Quantity Totals by Unit (Entity Claimed vs. Audit Verified)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {stats.unitTotals.map((t) => {
                  const diff = t.hasAudit ? roundTo(t.entityTotal - t.auditTotal, 2) : null;
                  const isExcess = diff !== null && diff > 0;
                  const isUnder = diff !== null && diff < 0;
                  const absDiff = diff !== null ? Math.abs(diff) : 0;
                  return (
                    <div
                      key={t.unit}
                      className="bg-white dark:bg-slate-900 border border-slate-300/90 dark:border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs tabular-nums"
                    >
                      <div>
                        <span className="font-bold text-slate-950 dark:text-white">{t.unit}</span>
                        <span className="text-slate-600 dark:text-slate-300 ml-1.5">
                          Claimed {t.entityTotal} · Verified {t.hasAudit ? t.auditTotal : '—'}
                        </span>
                      </div>
                      <span
                        className={`font-bold ${
                          diff === null
                            ? 'text-slate-600 dark:text-slate-300'
                            : isExcess
                            ? 'text-rose-700 dark:text-rose-400'
                            : isUnder
                            ? 'text-sky-700 dark:text-sky-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {diff === null
                          ? 'Pending'
                          : diff === 0
                          ? `0 ${t.unit} (Matched)`
                          : isExcess
                          ? `${absDiff} ${t.unit} Excess`
                          : `${absDiff} ${t.unit} Underpayment`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
