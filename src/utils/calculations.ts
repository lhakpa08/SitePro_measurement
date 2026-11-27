import { ConstructionProject, EntityCalcBasis, EntityComparisonTarget, EntityMeasurementItem } from '../types';
import {
  formatChainage,
  getProjectSettings,
  getUnitForBasis,
  getUnitLabels,
  isAreaUnit,
  isLengthUnit,
  isVolumeUnit,
} from './geo';
import { StaticMapScope } from './staticMap';

export interface ReportMeasurements {
  lengthUnit: string;
  areaUnit: string;
  volumeUnit: string;
  totalAngle: number;
  totalIntermed: number;
  totalStrut: number;
  totalGate: number;
  totalPosts: number;
  postUnit: string;
  meshLen: number;
  meshWidth: number;
  meshArea: number;
  rrmLen: number;
  rrmWidth: number;
  rrmHeight: number;
  rrmVol: number;
  rrmWidthEntries: number[];
  rrmHeightEntries: number[];
  roadLen: number;
  chainageStart: string;
  chainageEnd: string;
  roadWidth: number;
  roadDepth: number;
  roadArea: number;
  roadVol: number;
  roadWidthEntries: number[];
  roadDepthEntries: number[];
  sideDrainLen: number;
  totalCustomQty: number;
  totalAllLengths: number;
  totalAllAreas: number;
  totalAllVolumes: number;
}

export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function cleanVariance(verified: number, logged: number, decimals = 2): number {
  const diff = verified - logged;
  if (!Number.isFinite(diff)) return 0;
  const rounded = roundTo(diff, decimals);
  return Math.abs(rounded) < 10 ** -(decimals + 1) ? 0 : rounded;
}

export function formatVariance(diff: number, decimals = 2): string {
  const clean = roundTo(diff, decimals);
  if (clean === 0) return '0';
  const formatted = Number.isInteger(clean) ? String(clean) : clean.toFixed(decimals).replace(/\.?0+$/, '');
  return clean > 0 ? `+${formatted}` : formatted;
}

export function getAverageOf(entries?: number[], fallback = 0): number {
  if (!entries || entries.length === 0) return fallback;
  const valid = entries.filter((n) => Number.isFinite(n) && n >= 0);
  if (valid.length === 0) return fallback;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function computeMeasurements(
  project: ConstructionProject,
  scope: StaticMapScope = 'all'
): ReportMeasurements {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustom = customItems.filter((c) => {
    if (!c.enabled) return false;
    if (scope === 'fencing') return c.category === 'fencing';
    if (scope === 'road') return c.category === 'road';
    return true;
  });
  const { lengthUnit, areaUnit, volumeUnit } = getUnitLabels(settings);

  const totalAngle = project.fencePosts.filter((p) => p.postType === 'angle_post').length;
  const totalIntermed = project.fencePosts.filter((p) => p.postType === 'intermediate_post').length;
  const totalStrut = project.fencePosts.filter((p) => p.postType === 'strut_post').length;
  const totalGate = project.fencePosts.filter((p) => p.postType === 'gate_post').length;
  const totalPosts =
    scope === 'road'
      ? 0
      : (items.anglePosts.enabled ? totalAngle : 0) +
        (items.intermediatePosts.enabled ? totalIntermed : 0) +
        (items.strutPosts.enabled ? totalStrut : 0) +
        (items.gatePosts.enabled ? totalGate : 0);

  const postUnit = items.anglePosts.unit || items.intermediatePosts.unit || 'pcs';

  const meshLen = roundTo(
    project.fenceMeshSegments.reduce((a, c) => a + (Number.isFinite(c.lengthMeters) ? c.lengthMeters : 0), 0),
    4
  );
  const meshWidth = roundTo(
    project.fenceMeshSegments[0]?.meshHeightMeters ?? settings.defaultMeshHeight,
    3
  );
  const meshArea = roundTo(
    project.fenceMeshSegments.reduce(
      (acc, seg) =>
        acc +
        (Number.isFinite(seg.lengthMeters) ? seg.lengthMeters : 0) *
          (seg.meshHeightMeters ?? settings.defaultMeshHeight),
      0
    ),
    4
  );

  const rrmLen = roundTo(
    project.rrmWalls.reduce((a, c) => a + (Number.isFinite(c.lengthMeters) ? c.lengthMeters : 0), 0),
    4
  );
  const rrmWall0 = project.rrmWalls[0];
  const rrmWidthEntries = rrmWall0?.topWidthEntries?.length ? rrmWall0.topWidthEntries : [];
  const rrmHeightEntries = rrmWall0?.heightEntries?.length ? rrmWall0.heightEntries : [];

  let rrmAreaSum = 0;
  let rrmVol = 0;
  let rrmHeightLenSum = 0;
  for (const c of project.rrmWalls) {
    const len = Number.isFinite(c.lengthMeters) ? c.lengthMeters : 0;
    const topW = getAverageOf(c.topWidthEntries, c.topWidthMeters);
    const botW = getAverageOf(c.bottomWidthEntries, c.bottomWidthMeters);
    const h = getAverageOf(c.heightEntries, c.heightMeters);
    const avgW = (topW + botW) / 2;
    rrmAreaSum += len * avgW;
    rrmHeightLenSum += len * h;
    rrmVol += len * h * avgW;
  }
  rrmVol = roundTo(rrmVol, 4);

  const rrmWidth = roundTo(
    rrmLen > 0
      ? rrmAreaSum / rrmLen
      : rrmWall0
      ? (getAverageOf(rrmWall0.topWidthEntries, rrmWall0.topWidthMeters) +
          getAverageOf(rrmWall0.bottomWidthEntries, rrmWall0.bottomWidthMeters)) /
        2
      : 0.38,
    3
  );
  const rrmHeight = roundTo(
    rrmLen > 0
      ? rrmHeightLenSum / rrmLen
      : rrmWall0
      ? getAverageOf(rrmWall0.heightEntries, rrmWall0.heightMeters)
      : settings.defaultRrmHeight,
    3
  );

  const roadLen = roundTo(
    project.roadSections.reduce((a, c) => a + (Number.isFinite(c.lengthMeters) ? c.lengthMeters : 0), 0),
    4
  );
  const chainageStart = project.roadSections[0]?.chainageStart || '0+000';
  const chainageEnd = project.roadSections[0]?.chainageEnd || formatChainage(roadLen);
  const roadSec0 = project.roadSections[0];
  const roadWidthEntries = roadSec0?.widthEntries?.length ? roadSec0.widthEntries : [];
  const roadDepthEntries = roadSec0?.depthEntries?.length ? roadSec0.depthEntries : [];

  let roadAreaSum = 0;
  let roadVolSum = 0;
  let roadDepthLenSum = 0;
  for (const curr of project.roadSections) {
    const len = Number.isFinite(curr.lengthMeters) ? curr.lengthMeters : 0;
    const w = getAverageOf(curr.widthEntries, curr.widthMeters ?? settings.defaultRoadWidth);
    const d = getAverageOf(curr.depthEntries, curr.earthworkCutDepthMeters ?? 0);
    roadAreaSum += len * w;
    roadDepthLenSum += len * d;
    roadVolSum += len * w * d;
  }
  const roadArea = roundTo(roadAreaSum, 4);
  const roadVol = roundTo(roadVolSum, 4);
  const roadWidth = roundTo(
    roadLen > 0
      ? roadAreaSum / roadLen
      : roadSec0
      ? getAverageOf(roadSec0.widthEntries, roadSec0.widthMeters ?? settings.defaultRoadWidth)
      : settings.defaultRoadWidth,
    3
  );
  const roadDepth = roundTo(
    roadLen > 0
      ? roadDepthLenSum / roadLen
      : roadSec0
      ? getAverageOf(roadSec0.depthEntries, roadSec0.earthworkCutDepthMeters ?? 0)
      : 0,
    3
  );
  const sideDrainLen = roundTo(
    project.roadSections.reduce(
      (acc, curr) => acc + (Number.isFinite(curr.sideDrainLengthMeters) ? curr.sideDrainLengthMeters || 0 : 0),
      0
    ),
    4
  );

  const totalCustomQty = roundTo(
    enabledCustom.reduce((acc, c) => acc + (Number.isFinite(c.quantity) ? c.quantity : 0), 0),
    4
  );
  const totalAllLengths = roundTo(
    (scope !== 'road' && items.chainLinkMesh.enabled ? meshLen : 0) +
      (scope !== 'road' && items.rrmWall.enabled ? rrmLen : 0) +
      (scope !== 'fencing' && items.roadMeasurement.enabled ? roadLen : 0) +
      (scope !== 'fencing' && items.sideDrain.enabled ? sideDrainLen : 0),
    4
  );
  const totalAllAreas = roundTo(
    (scope !== 'road' && items.chainLinkMesh.enabled ? meshArea : 0) +
      (scope !== 'fencing' && items.roadMeasurement.enabled ? roadArea : 0),
    4
  );
  const totalAllVolumes = roundTo(
    (scope !== 'road' && items.rrmWall.enabled ? rrmVol : 0) +
      (scope !== 'fencing' && items.roadMeasurement.enabled ? roadVol : 0),
    4
  );

  return {
    lengthUnit,
    areaUnit,
    volumeUnit,
    totalAngle,
    totalIntermed,
    totalStrut,
    totalGate,
    totalPosts,
    postUnit,
    meshLen,
    meshWidth,
    meshArea,
    rrmLen,
    rrmWidth,
    rrmHeight,
    rrmVol,
    rrmWidthEntries,
    rrmHeightEntries,
    roadLen,
    chainageStart,
    chainageEnd,
    roadWidth,
    roadDepth,
    roadArea,
    roadVol,
    roadWidthEntries,
    roadDepthEntries,
    sideDrainLen,
    totalCustomQty,
    totalAllLengths,
    totalAllAreas,
    totalAllVolumes,
  };
}

export function calcQuantityFromDims(dims: {
  nos?: number;
  length?: number;
  width?: number;
  thickness?: number;
  calcBasis?: EntityCalcBasis;
}): number {
  const basis = dims.calcBasis || 'auto';
  const nosVal = dims.nos !== undefined && Number.isFinite(dims.nos) ? Math.max(0, dims.nos) : undefined;
  const lenVal = dims.length !== undefined && Number.isFinite(dims.length) && dims.length >= 0 ? dims.length : undefined;
  const widthVal = dims.width !== undefined && Number.isFinite(dims.width) && dims.width >= 0 ? dims.width : undefined;
  const thickVal =
    dims.thickness !== undefined && Number.isFinite(dims.thickness) && dims.thickness >= 0 ? dims.thickness : undefined;

  if (nosVal === 0) return 0;

  if (basis === 'nos') {
    return roundTo(nosVal ?? 0, 3);
  }
  if (basis === 'length') {
    if (lenVal === undefined) return 0;
    return roundTo((nosVal ?? 1) * lenVal, 3);
  }
  if (basis === 'area') {
    if (lenVal === undefined || widthVal === undefined) return 0;
    return roundTo((nosVal ?? 1) * lenVal * widthVal, 3);
  }
  if (basis === 'volume') {
    if (lenVal === undefined || widthVal === undefined || thickVal === undefined) return 0;
    return roundTo((nosVal ?? 1) * lenVal * widthVal * thickVal, 3);
  }

  // 'auto': multiply Nos (default 1 when dimensions exist) across whichever dimensions are entered
  const enteredDims = [lenVal, widthVal, thickVal].filter((v): v is number => v !== undefined);
  if (enteredDims.length === 0) {
    return roundTo(nosVal ?? 0, 3);
  }
  const product = enteredDims.reduce((acc, d) => acc * d, nosVal ?? 1);
  return roundTo(product, 3);
}

export function calcEntityQuantity(
  item: Pick<EntityMeasurementItem, 'nos' | 'length' | 'width' | 'thickness' | 'calcBasis'>
): number {
  return calcQuantityFromDims(item);
}

export function calcAuditQuantity(
  item: Pick<
    EntityMeasurementItem,
    'auditNos' | 'auditLength' | 'auditWidth' | 'auditThickness' | 'calcBasis' | 'verifiedOverride'
  >,
  fallbackDims?: EntityAuditDimensionSnapshot
): number | null {
  if (item.verifiedOverride !== undefined && Number.isFinite(item.verifiedOverride)) {
    return roundTo(item.verifiedOverride, 3);
  }
  const hasManualInput =
    item.auditNos !== undefined ||
    item.auditLength !== undefined ||
    item.auditWidth !== undefined ||
    item.auditThickness !== undefined;

  if (!hasManualInput) {
    return null;
  }

  return calcQuantityFromDims({
    nos: item.auditNos !== undefined ? item.auditNos : fallbackDims?.nos,
    length: item.auditLength !== undefined ? item.auditLength : fallbackDims?.length,
    width: item.auditWidth !== undefined ? item.auditWidth : fallbackDims?.width,
    thickness: item.auditThickness !== undefined ? item.auditThickness : fallbackDims?.thickness,
    calcBasis: item.calcBasis,
  });
}

export interface EntityAuditDimensionSnapshot {
  nos?: number;
  length?: number;
  width?: number;
  thickness?: number;
}
export type EntityComparisonStatus = 'matched' | 'excess' | 'underpayment' | 'pending' | 'shortfall';

export interface EntityAuditComparisonRow {
  item: EntityMeasurementItem;
  entityQty: number;
  auditQty: number | null;
  auditUnit: string;
  auditLabel: string;
  auditDims: EntityAuditDimensionSnapshot;
  dimensionVariances: {
    nos?: number;
    length?: number;
    width?: number;
    thickness?: number;
  };
  variance: number | null; // Quantity difference (Audit - Entity)
  variancePct: number | null;
  rate?: number;
  entityAmount: number | null;
  auditAmount: number | null;
  amountVariance: number | null; // Financial variance
  differenceType: 'matched' | 'excess' | 'underpayment' | 'pending';
  status: EntityComparisonStatus;
  scopeCategory: 'fencing' | 'road' | 'general';
}

interface SnapshotContext {
  settings: ReturnType<typeof getProjectSettings>;
  customItemsById: Map<string, ReturnType<typeof getProjectSettings>['customItems'][number]>;
  avgPostHeights: Record<'all' | 'angle_post' | 'intermediate_post' | 'strut_post' | 'gate_post', number>;
}

function buildSnapshotContext(project: ConstructionProject): SnapshotContext {
  const settings = getProjectSettings(project);
  const customItemsById = new Map(settings.customItems.map((c) => [c.id, c]));

  const sums = {
    all: 0,
    angle_post: 0,
    intermediate_post: 0,
    strut_post: 0,
    gate_post: 0,
  };
  const counts = {
    all: 0,
    angle_post: 0,
    intermediate_post: 0,
    strut_post: 0,
    gate_post: 0,
  };

  for (const p of project.fencePosts) {
    const h = Number.isFinite(p.heightMeters) && p.heightMeters > 0 ? p.heightMeters : settings.defaultPostHeight;
    sums.all += h;
    counts.all += 1;
    if (p.postType in sums) {
      sums[p.postType] += h;
      counts[p.postType] += 1;
    }
  }

  return {
    settings,
    customItemsById,
    avgPostHeights: {
      all: counts.all > 0 ? roundTo(sums.all / counts.all, 3) : settings.defaultPostHeight,
      angle_post: counts.angle_post > 0 ? roundTo(sums.angle_post / counts.angle_post, 3) : settings.defaultPostHeight,
      intermediate_post:
        counts.intermediate_post > 0
          ? roundTo(sums.intermediate_post / counts.intermediate_post, 3)
          : settings.defaultPostHeight,
      strut_post: counts.strut_post > 0 ? roundTo(sums.strut_post / counts.strut_post, 3) : settings.defaultPostHeight,
      gate_post: counts.gate_post > 0 ? roundTo(sums.gate_post / counts.gate_post, 3) : settings.defaultPostHeight,
    },
  };
}

export function getAuditTargetSnapshot(
  project: ConstructionProject,
  item: EntityMeasurementItem,
  m: ReportMeasurements = computeMeasurements(project),
  ctx?: SnapshotContext
): {
  auditQty: number | null;
  auditUnit: string;
  auditLabel: string;
  auditDims: EntityAuditDimensionSnapshot;
  scopeCategory: 'fencing' | 'road' | 'general';
} {
  const context = ctx ?? buildSnapshotContext(project);
  const { settings, customItemsById, avgPostHeights } = context;
  const { items } = settings;
  const target: EntityComparisonTarget = item.linkedTarget || 'none';
  const basis = item.calcBasis || 'auto';
  const useManualDims = Boolean(item.auditManualOverride);

  const hasW = item.width !== undefined && item.width > 0;
  const hasT = item.thickness !== undefined && item.thickness > 0;
  const hasL = item.length !== undefined && item.length > 0;

  const resolvePostSnapshot = (
    count: number,
    unit: string,
    label: string,
    postType?: 'angle_post' | 'intermediate_post' | 'strut_post' | 'gate_post'
  ) => {
    const fieldHeight = postType ? avgPostHeights[postType] : avgPostHeights.all;
    if (basis === 'length') {
      const effLen = (useManualDims ? item.auditLength : undefined) ?? fieldHeight;
      return {
        auditQty: roundTo(count * effLen, 3),
        auditUnit: m.lengthUnit,
        auditLabel: `${label} (Length)`,
        auditDims: { nos: count, length: effLen },
        scopeCategory: 'fencing' as const,
      };
    }
    if (basis === 'area' || basis === 'volume') {
      const effLen = (useManualDims ? item.auditLength : undefined) ?? fieldHeight;
      const effW = (useManualDims ? item.auditWidth : undefined) ?? item.width;
      const effT = (useManualDims ? item.auditThickness : undefined) ?? item.thickness;
      return {
        auditQty: calcQuantityFromDims({ nos: count, length: effLen, width: effW, thickness: effT, calcBasis: basis }),
        auditUnit: basis === 'area' ? m.areaUnit : m.volumeUnit,
        auditLabel: label,
        auditDims: { nos: count, length: effLen, width: effW, thickness: effT },
        scopeCategory: 'fencing' as const,
      };
    }
    return {
      auditQty: count,
      auditUnit: unit,
      auditLabel: label,
      auditDims: { nos: count },
      scopeCategory: 'fencing' as const,
    };
  };

  switch (target) {
    case 'angle_post':
      return resolvePostSnapshot(m.totalAngle, items.anglePosts.unit, 'Angle Post', 'angle_post');
    case 'intermediate_post':
      return resolvePostSnapshot(m.totalIntermed, items.intermediatePosts.unit, 'Intermediate Posts', 'intermediate_post');
    case 'strut_post':
      return resolvePostSnapshot(m.totalStrut, items.strutPosts.unit, 'Strut Posts', 'strut_post');
    case 'gate_post':
      return resolvePostSnapshot(m.totalGate, items.gatePosts.unit, 'Gate Posts', 'gate_post');
    case 'total_posts': {
      return resolvePostSnapshot(m.totalPosts, m.postUnit, 'Total Fence Posts');
    }
    case 'chainLinkMesh': {
      const fieldLen = roundTo(m.meshLen, 3);
      const fieldHeight = m.meshLen > 0 ? roundTo(m.meshArea / m.meshLen, 3) : m.meshWidth;
      const nosForDims = fieldLen > 0 ? 1 : 0;
      const compareNos = basis === 'nos';
      const compareVol =
        basis === 'volume' || (basis === 'auto' && ((hasL && hasW && hasT) || isVolumeUnit(item.unit)));
      const compareArea =
        basis === 'area' ||
        (basis === 'auto' && ((hasL && hasW && !hasT) || isAreaUnit(item.unit) || isAreaUnit(items.chainLinkMesh.unit)));

      if (compareNos) {
        const nosCount = project.fenceMeshSegments.length;
        return {
          auditQty: nosCount,
          auditUnit: 'pcs',
          auditLabel: 'Chain-Link Mesh (Nos)',
          auditDims: { nos: nosCount, length: fieldLen, width: fieldHeight },
          scopeCategory: 'fencing',
        };
      }
      if (compareVol) {
        const effT = (useManualDims ? item.auditThickness : undefined) ?? item.thickness;
        return {
          auditQty: effT !== undefined ? roundTo(m.meshArea * effT, 3) : 0,
          auditUnit: m.volumeUnit,
          auditLabel: 'Chain-Link Mesh (Volume)',
          auditDims: { nos: nosForDims, length: fieldLen, width: fieldHeight, thickness: effT },
          scopeCategory: 'fencing',
        };
      }
      if (compareArea) {
        return {
          auditQty: roundTo(m.meshArea, 3),
          auditUnit: m.areaUnit,
          auditLabel: 'Chain-Link Mesh (Area)',
          auditDims: { nos: nosForDims, length: fieldLen, width: fieldHeight },
          scopeCategory: 'fencing',
        };
      }
      return {
        auditQty: fieldLen,
        auditUnit: isAreaUnit(items.chainLinkMesh.unit) ? m.lengthUnit : items.chainLinkMesh.unit || m.lengthUnit,
        auditLabel: 'Chain-Link Mesh (Length)',
        auditDims: { nos: nosForDims, length: fieldLen, width: fieldHeight },
        scopeCategory: 'fencing',
      };
    }
    case 'rrmWall': {
      const rrmLenRounded = roundTo(m.rrmLen, 3);
      const nosForDims = rrmLenRounded > 0 ? 1 : 0;
      const compareNos = basis === 'nos';
      const compareLength =
        basis === 'length' ||
        (basis === 'auto' && ((hasL && !hasW && !hasT) || isLengthUnit(item.unit) || isLengthUnit(items.rrmWall.unit)));
      const compareArea =
        basis === 'area' || (basis === 'auto' && hasL && hasW && !hasT && isAreaUnit(item.unit));

      if (compareNos) {
        const nosCount = project.rrmWalls.length;
        return {
          auditQty: nosCount,
          auditUnit: 'pcs',
          auditLabel: 'RMM Wall (Nos)',
          auditDims: { nos: nosCount, length: rrmLenRounded, width: m.rrmWidth, thickness: m.rrmHeight },
          scopeCategory: 'fencing',
        };
      }
      if (compareLength) {
        return {
          auditQty: rrmLenRounded,
          auditUnit: isLengthUnit(items.rrmWall.unit) ? items.rrmWall.unit : m.lengthUnit,
          auditLabel: 'RMM Wall (Length)',
          auditDims: { nos: nosForDims, length: rrmLenRounded, width: m.rrmWidth, thickness: m.rrmHeight },
          scopeCategory: 'fencing',
        };
      }
      if (compareArea) {
        const rrmArea = roundTo(
          project.rrmWalls.reduce((acc, c) => {
            const len = Number.isFinite(c.lengthMeters) ? c.lengthMeters : 0;
            const topW = getAverageOf(c.topWidthEntries, c.topWidthMeters);
            const botW = getAverageOf(c.bottomWidthEntries, c.bottomWidthMeters);
            return acc + len * ((topW + botW) / 2);
          }, 0),
          3
        );
        return {
          auditQty: rrmArea,
          auditUnit: m.areaUnit,
          auditLabel: 'RMM Wall (Area)',
          auditDims: { nos: nosForDims, length: rrmLenRounded, width: m.rrmWidth, thickness: m.rrmHeight },
          scopeCategory: 'fencing',
        };
      }
      const fieldVol = roundTo(m.rrmVol, 3);
      return {
        auditQty: fieldVol,
        auditUnit: isLengthUnit(items.rrmWall.unit) ? m.volumeUnit : items.rrmWall.unit || m.volumeUnit,
        auditLabel: 'RMM Wall (Volume)',
        auditDims: { nos: nosForDims, length: rrmLenRounded, width: m.rrmWidth, thickness: m.rrmHeight },
        scopeCategory: 'fencing',
      };
    }
    case 'roadMeasurement': {
      const roadLenRounded = roundTo(m.roadLen, 3);
      const nosForDims = roadLenRounded > 0 ? 1 : 0;
      const compareNos = basis === 'nos';
      const compareVol =
        basis === 'volume' ||
        (basis === 'auto' && ((hasL && hasW && hasT) || isVolumeUnit(item.unit) || isVolumeUnit(items.roadMeasurement.unit)));
      const compareArea =
        basis === 'area' ||
        (basis === 'auto' && ((hasL && hasW && !hasT) || isAreaUnit(item.unit) || isAreaUnit(items.roadMeasurement.unit)));

      if (compareNos) {
        const nosCount = project.roadSections.length;
        return {
          auditQty: nosCount,
          auditUnit: 'pcs',
          auditLabel: 'Road Alignment (Nos)',
          auditDims: { nos: nosCount, length: roadLenRounded, width: m.roadWidth, thickness: m.roadDepth },
          scopeCategory: 'road',
        };
      }
      if (compareVol) {
        return {
          auditQty: roundTo(m.roadVol, 3),
          auditUnit: m.volumeUnit,
          auditLabel: 'Road Alignment (Volume)',
          auditDims: { nos: nosForDims, length: roadLenRounded, width: m.roadWidth, thickness: m.roadDepth },
          scopeCategory: 'road',
        };
      }
      if (compareArea) {
        return {
          auditQty: roundTo(m.roadArea, 3),
          auditUnit: m.areaUnit,
          auditLabel: 'Road Alignment (Area)',
          auditDims: { nos: nosForDims, length: roadLenRounded, width: m.roadWidth, thickness: m.roadDepth },
          scopeCategory: 'road',
        };
      }
      return {
        auditQty: roadLenRounded,
        auditUnit: items.roadMeasurement.unit || m.lengthUnit,
        auditLabel: 'Road Alignment (Length)',
        auditDims: { nos: nosForDims, length: roadLenRounded, width: m.roadWidth, thickness: m.roadDepth },
        scopeCategory: 'road',
      };
    }
    case 'sideDrain': {
      const drainLenRounded = roundTo(m.sideDrainLen, 3);
      const nosForDims = drainLenRounded > 0 ? 1 : 0;
      if (basis === 'nos') {
        const nosCount = project.roadSections.filter((s) => (s.sideDrainLengthMeters || 0) > 0).length;
        return {
          auditQty: nosCount,
          auditUnit: 'pcs',
          auditLabel: 'Road Side Drain (Nos)',
          auditDims: { nos: nosCount, length: drainLenRounded },
          scopeCategory: 'road',
        };
      }
      if (basis === 'area') {
        const effW = (useManualDims ? item.auditWidth : undefined) ?? item.width;
        return {
          auditQty: effW !== undefined ? roundTo(drainLenRounded * effW, 3) : 0,
          auditUnit: m.areaUnit,
          auditLabel: 'Road Side Drain (Area)',
          auditDims: { nos: nosForDims, length: drainLenRounded, width: effW },
          scopeCategory: 'road',
        };
      }
      if (basis === 'volume') {
        const effW = (useManualDims ? item.auditWidth : undefined) ?? item.width;
        const effT = (useManualDims ? item.auditThickness : undefined) ?? item.thickness;
        return {
          auditQty: effW !== undefined && effT !== undefined ? roundTo(drainLenRounded * effW * effT, 3) : 0,
          auditUnit: m.volumeUnit,
          auditLabel: 'Road Side Drain (Volume)',
          auditDims: { nos: nosForDims, length: drainLenRounded, width: effW, thickness: effT },
          scopeCategory: 'road',
        };
      }
      return {
        auditQty: drainLenRounded,
        auditUnit: items.sideDrain.unit || m.lengthUnit,
        auditLabel: 'Road Side Drain',
        auditDims: { nos: nosForDims, length: drainLenRounded },
        scopeCategory: 'road',
      };
    }
    case 'custom': {
      const customItem = item.linkedCustomId ? customItemsById.get(item.linkedCustomId) : undefined;
      if (!customItem) {
        return {
          auditQty: item.verifiedOverride ?? null,
          auditUnit: item.unit || getUnitForBasis(basis, m.lengthUnit, m.areaUnit, m.volumeUnit),
          auditLabel: 'Custom Item (Unlinked)',
          auditDims: {},
          scopeCategory: 'general',
        };
      }
      const fieldCustomQty = roundTo(customItem.quantity, 3);
      const customUnit =
        basis === 'length' || basis === 'area' || basis === 'volume'
          ? getUnitForBasis(basis, m.lengthUnit, m.areaUnit, m.volumeUnit, customItem.unit)
          : customItem.unit;
      const isLenCustom = basis === 'length' || (basis === 'auto' && isLengthUnit(customItem.unit));
      return {
        auditQty: fieldCustomQty,
        auditUnit: customUnit,
        auditLabel: customItem.name,
        auditDims: isLenCustom ? { nos: fieldCustomQty > 0 ? 1 : 0, length: fieldCustomQty } : { nos: fieldCustomQty },
        scopeCategory: customItem.category,
      };
    }
    case 'none':
    default: {
      const hasOverride = item.verifiedOverride !== undefined && Number.isFinite(item.verifiedOverride);
      return {
        auditQty: hasOverride ? roundTo(item.verifiedOverride!, 3) : null,
        auditUnit: item.unit || getUnitForBasis(basis, m.lengthUnit, m.areaUnit, m.volumeUnit),
        auditLabel: 'Manual Audit Verification',
        auditDims: {},
        scopeCategory: 'general',
      };
    }
  }
}

export function computeEntityAuditComparisons(
  project: ConstructionProject,
  scope: StaticMapScope = 'all'
): EntityAuditComparisonRow[] {
  const list = project.entityMeasurements ?? [];
  if (list.length === 0) return [];
  const m = computeMeasurements(project);
  const ctx = buildSnapshotContext(project);

  return list
    .map((item): EntityAuditComparisonRow => {
      const entityQty = calcEntityQuantity(item);
      const snapshot = getAuditTargetSnapshot(project, item, m, ctx);

      const isLinked = Boolean(item.linkedTarget && item.linkedTarget !== 'none');
      const useManualAudit = !isLinked || Boolean(item.auditManualOverride);

      const effectiveAuditDims: EntityAuditDimensionSnapshot = useManualAudit
        ? {
            nos: item.auditNos !== undefined ? item.auditNos : snapshot.auditDims.nos,
            length: item.auditLength !== undefined ? item.auditLength : snapshot.auditDims.length,
            width: item.auditWidth !== undefined ? item.auditWidth : snapshot.auditDims.width,
            thickness: item.auditThickness !== undefined ? item.auditThickness : snapshot.auditDims.thickness,
          }
        : snapshot.auditDims;

      // Manual / explicit audit inputs apply for standalone items or explicitly overridden rows;
      // otherwise linked rows automatically extract live from Field Measurement Works (snapshot.auditQty).
      const manualAuditQty = useManualAudit ? calcAuditQuantity(item, snapshot.auditDims) : null;
      const auditQty = manualAuditQty !== null ? manualAuditQty : snapshot.auditQty;

      const dimensionVariances: EntityAuditComparisonRow['dimensionVariances'] = {};
      if (item.nos !== undefined && effectiveAuditDims.nos !== undefined) {
        dimensionVariances.nos = cleanVariance(effectiveAuditDims.nos, item.nos, 0);
      }
      if (item.length !== undefined && effectiveAuditDims.length !== undefined) {
        dimensionVariances.length = cleanVariance(effectiveAuditDims.length, item.length, 3);
      }
      if (item.width !== undefined && effectiveAuditDims.width !== undefined) {
        dimensionVariances.width = cleanVariance(effectiveAuditDims.width, item.width, 3);
      }
      if (item.thickness !== undefined && effectiveAuditDims.thickness !== undefined) {
        dimensionVariances.thickness = cleanVariance(effectiveAuditDims.thickness, item.thickness, 3);
      }

      const rate =
        item.rate !== undefined && Number.isFinite(item.rate) && item.rate >= 0 ? item.rate : undefined;
      const entityAmount = rate !== undefined ? roundTo(entityQty * rate, 2) : null;
      const auditAmount = rate !== undefined && auditQty !== null ? roundTo(auditQty * rate, 2) : null;
      const amountVariance =
        entityAmount !== null && auditAmount !== null
          ? cleanVariance(auditAmount, entityAmount, 2)
          : null;

      if (auditQty === null) {
        return {
          item,
          entityQty,
          auditQty: null,
          auditUnit: snapshot.auditUnit,
          auditLabel: snapshot.auditLabel,
          auditDims: effectiveAuditDims,
          dimensionVariances,
          variance: null,
          variancePct: null,
          rate,
          entityAmount,
          auditAmount: null,
          amountVariance: null,
          differenceType: 'pending',
          status: 'pending',
          scopeCategory: snapshot.scopeCategory,
        };
      }

      const variance = cleanVariance(auditQty, entityQty, 3);
      const variancePct =
        entityQty > 0
          ? roundTo(((auditQty - entityQty) / entityQty) * 100, 1)
          : auditQty === 0
          ? 0
          : null;

      // User Rule: If entity measurement/amount is higher -> excess
      // If audit measurement/amount is more -> underpayment
      let status: EntityComparisonStatus = 'matched';
      let differenceType: 'matched' | 'excess' | 'underpayment' | 'pending' = 'matched';

      const hasPositiveRate = rate !== undefined && rate > 0;
      if (hasPositiveRate && amountVariance !== null) {
        if (amountVariance < 0) {
          status = 'excess';
          differenceType = 'excess';
        } else if (amountVariance > 0) {
          status = 'underpayment';
          differenceType = 'underpayment';
        } else {
          status = 'matched';
          differenceType = 'matched';
        }
      } else {
        if (variance < 0) {
          status = 'excess';
          differenceType = 'excess';
        } else if (variance > 0) {
          status = 'underpayment';
          differenceType = 'underpayment';
        } else {
          status = 'matched';
          differenceType = 'matched';
        }
      }

      return {
        item,
        entityQty,
        auditQty,
        auditUnit: snapshot.auditUnit,
        auditLabel: snapshot.auditLabel,
        auditDims: effectiveAuditDims,
        dimensionVariances,
        variance,
        variancePct,
        rate,
        entityAmount,
        auditAmount,
        amountVariance,
        differenceType,
        status,
        scopeCategory: snapshot.scopeCategory,
      };
    })
    .filter((row) => {
      if (scope === 'fencing') return row.scopeCategory === 'fencing';
      if (scope === 'road') return row.scopeCategory === 'road';
      return true;
    });
}

export function formatEntityDimensionsLabel(item: EntityMeasurementItem): string {
  const parts: string[] = [];
  if (item.nos !== undefined) parts.push(`Nos: ${item.nos}`);
  if (item.length !== undefined) parts.push(`L: ${item.length}`);
  if (item.width !== undefined) parts.push(`W: ${item.width}`);
  if (item.thickness !== undefined) parts.push(`T: ${item.thickness}`);
  return parts.length > 0 ? parts.join(' × ') : 'No dimensions entered';
}

export function formatAuditDimensionsLabel(
  item: EntityMeasurementItem,
  auditDims?: EntityAuditDimensionSnapshot
): string {
  const isLinked = Boolean(item.linkedTarget && item.linkedTarget !== 'none');
  const useManual = !isLinked || Boolean(item.auditManualOverride);
  const parts: string[] = [];
  const nos = useManual ? (item.auditNos ?? auditDims?.nos) : auditDims?.nos;
  const len = useManual ? (item.auditLength ?? auditDims?.length) : auditDims?.length;
  const wid = useManual ? (item.auditWidth ?? auditDims?.width) : auditDims?.width;
  const thk = useManual ? (item.auditThickness ?? auditDims?.thickness) : auditDims?.thickness;
  if (nos !== undefined) parts.push(`Nos: ${nos}`);
  if (len !== undefined) parts.push(`L: ${len}`);
  if (wid !== undefined) parts.push(`W: ${wid}`);
  if (thk !== undefined) parts.push(`T: ${thk}`);
  return parts.length > 0 ? parts.join(' × ') : '—';
}

export function buildPresetEntityItems(project: ConstructionProject): EntityMeasurementItem[] {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const now = Date.now();
  const presets: EntityMeasurementItem[] = [];
  const m = computeMeasurements(project);

  if (items.anglePosts.enabled) {
    presets.push({
      id: `ent-preset-angle-${now}`,
      itemName: 'Angle Post',
      linkedTarget: 'angle_post',
      unit: items.anglePosts.unit,
      calcBasis: 'nos',
      nos: m.totalAngle > 0 ? m.totalAngle : undefined,
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  if (items.intermediatePosts.enabled) {
    presets.push({
      id: `ent-preset-intermed-${now}`,
      itemName: 'Intermediate Posts',
      linkedTarget: 'intermediate_post',
      unit: items.intermediatePosts.unit,
      calcBasis: 'nos',
      nos: m.totalIntermed > 0 ? m.totalIntermed : undefined,
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  if (items.strutPosts.enabled) {
    presets.push({
      id: `ent-preset-strut-${now}`,
      itemName: 'Strut Posts',
      linkedTarget: 'strut_post',
      unit: items.strutPosts.unit,
      calcBasis: 'nos',
      nos: m.totalStrut > 0 ? m.totalStrut : undefined,
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  if (items.gatePosts.enabled) {
    presets.push({
      id: `ent-preset-gate-${now}`,
      itemName: 'Gate Posts',
      linkedTarget: 'gate_post',
      unit: items.gatePosts.unit,
      calcBasis: 'nos',
      nos: m.totalGate > 0 ? m.totalGate : undefined,
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  if (items.chainLinkMesh.enabled) {
    const meshIsArea = isAreaUnit(items.chainLinkMesh.unit);
    presets.push({
      id: `ent-preset-mesh-${now}`,
      itemName: 'Chain-Link Mesh',
      linkedTarget: 'chainLinkMesh',
      unit: items.chainLinkMesh.unit,
      nos: 1,
      length: m.meshLen > 0 ? roundTo(m.meshLen, 3) : undefined,
      width: m.meshWidth > 0 ? m.meshWidth : undefined,
      calcBasis: meshIsArea ? 'area' : 'length',
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  if (items.rrmWall.enabled) {
    const rrmIsLength = isLengthUnit(items.rrmWall.unit);
    presets.push({
      id: `ent-preset-rrm-${now}`,
      itemName: 'RMM Wall',
      linkedTarget: 'rrmWall',
      unit: items.rrmWall.unit,
      nos: 1,
      length: m.rrmLen > 0 ? roundTo(m.rrmLen, 3) : undefined,
      width: m.rrmWidth > 0 ? m.rrmWidth : undefined,
      thickness: m.rrmHeight > 0 ? m.rrmHeight : undefined,
      calcBasis: rrmIsLength ? 'length' : 'volume',
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  if (items.roadMeasurement.enabled) {
    const roadBasis: EntityCalcBasis = isVolumeUnit(items.roadMeasurement.unit)
      ? 'volume'
      : isAreaUnit(items.roadMeasurement.unit)
      ? 'area'
      : 'length';
    presets.push({
      id: `ent-preset-road-${now}`,
      itemName: 'Road Alignment',
      linkedTarget: 'roadMeasurement',
      unit: items.roadMeasurement.unit,
      nos: 1,
      length: m.roadLen > 0 ? roundTo(m.roadLen, 3) : undefined,
      width: m.roadWidth > 0 ? m.roadWidth : undefined,
      thickness: m.roadDepth > 0 ? m.roadDepth : undefined,
      calcBasis: roadBasis,
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  if (items.sideDrain.enabled) {
    presets.push({
      id: `ent-preset-drain-${now}`,
      itemName: 'Road Side Drain',
      linkedTarget: 'sideDrain',
      unit: items.sideDrain.unit,
      nos: 1,
      length: m.sideDrainLen > 0 ? roundTo(m.sideDrainLen, 3) : undefined,
      calcBasis: 'length',
      auditManualOverride: false,
      updatedAt: now,
    });
  }
  customItems
    .filter((c) => c.enabled)
    .forEach((c, idx) => {
      const isLen = isLengthUnit(c.unit);
      const roundedQty = c.quantity > 0 ? roundTo(c.quantity, 3) : undefined;
      presets.push({
        id: `ent-preset-custom-${c.id}-${now}-${idx}`,
        itemName: c.name,
        linkedTarget: 'custom',
        linkedCustomId: c.id,
        unit: c.unit,
        nos: isLen ? (roundedQty !== undefined ? 1 : undefined) : roundedQty,
        ...(isLen && roundedQty !== undefined ? { length: roundedQty } : {}),
        calcBasis: isLen ? 'length' : 'nos',
        auditManualOverride: false,
        updatedAt: now,
      });
    });

  return presets;
}

export function formatDiffLabel(
  status: EntityComparisonStatus,
  qtyDiff: number | null,
  unit: string,
  amountDiff?: number | null
): {
  badgeLabel: string;
  qtyText: string;
  costText: string;
  colorClass: string;
  hexColor: string;
} {
  if (status === 'pending' || qtyDiff === null) {
    return {
      badgeLabel: 'Pending Audit',
      qtyText: 'Pending',
      costText: '—',
      colorClass: 'text-slate-500',
      hexColor: '#64748b',
    };
  }
  if (status === 'matched' || qtyDiff === 0) {
    return {
      badgeLabel: 'Matched',
      qtyText: `0 ${unit} (Matched)`,
      costText: '0.00 Matched',
      colorClass: 'text-emerald-700',
      hexColor: '#047857',
    };
  }
  const absQty = roundTo(Math.abs(qtyDiff), 3);
  const qtyFormatted = Number.isInteger(absQty) ? String(absQty) : absQty.toFixed(3).replace(/\.?0+$/, '');
  const absCost =
    amountDiff !== undefined && amountDiff !== null
      ? Math.abs(amountDiff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null;

  if (status === 'excess' || (status as string) === 'shortfall') {
    return {
      badgeLabel: 'Excess',
      qtyText: `${qtyFormatted} ${unit} Excess`,
      costText: absCost ? `${absCost} Excess` : '—',
      colorClass: 'text-red-600',
      hexColor: '#dc2626',
    };
  }
  return {
    badgeLabel: 'Underpayment',
    qtyText: `${qtyFormatted} ${unit} Underpayment`,
    costText: absCost ? `${absCost} Underpayment` : '—',
    colorClass: 'text-blue-600',
    hexColor: '#2563eb',
  };
}

