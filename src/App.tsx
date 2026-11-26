import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConstructionProject, GpsCoordinate } from './types';
import { INITIAL_DEMO_PROJECT } from './utils/geo';
import {
  getLatestProjectTimestamp,
  loadActiveProjectIdSync,
  loadActiveTabSync,
  loadInitialProjectsSync,
  persistProjectsToDevice,
  persistProjectsToLocalStorageSync,
  PROJECTS_STORAGE_KEY,
  readProjectsFromIndexedDB,
  requestPersistentDeviceStorage,
  saveActiveProjectId,
  saveActiveTab,
} from './utils/deviceStorage';
import { exportProjectToExcel } from './utils/export';
import { StaticMapScope } from './utils/staticMap';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { SiteManagerModal } from './components/SiteManagerModal';
import { SimpleAuditDashboard } from './components/SimpleAuditDashboard';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ExportReportModal } from './components/ExportReportModal';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const initialLoadRef = useRef<{ projects: ConstructionProject[]; fromStorage: boolean } | null>(null);
  if (!initialLoadRef.current) {
    initialLoadRef.current = loadInitialProjectsSync();
  }

  const [savedProjects, setSavedProjects] = useState<ConstructionProject[]>(
    () => initialLoadRef.current!.projects
  );

  const [activeProjectId, setActiveProjectId] = useState<string>(
    () => loadActiveProjectIdSync(initialLoadRef.current!.projects)
  );

  const project = savedProjects.find(p => p.id === activeProjectId) || savedProjects[0] || INITIAL_DEMO_PROJECT;

  const [activeTab, setActiveTab] = useState<'audit' | 'overview'>(() => loadActiveTabSync());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSiteManagerOpen, setIsSiteManagerOpen] = useState<boolean>(false);
  const [isDriveOpen, setIsDriveOpen] = useState<boolean>(false);
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(false);
  const [exportReportState, setExportReportState] = useState<{ isOpen: boolean; scope: StaticMapScope }>({
    isOpen: false,
    scope: 'all',
  });

  // Toast state for localStorage save confirmation
  const [saveToast, setSaveToast] = useState<{ visible: boolean; type: 'success' | 'error'; message: string }>({
    visible: false,
    type: 'success',
    message: '',
  });
  const prevSavedProjectsRef = useRef<ConstructionProject[]>(savedProjects);
  const toastTimerRef = useRef<number | null>(null);

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'success' | 'error'>('idle');
  const [currentGps, setCurrentGps] = useState<{ lat: number; lng: number; accuracy?: number } | undefined>(undefined);
  const currentGpsRef = useRef(currentGps);
  currentGpsRef.current = currentGps;
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const showSaveToast = (type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setSaveToast({ visible: true, type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setSaveToast(prev => ({ ...prev, visible: false }));
      toastTimerRef.current = null;
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Hydrate from IndexedDB if localStorage was cleared/empty or older, and request persistent device storage
  useEffect(() => {
    let cancelled = false;
    void requestPersistentDeviceStorage();

    void (async () => {
      const idbProjects = await readProjectsFromIndexedDB();
      if (cancelled || !idbProjects || idbProjects.length === 0) return;

      const hadLocal = initialLoadRef.current?.fromStorage ?? false;
      const localLatest = getLatestProjectTimestamp(initialLoadRef.current?.projects ?? []);
      const idbLatest = getLatestProjectTimestamp(idbProjects);

      if (!hadLocal || idbLatest > localLatest) {
        prevSavedProjectsRef.current = idbProjects;
        setSavedProjects(idbProjects);
        setActiveProjectId((currId) =>
          idbProjects.some((p) => p.id === currId) ? currId : idbProjects[0].id
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist active site & tab on local device
  useEffect(() => {
    saveActiveProjectId(project.id);
  }, [project.id]);

  useEffect(() => {
    saveActiveTab(activeTab);
  }, [activeTab]);

  // Cross-tab localStorage synchronization
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROJECTS_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            prevSavedProjectsRef.current = parsed;
            setSavedProjects(parsed);
          }
        } catch {
          // Ignore malformed storage event
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Save projects to local device (localStorage + IndexedDB) on change
  useEffect(() => {
    const hasChanged = prevSavedProjectsRef.current !== savedProjects;
    prevSavedProjectsRef.current = savedProjects;
    let active = true;

    void persistProjectsToDevice(savedProjects).then(({ ok, usedIndexedDbOnly }) => {
      if (!active || !hasChanged) return;
      if (ok) {
        showSaveToast(
          'success',
          usedIndexedDbOnly
            ? 'Saved to local device (IndexedDB)'
            : 'Saved to local device'
        );
      } else {
        showSaveToast('error', 'Could not save to local device storage');
      }
    });

    return () => {
      active = false;
    };
  }, [savedProjects]);

  useEffect(() => {
    const flushToLocal = () => {
      persistProjectsToLocalStorageSync(prevSavedProjectsRef.current);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushToLocal();
      }
    };
    window.addEventListener('pagehide', flushToLocal);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushToLocal);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Request GPS position
  const handleRequestGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsStatus('success');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleCaptureFreshGps = useCallback((): Promise<GpsCoordinate | undefined> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(currentGpsRef.current ? { ...currentGpsRef.current, timestamp: Date.now() } : undefined);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coord: GpsCoordinate = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: Date.now(),
          };
          setCurrentGps({ lat: coord.lat, lng: coord.lng, accuracy: coord.accuracy });
          setGpsStatus('success');
          resolve(coord);
        },
        () => {
          resolve(currentGpsRef.current ? { ...currentGpsRef.current, timestamp: Date.now() } : undefined);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 4000 }
      );
    });
  }, []);

  useEffect(() => {
    handleRequestGps();
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsStatus('success');
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [handleRequestGps]);

  const handleUpdateProject = useCallback((updated: ConstructionProject) => {
    setSavedProjects(prev => {
      const next = prev.map(p => p.id === updated.id ? updated : p);
      persistProjectsToLocalStorageSync(next);
      return next;
    });
  }, []);

  const handlePatchProject = useCallback(
    (projectId: string, updater: (latest: ConstructionProject) => ConstructionProject) => {
      setSavedProjects(prev => {
        const next = prev.map(p => p.id === projectId ? updater(p) : p);
        persistProjectsToLocalStorageSync(next);
        return next;
      });
    },
    []
  );

  const handleRestoreFromDrive = (incoming: ConstructionProject[], mode: 'merge' | 'replace') => {
    if (incoming.length === 0) return;
    if (mode === 'replace') {
      persistProjectsToLocalStorageSync(incoming);
      setSavedProjects(incoming);
      setActiveProjectId(incoming[0].id);
      return;
    }
    setSavedProjects((prev) => {
      const merged = [...prev];
      incoming.forEach((item) => {
        const idx = merged.findIndex((p) => p.id === item.id);
        if (idx >= 0) {
          merged[idx] = item;
        } else {
          merged.push(item);
        }
      });
      persistProjectsToLocalStorageSync(merged);
      return merged;
    });
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] pt-2.5 sm:pt-3 pb-24 md:pb-10 text-slate-900 font-sans selection:bg-amber-500 selection:text-slate-950">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm mb-2">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      
      {/* Navigation Header */}
      <Navbar
        project={project}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNewProject={() => setIsSiteManagerOpen(true)}
        onOpenDrive={() => setIsDriveOpen(true)}
        isDriveConnected={isDriveConnected}
        onExportCsv={() => exportProjectToExcel(project)}
        gpsStatus={gpsStatus}
        currentGps={currentGps}
        onRequestGps={handleRequestGps}
      />

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {activeTab === 'audit' && (
          <SimpleAuditDashboard
            project={project}
            onUpdateProject={handleUpdateProject}
            onPatchProject={handlePatchProject}
            savedProjects={savedProjects}
            onSwitchProject={(p) => setActiveProjectId(p.id)}
            onOpenSiteManager={() => setIsSiteManagerOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenReport={(scope = 'all') => setExportReportState({ isOpen: true, scope })}
            onCaptureGps={handleCaptureFreshGps}
            currentGps={currentGps}
          />
        )}

        {activeTab === 'overview' && (
          <DashboardOverview
            project={project}
            setActiveTab={setActiveTab}
            onUpdateProject={handleUpdateProject}
            onPatchProject={handlePatchProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenReport={(scope = 'all') => setExportReportState({ isOpen: true, scope })}
            currentGps={currentGps}
          />
        )}
      </main>

      {/* Settings Modal */}
      <ProjectSettingsModal
        project={project}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateProject={handleUpdateProject}
      />

      {/* Site Manager Modal */}
      <SiteManagerModal
        isOpen={isSiteManagerOpen}
        onClose={() => setIsSiteManagerOpen(false)}
        currentProject={project}
        savedProjects={savedProjects}
        onSwitchProject={(p) => {
          setActiveProjectId(p.id);
          setIsSiteManagerOpen(false);
        }}
        onCreateProject={(newProj) => {
          setSavedProjects(prev => [newProj, ...prev]);
          setActiveProjectId(newProj.id);
          setIsSiteManagerOpen(false);
        }}
        onDeleteProject={(id) => {
          const remaining = savedProjects.filter(p => p.id !== id);
          if (remaining.length > 0) {
            setSavedProjects(remaining);
            if (activeProjectId === id) setActiveProjectId(remaining[0].id);
          }
        }}
        onRestoreProjects={handleRestoreFromDrive}
      />

      {/* Google Drive Backup & Sync Modal */}
      <GoogleDriveModal
        isOpen={isDriveOpen}
        onClose={() => setIsDriveOpen(false)}
        currentProject={project}
        savedProjects={savedProjects}
        onRestoreProjects={handleRestoreFromDrive}
        onDriveAuthChange={(_user, connected) => setIsDriveConnected(connected)}
      />

      {/* Exported Report & Real-Time Map Preview Modal */}
      <ExportReportModal
        isOpen={exportReportState.isOpen}
        onClose={() => setExportReportState(prev => ({ ...prev, isOpen: false }))}
        project={project}
        onUpdateProject={handleUpdateProject}
        scope={exportReportState.scope}
        onChangeScope={(scope) => setExportReportState(prev => ({ ...prev, scope }))}
        currentGps={currentGps}
      />

      {/* Local Storage Save Toast */}
      {saveToast.visible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-auto sm:right-6 z-50 flex justify-center sm:justify-end pointer-events-none"
        >
          <div
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-xs sm:text-sm font-semibold transition-all ${
              saveToast.type === 'success'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-rose-600 text-white border-rose-500'
            }`}
          >
            {saveToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-200 flex-shrink-0" />
            )}
            <span>{saveToast.message}</span>
            <button
              type="button"
              onClick={() => setSaveToast(prev => ({ ...prev, visible: false }))}
              aria-label="Dismiss notification"
              className="ml-1 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
