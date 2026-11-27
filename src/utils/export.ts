import { ConstructionProject, GpsCoordinate, InputLocationPoint } from '../types';
import { getProjectSettings, formatChainage, isAreaUnit, isLengthUnit } from './geo';
import {
  buildSiteStaticMapUrl,
  getGoogleMapsApiKey,
  getProjectMapData,
  StaticMapScope,
} from './staticMap';
import {
  cleanVariance,
  computeEntityAuditComparisons,
  computeMeasurements,
  formatAuditDimensionsLabel,
  formatDiffLabel,
  formatEntityDimensionsLabel,
  formatVariance,
  ReportMeasurements,
  roundTo,
} from './calculations';

export { computeMeasurements };
export type { ReportMeasurements };

export function escapeHtml(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatAuditStatus(status?: string): string {
  if (status === 'fully_compliant') return 'Fully Compliant';
  if (status === 'verified_with_variance') return 'Verified with Variance';
  return 'Pending Audit';
}

export interface RecordedInputItem {
  category: string;
  fieldLabel: string;
  rawInput: string;
  computedTotal: string;
  capturedGps?: string;
}

function formatGpsShort(gps?: GpsCoordinate): string {
  if (!gps) return 'Not captured';
  return `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`;
}


function getLatestFieldGps(project: ConstructionProject, fieldKey: string): GpsCoordinate | undefined {
  const matches = (project.inputLocations ?? []).filter((l) => l.fieldKey === fieldKey);
  if (matches.length > 0) {
    return matches[matches.length - 1].gps;
  }
  return undefined;
}

export interface MeasuredSummaryRow {
  category: string;
  item: string;
  details: string;
  quantity: string;
  unit: string;
  capturedGps: string;
}

export function buildMeasuredSummaryRows(
  project: ConstructionProject,
  scope: StaticMapScope = 'all'
): MeasuredSummaryRow[] {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const m = computeMeasurements(project, scope);
  const rows: MeasuredSummaryRow[] = [];

  if (scope !== 'road') {
    if (items.anglePosts.enabled && m.totalAngle > 0) {
      const gps =
        project.fencePosts.filter((p) => p.postType === 'angle_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'angle_post');
      rows.push({
        category: 'Fencing',
        item: 'Angle Post',
        details: 'Physical post count',
        quantity: String(m.totalAngle),
        unit: items.anglePosts.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
    if (items.intermediatePosts.enabled && m.totalIntermed > 0) {
      const gps =
        project.fencePosts.filter((p) => p.postType === 'intermediate_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'intermediate_post');
      rows.push({
        category: 'Fencing',
        item: 'Intermediate Posts',
        details: 'Physical post count',
        quantity: String(m.totalIntermed),
        unit: items.intermediatePosts.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
    if (items.strutPosts.enabled && m.totalStrut > 0) {
      const gps =
        project.fencePosts.filter((p) => p.postType === 'strut_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'strut_post');
      rows.push({
        category: 'Fencing',
        item: 'Strut Posts',
        details: 'Physical post count',
        quantity: String(m.totalStrut),
        unit: items.strutPosts.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
    if (items.gatePosts.enabled && m.totalGate > 0) {
      const gps =
        project.fencePosts.filter((p) => p.postType === 'gate_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'gate_post');
      rows.push({
        category: 'Fencing',
        item: 'Gate Posts',
        details: 'Physical post count',
        quantity: String(m.totalGate),
        unit: items.gatePosts.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
    if (items.chainLinkMesh.enabled && m.meshLen > 0) {
      const gps = project.fenceMeshSegments[0]?.gps || getLatestFieldGps(project, 'chainLinkMesh');
      const meshIsArea = isAreaUnit(items.chainLinkMesh.unit);
      const meshLenUnit = meshIsArea ? m.lengthUnit : items.chainLinkMesh.unit;
      rows.push({
        category: 'Fencing',
        item: 'Chain-Link Mesh',
        details: `L: ${m.meshLen} ${meshLenUnit} × W: ${m.meshWidth} ${m.lengthUnit} (Area: ${m.meshArea.toFixed(2)} ${m.areaUnit})`,
        quantity: meshIsArea
          ? m.meshArea.toFixed(2)
          : m.meshLen.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: items.chainLinkMesh.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
    const hasRrmData =
      m.rrmLen > 0 ||
      m.rrmVol > 0 ||
      m.rrmWidthEntries.length > 0 ||
      m.rrmHeightEntries.length > 0;
    if (items.rrmWall.enabled && hasRrmData) {
      const gps = project.rrmWalls[0]?.gps || getLatestFieldGps(project, 'rrmWall');
      const rrmIsLength = isLengthUnit(items.rrmWall.unit);
      const wDetail =
        m.rrmWidthEntries.length > 0
          ? `W [${m.rrmWidthEntries.join(', ')}] Avg ${m.rrmWidth}`
          : `W: ${m.rrmWidth}`;
      const hDetail =
        m.rrmHeightEntries.length > 0
          ? `H [${m.rrmHeightEntries.join(', ')}] Avg ${m.rrmHeight}`
          : `H: ${m.rrmHeight}`;
      rows.push({
        category: 'Masonry',
        item: 'RMM Wall',
        details: `L: ${m.rrmLen.toFixed(2)} ${m.lengthUnit} × ${wDetail} ${m.lengthUnit} × ${hDetail} ${m.lengthUnit} (Vol: ${m.rrmVol.toFixed(2)} ${m.volumeUnit})`,
        quantity: rrmIsLength ? m.rrmLen.toFixed(2) : m.rrmVol.toFixed(2),
        unit: items.rrmWall.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
  }

  if (scope !== 'fencing') {
    const hasRoadData =
      m.roadLen > 0 ||
      m.roadVol > 0 ||
      m.roadWidthEntries.length > 0 ||
      m.roadDepthEntries.length > 0;
    if (items.roadMeasurement.enabled && hasRoadData) {
      const roadSec = project.roadSections[0];
      const gps = roadSec?.gps || roadSec?.startGps || getLatestFieldGps(project, 'roadMeasurement');
      const chainageText = `Ch. ${m.chainageStart}–${m.chainageEnd} · `;
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
          ? `${chainageText}L: ${m.roadLen} ${items.roadMeasurement.unit} × ${wDetail} ${m.lengthUnit} × ${dDetail} ${m.lengthUnit} · Area: ${m.roadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.areaUnit} · Vol: ${m.roadVol.toFixed(2)} ${m.volumeUnit}`
          : `${chainageText}L: ${m.roadLen} ${items.roadMeasurement.unit} × ${wDetail} ${m.lengthUnit} · Area: ${m.roadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.areaUnit}`;
      rows.push({
        category: 'Road',
        item: 'Road Alignment',
        details: roadDetails,
        quantity: m.roadLen.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: items.roadMeasurement.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
    if (items.sideDrain.enabled && m.sideDrainLen > 0) {
      const gps = getLatestFieldGps(project, 'sideDrain') || project.roadSections[0]?.gps;
      rows.push({
        category: 'Road',
        item: 'Road Side Drain',
        details: 'Measured length',
        quantity: m.sideDrainLen.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        unit: items.sideDrain.unit,
        capturedGps: formatGpsShort(gps),
      });
    }
  }

  const enabledCustom = customItems.filter((c) => {
    if (!c.enabled || !(c.quantity > 0)) return false;
    if (scope === 'fencing') return c.category === 'fencing';
    if (scope === 'road') return c.category === 'road';
    return true;
  });

  enabledCustom.forEach((c) => {
    const gps =
      c.gps ||
      getLatestFieldGps(project, `custom:${c.id}`) ||
      getLatestFieldGps(project, c.id);
    rows.push({
      category: `Custom (${c.category})`,
      item: c.name,
      details: 'Measured custom item',
      quantity: String(c.quantity),
      unit: c.unit,
      capturedGps: formatGpsShort(gps),
    });
  });

  return rows;
}

export function buildAllRecordedInputs(
  project: ConstructionProject,
  scope: StaticMapScope = 'all'
): RecordedInputItem[] {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const m = computeMeasurements(project);
  const rows: RecordedInputItem[] = [];

  if (scope !== 'road') {
    if (items.anglePosts.enabled && m.totalAngle > 0) {
      const postGps =
        project.fencePosts.filter((p) => p.postType === 'angle_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'angle_post');
      rows.push({
        category: 'Fencing',
        fieldLabel: 'Angle Post',
        rawInput: `${m.totalAngle} ${items.anglePosts.unit}`,
        computedTotal: `${m.totalAngle} ${items.anglePosts.unit}`,
        capturedGps: formatGpsShort(postGps),
      });
    }
    if (items.intermediatePosts.enabled && m.totalIntermed > 0) {
      const postGps =
        project.fencePosts.filter((p) => p.postType === 'intermediate_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'intermediate_post');
      rows.push({
        category: 'Fencing',
        fieldLabel: 'Intermediate Posts',
        rawInput: `${m.totalIntermed} ${items.intermediatePosts.unit}`,
        computedTotal: `${m.totalIntermed} ${items.intermediatePosts.unit}`,
        capturedGps: formatGpsShort(postGps),
      });
    }
    if (items.strutPosts.enabled && m.totalStrut > 0) {
      const postGps =
        project.fencePosts.filter((p) => p.postType === 'strut_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'strut_post');
      rows.push({
        category: 'Fencing',
        fieldLabel: 'Strut Posts',
        rawInput: `${m.totalStrut} ${items.strutPosts.unit}`,
        computedTotal: `${m.totalStrut} ${items.strutPosts.unit}`,
        capturedGps: formatGpsShort(postGps),
      });
    }
    if (items.gatePosts.enabled && m.totalGate > 0) {
      const postGps =
        project.fencePosts.filter((p) => p.postType === 'gate_post' && p.gps).slice(-1)[0]?.gps ||
        getLatestFieldGps(project, 'gate_post');
      rows.push({
        category: 'Fencing',
        fieldLabel: 'Gate Posts',
        rawInput: `${m.totalGate} ${items.gatePosts.unit}`,
        computedTotal: `${m.totalGate} ${items.gatePosts.unit}`,
        capturedGps: formatGpsShort(postGps),
      });
    }
    if (items.chainLinkMesh.enabled && m.meshLen > 0) {
      const meshGps = project.fenceMeshSegments[0]?.gps || getLatestFieldGps(project, 'chainLinkMesh');
      const meshLenUnit = isAreaUnit(items.chainLinkMesh.unit) ? m.lengthUnit : items.chainLinkMesh.unit;
      rows.push({
        category: 'Fencing',
        fieldLabel: 'Chain-Link Mesh Length',
        rawInput: `${m.meshLen} ${meshLenUnit}`,
        computedTotal: `${m.meshLen.toLocaleString()} ${meshLenUnit}`,
        capturedGps: formatGpsShort(meshGps),
      });
      if (m.meshWidth > 0) {
        rows.push({
          category: 'Fencing',
          fieldLabel: 'Chain-Link Mesh Width / Height',
          rawInput: `${m.meshWidth} ${m.lengthUnit}`,
          computedTotal: `Area: ${m.meshArea.toFixed(2)} ${m.areaUnit}`,
          capturedGps: formatGpsShort(meshGps),
        });
      }
    }
    const hasRrmData =
      m.rrmLen > 0 ||
      m.rrmVol > 0 ||
      m.rrmWidthEntries.length > 0 ||
      m.rrmHeightEntries.length > 0;
    if (items.rrmWall.enabled && hasRrmData) {
      const rrmGps = project.rrmWalls[0]?.gps || getLatestFieldGps(project, 'rrmWall');
      rows.push({
        category: 'Masonry (RMM Wall)',
        fieldLabel: 'RMM Wall Length',
        rawInput: `${m.rrmLen} ${m.lengthUnit}`,
        computedTotal: `${m.rrmLen.toFixed(2)} ${m.lengthUnit}`,
        capturedGps: formatGpsShort(rrmGps),
      });
      rows.push({
        category: 'Masonry (RMM Wall)',
        fieldLabel: 'RMM Wall Width & Multi-Samples',
        rawInput:
          m.rrmWidthEntries.length > 0
            ? `Samples (${m.rrmWidthEntries.length}): ${m.rrmWidthEntries.join(', ')} ${m.lengthUnit}`
            : `Single entry: ${m.rrmWidth} ${m.lengthUnit}`,
        computedTotal: `Avg: ${m.rrmWidth.toFixed(2)} ${m.lengthUnit}`,
        capturedGps: formatGpsShort(rrmGps),
      });
      rows.push({
        category: 'Masonry (RMM Wall)',
        fieldLabel: 'RMM Wall Height & Multi-Samples',
        rawInput:
          m.rrmHeightEntries.length > 0
            ? `Samples (${m.rrmHeightEntries.length}): ${m.rrmHeightEntries.join(', ')} ${m.lengthUnit}`
            : `Single entry: ${m.rrmHeight} ${m.lengthUnit}`,
        computedTotal: `Avg: ${m.rrmHeight.toFixed(2)} ${m.lengthUnit} | Vol: ${m.rrmVol.toFixed(2)} ${m.volumeUnit}`,
        capturedGps: formatGpsShort(rrmGps),
      });
    }
  }

  if (scope !== 'fencing') {
    const hasRoadData =
      m.roadLen > 0 ||
      m.roadVol > 0 ||
      m.roadWidthEntries.length > 0 ||
      m.roadDepthEntries.length > 0;
    if (items.roadMeasurement.enabled && hasRoadData) {
      const roadSec = project.roadSections[0];
      const roadGps = roadSec?.gps || roadSec?.startGps || getLatestFieldGps(project, 'roadMeasurement');
      rows.push({
        category: 'Road',
        fieldLabel: 'Road Chainage Range',
        rawInput: `${m.chainageStart} to ${m.chainageEnd}`,
        computedTotal: `${m.roadLen.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${items.roadMeasurement.unit}`,
        capturedGps: formatGpsShort(roadSec?.startGps || roadGps),
      });
      rows.push({
        category: 'Road',
        fieldLabel: 'Road Length',
        rawInput: `${m.roadLen} ${items.roadMeasurement.unit}`,
        computedTotal: `${m.roadLen.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${items.roadMeasurement.unit}`,
        capturedGps: formatGpsShort(roadGps),
      });
      rows.push({
        category: 'Road',
        fieldLabel: 'Road Breadth / Width & Multi-Samples',
        rawInput:
          m.roadWidthEntries.length > 0
            ? `Samples (${m.roadWidthEntries.length}): ${m.roadWidthEntries.join(', ')} ${m.lengthUnit}`
            : `Single entry: ${m.roadWidth} ${m.lengthUnit}`,
        computedTotal: `Avg: ${m.roadWidth} ${m.lengthUnit} | Area: ${m.roadArea.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${m.areaUnit}`,
        capturedGps: formatGpsShort(roadGps),
      });
      if (m.roadDepth > 0 || m.roadDepthEntries.length > 0) {
        rows.push({
          category: 'Road',
          fieldLabel: 'Road Depth / Thickness & Multi-Samples',
          rawInput:
            m.roadDepthEntries.length > 0
              ? `Samples (${m.roadDepthEntries.length}): ${m.roadDepthEntries.join(', ')} ${m.lengthUnit}`
              : `Single entry: ${m.roadDepth} ${m.lengthUnit}`,
          computedTotal: `Avg: ${m.roadDepth} ${m.lengthUnit} | Vol: ${m.roadVol.toFixed(2)} ${m.volumeUnit}`,
          capturedGps: formatGpsShort(roadSec?.endGps || roadGps),
        });
      }
    }
    if (items.sideDrain.enabled && m.sideDrainLen > 0) {
      const drainGps = getLatestFieldGps(project, 'sideDrain') || project.roadSections[0]?.gps;
      rows.push({
        category: 'Road',
        fieldLabel: 'Road Side Drain Length',
        rawInput: `${m.sideDrainLen} ${items.sideDrain.unit}`,
        computedTotal: `${m.sideDrainLen.toLocaleString()} ${items.sideDrain.unit}`,
        capturedGps: formatGpsShort(drainGps),
      });
    }
  }

  const enabledCustom = customItems.filter((c) => {
    if (!c.enabled || !(c.quantity > 0)) return false;
    if (scope === 'fencing') return c.category === 'fencing';
    if (scope === 'road') return c.category === 'road';
    return true;
  });

  enabledCustom.forEach((c) => {
    const customGps =
      c.gps ||
      getLatestFieldGps(project, `custom:${c.id}`) ||
      getLatestFieldGps(project, c.id);
    rows.push({
      category: `Custom (${c.category})`,
      fieldLabel: c.name,
      rawInput: `${c.quantity} ${c.unit}`,
      computedTotal: `${c.quantity} ${c.unit}`,
      capturedGps: formatGpsShort(customGps),
    });
  });

  if (scope === 'all' && project.auditNotes?.trim()) {
    const notesGps = getLatestFieldGps(project, 'auditNotes');
    rows.push({
      category: 'Field Notes',
      fieldLabel: 'Audit Notes',
      rawInput: project.auditNotes.trim(),
      computedTotal: `${project.auditNotes.trim().length} chars`,
      capturedGps: formatGpsShort(notesGps),
    });
  }

  return rows;
}

export function buildVectorGeospatialSvg(
  project: ConstructionProject,
  scope: StaticMapScope = 'all',
  liveGps?: GpsCoordinate
): string {
  const data = getProjectMapData(project, scope);
  const pts: Array<{ lat: number; lng: number; color: string; label: string; kind: string }> = [];

  if (data.sitePin) {
    pts.push({ lat: data.sitePin.lat, lng: data.sitePin.lng, color: '#e11d48', label: 'S', kind: 'site' });
  }
  if (data.roadStart) {
    pts.push({ lat: data.roadStart.lat, lng: data.roadStart.lng, color: '#059669', label: 'A', kind: 'roadStart' });
  }
  if (data.roadEnd) {
    pts.push({ lat: data.roadEnd.lat, lng: data.roadEnd.lng, color: '#059669', label: 'B', kind: 'roadEnd' });
  }
  data.gpsPosts.forEach((p, idx) => {
    pts.push({ lat: p.gps.lat, lng: p.gps.lng, color: '#d97706', label: `P${idx + 1}`, kind: 'post' });
  });
  data.inputLocations.forEach((l, idx) => {
    pts.push({ lat: l.gps.lat, lng: l.gps.lng, color: '#7c3aed', label: `I${idx + 1}`, kind: 'input' });
  });
  if (liveGps) {
    pts.push({ lat: liveGps.lat, lng: liveGps.lng, color: '#0284c7', label: 'GPS', kind: 'live' });
  }

  if (pts.length === 0) return '';

  const width = 640;
  const height = 280;
  const pad = 44;

  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs);
  let maxLng = Math.max(...lngs);

  const minSpan = 0.0008;
  if (maxLat - minLat < minSpan) {
    const mid = (minLat + maxLat) / 2;
    minLat = mid - minSpan / 2;
    maxLat = mid + minSpan / 2;
  }
  if (maxLng - minLng < minSpan) {
    const mid = (minLng + maxLng) / 2;
    minLng = mid - minSpan / 2;
    maxLng = mid + minSpan / 2;
  }

  const projectX = (lng: number) =>
    pad + ((lng - minLng) / (maxLng - minLng)) * (width - pad * 2);
  const projectY = (lat: number) =>
    height - pad - ((lat - minLat) / (maxLat - minLat)) * (height - pad * 2);

  const gridLines: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const gx = pad + ((width - pad * 2) * i) / 4;
    const gy = pad + ((height - pad * 2) * i) / 4;
    gridLines.push(
      `<line x1="${gx.toFixed(1)}" y1="${pad}" x2="${gx.toFixed(1)}" y2="${height - pad}" stroke="#e2e8f0" stroke-dasharray="3 3" />`,
      `<line x1="${pad}" y1="${gy.toFixed(1)}" x2="${width - pad}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-dasharray="3 3" />`
    );
  }

  const roadLine =
    data.roadStart && data.roadEnd
      ? `<line x1="${projectX(data.roadStart.lng).toFixed(1)}" y1="${projectY(data.roadStart.lat).toFixed(1)}" x2="${projectX(data.roadEnd.lng).toFixed(1)}" y2="${projectY(data.roadEnd.lat).toFixed(1)}" stroke="#059669" stroke-width="3.5" stroke-linecap="round" />`
      : '';

  const fenceLine =
    data.gpsPosts.length >= 2
      ? `<polyline fill="none" stroke="#d97706" stroke-width="2.5" stroke-linejoin="round" points="${data.gpsPosts
          .map((p) => `${projectX(p.gps.lng).toFixed(1)},${projectY(p.gps.lat).toFixed(1)}`)
          .join(' ')}" />`
      : '';

  const markersSvg = pts
    .map((pt) => {
      const x = projectX(pt.lng);
      const y = projectY(pt.lat);
      const r = pt.kind === 'post' ? 6 : 9;
      return `
        <g>
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${pt.color}" stroke="#ffffff" stroke-width="2" />
          <text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" font-size="${pt.kind === 'post' ? 7 : 8.5}" font-weight="700" fill="#ffffff" font-family="ui-monospace, monospace">${escapeHtml(pt.label)}</text>
        </g>
      `;
    })
    .join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" style="display:block;background:#f8fafc;border-radius:6px;">
      ${gridLines.join('')}
      <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" fill="none" stroke="#cbd5e1" stroke-width="1" />
      ${roadLine}
      ${fenceLine}
      ${markersSvg}
      <text x="${pad}" y="22" font-size="10" font-weight="700" fill="#334155" font-family="sans-serif">Geospatial Coordinate Plot (${pts.length} plotted points)</text>
      <text x="${width - pad}" y="22" text-anchor="end" font-size="9.5" fill="#64748b" font-family="ui-monospace, monospace">Lat ${minLat.toFixed(5)}..${maxLat.toFixed(5)} | Lng ${minLng.toFixed(5)}..${maxLng.toFixed(5)}</text>
      <text x="${pad}" y="${height - 14}" font-size="9" fill="#475569" font-family="sans-serif">S = Site Pin | A/B = Road Alignment | P# = Fence Posts | I# = Input Location Pins | GPS = Live Device</text>
    </svg>
  `;
}

const SHARED_PRINT_CSS = `
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #f1f5f9;
    margin: 0;
    padding: 24px 16px;
    font-size: 11.5px;
    line-height: 1.45;
  }
  .report-shell {
    max-width: 960px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 28px 32px;
    box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
  }
  .toolbar-actions {
    max-width: 960px;
    margin: 0 auto 14px auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: #0f172a;
    color: #ffffff;
    padding: 12px 18px;
    border-radius: 10px;
  }
  .toolbar-actions button {
    background: #f59e0b;
    color: #0f172a;
    border: none;
    border-radius: 7px;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }
  .toolbar-actions button.secondary {
    background: #334155;
    color: #ffffff;
  }
  .print-only { display: none; }
  @media print {
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    body {
      background: #ffffff;
      padding: 0;
    }
    .report-shell {
      max-width: none;
      border: none;
      border-radius: 0;
      padding: 0;
      box-shadow: none;
    }
  }
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    border-bottom: 2.5px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .doc-kicker {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 4px;
  }
  .doc-title {
    font-size: 21px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .doc-meta-right {
    text-align: right;
    font-size: 11px;
    color: #475569;
    white-space: nowrap;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 24px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 16px;
    break-inside: avoid;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    border-bottom: 1px solid #e2e8f0;
    padding: 4px 0;
  }
  .info-row:nth-last-child(-n+2) {
    border-bottom: none;
  }
  .info-label { color: #64748b; font-weight: 600; }
  .info-val { color: #0f172a; font-weight: 700; text-align: right; word-break: break-word; }
  h2 {
    font-size: 11.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #0f172a;
    margin: 22px 0 10px 0;
    padding: 0 0 5px 0;
    border-bottom: 1.5px solid #cbd5e1;
    break-after: avoid;
    page-break-after: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
    table-layout: auto;
  }
  thead { display: table-header-group; }
  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 6.5px 8px;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
  }
  th {
    background: #f1f5f9;
    font-size: 10px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td { font-size: 11px; color: #1e293b; }
  tbody tr:nth-child(even):not(.totals-row) {
    background: #f8fafc;
  }
  tr.totals-row td {
    background: #eef2ff;
    font-weight: 800;
    color: #0f172a;
    border-top: 2px solid #1e293b;
    padding: 8px 9px;
  }
  .totals-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .total-pill {
    display: inline-block;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 10.5px;
    font-weight: 700;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }
  .cat-tag {
    display: inline-block;
    padding: 1.5px 6px;
    border-radius: 4px;
    font-size: 9.5px;
    font-weight: 700;
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #e2e8f0;
    white-space: nowrap;
  }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
  .center { text-align: center; }
  .muted { color: #64748b; font-size: 10.5px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    background: #e2e8f0;
    color: #0f172a;
  }
  .remarks-box {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 3px solid #64748b;
    border-radius: 6px;
    padding: 9px 12px;
    margin-bottom: 14px;
    font-size: 11px;
    break-inside: avoid;
  }
  .totals-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 16px;
    break-inside: avoid;
  }
  .total-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-top: 3px solid #0f172a;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .total-card-label { font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .total-card-val { font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .sig-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 40px;
    margin-top: 28px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .sig-box {
    border-top: 1px solid #475569;
    padding-top: 6px;
    font-size: 10.5px;
    color: #334155;
    font-weight: 600;
  }
  .footer {
    margin-top: 20px;
    padding-top: 8px;
    border-top: 1px solid #cbd5e1;
    font-size: 9.5px;
    color: #64748b;
    display: flex;
    justify-content: space-between;
  }
  .map-section {
    margin: 14px 0 18px 0;
  }
  .map-frame {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    overflow: hidden;
    background: #f8fafc;
    margin-bottom: 10px;
    break-inside: avoid;
  }
  .print-map-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }
  .print-map-grid.two-col {
    grid-template-columns: 1fr 1fr;
  }
  .realtime-map-box {
    width: 100%;
    height: 340px;
    background: #e2e8f0;
  }
  .report-map-img {
    width: 100%;
    height: 230px;
    object-fit: cover;
    display: block;
  }
  .map-caption {
    padding: 6px 10px;
    font-size: 10px;
    color: #475569;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 720px) {
    .report-shell { padding: 16px; }
    .totals-cards { grid-template-columns: repeat(2, 1fr); }
    .info-grid { grid-template-columns: 1fr; }
    .print-map-grid.two-col { grid-template-columns: 1fr; }
  }
`;

function buildTotalsCardsHtml(project: ConstructionProject, scope: StaticMapScope): string {
  const m = computeMeasurements(project, scope);
  const mapData = getProjectMapData(project, scope);

  return `
    <div class="totals-cards">
      <div class="total-card">
        <div class="total-card-label">Total Posts</div>
        <div class="total-card-val">${m.totalPosts} ${escapeHtml(m.postUnit)}</div>
      </div>
      <div class="total-card">
        <div class="total-card-label">Total Linear Length</div>
        <div class="total-card-val">${m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${escapeHtml(m.lengthUnit)}</div>
      </div>
      <div class="total-card">
        <div class="total-card-label">Total Area / Volume</div>
        <div class="total-card-val">${m.totalAllAreas.toFixed(2)} ${escapeHtml(m.areaUnit)} &middot; ${m.totalAllVolumes.toFixed(2)} ${escapeHtml(m.volumeUnit)}</div>
      </div>
      <div class="total-card">
        <div class="total-card-label">Mapped GPS Points</div>
        <div class="total-card-val">${mapData.allPoints.length} pts</div>
      </div>
    </div>
  `;
}

function buildMapSectionHtml(
  project: ConstructionProject,
  scope: StaticMapScope,
  headingText: string,
  liveGps?: GpsCoordinate
): string {
  const staticMapUrl = buildSiteStaticMapUrl(project, {
    scope,
    mapType: 'hybrid',
    size: '640x360',
    scale: 2,
    liveGps,
  });
  const data = getProjectMapData(project, scope);
  const vectorSvg = buildVectorGeospatialSvg(project, scope, liveGps);
  const apiKey = getGoogleMapsApiKey();
  const totalPts = data.allPoints.length + (liveGps ? 1 : 0);

  const coordRows: string[] = [];
  if (data.sitePin) {
    coordRows.push(
      `<tr><td><strong>Site Anchor Pin (S)</strong></td><td class="mono">${data.sitePin.lat.toFixed(6)}&deg;, ${data.sitePin.lng.toFixed(6)}&deg;</td><td class="muted">${escapeHtml(project.location || 'Pinned Site Location')}</td></tr>`
    );
  }
  if (liveGps) {
    coordRows.push(
      `<tr><td><strong>Live Surveyor GPS (G)</strong></td><td class="mono">${liveGps.lat.toFixed(6)}&deg;, ${liveGps.lng.toFixed(6)}&deg;</td><td class="muted">Real-time device position${liveGps.accuracy ? ` (&plusmn;${Math.round(liveGps.accuracy)}m)` : ''}</td></tr>`
    );
  }
  if (scope !== 'fencing' && (data.roadStart || data.roadEnd)) {
    const roadSec = project.roadSections[0];
    if (data.roadStart) {
      coordRows.push(
        `<tr><td><strong>Road Start (A)</strong></td><td class="mono">${data.roadStart.lat.toFixed(6)}&deg;, ${data.roadStart.lng.toFixed(6)}&deg;</td><td class="muted">Chainage ${escapeHtml(roadSec?.chainageStart || '0+000')}</td></tr>`
      );
    }
    if (data.roadEnd) {
      coordRows.push(
        `<tr><td><strong>Road End (B)</strong></td><td class="mono">${data.roadEnd.lat.toFixed(6)}&deg;, ${data.roadEnd.lng.toFixed(6)}&deg;</td><td class="muted">Chainage ${escapeHtml(roadSec?.chainageEnd || formatChainage(roadSec?.lengthMeters || 0))}</td></tr>`
      );
    }
  }
  if (scope !== 'road' && data.gpsPosts.length > 0) {
    const first = data.gpsPosts[0];
    const last = data.gpsPosts[data.gpsPosts.length - 1];
    const spanText =
      data.gpsPosts.length === 1
        ? `${first.gps.lat.toFixed(6)}&deg;, ${first.gps.lng.toFixed(6)}&deg;`
        : `${first.gps.lat.toFixed(6)}&deg;, ${first.gps.lng.toFixed(6)}&deg; to ${last.gps.lat.toFixed(6)}&deg;, ${last.gps.lng.toFixed(6)}&deg;`;
    coordRows.push(
      `<tr><td><strong>GPS-Tagged Fence Posts</strong></td><td class="mono">${spanText}</td><td class="muted">${data.gpsPosts.length} of ${project.fencePosts.length} posts mapped</td></tr>`
    );
  }
  data.inputLocations.forEach((loc: InputLocationPoint, idx: number) => {
    coordRows.push(
      `<tr><td><strong>Input Pin #${idx + 1}:</strong> ${escapeHtml(loc.fieldLabel)}</td><td class="mono">${loc.gps.lat.toFixed(6)}&deg;, ${loc.gps.lng.toFixed(6)}&deg;</td><td class="muted">${escapeHtml(loc.valueSummary || 'Captured on input')} &bull; ${escapeHtml(new Date(loc.capturedAt).toLocaleTimeString())}</td></tr>`
    );
  });

  const mapPayload = JSON.stringify({
    sitePin: data.sitePin ?? null,
    roadStart: data.roadStart ?? null,
    roadEnd: data.roadEnd ?? null,
    gpsPosts: data.gpsPosts.map((p, i) => ({
      label: `P${i + 1}`,
      title: `${p.postType.replace('_', ' ')} #${i + 1}`,
      lat: p.gps.lat,
      lng: p.gps.lng,
    })),
    inputLocations: data.inputLocations.map((l, i) => ({
      label: `I${i + 1}`,
      title: `${l.fieldLabel}${l.valueSummary ? ` (${l.valueSummary})` : ''}`,
      lat: l.gps.lat,
      lng: l.gps.lng,
    })),
    liveGps: liveGps ?? null,
  }).replace(/</g, '\\u003c');

  const bothPrintVisuals = Boolean(staticMapUrl && vectorSvg);
  const staticAndVectorBlock = (staticMapUrl || vectorSvg) ? `
    <div class="print-map-grid ${bothPrintVisuals ? 'two-col' : ''}">
      ${staticMapUrl ? `
        <div class="map-frame" style="margin-bottom:0;">
          <img
            src="${escapeHtml(staticMapUrl)}"
            alt="Site location satellite map for ${escapeHtml(project.name)}"
            class="report-map-img"
            onerror="this.parentElement.style.display='none'"
          />
          <div class="map-caption">
            <span><strong>Satellite Map</strong> (S=Site, A/B=Road, I=Inputs, G=GPS)</span>
            <span class="mono">${totalPts} pt${totalPts === 1 ? '' : 's'}</span>
          </div>
        </div>
      ` : ''}
      ${vectorSvg ? `
        <div class="map-frame" style="margin-bottom:0;">
          ${vectorSvg}
        </div>
      ` : ''}
    </div>
  ` : '';

  return `
    <div class="map-section">
      <h2>${escapeHtml(headingText)}</h2>
      ${apiKey ? `
        <div class="map-frame no-print">
          <div id="realtime-report-map" class="realtime-map-box"></div>
          <div class="map-caption">
            <span><strong>Real-Time Interactive Map:</strong> Live GPS + Input Pins + Road &amp; Fence Polylines</span>
            <span id="realtime-gps-status" class="mono">Syncing GPS...</span>
          </div>
        </div>
        <div class="print-only">
          ${staticAndVectorBlock}
        </div>
      ` : staticAndVectorBlock}
      ${coordRows.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th style="width:210px;">Geospatial Reference</th>
              <th style="width:205px;">WGS84 Coordinates (Lat, Lng)</th>
              <th>Notes / Chainage / Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${coordRows.join('')}
          </tbody>
        </table>
      ` : `
        <div class="remarks-box muted">
          No GPS coordinates captured yet. Click any measurement input with GPS enabled or pin a location on the map to record geospatial coordinates.
        </div>
      `}
      <script id="report-map-data" type="application/json">${mapPayload}</script>
    </div>
  `;
}

function buildRealtimeMapScript(apiKey: string): string {
  if (!apiKey) return '';
  return `
    <script>
      (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=\`https://maps.\${c}apis.com/maps/api/js?\`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
        key: ${JSON.stringify(apiKey)},
        v: "weekly"
      });

      (async function initRealtimeReportMap() {
        var container = document.getElementById('realtime-report-map');
        var dataEl = document.getElementById('report-map-data');
        var statusEl = document.getElementById('realtime-gps-status');
        if (!container || !dataEl) return;
        try {
          var payload = JSON.parse(dataEl.textContent || '{}');
          var mapsLib = await google.maps.importLibrary('maps');
          var markerLib = await google.maps.importLibrary('marker');
          var coreLib = await google.maps.importLibrary('core');

          var fallbackCenter = payload.sitePin || payload.liveGps || payload.roadStart || (payload.inputLocations && payload.inputLocations[0]) || (payload.gpsPosts && payload.gpsPosts[0]) || { lat: 20, lng: 0 };
          var map = new mapsLib.Map(container, {
            center: { lat: fallbackCenter.lat, lng: fallbackCenter.lng },
            zoom: fallbackCenter.lat === 20 && fallbackCenter.lng === 0 ? 2 : 17,
            mapTypeId: 'hybrid',
            mapId: 'DEMO_MAP_ID',
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio']
          });

          var bounds = new coreLib.LatLngBounds();
          var count = 0;

          function addPin(lat, lng, title, bg, border, glyph) {
            var pin = new markerLib.PinElement({
              background: bg,
              borderColor: border,
              glyphColor: '#ffffff',
              glyphText: glyph
            });
            new markerLib.AdvancedMarkerElement({
              map: map,
              position: { lat: lat, lng: lng },
              title: title,
              content: pin.element
            });
            bounds.extend({ lat: lat, lng: lng });
            count++;
          }

          if (payload.sitePin) addPin(payload.sitePin.lat, payload.sitePin.lng, 'Site Anchor (S)', '#e11d48', '#9f1239', 'S');
          if (payload.roadStart) addPin(payload.roadStart.lat, payload.roadStart.lng, 'Road Start (A)', '#059669', '#065f46', 'A');
          if (payload.roadEnd) addPin(payload.roadEnd.lat, payload.roadEnd.lng, 'Road End (B)', '#059669', '#065f46', 'B');
          if (payload.roadStart && payload.roadEnd) {
            new mapsLib.Polyline({
              map: map,
              path: [{ lat: payload.roadStart.lat, lng: payload.roadStart.lng }, { lat: payload.roadEnd.lat, lng: payload.roadEnd.lng }],
              strokeColor: '#059669',
              strokeWeight: 4,
              geodesic: true
            });
          }
          if (payload.gpsPosts && payload.gpsPosts.length > 0) {
            payload.gpsPosts.forEach(function(p) { addPin(p.lat, p.lng, p.title, '#d97706', '#b45309', p.label); });
            if (payload.gpsPosts.length >= 2) {
              new mapsLib.Polyline({
                map: map,
                path: payload.gpsPosts.map(function(p) { return { lat: p.lat, lng: p.lng }; }),
                strokeColor: '#d97706',
                strokeWeight: 3,
                geodesic: true
              });
            }
          }
          if (payload.inputLocations && payload.inputLocations.length > 0) {
            payload.inputLocations.forEach(function(l) { addPin(l.lat, l.lng, l.title, '#7c3aed', '#5b21b6', l.label); });
          }

          if (count > 1) {
            map.fitBounds(bounds, 40);
          }

          var liveMarker = null;
          function updateLivePos(lat, lng) {
            var pos = { lat: lat, lng: lng };
            if (!liveMarker) {
              var dot = document.createElement('div');
              dot.style.width = '14px';
              dot.style.height = '14px';
              dot.style.borderRadius = '9999px';
              dot.style.background = '#0ea5e9';
              dot.style.border = '2px solid #ffffff';
              dot.style.boxShadow = '0 1px 4px rgba(0,0,0,0.4)';
              liveMarker = new markerLib.AdvancedMarkerElement({
                map: map,
                position: pos,
                title: 'Live Device GPS',
                content: dot
              });
              if (count === 0) {
                map.setCenter(pos);
                map.setZoom(17);
              }
            } else {
              liveMarker.position = pos;
            }
            if (statusEl) statusEl.textContent = 'Live GPS: ' + lat.toFixed(6) + ', ' + lng.toFixed(6);
          }

          if (payload.liveGps) {
            updateLivePos(payload.liveGps.lat, payload.liveGps.lng);
          }

          if (navigator.geolocation) {
            navigator.geolocation.watchPosition(
              function(pos) { updateLivePos(pos.coords.latitude, pos.coords.longitude); },
              function() { if (statusEl && !payload.liveGps) statusEl.textContent = 'Live GPS unavailable'; },
              { enableHighAccuracy: true, maximumAge: 5000 }
            );
          }
        } catch (err) {
          if (statusEl) statusEl.textContent = 'Map preview offline';
        }
      })();
    </script>
  `;
}

export function buildStandaloneReportHtml(
  project: ConstructionProject,
  scope: StaticMapScope = 'all',
  liveGps?: GpsCoordinate
): string {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const m = computeMeasurements(project, scope);
  const apiKey = getGoogleMapsApiKey();

  const measuredRows = buildMeasuredSummaryRows(project, scope);
  const measurementRows = measuredRows.map(
    (row, i) =>
      `<tr><td class="center">${i + 1}</td><td><strong>${escapeHtml(row.item)}</strong><div class="muted">${escapeHtml(row.category)}</div></td><td>${escapeHtml(row.details)}</td><td class="num">${escapeHtml(row.quantity)}</td><td class="center">${escapeHtml(row.unit)}</td><td class="mono muted">${escapeHtml(row.capturedGps)}</td></tr>`
  );

  const enabledCustom = customItems.filter((c) => {
    if (!c.enabled || !(c.quantity > 0)) return false;
    if (scope === 'fencing') return c.category === 'fencing';
    if (scope === 'road') return c.category === 'road';
    return true;
  });

  const totalBadges = [
    scope !== 'road' && m.totalPosts > 0 ? `<span class="total-pill">Posts: ${m.totalPosts} ${escapeHtml(m.postUnit)}</span>` : '',
    m.totalAllLengths > 0 ? `<span class="total-pill">Linear: ${m.totalAllLengths.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${escapeHtml(m.lengthUnit)}</span>` : '',
    m.totalAllAreas > 0 ? `<span class="total-pill">Area: ${m.totalAllAreas.toFixed(2)} ${escapeHtml(m.areaUnit)}</span>` : '',
    m.totalAllVolumes > 0 ? `<span class="total-pill">Volume: ${m.totalAllVolumes.toFixed(2)} ${escapeHtml(m.volumeUnit)}</span>` : '',
    enabledCustom.length > 0 ? `<span class="total-pill">Custom: ${m.totalCustomQty}</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  const auditRows: string[] = [];
  if (scope === 'all' && project.auditInfo) {
    const a = project.auditInfo;
    const anyPosts = items.anglePosts.enabled || items.intermediatePosts.enabled || items.strutPosts.enabled || items.gatePosts.enabled;
    if (anyPosts && (m.totalPosts > 0 || (a.verifiedPostCount ?? 0) > 0)) {
      const vp = a.verifiedPostCount ?? m.totalPosts;
      const diff = cleanVariance(vp, m.totalPosts, 0);
      auditRows.push(`<tr><td>Fence Posts Total</td><td class="num">${m.totalPosts} ${escapeHtml(m.postUnit)}</td><td class="num">${vp} ${escapeHtml(m.postUnit)}</td><td class="num">${escapeHtml(formatVariance(diff, 0))} ${escapeHtml(m.postUnit)}</td></tr>`);
    }
    const meshUnitIsArea = isAreaUnit(items.chainLinkMesh.unit);
    const loggedMesh = roundTo(meshUnitIsArea ? m.meshArea : m.meshLen, 2);
    if (items.chainLinkMesh.enabled && (loggedMesh > 0 || (a.verifiedMeshLength ?? 0) > 0)) {
      const vm = a.verifiedMeshLength ?? loggedMesh;
      const diff = cleanVariance(vm, loggedMesh, 2);
      const meshLabel = meshUnitIsArea ? 'Chain-Link Mesh Area' : 'Chain-Link Mesh Length';
      auditRows.push(`<tr><td>${meshLabel}</td><td class="num">${loggedMesh} ${escapeHtml(items.chainLinkMesh.unit)}</td><td class="num">${vm} ${escapeHtml(items.chainLinkMesh.unit)}</td><td class="num">${escapeHtml(formatVariance(diff, 2))} ${escapeHtml(items.chainLinkMesh.unit)}</td></tr>`);
    }
    const rrmUnitIsLength = isLengthUnit(items.rrmWall.unit);
    const loggedRrm = roundTo(rrmUnitIsLength ? m.rrmLen : m.rrmVol, 2);
    if (items.rrmWall.enabled && (loggedRrm > 0 || (a.verifiedRrmVolume ?? 0) > 0)) {
      const vr = a.verifiedRrmVolume ?? loggedRrm;
      const diff = cleanVariance(vr, loggedRrm, 2);
      const rrmLabel = rrmUnitIsLength ? 'RMM Wall Length' : 'RMM Wall Volume';
      auditRows.push(`<tr><td>${rrmLabel}</td><td class="num">${loggedRrm.toFixed(2)} ${escapeHtml(items.rrmWall.unit)}</td><td class="num">${vr.toFixed(2)} ${escapeHtml(items.rrmWall.unit)}</td><td class="num">${escapeHtml(formatVariance(diff, 2))} ${escapeHtml(items.rrmWall.unit)}</td></tr>`);
    }
    if (items.roadMeasurement.enabled && (m.roadLen > 0 || (a.verifiedRoadLength ?? 0) > 0)) {
      const vrd = a.verifiedRoadLength ?? m.roadLen;
      const diff = cleanVariance(vrd, m.roadLen, 2);
      auditRows.push(`<tr><td>Road Length</td><td class="num">${m.roadLen} ${escapeHtml(items.roadMeasurement.unit)}</td><td class="num">${vrd} ${escapeHtml(items.roadMeasurement.unit)}</td><td class="num">${escapeHtml(formatVariance(diff, 2))} ${escapeHtml(items.roadMeasurement.unit)}</td></tr>`);
    }
    if (items.sideDrain.enabled && (m.sideDrainLen > 0 || (a.verifiedSideDrainLength ?? 0) > 0)) {
      const vsd = a.verifiedSideDrainLength ?? m.sideDrainLen;
      const diff = cleanVariance(vsd, m.sideDrainLen, 2);
      auditRows.push(`<tr><td>Road Side Drain</td><td class="num">${m.sideDrainLen} ${escapeHtml(items.sideDrain.unit)}</td><td class="num">${vsd} ${escapeHtml(items.sideDrain.unit)}</td><td class="num">${escapeHtml(formatVariance(diff, 2))} ${escapeHtml(items.sideDrain.unit)}</td></tr>`);
    }
    enabledCustom.forEach((c) => {
      const vc = a.verifiedCustomItems?.[c.id] ?? c.quantity;
      if (c.quantity > 0 || vc > 0) {
        const diff = cleanVariance(vc, c.quantity, 2);
        auditRows.push(`<tr><td>${escapeHtml(c.name)}</td><td class="num">${c.quantity} ${escapeHtml(c.unit)}</td><td class="num">${vc} ${escapeHtml(c.unit)}</td><td class="num">${escapeHtml(formatVariance(diff, 2))} ${escapeHtml(c.unit)}</td></tr>`);
      }
    });
  }

  const scopeTitle =
    scope === 'fencing'
      ? 'Chain-Link & RMM Fencing Report'
      : scope === 'road'
      ? 'Road Works Measurement Report'
      : 'Site Measurement & Technical Audit Report';

  const entityComparisons = computeEntityAuditComparisons(project, scope).filter(
    (row) =>
      row.item.nos !== undefined ||
      row.item.length !== undefined ||
      row.item.width !== undefined ||
      row.item.thickness !== undefined ||
      row.item.auditNos !== undefined ||
      row.item.auditLength !== undefined ||
      row.item.auditWidth !== undefined ||
      row.item.auditThickness !== undefined ||
      row.item.verifiedOverride !== undefined ||
      (row.item.rate !== undefined && row.item.rate > 0) ||
      row.entityQty > 0
  );

  let nextSectionNum = 1;
  const summarySecNum = nextSectionNum++;
  const entitySecNum = entityComparisons.length > 0 ? nextSectionNum++ : 0;
  const auditSecNum = scope === 'all' && project.auditInfo && (auditRows.length > 0 || project.auditInfo.generalRemarks || project.auditInfo.auditorName) ? nextSectionNum++ : 0;
  const mapSecNum = nextSectionNum++;

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

  const entityRowsHtml = entityComparisons
    .map((row, idx) => {
      const unit = row.auditUnit || row.item.unit;
      const diffInfo = formatDiffLabel(row.status, row.variance, unit, row.amountVariance);
      const varText =
        row.variance === null
          ? 'Pending'
          : `${diffInfo.qtyText}${row.variancePct !== null && row.variance !== 0 ? ` (${row.variancePct > 0 ? `+${row.variancePct}` : row.variancePct}%)` : ''}`;

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

      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td><strong>${escapeHtml(row.item.itemName || row.auditLabel)}</strong>${row.item.remarks ? `<div class="muted">${escapeHtml(row.item.remarks)}</div>` : ''}</td>
          <td class="num mono">${escapeHtml(rateText)}</td>
          <td class="num">${row.item.nos ?? '—'}</td>
          <td class="num">${row.item.length ?? '—'}</td>
          <td class="num">${row.item.width ?? '—'}</td>
          <td class="num">${row.item.thickness ?? '—'}</td>
          <td class="num" style="font-weight:800;">${row.entityQty} <span class="muted">${escapeHtml(unit)}</span></td>
          <td class="num mono" style="font-weight:700;">${escapeHtml(entityAmtText)}</td>
          <td class="num" style="background:#faf5ff;">${row.auditDims.nos ?? '—'}</td>
          <td class="num" style="background:#faf5ff;">${row.auditDims.length ?? '—'}</td>
          <td class="num" style="background:#faf5ff;">${row.auditDims.width ?? '—'}</td>
          <td class="num" style="background:#faf5ff;">${row.auditDims.thickness ?? '—'}</td>
          <td class="num" style="font-weight:800;color:#3730a3;background:#eef2ff;">${row.auditQty !== null ? `${row.auditQty}` : 'Pending'} <span class="muted">${escapeHtml(unit)}</span></td>
          <td class="num mono" style="font-weight:700;color:#3730a3;background:#ede9fe;">${escapeHtml(auditAmtText)}</td>
          <td class="num" style="color:${diffInfo.hexColor};font-weight:800;">${escapeHtml(varText)}</td>
          <td class="num mono" style="color:${diffInfo.hexColor};font-weight:800;">${escapeHtml(diffInfo.costText)}</td>
          <td style="color:${diffInfo.hexColor};font-weight:700;">${escapeHtml(diffInfo.badgeLabel)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(scopeTitle)} - ${escapeHtml(project.name)}</title>
        <style>${SHARED_PRINT_CSS}</style>
      </head>
      <body>
        <div class="toolbar-actions no-print">
          <div>
            <strong>${escapeHtml(project.name)}</strong> &mdash; Interactive &amp; Printable Site Report
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" onclick="window.print()">Print / Save PDF</button>
          </div>
        </div>

        <div class="report-shell">
          <div class="doc-header">
            <div>
              <div class="doc-kicker">${escapeHtml(scopeTitle)}</div>
              <h1 class="doc-title">${escapeHtml(project.name)}</h1>
            </div>
            <div class="doc-meta-right">
              <div><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</div>
              <div><strong>Unit System:</strong> ${escapeHtml(settings.unitSystem.toUpperCase())}</div>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-row"><span class="info-label">Client</span><span class="info-val">${escapeHtml(project.clientName || 'N/A')}</span></div>
            <div class="info-row"><span class="info-label">Location</span><span class="info-val">${escapeHtml(project.location || 'N/A')}</span></div>
            <div class="info-row"><span class="info-label">Auditor</span><span class="info-val">${escapeHtml(project.auditInfo?.auditorName || 'Pending Assignment')}</span></div>
            <div class="info-row"><span class="info-label">Audit Status</span><span class="info-val"><span class="badge">${escapeHtml(formatAuditStatus(project.auditInfo?.auditStatus))}</span></span></div>
            ${project.entityName ? `<div class="info-row"><span class="info-label">Executing Entity</span><span class="info-val">${escapeHtml(project.entityName)}</span></div>` : ''}
          </div>

          ${buildTotalsCardsHtml(project, scope)}

          <h2>${summarySecNum}. Physical Measurement Summary (${measurementRows.length} Recorded Item${measurementRows.length === 1 ? '' : 's'})</h2>
          <table>
            <thead>
              <tr>
                <th class="center" style="width:30px;">#</th>
                <th style="width:155px;">Work Item</th>
                <th>Inputs / Dimensions / Multi-Samples</th>
                <th class="num" style="width:82px;">Quantity</th>
                <th class="center" style="width:52px;">Unit</th>
                <th style="width:135px;">Captured GPS</th>
              </tr>
            </thead>
            <tbody>
              ${measurementRows.length > 0 ? measurementRows.join('') : '<tr><td colspan="6" class="center muted">No measurement items with inputted data yet.</td></tr>'}
              ${totalBadges ? `
                <tr class="totals-row">
                  <td class="center">&Sigma;</td>
                  <td>GRAND TOTALS</td>
                  <td colspan="4">
                    <div class="totals-pills">${totalBadges}</div>
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          ${project.auditNotes?.trim() ? `
            <div class="remarks-box">
              <strong>Site Audit Notes:</strong>
              ${escapeHtml(project.auditNotes.trim())}
            </div>
          ` : ''}

          ${entityComparisons.length > 0 ? `
            <h2>${entitySecNum}. Entity Measurements vs. Audit Verification &amp; Variances${project.entityName ? ` (${escapeHtml(project.entityName)})` : ''}</h2>
            <table>
              <thead>
                <tr>
                  <th class="center" rowspan="2" style="width:24px;">#</th>
                  <th rowspan="2" style="min-width:125px;">Work Item</th>
                  <th class="num" rowspan="2" style="width:54px;">Rate / Unit</th>
                  <th class="center" colspan="6" style="background:#f1f5f9;border-bottom:1px solid #cbd5e1;">Entity Claimed Measurement (MB)</th>
                  <th class="center" colspan="6" style="background:#eef2ff;color:#3730a3;border-bottom:1px solid #cbd5e1;">Audit Field Verified Measurement</th>
                  <th class="num" rowspan="2" style="width:88px;">Qty Variance</th>
                  <th class="num" rowspan="2" style="width:88px;">Cost Variance</th>
                  <th rowspan="2" style="width:95px;">Status</th>
                </tr>
                <tr>
                  <th class="num" style="width:32px;">Nos</th>
                  <th class="num" style="width:36px;">L</th>
                  <th class="num" style="width:36px;">W</th>
                  <th class="num" style="width:36px;">T</th>
                  <th class="num" style="width:56px;font-weight:800;background:#f8fafc;">Qty</th>
                  <th class="num" style="width:64px;font-weight:800;background:#f1f5f9;">Amount</th>
                  <th class="num" style="width:32px;background:#f5f3ff;">Nos</th>
                  <th class="num" style="width:36px;background:#f5f3ff;">L</th>
                  <th class="num" style="width:36px;background:#f5f3ff;">W</th>
                  <th class="num" style="width:36px;background:#f5f3ff;">T</th>
                  <th class="num" style="width:56px;font-weight:800;background:#e0e7ff;color:#3730a3;">Qty</th>
                  <th class="num" style="width:64px;font-weight:800;background:#ede9fe;color:#3730a3;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${entityRowsHtml}
                ${hasAnyRates ? `
                  <tr class="totals-row">
                    <td class="center">&Sigma;</td>
                    <td colspan="6">TOTAL FINANCIAL OUTCOME (EXCESS / UNDERPAYMENT)</td>
                    <td class="num mono" style="font-weight:800;">${totalEntityAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td colspan="5"></td>
                    <td class="num mono" style="font-weight:800;color:#3730a3;">${totalAuditAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td>
                    <td class="num mono" style="font-weight:800;color:${netOutcome === 'excess' ? '#dc2626' : netOutcome === 'underpayment' ? '#2563eb' : '#047857'};">${
                      netOutcome === 'excess'
                        ? `${netDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Excess`
                        : netOutcome === 'underpayment'
                        ? `${netDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Underpayment`
                        : '0.00 Matched'
                    }</td>
                    <td style="font-weight:800;color:${netOutcome === 'excess' ? '#dc2626' : netOutcome === 'underpayment' ? '#2563eb' : '#047857'};">${
                      netOutcome === 'excess' ? 'Excess' : netOutcome === 'underpayment' ? 'Underpayment' : 'Matched'
                    }</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          ` : ''}

          ${auditSecNum > 0 && project.auditInfo ? `
            <h2>${auditSecNum}. Auditor Verification &amp; Reconciliation</h2>
            ${auditRows.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th class="num" style="width:110px;">Logged</th>
                    <th class="num" style="width:110px;">Verified</th>
                    <th class="num" style="width:110px;">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  ${auditRows.join('')}
                </tbody>
              </table>
            ` : ''}
            <div class="remarks-box">
              <strong>Auditor Remarks (${escapeHtml(project.auditInfo.auditDate)}):</strong>
              ${escapeHtml(project.auditInfo.generalRemarks || 'No remarks recorded.')}
            </div>
          ` : ''}

          ${buildMapSectionHtml(project, scope, `${mapSecNum}. Site Location & Real-Time Geospatial Map`, liveGps)}

          <div class="sig-grid">
            <div class="sig-box">Prepared By (Site Engineer / Surveyor)</div>
            <div class="sig-box">Verified By (${escapeHtml(project.auditInfo?.auditorName || 'Technical Auditor')})</div>
          </div>

          <div class="footer">
            <span>SitePro Measurement &amp; Audit Record</span>
            <span>Generated ${escapeHtml(new Date().toLocaleString())}</span>
          </div>
        </div>

        ${buildRealtimeMapScript(apiKey)}
      </body>
    </html>
  `;
}

export function downloadStandaloneHtmlReport(
  project: ConstructionProject,
  scope: StaticMapScope = 'all',
  liveGps?: GpsCoordinate
) {
  const html = buildStandaloneReportHtml(project, scope, liveGps);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = scope === 'all' ? 'full_report' : `${scope}_report`;
  link.setAttribute('href', url);
  link.setAttribute('download', `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${suffix}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function printHtmlViaHiddenFrame(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }
  };

  const imgs = Array.from(doc.images || []);
  if (imgs.length === 0) {
    window.setTimeout(triggerPrint, 250);
    return;
  }

  let remaining = imgs.length;
  const onAssetSettled = () => {
    remaining -= 1;
    if (remaining <= 0) {
      window.setTimeout(triggerPrint, 180);
    }
  };

  imgs.forEach((img) => {
    if (img.complete) {
      onAssetSettled();
    } else {
      img.addEventListener('load', onAssetSettled, { once: true });
      img.addEventListener('error', onAssetSettled, { once: true });
    }
  });

  // Safety fallback in case static map network request stalls
  window.setTimeout(triggerPrint, 3500);
}

export function exportChainLinkPdf(project: ConstructionProject, liveGps?: GpsCoordinate) {
  printHtmlViaHiddenFrame(buildStandaloneReportHtml(project, 'fencing', liveGps));
}

export function exportRoadPdf(project: ConstructionProject, liveGps?: GpsCoordinate) {
  printHtmlViaHiddenFrame(buildStandaloneReportHtml(project, 'road', liveGps));
}

export function exportProjectToPdf(project: ConstructionProject, liveGps?: GpsCoordinate) {
  printHtmlViaHiddenFrame(buildStandaloneReportHtml(project, 'all', liveGps));
}

export function exportProjectToExcel(
  project: ConstructionProject,
  scope: StaticMapScope = 'all'
) {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustom = customItems.filter((c) => {
    if (!c.enabled) return false;
    if (scope === 'fencing') return c.category === 'fencing';
    if (scope === 'road') return c.category === 'road';
    return true;
  });
  const m = computeMeasurements(project, scope);
  const mapData = getProjectMapData(project, scope);

  const scopeLabel =
    scope === 'fencing'
      ? 'Chain-Link & RMM Fencing'
      : scope === 'road'
      ? 'Road Works'
      : 'Full Site Audit';

  const rows: string[] = [];
  rows.push(`SITE MEASUREMENT & TECHNICAL AUDIT REPORT`);
  rows.push(`Report Scope,${csvCell(scopeLabel)}`);
  rows.push(`Project Name,${csvCell(project.name)}`);
  rows.push(`Client,${csvCell(project.clientName || 'N/A')}`);
  rows.push(`Location,${csvCell(project.location || 'N/A')}`);
  if (project.entityName) {
    rows.push(`Executing Entity,${csvCell(project.entityName)}`);
  }
  rows.push(`Auditor,${csvCell(project.auditInfo?.auditorName || 'Pending Assignment')}`);
  rows.push(`Audit Status,${csvCell(formatAuditStatus(project.auditInfo?.auditStatus))}`);
  if (project.siteCoordinates) {
    rows.push(
      `Site Anchor Coordinates,${csvCell(`${project.siteCoordinates.lat.toFixed(6)}, ${project.siteCoordinates.lng.toFixed(6)}`)}`
    );
  }
  const roadSec0 = project.roadSections[0];
  if (scope !== 'fencing' && roadSec0?.startGps) {
    rows.push(
      `Road Start GPS (A),${csvCell(`${roadSec0.startGps.lat.toFixed(6)}, ${roadSec0.startGps.lng.toFixed(6)}`)}`
    );
  }
  if (scope !== 'fencing' && roadSec0?.endGps) {
    rows.push(
      `Road End GPS (B),${csvCell(`${roadSec0.endGps.lat.toFixed(6)}, ${roadSec0.endGps.lng.toFixed(6)}`)}`
    );
  }
  rows.push(`Unit System,${csvCell(settings.unitSystem.toUpperCase())}`);
  rows.push(`Exported On,${csvCell(new Date().toLocaleString())}`);
  if (project.auditNotes?.trim()) {
    rows.push(`Audit Notes,${csvCell(project.auditNotes.trim())}`);
  }
  rows.push('');

  const measuredRows = buildMeasuredSummaryRows(project, scope);
  rows.push(`1. PHYSICAL MEASUREMENT SUMMARY & TOTALS`);
  rows.push(`#,Category,Work Item,Dimensions / Samples / Specification,Quantity,Unit,Captured GPS`);

  if (measuredRows.length === 0) {
    rows.push(`-,None,No measurement items with inputted data yet,-,-,-,-`);
  } else {
    measuredRows.forEach((mr, i) => {
      rows.push(
        `${i + 1},${csvCell(mr.category)},${csvCell(mr.item)},${csvCell(mr.details)},${csvCell(mr.quantity)},${csvCell(mr.unit)},${csvCell(mr.capturedGps)}`
      );
    });
  }

  if (scope !== 'road' && m.totalPosts > 0) {
    rows.push(`TOTAL,Fencing,Total Fence Posts,All enabled post types,${m.totalPosts},${csvCell(m.postUnit)},`);
  }
  if (m.totalAllLengths > 0) {
    rows.push(`TOTAL,Linear,Total Linear Length,Mesh + RMM + Road + Drain,${m.totalAllLengths.toFixed(2)},${csvCell(m.lengthUnit)},`);
  }
  if (m.totalAllAreas > 0) {
    rows.push(`TOTAL,Area,Total Surface Area,Mesh + Road surface,${m.totalAllAreas.toFixed(2)},${csvCell(m.areaUnit)},`);
  }
  if (m.totalAllVolumes > 0) {
    rows.push(`TOTAL,Volume,Total Volume,RMM Masonry + Road Earthwork,${m.totalAllVolumes.toFixed(2)},${csvCell(m.volumeUnit)},`);
  }
  if (enabledCustom.some((c) => c.quantity > 0)) {
    rows.push(`TOTAL,Custom,Total Custom Quantities,Sum of active custom items,${m.totalCustomQty},items,`);
  }
  rows.push(`TOTAL,Geospatial,Total Mapped GPS Points,Site + Road + Posts + Input Pins,${mapData.allPoints.length},points,`);

  if (scope !== 'road' && project.fencePosts.length > 0) {
    rows.push('');
    rows.push(`INDIVIDUAL FENCE POST ENTRIES`);
    rows.push(`#,Post Type,Height (${m.lengthUnit}),Latitude,Longitude,Accuracy (m),Timestamp`);
    project.fencePosts.forEach((p, i) => {
      rows.push(
        `${i + 1},${csvCell(p.postType)},${p.heightMeters},${p.gps ? p.gps.lat.toFixed(6) : ''},${p.gps ? p.gps.lng.toFixed(6) : ''},${p.gps?.accuracy ? Math.round(p.gps.accuracy) : ''},${csvCell(new Date(p.createdAt).toLocaleString())}`
      );
    });
  }

  if (mapData.inputLocations.length > 0) {
    rows.push('');
    rows.push(`CAPTURED INPUT LOCATION PINS (MAP LOG)`);
    rows.push(`#,Input Field,Recorded Value,Latitude,Longitude,Accuracy (m),Timestamp`);
    mapData.inputLocations.forEach((loc, i) => {
      rows.push(
        `${i + 1},${csvCell(loc.fieldLabel)},${csvCell(loc.valueSummary || '')},${loc.gps.lat.toFixed(6)},${loc.gps.lng.toFixed(6)},${loc.gps.accuracy ? Math.round(loc.gps.accuracy) : ''},${csvCell(new Date(loc.capturedAt).toLocaleString())}`
      );
    });
  }

  if (scope === 'all' && project.auditInfo) {
    const a = project.auditInfo;
    const csvAuditRows: string[] = [];
    const anyPosts = items.anglePosts.enabled || items.intermediatePosts.enabled || items.strutPosts.enabled || items.gatePosts.enabled;
    if (anyPosts && (m.totalPosts > 0 || (a.verifiedPostCount ?? 0) > 0)) {
      const vp = a.verifiedPostCount ?? m.totalPosts;
      csvAuditRows.push(`Fence Posts Total,${m.totalPosts},${vp},${cleanVariance(vp, m.totalPosts, 0)},${csvCell(m.postUnit)}`);
    }
    const meshUnitIsArea = isAreaUnit(items.chainLinkMesh.unit);
    const loggedMesh = roundTo(meshUnitIsArea ? m.meshArea : m.meshLen, 2);
    if (items.chainLinkMesh.enabled && (loggedMesh > 0 || (a.verifiedMeshLength ?? 0) > 0)) {
      const vm = a.verifiedMeshLength ?? loggedMesh;
      csvAuditRows.push(`Chain-Link Mesh,${loggedMesh},${vm},${cleanVariance(vm, loggedMesh, 2)},${csvCell(items.chainLinkMesh.unit)}`);
    }
    const rrmUnitIsLength = isLengthUnit(items.rrmWall.unit);
    const loggedRrm = roundTo(rrmUnitIsLength ? m.rrmLen : m.rrmVol, 2);
    if (items.rrmWall.enabled && (loggedRrm > 0 || (a.verifiedRrmVolume ?? 0) > 0)) {
      const vr = a.verifiedRrmVolume ?? loggedRrm;
      const diff = cleanVariance(vr, loggedRrm, 2);
      csvAuditRows.push(`RMM Wall,${loggedRrm.toFixed(2)},${vr.toFixed(2)},${diff.toFixed(2)},${csvCell(items.rrmWall.unit)}`);
    }
    if (items.roadMeasurement.enabled && (m.roadLen > 0 || (a.verifiedRoadLength ?? 0) > 0)) {
      const vrd = a.verifiedRoadLength ?? m.roadLen;
      csvAuditRows.push(`Road Length,${m.roadLen},${vrd},${cleanVariance(vrd, m.roadLen, 2)},${csvCell(items.roadMeasurement.unit)}`);
    }
    if (items.sideDrain.enabled && (m.sideDrainLen > 0 || (a.verifiedSideDrainLength ?? 0) > 0)) {
      const vsd = a.verifiedSideDrainLength ?? m.sideDrainLen;
      csvAuditRows.push(`Side Drain,${m.sideDrainLen},${vsd},${cleanVariance(vsd, m.sideDrainLen, 2)},${csvCell(items.sideDrain.unit)}`);
    }
    enabledCustom.forEach((c) => {
      const vc = a.verifiedCustomItems?.[c.id] ?? c.quantity;
      if (c.quantity > 0 || vc > 0) {
        csvAuditRows.push(`${csvCell(c.name)},${c.quantity},${vc},${cleanVariance(vc, c.quantity, 2)},${csvCell(c.unit)}`);
      }
    });

    if (csvAuditRows.length > 0 || a.generalRemarks || a.auditorName) {
      rows.push('');
      rows.push(`AUDITOR VERIFICATION & RECONCILIATION`);
      rows.push(`Auditor Name,${csvCell(a.auditorName || 'Pending')},Audit Date,${csvCell(a.auditDate)},Status,${csvCell(formatAuditStatus(a.auditStatus))}`);
      rows.push(`Remarks,${csvCell(a.generalRemarks || 'None')}`);
      if (csvAuditRows.length > 0) {
        rows.push(`Item,Logged,Physically Verified,Variance,Unit`);
        rows.push(...csvAuditRows);
      }
    }
  }

  const entityComparisons = computeEntityAuditComparisons(project, scope).filter(
    (row) =>
      row.item.nos !== undefined ||
      row.item.length !== undefined ||
      row.item.width !== undefined ||
      row.item.thickness !== undefined ||
      row.item.auditNos !== undefined ||
      row.item.auditLength !== undefined ||
      row.item.auditWidth !== undefined ||
      row.item.auditThickness !== undefined ||
      row.item.verifiedOverride !== undefined ||
      (row.item.rate !== undefined && row.item.rate > 0) ||
      row.entityQty > 0
  );
  if (entityComparisons.length > 0) {
    rows.push('');
    rows.push(`ENTITY MEASUREMENTS VS. AUDIT VERIFICATION & VARIANCES`);
    if (project.entityName) {
      rows.push(`Executing Entity,${csvCell(project.entityName)}`);
    }
    rows.push(
      `#,Work Item,Linked Audit Target,Rate / Unit,Entity Nos,Entity Length,Entity Width,Entity Thickness,Entity Dimensions,Entity Qty,Entity Claimed Amount,Audit Nos,Audit Length,Audit Width,Audit Thickness,Audit Dimensions,Audit Verified Qty,Audit Verified Amount,Quantity Variance (Audit - Entity),Variance %,Cost Variance (Audit - Entity),Status (Excess / Underpayment),Unit,Remarks`
    );
    entityComparisons.forEach((r, i) => {
      const unit = r.auditUnit || r.item.unit;
      const diffInfo = formatDiffLabel(r.status, r.variance, unit, r.amountVariance);
      rows.push(
        `${i + 1},${csvCell(r.item.itemName || r.auditLabel)},${csvCell(r.auditLabel)},${r.rate ?? ''},${r.item.nos ?? ''},${r.item.length ?? ''},${r.item.width ?? ''},${r.item.thickness ?? ''},${csvCell(formatEntityDimensionsLabel(r.item))},${r.entityQty},${r.entityAmount ?? ''},${r.auditDims.nos ?? ''},${r.auditDims.length ?? ''},${r.auditDims.width ?? ''},${r.auditDims.thickness ?? ''},${csvCell(formatAuditDimensionsLabel(r.item, r.auditDims))},${r.auditQty ?? ''},${r.auditAmount ?? ''},${r.variance ?? ''},${r.variancePct !== null ? `${r.variancePct}%` : ''},${r.amountVariance ?? ''},${csvCell(diffInfo.badgeLabel)},${csvCell(unit)},${csvCell(r.item.remarks || '')}`
      );
    });

    const hasAnyRatesInCsv = entityComparisons.some((r) => r.rate !== undefined && r.rate > 0);
    if (hasAnyRatesInCsv) {
      const totalEntityAmount = roundTo(
        entityComparisons.reduce((sum, r) => sum + (r.entityAmount ?? 0), 0),
        2
      );
      const totalAuditAmount = roundTo(
        entityComparisons.reduce((sum, r) => sum + (r.auditAmount ?? 0), 0),
        2
      );
      let netCsvStatus = 'Matched';
      let netCsvDiff = 0;
      if (totalEntityAmount > totalAuditAmount) {
        netCsvStatus = 'Excess';
        netCsvDiff = roundTo(totalEntityAmount - totalAuditAmount, 2);
      } else if (totalAuditAmount > totalEntityAmount) {
        netCsvStatus = 'Underpayment';
        netCsvDiff = roundTo(totalAuditAmount - totalEntityAmount, 2);
      }
      rows.push(
        `TOTALS,FINANCIAL OUTCOME,,,Claimed Total Value,,,,,,${totalEntityAmount},,,,Verified Total Value,,${totalAuditAmount},,Net Difference,${netCsvDiff},${csvCell(netCsvStatus)},,`
      );
    }
  }

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = scope === 'all' ? 'audit_report' : `${scope}_report`;
  link.setAttribute('href', url);
  link.setAttribute('download', `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${suffix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const exportProjectToCsv = exportProjectToExcel;
