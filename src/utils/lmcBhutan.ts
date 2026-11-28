import { ConstructionProject } from '../types';
import { computeMeasurements, roundTo } from './calculations';
import { getProjectSettings } from './geo';

export type LmcCategory =
  | 'Stone Masonry'
  | 'Concrete Works'
  | 'Brick & Block'
  | 'Plastering & Pointing'
  | 'Fencing Works'
  | 'Road & Drain';

export type LmcMaterialKey =
  | 'cementBags'
  | 'cementTonnes'
  | 'sandCum'
  | 'aggregateCum'
  | 'stoneBoulderCum'
  | 'bricksNos'
  | 'blocksNos'
  | 'chainLinkSqm'
  | 'giWireKg'
  | 'msPostsNos'
  | 'granularMatCum'
  | 'stoneDustCum'
  | 'bitumenKg';

export interface LmcResourceSpec {
  key: LmcMaterialKey;
  label: string;
  unit: string;
  bsrCode: string;
  defaultRateNu?: number;
}

export const LMC_MATERIAL_SPECS: Record<LmcMaterialKey, LmcResourceSpec> = {
  cementBags: {
    key: 'cementBags',
    label: 'Cement (50 kg Bags)',
    unit: 'bags',
    bsrCode: 'MT0145',
    defaultRateNu: 420,
  },
  cementTonnes: {
    key: 'cementTonnes',
    label: 'Cement (Tonnage)',
    unit: 'tonne',
    bsrCode: 'MT0145',
  },
  sandCum: {
    key: 'sandCum',
    label: 'Sand (Fine Aggregate)',
    unit: 'm³',
    bsrCode: 'MT0043',
    defaultRateNu: 950,
  },
  aggregateCum: {
    key: 'aggregateCum',
    label: 'Crushed Stone Aggregate (20/40mm)',
    unit: 'm³',
    bsrCode: 'MT0012',
    defaultRateNu: 1350,
  },
  stoneBoulderCum: {
    key: 'stoneBoulderCum',
    label: 'Hard Stone / Boulders',
    unit: 'm³',
    bsrCode: 'MT0060',
    defaultRateNu: 750,
  },
  bricksNos: {
    key: 'bricksNos',
    label: 'Standard Bricks (1st Class)',
    unit: 'nos',
    bsrCode: 'MT0020',
    defaultRateNu: 12,
  },
  blocksNos: {
    key: 'blocksNos',
    label: 'Hollow Concrete Blocks (200mm)',
    unit: 'nos',
    bsrCode: 'MT0026',
    defaultRateNu: 65,
  },
  chainLinkSqm: {
    key: 'chainLinkSqm',
    label: 'G.I. Chain-Link Mesh',
    unit: 'm²',
    bsrCode: 'MT0310',
    defaultRateNu: 320,
  },
  giWireKg: {
    key: 'giWireKg',
    label: 'G.I. Binding / Straining Wire',
    unit: 'kg',
    bsrCode: 'MT0315',
    defaultRateNu: 115,
  },
  msPostsNos: {
    key: 'msPostsNos',
    label: 'M.S. Angle / Pipe Fence Posts',
    unit: 'nos',
    bsrCode: 'MT0280',
    defaultRateNu: 1450,
  },
  granularMatCum: {
    key: 'granularMatCum',
    label: 'Granular Sub-Base / River Shingle',
    unit: 'm³',
    bsrCode: 'MT0052',
    defaultRateNu: 850,
  },
  stoneDustCum: {
    key: 'stoneDustCum',
    label: 'Stone Dust / Screening',
    unit: 'm³',
    bsrCode: 'MT0048',
    defaultRateNu: 800,
  },
  bitumenKg: {
    key: 'bitumenKg',
    label: 'Bitumen (VG-10 / 80-100)',
    unit: 'kg',
    bsrCode: 'MT0180',
    defaultRateNu: 95,
  },
};

export interface LmcWorkCoefficient {
  id: string;
  bsrCode: string;
  category: LmcCategory;
  name: string;
  unit: 'm³' | 'm²' | 'm' | 'nos';
  description: string;
  // Quantities per 1 unit of finished work (LMC Bhutan standard)
  materials: Partial<Record<LmcMaterialKey, number>>;
  labour: {
    masonDays: number;
    fitterDays: number;
    unskilledDays: number;
  };
}

export const LMC_BHUTAN_CATALOG: LmcWorkCoefficient[] = [
  // Stone Masonry (RRM & Soling)
  {
    id: 'rrm_1_4',
    bsrCode: 'SM0005',
    category: 'Stone Masonry',
    name: 'Random Rubble Masonry (RRM) in CM 1:4',
    unit: 'm³',
    description: 'Hard stone boulders in cement mortar 1:4 (foundation, plinth & retaining wall)',
    materials: {
      stoneBoulderCum: 1.1,
      cementTonnes: 0.114,
      cementBags: 2.28,
      sandCum: 0.32,
    },
    labour: { masonDays: 1.1, fitterDays: 0, unskilledDays: 1.9 },
  },
  {
    id: 'rrm_1_5',
    bsrCode: 'SM0006',
    category: 'Stone Masonry',
    name: 'Random Rubble Masonry (RRM) in CM 1:5',
    unit: 'm³',
    description: 'Hard stone boulders in cement mortar 1:5 (standard boundary & retaining wall)',
    materials: {
      stoneBoulderCum: 1.1,
      cementTonnes: 0.095,
      cementBags: 1.9,
      sandCum: 0.33,
    },
    labour: { masonDays: 1.1, fitterDays: 0, unskilledDays: 1.9 },
  },
  {
    id: 'rrm_1_6',
    bsrCode: 'SM0007',
    category: 'Stone Masonry',
    name: 'Random Rubble Masonry (RRM) in CM 1:6',
    unit: 'm³',
    description: 'Hard stone boulders in cement mortar 1:6 (compound & mass retaining wall)',
    materials: {
      stoneBoulderCum: 1.1,
      cementTonnes: 0.08,
      cementBags: 1.6,
      sandCum: 0.34,
    },
    labour: { masonDays: 1.1, fitterDays: 0, unskilledDays: 1.9 },
  },
  {
    id: 'dry_stone_soling',
    bsrCode: 'SM0071',
    category: 'Stone Masonry',
    name: 'Dry Stone Soling / Hand-Packed Boulder Filling',
    unit: 'm³',
    description: 'Chisel-dressed dry stone soling & hand-packed boulder foundation',
    materials: {
      stoneBoulderCum: 1.15,
    },
    labour: { masonDays: 0.45, fitterDays: 0, unskilledDays: 1.15 },
  },

  // Concrete Works (PCC & RCC)
  {
    id: 'pcc_1_4_8',
    bsrCode: 'CW0101',
    category: 'Concrete Works',
    name: 'PCC 1:4:8 (Crushed Aggregate 40mm/20mm)',
    unit: 'm³',
    description: 'Lean plain cement concrete for foundation bedding & levelling course',
    materials: {
      cementTonnes: 0.17,
      cementBags: 3.4,
      sandCum: 0.45,
      aggregateCum: 0.9,
    },
    labour: { masonDays: 0.15, fitterDays: 0, unskilledDays: 1.65 },
  },
  {
    id: 'pcc_1_3_6',
    bsrCode: 'CW0102',
    category: 'Concrete Works',
    name: 'PCC 1:3:6 (Crushed Aggregate 20mm/40mm)',
    unit: 'm³',
    description: 'Plain cement concrete 1:3:6 for plinth, apron & rigid sub-base',
    materials: {
      cementTonnes: 0.22,
      cementBags: 4.4,
      sandCum: 0.47,
      aggregateCum: 0.89,
    },
    labour: { masonDays: 0.18, fitterDays: 0, unskilledDays: 1.65 },
  },
  {
    id: 'pcc_1_2_4',
    bsrCode: 'CW0104',
    category: 'Concrete Works',
    name: 'PCC / Concrete 1:2:4 (M15, 20mm Aggregate)',
    unit: 'm³',
    description: 'Plain or reinforced 1:2:4 concrete with 20mm graded crushed aggregate',
    materials: {
      cementTonnes: 0.32,
      cementBags: 6.4,
      sandCum: 0.44,
      aggregateCum: 0.88,
    },
    labour: { masonDays: 0.2, fitterDays: 0, unskilledDays: 1.8 },
  },
  {
    id: 'rcc_1_15_3',
    bsrCode: 'CW0106',
    category: 'Concrete Works',
    name: 'RCC 1:1.5:3 (M20, 20mm Aggregate, excl. steel)',
    unit: 'm³',
    description: 'Structural reinforced concrete 1:1.5:3 (cement, sand & 20mm aggregate)',
    materials: {
      cementTonnes: 0.4,
      cementBags: 8.0,
      sandCum: 0.42,
      aggregateCum: 0.84,
    },
    labour: { masonDays: 0.25, fitterDays: 0, unskilledDays: 2.0 },
  },

  // Brick & Block Masonry
  {
    id: 'brick_1_4',
    bsrCode: 'BW0011',
    category: 'Brick & Block',
    name: 'Brick Masonry in CM 1:4',
    unit: 'm³',
    description: 'First class clay brick work in cement mortar 1:4',
    materials: {
      bricksNos: 494,
      cementTonnes: 0.095,
      cementBags: 1.9,
      sandCum: 0.27,
    },
    labour: { masonDays: 1.05, fitterDays: 0, unskilledDays: 1.5 },
  },
  {
    id: 'brick_1_6',
    bsrCode: 'BW0012',
    category: 'Brick & Block',
    name: 'Brick Masonry in CM 1:6',
    unit: 'm³',
    description: 'First class clay brick work in cement mortar 1:6',
    materials: {
      bricksNos: 494,
      cementTonnes: 0.065,
      cementBags: 1.3,
      sandCum: 0.28,
    },
    labour: { masonDays: 1.05, fitterDays: 0, unskilledDays: 1.5 },
  },
  {
    id: 'hollow_block_200',
    bsrCode: 'BW0030',
    category: 'Brick & Block',
    name: 'Hollow Concrete Block Wall (200mm) in CM 1:5',
    unit: 'm²',
    description: '200mm thick hollow cement concrete block masonry (400×200×200mm)',
    materials: {
      blocksNos: 12.5,
      cementTonnes: 0.011,
      cementBags: 0.22,
      sandCum: 0.036,
    },
    labour: { masonDays: 0.22, fitterDays: 0, unskilledDays: 0.28 },
  },

  // Plastering & Pointing
  {
    id: 'plaster_12mm_1_4',
    bsrCode: 'PL0011',
    category: 'Plastering & Pointing',
    name: '12mm Cement Plaster in CM 1:4',
    unit: 'm²',
    description: '12mm thick cement plaster on internal/smooth masonry faces',
    materials: {
      cementTonnes: 0.0054,
      cementBags: 0.108,
      sandCum: 0.015,
    },
    labour: { masonDays: 0.09, fitterDays: 0, unskilledDays: 0.12 },
  },
  {
    id: 'plaster_20mm_1_4',
    bsrCode: 'PL0021',
    category: 'Plastering & Pointing',
    name: '20mm Cement Plaster in CM 1:4',
    unit: 'm²',
    description: '20mm thick external cement plaster on rough stone/RRM wall',
    materials: {
      cementTonnes: 0.0086,
      cementBags: 0.172,
      sandCum: 0.024,
    },
    labour: { masonDays: 0.11, fitterDays: 0, unskilledDays: 0.15 },
  },
  {
    id: 'pointing_flush_1_3',
    bsrCode: 'PT0005',
    category: 'Plastering & Pointing',
    name: 'Flush / Ruled Pointing on RRM Wall in CM 1:3',
    unit: 'm²',
    description: 'Cement mortar 1:3 pointing on stone masonry joints',
    materials: {
      cementTonnes: 0.0022,
      cementBags: 0.044,
      sandCum: 0.0046,
    },
    labour: { masonDays: 0.08, fitterDays: 0, unskilledDays: 0.08 },
  },

  // Fencing Works
  {
    id: 'chainlink_mesh_fix',
    bsrCode: 'FN0010',
    category: 'Fencing Works',
    name: 'G.I. Chain-Link Mesh Fencing (50×50mm)',
    unit: 'm²',
    description: 'Providing & fixing G.I. chain-link mesh with binding/straining wire',
    materials: {
      chainLinkSqm: 1.05,
      giWireKg: 0.25,
    },
    labour: { masonDays: 0, fitterDays: 0.06, unskilledDays: 0.12 },
  },
  {
    id: 'fence_post_pcc',
    bsrCode: 'FN0020',
    category: 'Fencing Works',
    name: 'Fence Post Erection with PCC 1:2:4 Block',
    unit: 'nos',
    description: 'M.S. angle/pipe post fixed in 0.30×0.30×0.45m (0.0405 m³) PCC 1:2:4 footing',
    materials: {
      msPostsNos: 1,
      cementTonnes: 0.013,
      cementBags: 0.26,
      sandCum: 0.018,
      aggregateCum: 0.036,
    },
    labour: { masonDays: 0.08, fitterDays: 0.05, unskilledDays: 0.18 },
  },

  // Road & Drain Works
  {
    id: 'road_gsb',
    bsrCode: 'RW0010',
    category: 'Road & Drain',
    name: 'Granular Sub-Base (GSB) Compacted Layer',
    unit: 'm³',
    description: 'Providing, laying & compacting graded granular sub-base material',
    materials: {
      granularMatCum: 1.28,
    },
    labour: { masonDays: 0, fitterDays: 0, unskilledDays: 0.35 },
  },
  {
    id: 'road_wmm',
    bsrCode: 'RW0020',
    category: 'Road & Drain',
    name: 'Wet Mix Macadam (WMM) Base Course',
    unit: 'm³',
    description: 'Crushed graded aggregate & stone dust screening compacted base course',
    materials: {
      aggregateCum: 1.32,
      stoneDustCum: 0.22,
    },
    labour: { masonDays: 0, fitterDays: 0, unskilledDays: 0.4 },
  },
  {
    id: 'road_premix_20mm',
    bsrCode: 'RW0035',
    category: 'Road & Drain',
    name: '20mm Open-Graded Premix Carpet + Seal Coat',
    unit: 'm²',
    description: 'Bituminous surfacing with 13.2/11.2mm chips & VG-10 bitumen',
    materials: {
      aggregateCum: 0.027,
      bitumenKg: 2.44,
    },
    labour: { masonDays: 0, fitterDays: 0, unskilledDays: 0.09 },
  },
  {
    id: 'side_drain_pcc',
    bsrCode: 'DR0015',
    category: 'Road & Drain',
    name: 'Roadside Lined Drain (PCC 1:2:4 Channel)',
    unit: 'm',
    description: 'Typical 0.35 m³/m concrete U/V-drain channel along carriageway',
    materials: {
      cementTonnes: 0.112,
      cementBags: 2.24,
      sandCum: 0.154,
      aggregateCum: 0.308,
    },
    labour: { masonDays: 0.15, fitterDays: 0, unskilledDays: 0.7 },
  },
];

export interface LmcLineInput {
  id: string;
  itemId: string;
  quantity: number;
  enabled: boolean;
  sourceLabel?: string;
}

export interface LmcCalculationResult {
  itemsBreakdown: Array<{
    lineId: string;
    spec: LmcWorkCoefficient;
    quantity: number;
    sourceLabel?: string;
    materials: Partial<Record<LmcMaterialKey, number>>;
    labour: {
      masonDays: number;
      fitterDays: number;
      unskilledDays: number;
    };
  }>;
  totalMaterials: Partial<Record<LmcMaterialKey, number>>;
  totalLabour: {
    masonDays: number;
    fitterDays: number;
    unskilledDays: number;
    totalManDays: number;
  };
  wastagePct: number;
  estimatedMaterialCostNu: number;
  materialCostsNu: Partial<Record<LmcMaterialKey, number>>;
}

export function toMetricValue(val: number, unit: string): number {
  const safe = Number.isFinite(val) && val > 0 ? val : 0;
  const u = (unit || '').trim().toLowerCase();
  if (u === 'ft') return roundTo(safe * 0.3048, 3);
  if (u === 'yd') return roundTo(safe * 0.9144, 3);
  if (u === 'km') return roundTo(safe * 1000, 3);
  if (u === 'ft²' || u === 'sqft' || u === 'sq.ft') return roundTo(safe * 0.092903, 3);
  if (u === 'ft³' || u === 'cuft' || u === 'cu.ft') return roundTo(safe * 0.0283168, 3);
  if (u === 'brass') return roundTo(safe * 2.83168, 3);
  return roundTo(safe, 3);
}

export function buildSiteLmcLines(
  project: ConstructionProject,
  options: {
    rrmItemId: string;
    roadItemId: string;
  }
): LmcLineInput[] {
  const settings = getProjectSettings(project);
  const { items } = settings;
  const m = computeMeasurements(project, 'all');
  const lines: LmcLineInput[] = [];

  if (items.rrmWall.enabled && m.rrmVol > 0) {
    const qtyCum = toMetricValue(m.rrmVol, m.volumeUnit);
    lines.push({
      id: 'site-rrm',
      itemId: options.rrmItemId,
      quantity: qtyCum,
      enabled: true,
      sourceLabel: `Site RRM Wall (${m.rrmVol.toFixed(2)} ${m.volumeUnit})`,
    });
  }

  if (m.totalPosts > 0) {
    lines.push({
      id: 'site-posts',
      itemId: 'fence_post_pcc',
      quantity: m.totalPosts,
      enabled: true,
      sourceLabel: `Site Fence Posts (${m.totalPosts} ${m.postUnit})`,
    });
  }

  if (items.chainLinkMesh.enabled && m.meshArea > 0) {
    const areaSqm = toMetricValue(m.meshArea, m.areaUnit);
    lines.push({
      id: 'site-mesh',
      itemId: 'chainlink_mesh_fix',
      quantity: areaSqm,
      enabled: true,
      sourceLabel: `Site Chain-Link Mesh (${m.meshArea.toFixed(2)} ${m.areaUnit})`,
    });
  }

  if (items.roadMeasurement.enabled && (m.roadVol > 0 || m.roadArea > 0)) {
    const selectedRoad = LMC_BHUTAN_CATALOG.find((c) => c.id === options.roadItemId);
    const usesArea = selectedRoad?.unit === 'm²';
    const rawQty = usesArea ? m.roadArea : m.roadVol > 0 ? m.roadVol : m.roadArea * 0.15;
    const rawUnit = usesArea ? m.areaUnit : m.roadVol > 0 ? m.volumeUnit : m.areaUnit;
    const metricQty = usesArea
      ? toMetricValue(rawQty, rawUnit)
      : m.roadVol > 0
      ? toMetricValue(m.roadVol, m.volumeUnit)
      : roundTo(toMetricValue(m.roadArea, m.areaUnit) * 0.15, 3);

    if (metricQty > 0) {
      lines.push({
        id: 'site-road',
        itemId: options.roadItemId,
        quantity: metricQty,
        enabled: true,
        sourceLabel: usesArea
          ? `Site Road Area (${m.roadArea.toFixed(2)} ${m.areaUnit})`
          : m.roadVol > 0
          ? `Site Road Volume (${m.roadVol.toFixed(2)} ${m.volumeUnit})`
          : `Site Road Area × 0.15m (${m.roadArea.toFixed(2)} ${m.areaUnit})`,
      });
    }
  }

  if (items.sideDrain.enabled && m.sideDrainLen > 0) {
    const lenM = toMetricValue(m.sideDrainLen, m.lengthUnit);
    lines.push({
      id: 'site-drain',
      itemId: 'side_drain_pcc',
      quantity: lenM,
      enabled: true,
      sourceLabel: `Site Side Drain (${m.sideDrainLen.toFixed(2)} ${m.lengthUnit})`,
    });
  }

  return lines;
}

export function calculateLmcConsumption(
  lines: LmcLineInput[],
  includeWastage5Pct: boolean,
  customRatesNu?: Partial<Record<LmcMaterialKey, number>>
): LmcCalculationResult {
  const wastagePct = includeWastage5Pct ? 5 : 0;
  const mult = 1 + wastagePct / 100;

  const totalMaterials: Partial<Record<LmcMaterialKey, number>> = {};
  let masonDays = 0;
  let fitterDays = 0;
  let unskilledDays = 0;

  const itemsBreakdown: LmcCalculationResult['itemsBreakdown'] = [];

  for (const line of lines) {
    if (!line.enabled || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
    const spec = LMC_BHUTAN_CATALOG.find((c) => c.id === line.itemId);
    if (!spec) continue;

    const itemMats: Partial<Record<LmcMaterialKey, number>> = {};
    (Object.keys(spec.materials) as LmcMaterialKey[]).forEach((matKey) => {
      const coeff = spec.materials[matKey] ?? 0;
      const qty = roundTo(coeff * line.quantity * mult, 3);
      if (qty > 0) {
        itemMats[matKey] = qty;
        totalMaterials[matKey] = roundTo((totalMaterials[matKey] ?? 0) + qty, 3);
      }
    });

    const mDays = roundTo(spec.labour.masonDays * line.quantity, 2);
    const fDays = roundTo(spec.labour.fitterDays * line.quantity, 2);
    const uDays = roundTo(spec.labour.unskilledDays * line.quantity, 2);

    masonDays = roundTo(masonDays + mDays, 2);
    fitterDays = roundTo(fitterDays + fDays, 2);
    unskilledDays = roundTo(unskilledDays + uDays, 2);

    itemsBreakdown.push({
      lineId: line.id,
      spec,
      quantity: roundTo(line.quantity, 3),
      sourceLabel: line.sourceLabel,
      materials: itemMats,
      labour: {
        masonDays: mDays,
        fitterDays: fDays,
        unskilledDays: uDays,
      },
    });
  }

  const materialCostsNu: Partial<Record<LmcMaterialKey, number>> = {};
  let estimatedMaterialCostNu = 0;
  (Object.keys(totalMaterials) as LmcMaterialKey[]).forEach((key) => {
    if (key === 'cementTonnes') return; // Avoid double-counting cement (counted via bags)
    const qty = totalMaterials[key] ?? 0;
    const rate = customRatesNu?.[key] ?? LMC_MATERIAL_SPECS[key].defaultRateNu ?? 0;
    if (qty > 0 && rate > 0) {
      const cost = roundTo(qty * rate, 2);
      materialCostsNu[key] = cost;
      estimatedMaterialCostNu = roundTo(estimatedMaterialCostNu + cost, 2);
    }
  });

  return {
    itemsBreakdown,
    totalMaterials,
    totalLabour: {
      masonDays,
      fitterDays,
      unskilledDays,
      totalManDays: roundTo(masonDays + fitterDays + unskilledDays, 2),
    },
    wastagePct,
    estimatedMaterialCostNu,
    materialCostsNu,
  };
}

export function exportLmcScheduleToCsv(
  projectName: string,
  result: LmcCalculationResult,
  customRatesNu?: Partial<Record<LmcMaterialKey, number>>
): void {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows: string[][] = [
    ['BHUTAN LMC MATERIAL & LABOUR CONSUMPTION SCHEDULE'],
    ['Project / Site', projectName],
    ['Wastage Allowance (BSR/LMC Standard)', `${result.wastagePct}%`],
    ['Generated At', new Date().toLocaleString()],
    [],
    ['1. CONSOLIDATED MATERIAL CONSUMPTION'],
    ['BSR Code', 'Material Description', 'Required Quantity', 'Unit', 'Est. Rate (Nu.)', 'Est. Cost (Nu.)'],
  ];

  (Object.keys(result.totalMaterials) as LmcMaterialKey[]).forEach((key) => {
    const qty = result.totalMaterials[key] ?? 0;
    if (qty <= 0) return;
    const spec = LMC_MATERIAL_SPECS[key];
    const rate = key === 'cementTonnes' ? '' : customRatesNu?.[key] ?? spec.defaultRateNu ?? '';
    const cost = key === 'cementTonnes' ? '' : result.materialCostsNu[key] ?? '';
    rows.push([
      spec.bsrCode,
      spec.label,
      key === 'bricksNos' || key === 'blocksNos' || key === 'msPostsNos'
        ? String(Math.ceil(qty))
        : qty.toFixed(2),
      spec.unit,
      String(rate),
      String(cost),
    ]);
  });

  if (result.estimatedMaterialCostNu > 0) {
    rows.push(['', 'TOTAL ESTIMATED MATERIAL COST (Nu.)', '', '', '', result.estimatedMaterialCostNu.toFixed(2)]);
  }

  rows.push(
    [],
    ['2. LABOUR REQUIREMENT (DAYS)'],
    ['Category', 'Required Man-Days'],
    ['Mason (Grade I / II)', result.totalLabour.masonDays.toFixed(2)],
    ['Fitter / Steel / Mesh Fixer', result.totalLabour.fitterDays.toFixed(2)],
    ['Unskilled Labour (Coolie)', result.totalLabour.unskilledDays.toFixed(2)],
    ['TOTAL LABOUR DAYS', result.totalLabour.totalManDays.toFixed(2)],
    [],
    ['3. WORK ITEM BREAKDOWN'],
    ['BSR Code', 'Work Item', 'Quantity', 'Unit', 'Cement (Bags)', 'Sand (m³)', 'Aggregate (m³)', 'Boulders (m³)']
  );

  result.itemsBreakdown.forEach((b) => {
    rows.push([
      b.spec.bsrCode,
      b.spec.name,
      b.quantity.toFixed(2),
      b.spec.unit,
      (b.materials.cementBags ?? 0).toFixed(2),
      (b.materials.sandCum ?? 0).toFixed(3),
      (b.materials.aggregateCum ?? 0).toFixed(3),
      (b.materials.stoneBoulderCum ?? 0).toFixed(3),
    ]);
  });

  const csvContent = '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}_LMC_Bhutan_Materials.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
