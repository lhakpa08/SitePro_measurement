import { ConstructionProject, FencePostEntry, GpsCoordinate, InputLocationPoint } from '../types';

export type StaticMapScope = 'all' | 'road' | 'fencing';
export type ReportMapType = 'hybrid' | 'satellite' | 'roadmap' | 'terrain';

export function getGoogleMapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

export interface ProjectMapSummary {
  sitePin?: GpsCoordinate & { label?: string; source?: 'gps' | 'search' | 'pin' };
  roadStart?: GpsCoordinate;
  roadEnd?: GpsCoordinate;
  gpsPosts: Array<FencePostEntry & { gps: GpsCoordinate }>;
  inputLocations: InputLocationPoint[];
  allPoints: GpsCoordinate[];
  hasAnyCoordinates: boolean;
}

export function getProjectMapData(
  project: ConstructionProject,
  scope: StaticMapScope = 'all'
): ProjectMapSummary {
  const sitePin = project.siteCoordinates;
  const roadStart = scope !== 'fencing' ? project.roadSections[0]?.startGps : undefined;
  const roadEnd = scope !== 'fencing' ? project.roadSections[0]?.endGps : undefined;
  const gpsPosts =
    scope !== 'road'
      ? project.fencePosts.filter(
          (p): p is FencePostEntry & { gps: GpsCoordinate } => Boolean(p.gps)
        )
      : [];

  const customCategoryMap = new Map(
    (project.settings?.customItems ?? []).map((c) => [`custom:${c.id}`, c.category])
  );
  const rawInputLocs = project.inputLocations ?? [];
  const inputLocations = rawInputLocs.filter((loc) => {
    if (loc.fieldKey.startsWith('custom:')) {
      const cat = customCategoryMap.get(loc.fieldKey);
      if (scope === 'fencing') return cat === 'fencing' || !cat;
      if (scope === 'road') return cat === 'road' || cat === 'general' || !cat;
      return true;
    }
    if (scope === 'fencing') {
      return !['roadMeasurement', 'sideDrain'].includes(loc.fieldKey);
    }
    if (scope === 'road') {
      return ['roadMeasurement', 'sideDrain', 'auditNotes'].includes(loc.fieldKey);
    }
    return true;
  });

  const allPoints: GpsCoordinate[] = [];
  if (sitePin) allPoints.push(sitePin);
  if (roadStart) allPoints.push(roadStart);
  if (roadEnd) allPoints.push(roadEnd);
  gpsPosts.forEach((p) => allPoints.push(p.gps));
  inputLocations.forEach((l) => allPoints.push(l.gps));

  return {
    sitePin,
    roadStart,
    roadEnd,
    gpsPosts,
    inputLocations,
    allPoints,
    hasAnyCoordinates: allPoints.length > 0,
  };
}

function samplePoints<T>(items: T[], maxCount: number): T[] {
  if (items.length <= maxCount) return items;
  const result: T[] = [];
  const step = (items.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount; i++) {
    result.push(items[Math.round(i * step)]);
  }
  return result;
}

function formatCoord(pt: GpsCoordinate): string {
  return `${pt.lat.toFixed(6)},${pt.lng.toFixed(6)}`;
}

const GENERIC_LOCATIONS = new Set(['', 'site location', 'on-site', 'n/a', 'general']);

export function buildSiteStaticMapUrl(
  project: ConstructionProject,
  options?: {
    scope?: StaticMapScope;
    mapType?: ReportMapType;
    size?: string;
    scale?: 1 | 2;
    liveGps?: GpsCoordinate;
  }
): string {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return '';

  const scope = options?.scope ?? 'all';
  const mapType = options?.mapType ?? 'hybrid';
  const size = options?.size ?? '640x360';
  const scale = options?.scale ?? 2;
  const liveGps = options?.liveGps;

  const data = getProjectMapData(project, scope);
  const hasAny = data.hasAnyCoordinates || Boolean(liveGps);
  const params = new URLSearchParams({
    size,
    scale: String(scale),
    maptype: mapType,
    format: 'png',
    key: apiKey,
    solution_id: 'gmp_mcp_codeassist_v1_aistudio',
  });

  if (hasAny) {
    if (data.sitePin) {
      params.append('markers', `color:red|label:S|${formatCoord(data.sitePin)}`);
    }

    if (data.roadStart) {
      params.append('markers', `color:green|label:A|${formatCoord(data.roadStart)}`);
    }

    if (data.roadEnd) {
      params.append('markers', `color:green|label:B|${formatCoord(data.roadEnd)}`);
    }

    if (data.roadStart && data.roadEnd) {
      params.append(
        'path',
        `color:0x10b981ff|weight:5|${formatCoord(data.roadStart)}|${formatCoord(data.roadEnd)}`
      );
    }

    if (data.gpsPosts.length > 0) {
      const sampled = samplePoints(data.gpsPosts, 20);
      const postLocs = sampled.map((p) => formatCoord(p.gps));
      params.append('markers', `size:small|color:0xf59e0b|${postLocs.join('|')}`);
      if (sampled.length >= 2) {
        params.append('path', `color:0xf59e0bcc|weight:3|${postLocs.join('|')}`);
      }
    }

    if (data.inputLocations.length > 0) {
      const sampledInputs = samplePoints(data.inputLocations, 15);
      const inputLocs = sampledInputs.map((l) => formatCoord(l.gps));
      params.append('markers', `size:small|color:purple|label:I|${inputLocs.join('|')}`);
    }

    if (liveGps) {
      params.append('markers', `size:small|color:blue|label:G|${formatCoord(liveGps)}`);
    }

    const totalPts = data.allPoints.length + (liveGps ? 1 : 0);
    // Single-point zoom so Static Maps frames the site rather than zooming out too far
    if (totalPts === 1) {
      const onlyPt = data.allPoints[0] ?? liveGps!;
      params.set('center', formatCoord(onlyPt));
      params.set('zoom', '17');
    }

    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  }

  const locText = project.location?.trim() || '';
  if (locText && !GENERIC_LOCATIONS.has(locText.toLowerCase())) {
    params.set('center', locText);
    params.set('zoom', '15');
    params.append('markers', `color:red|label:S|${locText}`);
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  }

  return '';
}
