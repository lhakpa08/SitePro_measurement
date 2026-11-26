import { ConstructionProject } from '../types';
import { INITIAL_DEMO_PROJECT } from './geo';

export const PROJECTS_STORAGE_KEY = 'sitepro_projects_list';
export const LEGACY_PROJECT_STORAGE_KEY = 'sitepro_project_data';
export const ACTIVE_PROJECT_ID_KEY = 'sitepro_active_project_id';
export const ACTIVE_TAB_KEY = 'sitepro_active_tab';

const IDB_NAME = 'sitepro_device_db';
const IDB_VERSION = 1;
const IDB_STORE = 'app_data';
const IDB_PROJECTS_KEY = 'projects_v1';

export interface DeviceBackupPayload {
  format: 'sitepro-backup-v1';
  exportedAt: string;
  projects: ConstructionProject[];
}

function isValidProjectShape(item: unknown): item is ConstructionProject {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<ConstructionProject>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.fencePosts) &&
    Array.isArray(candidate.fenceMeshSegments) &&
    Array.isArray(candidate.rrmWalls) &&
    Array.isArray(candidate.roadSections)
  );
}

export function loadInitialProjectsSync(): {
  projects: ConstructionProject[];
  fromStorage: boolean;
} {
  try {
    const savedList = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (savedList) {
      const parsed = JSON.parse(savedList);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(isValidProjectShape);
        if (valid.length > 0) {
          return { projects: valid, fromStorage: true };
        }
      }
    }
    const legacy = localStorage.getItem(LEGACY_PROJECT_STORAGE_KEY);
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (isValidProjectShape(parsedLegacy)) {
        return { projects: [parsedLegacy], fromStorage: true };
      }
    }
  } catch {
    // Fallback to initial project when localStorage is unavailable or corrupt
  }
  return { projects: [INITIAL_DEMO_PROJECT], fromStorage: false };
}

export function loadActiveProjectIdSync(projects: ConstructionProject[]): string {
  try {
    const savedId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
    if (savedId && projects.some((p) => p.id === savedId)) {
      return savedId;
    }
  } catch {
    // Ignore storage read errors
  }
  return projects[0]?.id || INITIAL_DEMO_PROJECT.id;
}

export function saveActiveProjectId(projectId: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_ID_KEY, projectId);
  } catch {
    // Ignore quota/privacy mode errors
  }
}

export function loadActiveTabSync(): 'audit' | 'overview' {
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    if (saved === 'audit' || saved === 'overview') return saved;
  } catch {
    // Ignore
  }
  return 'audit';
}

export function saveActiveTab(tab: 'audit' | 'overview'): void {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {
    // Ignore
  }
}

function openDeviceDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      resolve(null);
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeProjectsToIndexedDB(projects: ConstructionProject[]): Promise<boolean> {
  const db = await openDeviceDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(projects, IDB_PROJECTS_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
      tx.onabort = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

export async function readProjectsFromIndexedDB(): Promise<ConstructionProject[] | null> {
  const db = await openDeviceDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_PROJECTS_KEY);
      req.onsuccess = () => {
        db.close();
        const res = req.result;
        if (Array.isArray(res) && res.length > 0) {
          const valid = res.filter(isValidProjectShape);
          resolve(valid.length > 0 ? valid : null);
          return;
        }
        resolve(null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export function getLatestProjectTimestamp(projects: ConstructionProject[]): number {
  return projects.reduce((max, p) => Math.max(max, p.updatedAt || 0, p.createdAt || 0), 0);
}

export function persistProjectsToLocalStorageSync(
  projects: ConstructionProject[]
): boolean {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    return true;
  } catch {
    return false;
  }
}

export async function persistProjectsToDevice(
  projects: ConstructionProject[]
): Promise<{ ok: boolean; usedIndexedDbOnly: boolean }> {
  const lsOk = persistProjectsToLocalStorageSync(projects);
  const idbOk = await writeProjectsToIndexedDB(projects);
  return {
    ok: lsOk || idbOk,
    usedIndexedDbOnly: !lsOk && idbOk,
  };
}

export async function requestPersistentDeviceStorage(): Promise<boolean> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported environments
  }
  return false;
}

export function getDeviceStorageFootprintBytes(projects: ConstructionProject[]): number {
  try {
    return new Blob([JSON.stringify(projects)]).size;
  } catch {
    return JSON.stringify(projects).length * 2;
  }
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function downloadLocalDeviceBackup(
  projects: ConstructionProject[],
  fileNamePrefix = 'SitePro_Local_Backup'
): string {
  const payload: DeviceBackupPayload = {
    format: 'sitepro-backup-v1',
    exportedAt: new Date().toISOString(),
    projects,
  };
  const dateStamp = new Date().toISOString().split('T')[0];
  const fileName = `${fileNamePrefix}_${dateStamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return fileName;
}

export async function parseLocalDeviceBackupFile(file: File): Promise<ConstructionProject[]> {
  const rawText = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as { projects?: unknown };
    if (Array.isArray(obj.projects)) {
      list = obj.projects;
    } else if (isValidProjectShape(parsed)) {
      list = [parsed];
    }
  }

  const validProjects = list.filter(isValidProjectShape);
  if (validProjects.length === 0) {
    throw new Error('No valid SitePro project records were found in this backup file.');
  }
  return validProjects;
}
