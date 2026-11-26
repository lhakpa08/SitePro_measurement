import { ConstructionProject, EntityComparisonTarget, EntityMeasurementItem } from '../types';
import { formatChainage, getProjectSettings } from './geo';
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
  if (clean === 0) return decimals > 0 && !Number.isInteger(clean) ? '0' : '0';
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
  const lengthUnit = settings.unitSystem === 'imperial' ? 'ft' : 'm';
  const areaUnit = settings.unitSystem === 'imperial' ? 'ft²' : 'm²';
  const volumeUnit = settings.unitSystem === 'imperial' ? 'ft³' : 'm³';

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
  const rrmTopW = rrmWall0 ? getAverageOf(rrmWall0.topWidthEntries, rrmWall0.topWidthMeters) : 0.38;
  const rrmBotW = rrmWall0 ? getAverageOf(rrmWall0.bottomWidthEntries, rrmWall0.bottomWidthMeters) : 0.38;
  const rrmWidth = roundTo((rrmTopW + rrmBotW) / 2, 2);
  const rrmHeight = roundTo(
    rrmWall0 ? getAverageOf(rrmWall0.heightEntries, rrmWall0.heightMeters) : settings.defaultRrmHeight,
    2
  );
  const rrmVol = roundTo(
    project.rrmWalls.reduce((acc, c) => {
      const len = Number.isFinite(c.lengthMeters) ? c.lengthMeters : 0;
      const topW = getAverageOf(c.topWidthEntries, c.topWidthMeters);
      const botW = getAverageOf(c.bottomWidthEntries, c.bottomWidthMeters);
      const h = getAverageOf(c.heightEntries, c.heightMeters);
      return acc + len * h * ((topW + botW) / 2);
    }, 0),
    4
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
  const roadWidth = roundTo(
    roadSec0
      ? getAverageOf(roadSec0.widthEntries, roadSec0.widthMeters ?? settings.defaultRoadWidth)
      : settings.defaultRoadWidth,
    2
  );
  const roadDepth = roundTo(
    roadSec0 ? getAverageOf(roadSec0.depthEntries, roadSec0.earthworkCutDepthMeters ?? 0) : 0,
    3
  );
  const roadArea = roundTo(
    project.roadSections.reduce((acc, curr) => {
      const len = Number.isFinite(curr.lengthMeters) ? curr.lengthMeters : 0;
      const w = getAverageOf(curr.widthEntries, curr.widthMeters ?? settings.defaultRoadWidth);
      return acc + len * w;
    }, 0),
    4
  );
  const roadVol = roundTo(
    project.roadSections.reduce((acc, curr) => {
      const len = Number.isFinite(curr.lengthMeters) ? curr.lengthMeters : 0;
      const w = getAverageOf(curr.widthEntries, curr.widthMeters ?? settings.defaultRoadWidth);
      const d = getAverageOf(curr.depthEntries, curr.earthworkCutDepthMeters ?? 0);
      return acc + len * w * d;
    }, 0),
    4
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

export function calcEntityQuantity(item: Pick<EntityMeasurementItem, 'nos' | 'length' | 'width' | 'thickness' | 'calcBasis'>): number {
  const basis = item.calcBasis || 'auto';
  const hasNos = item.nos !== undefined && Number.isFinite(item.nos);
  const nosVal = hasNos ? Math.max(0, item.nos!) : undefined;
  const lenVal = item.length !== undefined && Number.isFinite(item.length) && item.length > 0 ? item.length : undefined;
  const widthVal = item.width !== undefined && Number.isFinite(item.width) && item.width > 0 ? item.width : undefined;
  const thickVal = item.thickness !== undefined && Number.isFinite(item.thickness) && item.thickness > 0 ? item.thickness : undefined;

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

  // 'auto': multiply Nos (default 1 when dimensions exist) across whichever positive dimensions are entered
  const dims = [lenVal, widthVal, thickVal].filter((v): v is number => v !== undefined);
  if (dims.length === 0) {
    return roundTo(nosVal ?? 0, 3);
  }
  const product = dims.reduce((acc, d) => acc * d, nosVal ?? 1);
  return roundTo(product, 3);
}

export function calcAuditQuantity(
  item: Pick<EntityMeasurementItem, 'auditNos' | 'auditLength' | 'auditWidth' | 'auditThickness' | 'calcBasis' | 'verifiedOverride'>
): number | null {
  if (item.verifiedOverride !== undefined && Number.isFinite(item.verifiedOverride)) {
    return roundTo(item.verifiedOverride, 3);
  }
  const basis = item.calcBasis || 'auto';
  const hasNos = item.auditNos !== undefined && Number.isFinite(item.auditNos);
  const nosVal = hasNos ? Math.max(0, item.auditNos!) : undefined;
  const lenVal = item.auditLength !== undefined && Number.isFinite(item.auditLength) && item.auditLength > 0 ? item.auditLength : undefined;
  const widthVal = item.auditWidth !== undefined && Number.isFinite(item.auditWidth) && item.auditWidth > 0 ? item.auditWidth : undefined;
  const thickVal = item.auditThickness !== undefined && Number.isFinite(item.auditThickness) && item.auditThickness > 0 ? item.auditThickness : undefined;

  if (nosVal === undefined && lenVal === undefined && widthVal === undefined && thickVal === undefined) {
    return null;
  }
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

  // 'auto': multiply Nos across whichever positive dimensions are entered
  const dims = [lenVal, widthVal, thickVal].filter((v): v is number => v !== undefined);
  if (dims.length === 0) {
    return roundTo(nosVal ?? 0, 3);
  }
  const product = dims.reduce((acc, d) => acc * d, nosVal ?? 1);
  return roundTo(product, 3);
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

export function getAuditTargetSnapshot(
  project: ConstructionProject,
  item: EntityMeasurementItem,
  m: ReportMeasurements = computeMeasurements(project)
): {
  auditQty: number | null;
  auditUnit: string;
  auditLabel: string;
  auditDims: EntityAuditDimensionSnapshot;
  scopeCategory: 'fencing' | 'road' | 'general';
} {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const target: EntityComparisonTarget = item.linkedTarget || 'none';
  const basis = item.calcBasis || 'auto';
  const auditInfo = project.auditInfo;

  const hasW = item.width !== undefined && item.width > 0;
  const hasT = item.thickness !== undefined && item.thickness > 0;
  const hasL = item.length !== undefined && item.length > 0;

  switch (target) {
    case 'angle_post':
      return {
        auditQty: m.totalAngle,
        auditUnit: items.anglePosts.unit,
        auditLabel: 'Angle Post',
        auditDims: { nos: m.totalAngle },
        scopeCategory: 'fencing',
      };
    case 'intermediate_post':
      return {
        auditQty: m.totalIntermed,
        auditUnit: items.intermediatePosts.unit,
        auditLabel: 'Intermediate Posts',
        auditDims: { nos: m.totalIntermed },
        scopeCategory: 'fencing',
      };
    case 'strut_post':
      return {
        auditQty: m.totalStrut,
        auditUnit: items.strutPosts.unit,
        auditLabel: 'Strut Posts',
        auditDims: { nos: m.totalStrut },
        scopeCategory: 'fencing',
      };
    case 'gate_post':
      return {
        auditQty: m.totalGate,
        auditUnit: items.gatePosts.unit,
        auditLabel: 'Gate Posts',
        auditDims: { nos: m.totalGate },
        scopeCategory: 'fencing',
      };
    case 'total_posts': {
      const verified = auditInfo?.verifiedPostCount ?? m.totalPosts;
      return {
        auditQty: verified,
        auditUnit: m.postUnit,
        auditLabel: 'Total Fence Posts',
        auditDims: { nos: verified },
        scopeCategory: 'fencing',
      };
    }
    case 'chainLinkMesh': {
      const verifiedLen = roundTo(auditInfo?.verifiedMeshLength ?? m.meshLen, 2);
      const compareArea =
        basis === 'area' || (basis === 'auto' && hasL && hasW && !hasT) || item.unit.trim() === m.areaUnit;
      if (compareArea) {
        return {
          auditQty: roundTo(verifiedLen * m.meshWidth, 2),
          auditUnit: m.areaUnit,
          auditLabel: 'Chain-Link Mesh (Area)',
          auditDims: { length: verifiedLen, width: m.meshWidth },
          scopeCategory: 'fencing',
        };
      }
      return {
        auditQty: verifiedLen,
        auditUnit: items.chainLinkMesh.unit,
        auditLabel: 'Chain-Link Mesh (Length)',
        auditDims: { length: verifiedLen, width: m.meshWidth },
        scopeCategory: 'fencing',
      };
    }
    case 'rrmWall': {
      const compareLength =
        basis === 'length' || (basis === 'auto' && hasL && !hasW && !hasT && item.unit.trim() === m.lengthUnit);
      const compareArea =
        basis === 'area' || (basis === 'auto' && hasL && hasW && !hasT && item.unit.trim() === m.areaUnit);
      if (compareLength) {
        return {
          auditQty: roundTo(m.rrmLen, 2),
          auditUnit: m.lengthUnit,
          auditLabel: 'RMM Wall (Length)',
          auditDims: { length: roundTo(m.rrmLen, 2), width: m.rrmWidth, thickness: m.rrmHeight },
          scopeCategory: 'fencing',
        };
      }
      if (compareArea) {
        return {
          auditQty: roundTo(m.rrmLen * m.rrmWidth, 2),
          auditUnit: m.areaUnit,
          auditLabel: 'RMM Wall (Area)',
          auditDims: { length: roundTo(m.rrmLen, 2), width: m.rrmWidth, thickness: m.rrmHeight },
          scopeCategory: 'fencing',
        };
      }
      const verifiedVol = roundTo(auditInfo?.verifiedRrmVolume ?? m.rrmVol, 2);
      return {
        auditQty: verifiedVol,
        auditUnit: items.rrmWall.unit,
        auditLabel: 'RMM Wall (Volume)',
        auditDims: { length: roundTo(m.rrmLen, 2), width: m.rrmWidth, thickness: m.rrmHeight },
        scopeCategory: 'fencing',
      };
    }
    case 'roadMeasurement': {
      const verifiedRoadLen = roundTo(auditInfo?.verifiedRoadLength ?? m.roadLen, 2);
      const compareVol =
        basis === 'volume' || (basis === 'auto' && hasL && hasW && hasT);
      const compareArea =
        basis === 'area' || (basis === 'auto' && hasL && hasW && !hasT);
      if (compareVol) {
        return {
          auditQty: roundTo(m.roadVol, 2),
          auditUnit: m.volumeUnit,
          auditLabel: 'Road Alignment (Volume)',
          auditDims: { length: verifiedRoadLen, width: m.roadWidth, thickness: m.roadDepth },
          scopeCategory: 'road',
        };
      }
      if (compareArea) {
        return {
          auditQty: roundTo(m.roadArea, 2),
          auditUnit: m.areaUnit,
          auditLabel: 'Road Alignment (Area)',
          auditDims: { length: verifiedRoadLen, width: m.roadWidth, thickness: m.roadDepth },
          scopeCategory: 'road',
        };
      }
      return {
        auditQty: verifiedRoadLen,
        auditUnit: items.roadMeasurement.unit,
        auditLabel: 'Road Alignment (Length)',
        auditDims: { length: verifiedRoadLen, width: m.roadWidth, thickness: m.roadDepth },
        scopeCategory: 'road',
      };
    }
    case 'sideDrain': {
      const verifiedDrain = roundTo(auditInfo?.verifiedSideDrainLength ?? m.sideDrainLen, 2);
      return {
        auditQty: verifiedDrain,
        auditUnit: items.sideDrain.unit,
        auditLabel: 'Road Side Drain',
        auditDims: { length: verifiedDrain },
        scopeCategory: 'road',
      };
    }
    case 'custom': {
      const customItem = customItems.find((c) => c.id === item.linkedCustomId);
      if (!customItem) {
        return {
          auditQty: item.verifiedOverride ?? null,
          auditUnit: item.unit,
          auditLabel: 'Custom Item (Unlinked)',
          auditDims: {},
          scopeCategory: 'general',
        };
      }
      const verifiedCustom = roundTo(auditInfo?.verifiedCustomItems?.[customItem.id] ?? customItem.quantity, 2);
      return {
        auditQty: verifiedCustom,
        auditUnit: customItem.unit,
        auditLabel: customItem.name,
        auditDims: {},
        scopeCategory: customItem.category,
      };
    }
    case 'none':
    default: {
      const hasOverride = item.verifiedOverride !== undefined && Number.isFinite(item.verifiedOverride);
      return {
        auditQty: hasOverride ? roundTo(item.verifiedOverride!, 3) : null,
        auditUnit: item.unit,
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

  return list
    .map((item): EntityAuditComparisonRow => {
      const entityQty = calcEntityQuantity(item);
      const snapshot = getAuditTargetSnapshot(project, item, m);

      // Manual / explicit audit inputs take precedence, otherwise fallback to snapshot
      const manualAuditQty = calcAuditQuantity(item);
      const effectiveAuditDims: EntityAuditDimensionSnapshot = {
        nos: item.auditNos !== undefined ? item.auditNos : snapshot.auditDims.nos,
        length: item.auditLength !== undefined ? item.auditLength : snapshot.auditDims.length,
        width: item.auditWidth !== undefined ? item.auditWidth : snapshot.auditDims.width,
        thickness: item.auditThickness !== undefined ? item.auditThickness : snapshot.auditDims.thickness,
      };

      const auditQty = manualAuditQty !== null ? manualAuditQty : snapshot.auditQty;

      const dimensionVariances: EntityAuditComparisonRow['dimensionVariances'] = {};
      if (item.nos !== undefined && effectiveAuditDims.nos !== undefined) {
        dimensionVariances.nos = cleanVariance(effectiveAuditDims.nos, item.nos, 0);
      }
      if (item.length !== undefined && effectiveAuditDims.length !== undefined) {
        dimensionVariances.length = cleanVariance(effectiveAuditDims.length, item.length, 2);
      }
      if (item.width !== undefined && effectiveAuditDims.width !== undefined) {
        dimensionVariances.width = cleanVariance(effectiveAuditDims.width, item.width, 2);
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

      const variance = cleanVariance(auditQty, entityQty, 2);
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

      if (entityAmount !== null && auditAmount !== null) {
        if (entityAmount > auditAmount) {
          status = 'excess';
          differenceType = 'excess';
        } else if (auditAmount > entityAmount) {
          status = 'underpayment';
          differenceType = 'underpayment';
        } else {
          status = 'matched';
          differenceType = 'matched';
        }
      } else {
        if (entityQty > auditQty) {
          status = 'excess';
          differenceType = 'excess';
        } else if (auditQty > entityQty) {
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
  const parts: string[] = [];
  const nos = item.auditNos ?? auditDims?.nos;
  const len = item.auditLength ?? auditDims?.length;
  const wid = item.auditWidth ?? auditDims?.width;
  const thk = item.auditThickness ?? auditDims?.thickness;
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
      auditNos: m.totalAngle > 0 ? m.totalAngle : undefined,
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
      auditNos: m.totalIntermed > 0 ? m.totalIntermed : undefined,
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
      auditNos: m.totalStrut > 0 ? m.totalStrut : undefined,
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
      auditNos: m.totalGate > 0 ? m.totalGate : undefined,
      updatedAt: now,
    });
  }
  if (items.chainLinkMesh.enabled) {
    presets.push({
      id: `ent-preset-mesh-${now}`,
      itemName: 'Chain-Link Mesh',
      linkedTarget: 'chainLinkMesh',
      unit: items.chainLinkMesh.unit,
      nos: 1,
      length: m.meshLen > 0 ? m.meshLen : undefined,
      width: m.meshWidth > 0 ? m.meshWidth : undefined,
      auditNos: 1,
      auditLength: m.meshLen > 0 ? m.meshLen : undefined,
      auditWidth: m.meshWidth > 0 ? m.meshWidth : undefined,
      calcBasis: 'auto',
      updatedAt: now,
    });
  }
  if (items.rrmWall.enabled) {
    presets.push({
      id: `ent-preset-rrm-${now}`,
      itemName: 'RMM Wall',
      linkedTarget: 'rrmWall',
      unit: items.rrmWall.unit,
      nos: 1,
      length: m.rrmLen > 0 ? roundTo(m.rrmLen, 2) : undefined,
      width: m.rrmWidth > 0 ? m.rrmWidth : undefined,
      thickness: m.rrmHeight > 0 ? m.rrmHeight : undefined,
      auditNos: 1,
      auditLength: m.rrmLen > 0 ? roundTo(m.rrmLen, 2) : undefined,
      auditWidth: m.rrmWidth > 0 ? m.rrmWidth : undefined,
      auditThickness: m.rrmHeight > 0 ? m.rrmHeight : undefined,
      calcBasis: 'volume',
      updatedAt: now,
    });
  }
  if (items.roadMeasurement.enabled) {
    presets.push({
      id: `ent-preset-road-${now}`,
      itemName: 'Road Alignment',
      linkedTarget: 'roadMeasurement',
      unit: items.roadMeasurement.unit,
      nos: 1,
      length: m.roadLen > 0 ? m.roadLen : undefined,
      width: m.roadWidth > 0 ? m.roadWidth : undefined,
      thickness: m.roadDepth > 0 ? m.roadDepth : undefined,
      auditNos: 1,
      auditLength: m.roadLen > 0 ? m.roadLen : undefined,
      auditWidth: m.roadWidth > 0 ? m.roadWidth : undefined,
      auditThickness: m.roadDepth > 0 ? m.roadDepth : undefined,
      calcBasis: 'auto',
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
      length: m.sideDrainLen > 0 ? m.sideDrainLen : undefined,
      auditNos: 1,
      auditLength: m.sideDrainLen > 0 ? m.sideDrainLen : undefined,
      calcBasis: 'length',
      updatedAt: now,
    });
  }
  customItems
    .filter((c) => c.enabled)
    .forEach((c, idx) => {
      presets.push({
        id: `ent-preset-custom-${c.id}-${now}-${idx}`,
        itemName: c.name,
        linkedTarget: 'custom',
        linkedCustomId: c.id,
        unit: c.unit,
        nos: c.quantity > 0 ? c.quantity : undefined,
        auditNos: c.quantity > 0 ? c.quantity : undefined,
        calcBasis: 'nos',
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
  const absQty = Math.abs(qtyDiff);
  const qtyFormatted = Number.isInteger(absQty) ? String(absQty) : absQty.toFixed(2);
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

