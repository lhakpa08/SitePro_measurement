import React, { useState, useEffect, useRef } from 'react';
import { ConstructionProject } from './types';
import { INITIAL_DEMO_PROJECT } from './utils/geo';
import { exportProjectToExcel } from './utils/export';
import { Navbar } from './components/Navbar';
import { DashboardOverview } from './components/DashboardOverview';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { SiteManagerModal } from './components/SiteManagerModal';
import { SimpleAuditDashboard } from './components/SimpleAuditDashboard';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [savedProjects, setSavedProjects] = useState<ConstructionProject[]>(() => {
    const savedList = localStorage.getItem('sitepro_projects_list');
    if (savedList) {
      try {
        const parsed = JSON.parse(savedList);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    const legacy = localStorage.getItem('sitepro_project_data');
    if (legacy) {
      try {
        return [JSON.parse(legacy)];
      } catch (e) {}
    }
    return [INITIAL_DEMO_PROJECT];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return savedProjects[0]?.id || INITIAL_DEMO_PROJECT.id;
  });

  const project = savedProjects.find(p => p.id === activeProjectId) || savedProjects[0] || INITIAL_DEMO_PROJECT;

  const [activeTab, setActiveTab] = useState<'audit' | 'overview'>('audit');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSiteManagerOpen, setIsSiteManagerOpen] = useState<boolean>(false);
  const [isDriveOpen, setIsDriveOpen] = useState<boolean>(false);
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(false);

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

  // Save projects to localStorage on change and show confirmation toast after user edits
  useEffect(() => {
    const hasChanged = prevSavedProjectsRef.current !== savedProjects;
    prevSavedProjectsRef.current = savedProjects;
    try {
      localStorage.setItem('sitepro_projects_list', JSON.stringify(savedProjects));
      if (hasChanged) {
        showSaveToast('success', 'Project data saved to local storage');
      }
    } catch {
      if (hasChanged) {
        showSaveToast('error', 'Could not save to local storage (storage full)');
      }
    }
  }, [savedProjects]);

  // Request GPS position
  const handleRequestGps = () => {
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
  };

  useEffect(() => {
    handleRequestGps();
  }, []);

  const handleUpdateProject = (updated: ConstructionProject) => {
    setSavedProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleRestoreFromDrive = (incoming: ConstructionProject[], mode: 'merge' | 'replace') => {
    if (incoming.length === 0) return;
    if (mode === 'replace') {
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
            savedProjects={savedProjects}
            onSwitchProject={(p) => setActiveProjectId(p.id)}
            onOpenSiteManager={() => setIsSiteManagerOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            currentGps={currentGps}
          />
        )}

        {activeTab === 'overview' && (
          <DashboardOverview
            project={project}
            setActiveTab={setActiveTab}
            onUpdateProject={handleUpdateProject}
            onOpenSettings={() => setIsSettingsOpen(true)}
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
