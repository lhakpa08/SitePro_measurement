import { ConstructionProject } from '../types';
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
