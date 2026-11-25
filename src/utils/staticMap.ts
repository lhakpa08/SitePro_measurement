import { ConstructionProject, FencePostEntry, GpsCoordinate } from '../types';

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

  const allPoints: GpsCoordinate[] = [];
  if (sitePin) allPoints.push(sitePin);
  if (roadStart) allPoints.push(roadStart);
  if (roadEnd) allPoints.push(roadEnd);
  gpsPosts.forEach((p) => allPoints.push(p.gps));

  return {
    sitePin,
    roadStart,
    roadEnd,
    gpsPosts,
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
  }
): string {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return '';

  const scope = options?.scope ?? 'all';
  const mapType = options?.mapType ?? 'hybrid';
  const size = options?.size ?? '640x360';
  const scale = options?.scale ?? 2;

  const data = getProjectMapData(project, scope);
  const params = new URLSearchParams({
    size,
    scale: String(scale),
    maptype: mapType,
    format: 'png',
    key: apiKey,
    solution_id: 'gmp_mcp_codeassist_v1_aistudio',
  });

  if (data.hasAnyCoordinates) {
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

    // Single-point zoom so Static Maps frames the site rather than zooming out too far
    if (data.allPoints.length === 1) {
      params.set('center', formatCoord(data.allPoints[0]));
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
