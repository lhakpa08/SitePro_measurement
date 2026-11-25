import { ConstructionProject } from '../types';
import { getProjectSettings } from '../utils/geo';

export interface DriveBackupFile {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
}

export interface SiteProBackupPayload {
  format: 'sitepro-backup-v1';
  exportedAt: string;
  projects: ConstructionProject[];
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Your Google Drive session has expired. Please sign in again.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

async function handleDriveResponse(res: Response) {
  if (res.status === 401 || res.status === 403) {
    throw new DriveAuthExpiredError();
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Google Drive request failed (${res.status})`);
  }
  return res;
}

export async function listDriveBackups(accessToken: string): Promise<DriveBackupFile[]> {
  const query = encodeURIComponent("trashed = false and mimeType != 'application/vnd.google-apps.folder'");
  const fields = encodeURIComponent('files(id,name,modifiedTime,size,appProperties)');
  const res = await handleDriveResponse(
    await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&pageSize=50`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
  );
  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

function buildMultipartBody(metadata: Record<string, unknown>, content: string, mimeType: string) {
  const boundary = `-------sitepro_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;
  return { boundary, body };
}

export async function createDriveBackup(
  accessToken: string,
  projects: ConstructionProject[],
  fileName: string
): Promise<DriveBackupFile> {
  const payload: SiteProBackupPayload = {
    format: 'sitepro-backup-v1',
    exportedAt: new Date().toISOString(),
    projects,
  };
  const safeName = fileName.trim().endsWith('.json') ? fileName.trim() : `${fileName.trim()}.json`;
  const { boundary, body } = buildMultipartBody(
    {
      name: safeName,
      mimeType: 'application/json',
      description: 'SitePro field measurement and audit backup',
      appProperties: {
        app: 'sitepro',
        kind: 'backup',
        siteCount: String(projects.length),
      },
    },
    JSON.stringify(payload, null, 2),
    'application/json'
  );

  const res = await handleDriveResponse(
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
  );
  return res.json();
}

export async function updateDriveBackup(
  accessToken: string,
  fileId: string,
  projects: ConstructionProject[]
): Promise<DriveBackupFile> {
  const payload: SiteProBackupPayload = {
    format: 'sitepro-backup-v1',
    exportedAt: new Date().toISOString(),
    projects,
  };

  const res = await handleDriveResponse(
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,size,appProperties`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(payload, null, 2),
      }
    )
  );
  return res.json();
}

export async function downloadDriveBackup(
  accessToken: string,
  fileId: string
): Promise<ConstructionProject[]> {
  const res = await handleDriveResponse(
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  );
  const data = await res.json();

  if (data && Array.isArray(data.projects)) {
    return data.projects;
  }
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && typeof data.id === 'string' && typeof data.name === 'string') {
    return [data as ConstructionProject];
  }
  throw new Error('Selected file is not a valid SitePro project backup.');
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  await handleDriveResponse(
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  );
}

function csvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function createDriveCsvReport(
  accessToken: string,
  project: ConstructionProject
): Promise<DriveBackupFile> {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustom = customItems.filter(c => c.enabled);
  const lengthUnit = settings.unitSystem === 'imperial' ? 'ft' : 'm';

  const totalAngle = project.fencePosts.filter(p => p.postType === 'angle_post').length;
  const totalIntermed = project.fencePosts.filter(p => p.postType === 'intermediate_post').length;
  const totalStrut = project.fencePosts.filter(p => p.postType === 'strut_post').length;
  const totalGate = project.fencePosts.filter(p => p.postType === 'gate_post').length;
  const meshLen = project.fenceMeshSegments.reduce((a, c) => a + c.lengthMeters, 0);
  const rrmVol = project.rrmWalls.reduce(
    (acc, c) => acc + c.lengthMeters * c.heightMeters * ((c.topWidthMeters + c.bottomWidthMeters) / 2),
    0
  );
  const roadLen = project.roadSections.reduce((a, c) => a + c.lengthMeters, 0);
  const roadWidth = project.roadSections[0]?.widthMeters ?? settings.defaultRoadWidth;
  const sideDrainLen = project.roadSections.reduce((a, c) => a + (c.sideDrainLengthMeters || 0), 0);

  const rows: string[] = [
    'SITE MEASUREMENT & AUDIT REPORT',
    `Project Name,${csvCell(project.name)}`,
    `Client,${csvCell(project.clientName || 'N/A')}`,
    `Location,${csvCell(project.location || 'N/A')}`,
    `Unit System,${csvCell(settings.unitSystem.toUpperCase())}`,
    `Report Date,${csvCell(new Date().toLocaleDateString())}`,
  ];
  if (project.auditNotes?.trim()) {
    rows.push(`Audit Notes,${csvCell(project.auditNotes.trim())}`);
  }
  rows.push('');
  rows.push('Category,Item Description,Measured Quantity,Unit');
  if (items.anglePosts.enabled) rows.push(`Fencing,Angle Posts,${totalAngle},${csvCell(items.anglePosts.unit)}`);
  if (items.intermediatePosts.enabled) rows.push(`Fencing,Intermediate Posts,${totalIntermed},${csvCell(items.intermediatePosts.unit)}`);
  if (items.strutPosts.enabled) rows.push(`Fencing,Strut Posts,${totalStrut},${csvCell(items.strutPosts.unit)}`);
  if (items.gatePosts.enabled) rows.push(`Fencing,Gate Posts,${totalGate},${csvCell(items.gatePosts.unit)}`);
  if (items.chainLinkMesh.enabled) rows.push(`Fencing,Chain-Link Mesh,${meshLen},${csvCell(items.chainLinkMesh.unit)}`);
  if (items.rrmWall.enabled) rows.push(`Fencing,RRM Foundation Wall,${rrmVol.toFixed(2)},${csvCell(items.rrmWall.unit)}`);
  if (items.roadMeasurement.enabled) rows.push(`Road,Road Alignment (W: ${roadWidth}${lengthUnit}),${roadLen},${csvCell(items.roadMeasurement.unit)}`);
  if (items.sideDrain.enabled) rows.push(`Road,Road Side Drain,${sideDrainLen},${csvCell(items.sideDrain.unit)}`);
  enabledCustom.forEach(c => rows.push(`${csvCell(c.category)},${csvCell(c.name)},${c.quantity},${csvCell(c.unit)}`));

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const safeBase = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'site_report';
  const fileName = `${safeBase}_report_${new Date().toISOString().split('T')[0]}.csv`;

  const { boundary, body } = buildMultipartBody(
    {
      name: fileName,
      mimeType: 'text/csv',
      description: `SitePro audit report for ${project.name}`,
      appProperties: {
        app: 'sitepro',
        kind: 'report',
      },
    },
    csvContent,
    'text/csv'
  );

  const res = await handleDriveResponse(
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size,appProperties', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })
  );
  return res.json();
}
