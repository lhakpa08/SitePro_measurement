import { ConstructionProject } from '../types';
import { INITIAL_DEMO_PROJECT } from './geo';

export const PROJECTS_STORAGE_KEY = 'sitepro_projects_list';
export const LEGACY_PROJECT_STORAGE_KEY = 'sitepro_project_data';
export const ACTIVE_PROJECT_ID_KEY = 'sitepro_active_project_id';
export const ACTIVE_TAB_KEY = 'sitepro_active_tab';
export const THEME_STORAGE_KEY = 'sitepro_theme';

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
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.fencePosts) &&
    Array.isArray(candidate.fenceMeshSegments) &&
    Array.isArray(candidate.rrmWalls) &&
    Array.isArray(candidate.roadSections)
  );
}

export function deduplicateProjectsById(
  projects: unknown[]
): ConstructionProject[] {
  const byId = new Map<string, ConstructionProject>();
  const order: string[] = [];
  for (const item of projects) {
    if (!isValidProjectShape(item)) continue;
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      order.push(item.id);
    } else {
      const existingTs = Math.max(existing.updatedAt || 0, existing.createdAt || 0);
      const nextTs = Math.max(item.updatedAt || 0, item.createdAt || 0);
      if (nextTs >= existingTs) {
        byId.set(item.id, item);
      }
    }
  }
  return order.map((id) => byId.get(id)!);
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
        const valid = deduplicateProjectsById(parsed);
        if (valid.length > 0) {
          if (valid.length < parsed.length) {
            persistProjectsToLocalStorageSync(valid);
          }
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

export type AppTab = 'audit' | 'overview' | 'entity';

export function loadActiveTabSync(): AppTab {
  try {
    const saved = localStorage.getItem(ACTIVE_TAB_KEY);
    if (saved === 'audit' || saved === 'overview' || saved === 'entity') return saved;
  } catch {
    // Ignore
  }
  return 'audit';
}

export function saveActiveTab(tab: AppTab): void {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {
    // Ignore
  }
}

export type ThemeMode = 'light' | 'dark';

export function loadThemeSync(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore
  }
  return 'light';
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
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

let pendingIdbProjects: ConstructionProject[] | null = null;
let pendingIdbResolvers: Array<(ok: boolean) => void> = [];
let idbWriteRunning = false;

async function writeSingleBatchToIndexedDB(projects: ConstructionProject[]): Promise<boolean> {
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

async function flushIdbWriteQueue(): Promise<void> {
  if (idbWriteRunning) return;
  idbWriteRunning = true;
  try {
    while (pendingIdbProjects !== null) {
      const batch = pendingIdbProjects;
      const resolvers = pendingIdbResolvers;
      pendingIdbProjects = null;
      pendingIdbResolvers = [];
      const ok = await writeSingleBatchToIndexedDB(batch);
      resolvers.forEach((r) => r(ok));
    }
  } finally {
    idbWriteRunning = false;
  }
}

function writeProjectsToIndexedDB(
  projects: ConstructionProject[],
  alreadyClean = false
): Promise<boolean> {
  const clean = alreadyClean ? projects : deduplicateProjectsById(projects);
  return new Promise((resolve) => {
    pendingIdbProjects = clean;
    pendingIdbResolvers.push(resolve);
    void flushIdbWriteQueue();
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
          const valid = deduplicateProjectsById(res);
          if (valid.length > 0 && valid.length < res.length) {
            void writeProjectsToIndexedDB(valid, true);
          }
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
  projects: ConstructionProject[],
  alreadyClean = false
): boolean {
  try {
    const clean = alreadyClean ? projects : deduplicateProjectsById(projects);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export async function persistProjectsToDevice(
  projects: ConstructionProject[],
  options: { skipLocalStorage?: boolean; alreadyClean?: boolean } = {}
): Promise<{ ok: boolean; usedIndexedDbOnly: boolean }> {
  const clean = options.alreadyClean ? projects : deduplicateProjectsById(projects);
  const lsOk = options.skipLocalStorage
    ? true
    : persistProjectsToLocalStorageSync(clean, true);
  const idbOk = await writeProjectsToIndexedDB(clean, true);
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

  const validProjects = deduplicateProjectsById(list);
  if (validProjects.length === 0) {
    throw new Error('No valid SitePro project records were found in this backup file.');
  }
  return validProjects;
}
