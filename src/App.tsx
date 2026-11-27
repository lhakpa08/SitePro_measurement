import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConstructionProject, GpsCoordinate } from './types';
import { INITIAL_DEMO_PROJECT } from './utils/geo';
import {
  AppTab,
  deduplicateProjectsById,
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
import { computeEntityAuditComparisons } from './utils/calculations';
import { exportProjectToExcel } from './utils/export';
import { StaticMapScope } from './utils/staticMap';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { SiteManagerModal } from './components/SiteManagerModal';
import { SimpleAuditDashboard } from './components/SimpleAuditDashboard';
import { EntityComparisonModule } from './components/EntityComparisonModule';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ExportReportModal } from './components/ExportReportModal';
import { CheckCircle2, AlertTriangle, X, Download, FileSpreadsheet } from 'lucide-react';

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

  const uniqueSavedProjects = useMemo(
    () => deduplicateProjectsById(savedProjects),
    [savedProjects]
  );

  const project = uniqueSavedProjects.find(p => p.id === activeProjectId) || uniqueSavedProjects[0] || INITIAL_DEMO_PROJECT;

  const [activeTab, setActiveTab] = useState<AppTab>(() => loadActiveTabSync());
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
  const latestProjectsRef = useRef<ConstructionProject[]>(savedProjects);
  latestProjectsRef.current = savedProjects;
  const userEditedBeforeHydrationRef = useRef<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);
  const idbDebounceRef = useRef<number | null>(null);
  const idbPendingRef = useRef<boolean>(false);

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

  const showSaveToast = useCallback((type: 'success' | 'error', message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setSaveToast({ visible: true, type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setSaveToast(prev => ({ ...prev, visible: false }));
      toastTimerRef.current = null;
    }, 2200);
  }, []);

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
      if (cancelled) return;

      const hadLocal = initialLoadRef.current?.fromStorage ?? false;
      const localLatest = getLatestProjectTimestamp(initialLoadRef.current?.projects ?? []);
      const idbLatest = idbProjects ? getLatestProjectTimestamp(idbProjects) : 0;

      if (
        !userEditedBeforeHydrationRef.current &&
        idbProjects &&
        idbProjects.length > 0 &&
        (!hadLocal || idbLatest > localLatest)
      ) {
        prevSavedProjectsRef.current = idbProjects;
        latestProjectsRef.current = idbProjects;
        persistProjectsToLocalStorageSync(idbProjects, true);
        setSavedProjects(idbProjects);
        setActiveProjectId((currId) =>
          idbProjects.some((p) => p.id === currId) ? currId : idbProjects[0].id
        );
      } else if (hadLocal && (!idbProjects || localLatest > idbLatest)) {
        // Ensure existing localStorage projects are mirrored into IndexedDB
        void persistProjectsToDevice(latestProjectsRef.current, {
          skipLocalStorage: true,
          alreadyClean: true,
        });
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
            const unique = deduplicateProjectsById(parsed);
            if (unique.length > 0) {
              prevSavedProjectsRef.current = unique;
              latestProjectsRef.current = unique;
              setSavedProjects(unique);
            }
          }
        } catch {
          // Ignore malformed storage event
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Save projects synchronously to localStorage on commit, and debounce IndexedDB + toast
  useEffect(() => {
    const hasChanged = prevSavedProjectsRef.current !== savedProjects;
    prevSavedProjectsRef.current = savedProjects;
    if (!hasChanged) return;

    userEditedBeforeHydrationRef.current = true;
    const localSyncOk = persistProjectsToLocalStorageSync(savedProjects, true);
    let active = true;

    if (idbDebounceRef.current !== null) {
      window.clearTimeout(idbDebounceRef.current);
    }
    idbPendingRef.current = true;

    idbDebounceRef.current = window.setTimeout(() => {
      idbDebounceRef.current = null;
      idbPendingRef.current = false;
      void persistProjectsToDevice(latestProjectsRef.current, {
        skipLocalStorage: true,
        alreadyClean: true,
      }).then((idbRes) => {
        if (!active) return;
        const ok = localSyncOk || idbRes.ok;
        const usedIndexedDbOnly = !localSyncOk && idbRes.ok;
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
    }, 350);

    return () => {
      active = false;
    };
  }, [savedProjects, showSaveToast]);

  useEffect(() => {
    const flushPendingPersist = () => {
      persistProjectsToLocalStorageSync(latestProjectsRef.current, true);
      if (idbDebounceRef.current !== null) {
        window.clearTimeout(idbDebounceRef.current);
        idbDebounceRef.current = null;
      }
      if (idbPendingRef.current) {
        idbPendingRef.current = false;
        void persistProjectsToDevice(latestProjectsRef.current, {
          skipLocalStorage: true,
          alreadyClean: true,
        });
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingPersist();
      }
    };
    window.addEventListener('beforeunload', flushPendingPersist);
    window.addEventListener('pagehide', flushPendingPersist);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', flushPendingPersist);
      window.removeEventListener('pagehide', flushPendingPersist);
      document.removeEventListener('visibilitychange', handleVisibility);
      flushPendingPersist();
    };
  }, []);

  const updateGpsState = useCallback((lat: number, lng: number, accuracy?: number) => {
    setCurrentGps(prev => {
      if (prev && prev.lat === lat && prev.lng === lng && prev.accuracy === accuracy) {
        return prev;
      }
      return { lat, lng, accuracy };
    });
    setGpsStatus(prev => (prev === 'success' ? prev : 'success'));
  }, []);

  // Request GPS position
  const handleRequestGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateGpsState(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [updateGpsState]);

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
          updateGpsState(coord.lat, coord.lng, coord.accuracy);
          resolve(coord);
        },
        () => {
          resolve(currentGpsRef.current ? { ...currentGpsRef.current, timestamp: Date.now() } : undefined);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 4000 }
      );
    });
  }, [updateGpsState]);

  useEffect(() => {
    handleRequestGps();
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        updateGpsState(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [handleRequestGps, updateGpsState]);

  const handleUpdateProject = useCallback((updated: ConstructionProject) => {
    userEditedBeforeHydrationRef.current = true;
    setSavedProjects(prev => {
      const next = deduplicateProjectsById(prev.map(p => p.id === updated.id ? updated : p));
      latestProjectsRef.current = next;
      return next;
    });
  }, []);

  const handlePatchProject = useCallback(
    (projectId: string, updater: (latest: ConstructionProject) => ConstructionProject) => {
      userEditedBeforeHydrationRef.current = true;
      setSavedProjects(prev => {
        const next = deduplicateProjectsById(prev.map(p => p.id === projectId ? updater(p) : p));
        latestProjectsRef.current = next;
        return next;
      });
    },
    []
  );

  const handleSwitchProject = useCallback((targetId: string) => {
    saveActiveProjectId(targetId);
    setIsSettingsOpen(false);
    setExportReportState({ isOpen: false, scope: 'all' });
    setActiveProjectId(targetId);
  }, []);

  const handleRestoreFromDrive = (incoming: ConstructionProject[], mode: 'merge' | 'replace') => {
    const uniqueIncoming = deduplicateProjectsById(incoming);
    if (uniqueIncoming.length === 0) return;
    userEditedBeforeHydrationRef.current = true;
    if (mode === 'replace') {
      latestProjectsRef.current = uniqueIncoming;
      setSavedProjects(uniqueIncoming);
      handleSwitchProject(uniqueIncoming[0].id);
      return;
    }
    setSavedProjects((prev) => {
      const merged = deduplicateProjectsById(prev);
      uniqueIncoming.forEach((item) => {
        const idx = merged.findIndex((p) => p.id === item.id);
        if (idx >= 0) {
          merged[idx] = item;
        } else {
          merged.push(item);
        }
      });
      latestProjectsRef.current = merged;
      return merged;
    });
  };

  const entityTabSummary = useMemo(() => {
    if (activeTab !== 'entity') {
      return { total: 0, matched: 0, excess: 0, underpayment: 0 };
    }
    const entityComparisons = computeEntityAuditComparisons(project, 'all');
    return {
      total: entityComparisons.length,
      excess: entityComparisons.filter(
        (r) => r.status === 'excess' || (r.status as string) === 'shortfall'
      ).length,
      underpayment: entityComparisons.filter((r) => r.status === 'underpayment').length,
      matched: entityComparisons.filter((r) => r.status === 'matched').length,
    };
  }, [activeTab, project]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 md:pb-12 text-slate-900 font-sans selection:bg-amber-400 selection:text-slate-950">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50">
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6">
        {activeTab === 'audit' && (
          <SimpleAuditDashboard
            key={`audit-${project.id}`}
            project={project}
            onUpdateProject={handleUpdateProject}
            onPatchProject={handlePatchProject}
            savedProjects={uniqueSavedProjects}
            onSwitchProject={(p) => handleSwitchProject(p.id)}
            onOpenSiteManager={() => setIsSiteManagerOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenReport={(scope = 'all') => setExportReportState({ isOpen: true, scope })}
            onCaptureGps={handleCaptureFreshGps}
            currentGps={currentGps}
          />
        )}

        {activeTab === 'overview' && (
          <DashboardOverview
            key={`overview-${project.id}`}
            project={project}
            setActiveTab={setActiveTab}
            onUpdateProject={handleUpdateProject}
            onPatchProject={handlePatchProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenReport={(scope = 'all') => setExportReportState({ isOpen: true, scope })}
            currentGps={currentGps}
          />
        )}

        {activeTab === 'entity' && (
            <div className="space-y-5 pb-4">
              <div className="bg-white rounded-xl p-5 sm:p-6 border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 mb-5 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500 mb-1">
                      {project.name} &middot; Measurement Reconciliation
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                      Entity Measurements vs. Audit Verification
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1 tabular-nums">
                      {entityTabSummary.total === 0
                        ? 'Compare entity-claimed Nos, Length, Width & Thickness against audit verification'
                        : `${entityTabSummary.total} item${entityTabSummary.total === 1 ? '' : 's'} · ${entityTabSummary.matched} matched · ${entityTabSummary.excess} excess${entityTabSummary.underpayment > 0 ? ` · ${entityTabSummary.underpayment} underpayment` : ''}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => exportProjectToExcel(project)}
                      className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportReportState({ isOpen: true, scope: 'all' })}
                      className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export PDF</span>
                    </button>
                  </div>
                </div>

                <EntityComparisonModule
                  key={`entity-${project.id}`}
                  project={project}
                  onUpdateProject={handleUpdateProject}
                  onPatchProject={handlePatchProject}
                />
              </div>
            </div>
        )}
      </main>

      {/* Settings Modal */}
      <ProjectSettingsModal
        key={`settings-${project.id}`}
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
        savedProjects={uniqueSavedProjects}
        onSwitchProject={(p) => {
          handleSwitchProject(p.id);
          setIsSiteManagerOpen(false);
        }}
        onCreateProject={(newProj) => {
          userEditedBeforeHydrationRef.current = true;
          setSavedProjects(prev => {
            const next = deduplicateProjectsById([newProj, ...prev]);
            latestProjectsRef.current = next;
            return next;
          });
          handleSwitchProject(newProj.id);
          setIsSiteManagerOpen(false);
        }}
        onDeleteProject={(id) => {
          userEditedBeforeHydrationRef.current = true;
          const remainingNow = latestProjectsRef.current.filter(p => p.id !== id);
          if (remainingNow.length === 0) return;
          setSavedProjects(prev => {
            const remaining = prev.filter(p => p.id !== id);
            if (remaining.length === 0) return prev;
            latestProjectsRef.current = remaining;
            return remaining;
          });
          if (activeProjectId === id) {
            handleSwitchProject(remainingNow[0].id);
          }
        }}
        onRestoreProjects={handleRestoreFromDrive}
      />

      {/* Google Drive Backup & Sync Modal */}
      <GoogleDriveModal
        isOpen={isDriveOpen}
        onClose={() => setIsDriveOpen(false)}
        currentProject={project}
        savedProjects={uniqueSavedProjects}
        onRestoreProjects={handleRestoreFromDrive}
        onDriveAuthChange={(_user, connected) => setIsDriveConnected(connected)}
      />

      {/* Exported Report & Real-Time Map Preview Modal */}
      <ExportReportModal
        key={`export-${project.id}`}
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
