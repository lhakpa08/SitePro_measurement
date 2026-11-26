import { ConstructionProject } from '../types';
import { getProjectSettings, formatChainage } from './geo';
import { buildSiteStaticMapUrl, getProjectMapData, StaticMapScope } from './staticMap';

function escapeHtml(value: string | number | undefined | null): string {
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

function formatAuditStatus(status?: string): string {
  if (status === 'fully_compliant') return 'Fully Compliant';
  if (status === 'verified_with_variance') return 'Verified with Variance';
  return 'Pending Audit';
}

interface ReportMeasurements {
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
  roadLen: number;
  chainageStart: string;
  chainageEnd: string;
  roadWidth: number;
  roadDepth: number;
  roadArea: number;
  roadVol: number;
  sideDrainLen: number;
}

function getAverageOf(entries?: number[], fallback = 0): number {
  if (!entries || entries.length === 0) return fallback;
  const valid = entries.filter(n => !isNaN(n) && n >= 0);
  if (valid.length === 0) return fallback;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function computeMeasurements(project: ConstructionProject): ReportMeasurements {
  const settings = getProjectSettings(project);
  const { items } = settings;
  const lengthUnit = settings.unitSystem === 'imperial' ? 'ft' : 'm';
  const areaUnit = settings.unitSystem === 'imperial' ? 'ft²' : 'm²';
  const volumeUnit = settings.unitSystem === 'imperial' ? 'ft³' : 'm³';

  const totalAngle = project.fencePosts.filter(p => p.postType === 'angle_post').length;
  const totalIntermed = project.fencePosts.filter(p => p.postType === 'intermediate_post').length;
  const totalStrut = project.fencePosts.filter(p => p.postType === 'strut_post').length;
  const totalGate = project.fencePosts.filter(p => p.postType === 'gate_post').length;
  const totalPosts =
    (items.anglePosts.enabled ? totalAngle : 0) +
    (items.intermediatePosts.enabled ? totalIntermed : 0) +
    (items.strutPosts.enabled ? totalStrut : 0) +
    (items.gatePosts.enabled ? totalGate : 0);

  const postUnit = items.anglePosts.unit || items.intermediatePosts.unit || 'pcs';

  const meshLen = project.fenceMeshSegments.reduce((a, c) => a + c.lengthMeters, 0);
  const meshWidth = project.fenceMeshSegments[0]?.meshHeightMeters ?? settings.defaultMeshHeight;
  const meshArea = meshLen * meshWidth;

  const rrmLen = project.rrmWalls.reduce((a, c) => a + c.lengthMeters, 0);
  const rrmWall0 = project.rrmWalls[0];
  const rrmTopW = rrmWall0 ? getAverageOf(rrmWall0.topWidthEntries, rrmWall0.topWidthMeters) : 0.38;
  const rrmBotW = rrmWall0 ? getAverageOf(rrmWall0.bottomWidthEntries, rrmWall0.bottomWidthMeters) : 0.38;
  const rrmWidth = Number(((rrmTopW + rrmBotW) / 2).toFixed(2));
  const rrmHeight = rrmWall0 ? getAverageOf(rrmWall0.heightEntries, rrmWall0.heightMeters) : settings.defaultRrmHeight;
  const rrmVol = project.rrmWalls.reduce(
    (acc, c) => {
      const topW = getAverageOf(c.topWidthEntries, c.topWidthMeters);
      const botW = getAverageOf(c.bottomWidthEntries, c.bottomWidthMeters);
      const h = getAverageOf(c.heightEntries, c.heightMeters);
      return acc + c.lengthMeters * h * ((topW + botW) / 2);
    },
    0
  );

  const roadLen = project.roadSections.reduce((a, c) => a + c.lengthMeters, 0);
  const chainageStart = project.roadSections[0]?.chainageStart || '0+000';
  const chainageEnd = project.roadSections[0]?.chainageEnd || formatChainage(roadLen);
  const roadSec0 = project.roadSections[0];
  const roadWidth = roadSec0 ? getAverageOf(roadSec0.widthEntries, roadSec0.widthMeters ?? settings.defaultRoadWidth) : settings.defaultRoadWidth;
  const roadDepth = roadSec0 ? getAverageOf(roadSec0.depthEntries, roadSec0.earthworkCutDepthMeters) : 0;
  const roadArea = project.roadSections.reduce((acc, curr) => {
    const w = getAverageOf(curr.widthEntries, curr.widthMeters);
    return acc + curr.lengthMeters * w;
  }, 0);
  const roadVol = project.roadSections.reduce((acc, curr) => {
    const w = getAverageOf(curr.widthEntries, curr.widthMeters);
    const d = getAverageOf(curr.depthEntries, curr.earthworkCutDepthMeters);
    return acc + curr.lengthMeters * w * d;
  }, 0);
  const sideDrainLen = project.roadSections.reduce((acc, curr) => acc + (curr.sideDrainLengthMeters || 0), 0);

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
    roadLen,
    chainageStart,
    chainageEnd,
    roadWidth,
    roadDepth,
    roadArea,
    roadVol,
    sideDrainLen,
  };
}

const SHARED_PRINT_CSS = `
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
    margin: 0;
    padding: 24px;
    font-size: 12px;
    line-height: 1.45;
  }
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .doc-kicker {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 3px;
  }
  .doc-title {
    font-size: 20px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
  }
  .doc-meta-right {
    text-align: right;
    font-size: 11px;
    color: #475569;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px 24px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 20px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    border-bottom: 1px solid #eef2f7;
    padding: 3px 0;
  }
  .info-label { color: #64748b; font-weight: 600; }
  .info-val { color: #0f172a; font-weight: 700; text-align: right; }
  h2 {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #334155;
    margin: 20px 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #cbd5e1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 8px 10px;
    text-align: left;
  }
  th {
    background: #f1f5f9;
    font-size: 11px;
    font-weight: 700;
    color: #334155;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  td { font-size: 12px; color: #1e293b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  .center { text-align: center; }
  .muted { color: #64748b; font-size: 11px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10.5px;
    font-weight: 700;
    background: #e2e8f0;
    color: #0f172a;
  }
  .remarks-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 24px;
    font-size: 11.5px;
  }
  .sig-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 40px;
    margin-top: 36px;
    page-break-inside: avoid;
  }
  .sig-box {
    border-top: 1px solid #64748b;
    padding-top: 6px;
    font-size: 11px;
    color: #475569;
  }
  .footer {
    margin-top: 28px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
    font-size: 10px;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
  }
  .map-section {
    margin: 18px 0 20px 0;
    page-break-inside: avoid;
  }
  .map-frame {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    overflow: hidden;
    background: #f8fafc;
    margin-bottom: 10px;
  }
  .report-map-img {
    width: 100%;
    max-height: 300px;
    object-fit: cover;
    display: block;
  }
  .map-caption {
    padding: 7px 10px;
    font-size: 10.5px;
    color: #475569;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }
`;

function buildMapSectionHtml(
  project: ConstructionProject,
  scope: StaticMapScope,
  headingText: string
): string {
  const mapUrl = buildSiteStaticMapUrl(project, {
    scope,
    mapType: 'hybrid',
    size: '640x360',
    scale: 2,
  });
  const data = getProjectMapData(project, scope);

  const coordRows: string[] = [];
  if (data.sitePin) {
    coordRows.push(
      `<tr><td>Site Anchor Pin (S)</td><td class="mono">${data.sitePin.lat.toFixed(6)}&deg;, ${data.sitePin.lng.toFixed(6)}&deg;</td><td class="muted">${escapeHtml(project.location || 'Pinned Site Location')}</td></tr>`
    );
  }
  if (scope !== 'fencing' && (data.roadStart || data.roadEnd)) {
    const roadSec = project.roadSections[0];
    if (data.roadStart) {
      coordRows.push(
        `<tr><td>Road Start (A)</td><td class="mono">${data.roadStart.lat.toFixed(6)}&deg;, ${data.roadStart.lng.toFixed(6)}&deg;</td><td class="muted">Chainage ${escapeHtml(roadSec?.chainageStart || '0+000')}</td></tr>`
      );
    }
    if (data.roadEnd) {
      coordRows.push(
        `<tr><td>Road End (B)</td><td class="mono">${data.roadEnd.lat.toFixed(6)}&deg;, ${data.roadEnd.lng.toFixed(6)}&deg;</td><td class="muted">Chainage ${escapeHtml(roadSec?.chainageEnd || formatChainage(roadSec?.lengthMeters || 0))}</td></tr>`
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
      `<tr><td>GPS-Tagged Fence Posts</td><td class="mono">${spanText}</td><td class="muted">${data.gpsPosts.length} of ${project.fencePosts.length} posts mapped</td></tr>`
    );
  }

  if (!mapUrl && coordRows.length === 0) {
    return `
      <div class="map-section">
        <h2>${escapeHtml(headingText)}</h2>
        <div class="remarks-box muted">
          No GPS coordinates or site address have been pinned yet. Open the <strong>Overview</strong> tab to search a site address, lock device GPS, or drop a map pin before exporting.
        </div>
      </div>
    `;
  }

  return `
    <div class="map-section">
      <h2>${escapeHtml(headingText)}</h2>
      ${mapUrl ? `
        <div class="map-frame">
          <img
            src="${escapeHtml(mapUrl)}"
            alt="Site location satellite map for ${escapeHtml(project.name)}"
            class="report-map-img"
            onerror="this.parentElement.style.display='none'"
          />
          <div class="map-caption">
            <span><strong>Map Layer:</strong> Hybrid Satellite &amp; Roads &bull; <strong>Legend:</strong> S = Site Anchor, A/B = Road Alignment, Amber = Fence Posts</span>
            <span class="mono">${data.allPoints.length} GPS point${data.allPoints.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      ` : ''}
      ${coordRows.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th style="width:180px;">Geospatial Reference</th>
              <th>WGS84 Coordinates (Lat, Lng)</th>
              <th>Notes / Chainage</th>
            </tr>
          </thead>
          <tbody>
            ${coordRows.join('')}
          </tbody>
        </table>
      ` : ''}
    </div>
  `;
}

export function exportProjectToExcel(project: ConstructionProject) {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustom = customItems.filter(c => c.enabled);
  const m = computeMeasurements(project);

  const rows: string[] = [];
  rows.push(`SITE MEASUREMENT & AUDIT REPORT`);
  rows.push(`Project Name,${csvCell(project.name)}`);
  rows.push(`Client,${csvCell(project.clientName || 'N/A')}`);
  rows.push(`Location,${csvCell(project.location || 'N/A')}`);
  if (project.siteCoordinates) {
    rows.push(`Site Coordinates (Lat/Lng),${csvCell(`${project.siteCoordinates.lat.toFixed(6)}, ${project.siteCoordinates.lng.toFixed(6)}`)}`);
  }
  const roadSec0 = project.roadSections[0];
  if (roadSec0?.startGps) {
    rows.push(`Road Start GPS,${csvCell(`${roadSec0.startGps.lat.toFixed(6)}, ${roadSec0.startGps.lng.toFixed(6)}`)}`);
  }
  if (roadSec0?.endGps) {
    rows.push(`Road End GPS,${csvCell(`${roadSec0.endGps.lat.toFixed(6)}, ${roadSec0.endGps.lng.toFixed(6)}`)}`);
  }
  rows.push(`Unit System,${csvCell(settings.unitSystem.toUpperCase())}`);
  rows.push(`Report Date,${csvCell(new Date().toLocaleDateString())}`);
  if (project.auditNotes?.trim()) {
    rows.push(`Audit Notes,${csvCell(project.auditNotes.trim())}`);
  }
  rows.push('');

  rows.push(`MEASUREMENT SUMMARY`);
  rows.push(`#,Category,Item Description,Dimensions / Details,Measured Quantity,Unit`);

  let idx = 1;
  if (items.anglePosts.enabled) {
    rows.push(`${idx++},Fencing,Angle Posts (Corner / End),Physical count,${m.totalAngle},${csvCell(items.anglePosts.unit)}`);
  }
  if (items.intermediatePosts.enabled) {
    rows.push(`${idx++},Fencing,Intermediate Posts,Physical count,${m.totalIntermed},${csvCell(items.intermediatePosts.unit)}`);
  }
  if (items.strutPosts.enabled) {
    rows.push(`${idx++},Fencing,Strut Posts,Physical count,${m.totalStrut},${csvCell(items.strutPosts.unit)}`);
  }
  if (items.gatePosts.enabled) {
    rows.push(`${idx++},Fencing,Gate Posts,Physical count,${m.totalGate},${csvCell(items.gatePosts.unit)}`);
  }
  if (items.chainLinkMesh.enabled) {
    rows.push(
      `${idx++},Fencing,Chain-Link Mesh,${csvCell(`L: ${m.meshLen} ${items.chainLinkMesh.unit} x W: ${m.meshWidth} ${m.lengthUnit} (Area: ${m.meshArea.toFixed(1)} ${m.areaUnit})`)},${m.meshLen},${csvCell(items.chainLinkMesh.unit)}`
    );
  }
  if (items.rrmWall.enabled) {
    rows.push(
      `${idx++},Fencing,RRM Foundation Wall,${csvCell(`L: ${m.rrmLen.toFixed(2)} ${m.lengthUnit} x W: ${m.rrmWidth.toFixed(2)} ${m.lengthUnit} x H: ${m.rrmHeight.toFixed(2)} ${m.lengthUnit}`)},${m.rrmVol.toFixed(2)},${csvCell(items.rrmWall.unit)}`
    );
  }
  if (items.roadMeasurement.enabled) {
    const chainagePrefix = `Chainage: ${m.chainageStart} to ${m.chainageEnd} | `;
    const roadDetails = m.roadDepth > 0
      ? `${chainagePrefix}L: ${m.roadLen} ${items.roadMeasurement.unit} x W: ${m.roadWidth} ${m.lengthUnit} x D: ${m.roadDepth} ${m.lengthUnit} (Area: ${m.roadArea.toFixed(1)} ${m.areaUnit} | Vol: ${m.roadVol.toFixed(1)} ${m.volumeUnit})`
      : `${chainagePrefix}L: ${m.roadLen} ${items.roadMeasurement.unit} x W: ${m.roadWidth} ${m.lengthUnit} (Area: ${m.roadArea.toFixed(1)} ${m.areaUnit})`;
    rows.push(`${idx++},Road,Road Measurement,${csvCell(roadDetails)},${m.roadLen},${csvCell(items.roadMeasurement.unit)}`);
  }
  if (items.sideDrain.enabled) {
    rows.push(`${idx++},Road,Road Side Drain,Measured length,${m.sideDrainLen},${csvCell(items.sideDrain.unit)}`);
  }
  enabledCustom.forEach((c) => {
    rows.push(`${idx++},${csvCell(c.category)},${csvCell(c.name)},Custom item,${c.quantity},${csvCell(c.unit)}`);
  });

  if (project.auditInfo) {
    const a = project.auditInfo;
    rows.push('');
    rows.push(`AUDITOR VERIFICATION`);
    rows.push(`Auditor Name,${csvCell(a.auditorName || 'Pending')}`);
    rows.push(`Audit Date,${csvCell(a.auditDate)}`);
    rows.push(`Compliance Status,${csvCell(formatAuditStatus(a.auditStatus))}`);
    rows.push(`Remarks,${csvCell(a.generalRemarks || 'None')}`);
    rows.push('');
    rows.push(`Item,Logged,Physically Verified,Variance,Unit`);
    const anyPosts = items.anglePosts.enabled || items.intermediatePosts.enabled || items.strutPosts.enabled || items.gatePosts.enabled;
    if (anyPosts) {
      const vp = a.verifiedPostCount ?? m.totalPosts;
      rows.push(`Fence Posts Total,${m.totalPosts},${vp},${vp - m.totalPosts},${csvCell(m.postUnit)}`);
    }
    if (items.chainLinkMesh.enabled) {
      const vm = a.verifiedMeshLength ?? m.meshLen;
      rows.push(`Chain-Link Mesh,${m.meshLen},${vm},${vm - m.meshLen},${csvCell(items.chainLinkMesh.unit)}`);
    }
    if (items.rrmWall.enabled) {
      const vr = a.verifiedRrmVolume ?? Number(m.rrmVol.toFixed(2));
      rows.push(`RRM Foundation Wall,${m.rrmVol.toFixed(2)},${vr.toFixed(2)},${(vr - m.rrmVol).toFixed(2)},${csvCell(items.rrmWall.unit)}`);
    }
    if (items.roadMeasurement.enabled) {
      const vrd = a.verifiedRoadLength ?? m.roadLen;
      rows.push(`Road Length,${m.roadLen},${vrd},${vrd - m.roadLen},${csvCell(items.roadMeasurement.unit)}`);
    }
    if (items.sideDrain.enabled) {
      const vsd = a.verifiedSideDrainLength ?? m.sideDrainLen;
      rows.push(`Side Drain,${m.sideDrainLen},${vsd},${vsd - m.sideDrainLen},${csvCell(items.sideDrain.unit)}`);
    }
    enabledCustom.forEach((c) => {
      const vc = a.verifiedCustomItems?.[c.id] ?? c.quantity;
      rows.push(`${csvCell(c.name)},${c.quantity},${vc},${vc - c.quantity},${csvCell(c.unit)}`);
    });
  }

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_audit_report.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const exportProjectToCsv = exportProjectToExcel;

export function exportChainLinkPdf(project: ConstructionProject) {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const m = computeMeasurements(project);
  const fencingCustom = customItems.filter(c => c.enabled && c.category === 'fencing');

  const w = window.open('', '_blank');
  if (!w) {
    window.print();
    return;
  }

  const rowsHtml: string[] = [];
  let rowNum = 1;
  if (items.anglePosts.enabled) {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Angle Posts (Corner / End)</td><td class="muted">Physical count</td><td class="num">${m.totalAngle}</td><td class="center">${escapeHtml(items.anglePosts.unit)}</td></tr>`);
  }
  if (items.intermediatePosts.enabled) {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Intermediate Posts</td><td class="muted">Physical count</td><td class="num">${m.totalIntermed}</td><td class="center">${escapeHtml(items.intermediatePosts.unit)}</td></tr>`);
  }
  if (items.strutPosts.enabled) {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Strut Posts</td><td class="muted">Physical count</td><td class="num">${m.totalStrut}</td><td class="center">${escapeHtml(items.strutPosts.unit)}</td></tr>`);
  }
  if (items.gatePosts.enabled) {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Gate Posts</td><td class="muted">Physical count</td><td class="num">${m.totalGate}</td><td class="center">${escapeHtml(items.gatePosts.unit)}</td></tr>`);
  }
  if (items.chainLinkMesh.enabled) {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Chain-Link Mesh</td><td class="muted">L: ${m.meshLen} ${escapeHtml(items.chainLinkMesh.unit)} &times; W: ${m.meshWidth} ${escapeHtml(m.lengthUnit)} (Area: ${m.meshArea.toFixed(1)} ${escapeHtml(m.areaUnit)})</td><td class="num">${m.meshLen.toLocaleString()}</td><td class="center">${escapeHtml(items.chainLinkMesh.unit)}</td></tr>`);
  }
  if (items.rrmWall.enabled) {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>RRM Foundation Wall</td><td class="muted">L: ${m.rrmLen.toFixed(2)} ${escapeHtml(m.lengthUnit)} &times; W: ${m.rrmWidth.toFixed(2)} ${escapeHtml(m.lengthUnit)} &times; H: ${m.rrmHeight.toFixed(2)} ${escapeHtml(m.lengthUnit)}</td><td class="num">${m.rrmVol.toFixed(2)}</td><td class="center">${escapeHtml(items.rrmWall.unit)}</td></tr>`);
  }
  fencingCustom.forEach(c => {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>${escapeHtml(c.name)}</td><td class="muted">Custom item</td><td class="num">${c.quantity}</td><td class="center">${escapeHtml(c.unit)}</td></tr>`);
  });

  w.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Fencing Measurement Report - ${escapeHtml(project.name)}</title>
        <style>${SHARED_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-header">
          <div>
            <div class="doc-kicker">Site Measurement Report &bull; Chain-Link &amp; RRM</div>
            <h1 class="doc-title">${escapeHtml(project.name)}</h1>
          </div>
          <div class="doc-meta-right">
            <div><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</div>
            <div><strong>Units:</strong> ${escapeHtml(settings.unitSystem.toUpperCase())}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-row"><span class="info-label">Client</span><span class="info-val">${escapeHtml(project.clientName || 'N/A')}</span></div>
          <div class="info-row"><span class="info-label">Site Location</span><span class="info-val">${escapeHtml(project.location || 'N/A')}</span></div>
        </div>

        <h2>Fencing &amp; Masonry Quantities</h2>
        <table>
          <thead>
            <tr>
              <th class="center" style="width:36px;">#</th>
              <th>Work Item</th>
              <th>Dimensions / Details</th>
              <th class="num" style="width:95px;">Quantity</th>
              <th class="center" style="width:65px;">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml.length > 0 ? rowsHtml.join('') : '<tr><td colspan="5" class="center muted">No fencing items enabled.</td></tr>'}
          </tbody>
        </table>

        ${buildMapSectionHtml(project, 'fencing', 'Site Location & Fencing GPS Map')}

        <div class="sig-grid">
          <div class="sig-box">Prepared By (Site Engineer / Surveyor)</div>
          <div class="sig-box">Verified By (${escapeHtml(project.auditInfo?.auditorName || 'Technical Auditor')})</div>
        </div>

        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  w.document.close();
}

export function exportRoadPdf(project: ConstructionProject) {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const m = computeMeasurements(project);
  const roadCustom = customItems.filter(c => c.enabled && c.category === 'road');

  const w = window.open('', '_blank');
  if (!w) {
    window.print();
    return;
  }

  const rowsHtml: string[] = [];
  let rowNum = 1;
  if (items.roadMeasurement.enabled) {
    const chainageText = `Chainage: ${escapeHtml(m.chainageStart)} &ndash; ${escapeHtml(m.chainageEnd)} &bull; `;
    const dims = m.roadDepth > 0
      ? `${chainageText}Length: ${m.roadLen} ${escapeHtml(items.roadMeasurement.unit)} &times; Width: ${m.roadWidth} ${escapeHtml(m.lengthUnit)} &times; Depth: ${m.roadDepth} ${escapeHtml(m.lengthUnit)}`
      : `${chainageText}Length: ${m.roadLen} ${escapeHtml(items.roadMeasurement.unit)} &times; Width: ${m.roadWidth} ${escapeHtml(m.lengthUnit)}`;
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Road Length</td><td class="muted">${dims}</td><td class="num">${m.roadLen.toLocaleString()}</td><td class="center">${escapeHtml(items.roadMeasurement.unit)}</td></tr>`);
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Road Surface Area</td><td class="muted">Length &times; Breadth/Width</td><td class="num">${m.roadArea.toLocaleString()}</td><td class="center">${escapeHtml(m.areaUnit)}</td></tr>`);
    if (m.roadDepth > 0) {
      rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Road Volume (with Depth)</td><td class="muted">Length &times; Width &times; Depth</td><td class="num">${m.roadVol.toFixed(1)}</td><td class="center">${escapeHtml(m.volumeUnit)}</td></tr>`);
    }
  }
  if (items.sideDrain.enabled) {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>Road Side Drain</td><td class="muted">Measured length</td><td class="num">${m.sideDrainLen.toLocaleString()}</td><td class="center">${escapeHtml(items.sideDrain.unit)}</td></tr>`);
  }
  roadCustom.forEach(c => {
    rowsHtml.push(`<tr><td class="center">${rowNum++}</td><td>${escapeHtml(c.name)}</td><td class="muted">Custom item</td><td class="num">${c.quantity}</td><td class="center">${escapeHtml(c.unit)}</td></tr>`);
  });

  w.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Road Measurement Report - ${escapeHtml(project.name)}</title>
        <style>${SHARED_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-header">
          <div>
            <div class="doc-kicker">Site Measurement Report &bull; Road Works</div>
            <h1 class="doc-title">${escapeHtml(project.name)}</h1>
          </div>
          <div class="doc-meta-right">
            <div><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</div>
            <div><strong>Units:</strong> ${escapeHtml(settings.unitSystem.toUpperCase())}</div>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-row"><span class="info-label">Client</span><span class="info-val">${escapeHtml(project.clientName || 'N/A')}</span></div>
          <div class="info-row"><span class="info-label">Site Location</span><span class="info-val">${escapeHtml(project.location || 'N/A')}</span></div>
        </div>

        <h2>Road Quantities</h2>
        <table>
          <thead>
            <tr>
              <th class="center" style="width:36px;">#</th>
              <th>Road Component</th>
              <th>Dimensions / Details</th>
              <th class="num" style="width:95px;">Quantity</th>
              <th class="center" style="width:65px;">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml.length > 0 ? rowsHtml.join('') : '<tr><td colspan="5" class="center muted">No road items enabled.</td></tr>'}
          </tbody>
        </table>

        ${buildMapSectionHtml(project, 'road', 'Road Alignment & Site GPS Map')}

        <div class="sig-grid">
          <div class="sig-box">Prepared By (Site Engineer / Surveyor)</div>
          <div class="sig-box">Verified By (${escapeHtml(project.auditInfo?.auditorName || 'Technical Auditor')})</div>
        </div>

        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  w.document.close();
}

export function exportProjectToPdf(project: ConstructionProject) {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustom = customItems.filter(c => c.enabled);
  const m = computeMeasurements(project);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.print();
    return;
  }

  // Build Measurement Rows
  const measurementRows: string[] = [];
  let rowNum = 1;

  if (items.anglePosts.enabled) {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>Angle Posts (Corner / End)</td><td class="muted">Fencing &bull; Physical count</td><td class="num">${m.totalAngle}</td><td class="center">${escapeHtml(items.anglePosts.unit)}</td></tr>`);
  }
  if (items.intermediatePosts.enabled) {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>Intermediate Posts</td><td class="muted">Fencing &bull; Physical count</td><td class="num">${m.totalIntermed}</td><td class="center">${escapeHtml(items.intermediatePosts.unit)}</td></tr>`);
  }
  if (items.strutPosts.enabled) {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>Strut Posts</td><td class="muted">Fencing &bull; Physical count</td><td class="num">${m.totalStrut}</td><td class="center">${escapeHtml(items.strutPosts.unit)}</td></tr>`);
  }
  if (items.gatePosts.enabled) {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>Gate Posts</td><td class="muted">Fencing &bull; Physical count</td><td class="num">${m.totalGate}</td><td class="center">${escapeHtml(items.gatePosts.unit)}</td></tr>`);
  }
  if (items.chainLinkMesh.enabled) {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>Chain-Link Mesh</td><td class="muted">L: ${m.meshLen} ${escapeHtml(items.chainLinkMesh.unit)} &times; W: ${m.meshWidth} ${escapeHtml(m.lengthUnit)} (Area: ${m.meshArea.toFixed(1)} ${escapeHtml(m.areaUnit)})</td><td class="num">${m.meshLen.toLocaleString()}</td><td class="center">${escapeHtml(items.chainLinkMesh.unit)}</td></tr>`);
  }
  if (items.rrmWall.enabled) {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>RRM Foundation Wall</td><td class="muted">L: ${m.rrmLen.toFixed(2)} ${escapeHtml(m.lengthUnit)} &times; W: ${m.rrmWidth.toFixed(2)} ${escapeHtml(m.lengthUnit)} &times; H: ${m.rrmHeight.toFixed(2)} ${escapeHtml(m.lengthUnit)}</td><td class="num">${m.rrmVol.toFixed(2)}</td><td class="center">${escapeHtml(items.rrmWall.unit)}</td></tr>`);
  }
  if (items.roadMeasurement.enabled) {
    const chainageText = `Ch. ${escapeHtml(m.chainageStart)} &ndash; ${escapeHtml(m.chainageEnd)} &bull; `;
    const roadDetails = m.roadDepth > 0
      ? `${chainageText}L: ${m.roadLen} ${escapeHtml(items.roadMeasurement.unit)} &times; W: ${m.roadWidth} ${escapeHtml(m.lengthUnit)} &times; D: ${m.roadDepth} ${escapeHtml(m.lengthUnit)} &bull; Area: ${m.roadArea.toLocaleString()} ${escapeHtml(m.areaUnit)} &bull; Vol: ${m.roadVol.toFixed(1)} ${escapeHtml(m.volumeUnit)}`
      : `${chainageText}L: ${m.roadLen} ${escapeHtml(items.roadMeasurement.unit)} &times; W: ${m.roadWidth} ${escapeHtml(m.lengthUnit)} &bull; Area: ${m.roadArea.toLocaleString()} ${escapeHtml(m.areaUnit)}`;
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>Road Alignment</td><td class="muted">${roadDetails}</td><td class="num">${m.roadLen.toLocaleString()}</td><td class="center">${escapeHtml(items.roadMeasurement.unit)}</td></tr>`);
  }
  if (items.sideDrain.enabled) {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>Road Side Drain</td><td class="muted">Road &bull; Measured length</td><td class="num">${m.sideDrainLen.toLocaleString()}</td><td class="center">${escapeHtml(items.sideDrain.unit)}</td></tr>`);
  }
  enabledCustom.forEach(c => {
    measurementRows.push(`<tr><td class="center">${rowNum++}</td><td>${escapeHtml(c.name)}</td><td class="muted">${escapeHtml(c.category)} &bull; Custom item</td><td class="num">${c.quantity}</td><td class="center">${escapeHtml(c.unit)}</td></tr>`);
  });

  // Build Audit Reconciliation Rows
  const auditRows: string[] = [];
  if (project.auditInfo) {
    const a = project.auditInfo;
    const anyPosts = items.anglePosts.enabled || items.intermediatePosts.enabled || items.strutPosts.enabled || items.gatePosts.enabled;
    if (anyPosts) {
      const vp = a.verifiedPostCount ?? m.totalPosts;
      const diff = vp - m.totalPosts;
      auditRows.push(`<tr><td>Fence Posts Total</td><td class="num">${m.totalPosts} ${escapeHtml(m.postUnit)}</td><td class="num">${vp} ${escapeHtml(m.postUnit)}</td><td class="num">${diff > 0 ? `+${diff}` : diff} ${escapeHtml(m.postUnit)}</td></tr>`);
    }
    if (items.chainLinkMesh.enabled) {
      const vm = a.verifiedMeshLength ?? m.meshLen;
      const diff = vm - m.meshLen;
      auditRows.push(`<tr><td>Chain-Link Mesh Length</td><td class="num">${m.meshLen} ${escapeHtml(items.chainLinkMesh.unit)}</td><td class="num">${vm} ${escapeHtml(items.chainLinkMesh.unit)}</td><td class="num">${diff > 0 ? `+${diff}` : diff} ${escapeHtml(items.chainLinkMesh.unit)}</td></tr>`);
    }
    if (items.rrmWall.enabled) {
      const vr = a.verifiedRrmVolume ?? Number(m.rrmVol.toFixed(2));
      const diff = vr - m.rrmVol;
      auditRows.push(`<tr><td>RRM Wall Volume</td><td class="num">${m.rrmVol.toFixed(2)} ${escapeHtml(items.rrmWall.unit)}</td><td class="num">${vr.toFixed(2)} ${escapeHtml(items.rrmWall.unit)}</td><td class="num">${diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} ${escapeHtml(items.rrmWall.unit)}</td></tr>`);
    }
    if (items.roadMeasurement.enabled) {
      const vrd = a.verifiedRoadLength ?? m.roadLen;
      const diff = vrd - m.roadLen;
      auditRows.push(`<tr><td>Road Length</td><td class="num">${m.roadLen} ${escapeHtml(items.roadMeasurement.unit)}</td><td class="num">${vrd} ${escapeHtml(items.roadMeasurement.unit)}</td><td class="num">${diff > 0 ? `+${diff}` : diff} ${escapeHtml(items.roadMeasurement.unit)}</td></tr>`);
    }
    if (items.sideDrain.enabled) {
      const vsd = a.verifiedSideDrainLength ?? m.sideDrainLen;
      const diff = vsd - m.sideDrainLen;
      auditRows.push(`<tr><td>Road Side Drain</td><td class="num">${m.sideDrainLen} ${escapeHtml(items.sideDrain.unit)}</td><td class="num">${vsd} ${escapeHtml(items.sideDrain.unit)}</td><td class="num">${diff > 0 ? `+${diff}` : diff} ${escapeHtml(items.sideDrain.unit)}</td></tr>`);
    }
    enabledCustom.forEach(c => {
      const vc = a.verifiedCustomItems?.[c.id] ?? c.quantity;
      const diff = vc - c.quantity;
      auditRows.push(`<tr><td>${escapeHtml(c.name)}</td><td class="num">${c.quantity} ${escapeHtml(c.unit)}</td><td class="num">${vc} ${escapeHtml(c.unit)}</td><td class="num">${diff > 0 ? `+${diff}` : diff} ${escapeHtml(c.unit)}</td></tr>`);
    });
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Site Measurement &amp; Audit Report - ${escapeHtml(project.name)}</title>
        <style>${SHARED_PRINT_CSS}</style>
      </head>
      <body>
        <div class="doc-header">
          <div>
            <div class="doc-kicker">Site Measurement &amp; Technical Audit Report</div>
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
        </div>

        <h2>1. Physical Measurement Summary</h2>
        <table>
          <thead>
            <tr>
              <th class="center" style="width:36px;">#</th>
              <th>Work Item</th>
              <th>Dimensions / Specification</th>
              <th class="num" style="width:95px;">Quantity</th>
              <th class="center" style="width:65px;">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${measurementRows.length > 0 ? measurementRows.join('') : '<tr><td colspan="5" class="center muted">No measurement items enabled.</td></tr>'}
          </tbody>
        </table>

        ${project.auditNotes?.trim() ? `
          <div class="remarks-box">
            <strong>Site Audit Notes:</strong>
            ${escapeHtml(project.auditNotes.trim())}
          </div>
        ` : ''}

        ${buildMapSectionHtml(project, 'all', '2. Site Location & Geospatial Map')}

        ${project.auditInfo ? `
          <h2>3. Auditor Verification &amp; Reconciliation</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th class="num">Logged</th>
                <th class="num">Verified</th>
                <th class="num">Variance</th>
              </tr>
            </thead>
            <tbody>
              ${auditRows.join('')}
            </tbody>
          </table>
          <div class="remarks-box">
            <strong>Auditor Remarks (${escapeHtml(project.auditInfo.auditDate)}):</strong>
            ${escapeHtml(project.auditInfo.generalRemarks || 'No remarks recorded.')}
          </div>
        ` : ''}

        <div class="sig-grid">
          <div class="sig-box">Prepared By (Site Engineer / Surveyor)</div>
          <div class="sig-box">Verified By (${escapeHtml(project.auditInfo?.auditorName || 'Technical Auditor')})</div>
        </div>

        <div class="footer">
          <span>SitePro Measurement &amp; Audit Record</span>
          <span>Generated ${escapeHtml(new Date().toLocaleDateString())}</span>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
