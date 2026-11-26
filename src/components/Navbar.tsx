import React from 'react';
import { ConstructionProject } from '../types';
import { 
  Settings, 
  Compass,
  FileSpreadsheet,
  ShieldCheck,
  Building2,
  MapPin,
  LayoutDashboard,
  Cloud,
  Wifi,
  WifiOff
} from 'lucide-react';

interface NavbarProps {
  project: ConstructionProject;
  activeTab: 'audit' | 'overview';
  setActiveTab: (tab: 'audit' | 'overview') => void;
  onOpenSettings: () => void;
  onOpenNewProject: () => void;
  onOpenDrive: () => void;
  isDriveConnected?: boolean;
  onExportCsv: () => void;
  gpsStatus: 'idle' | 'locating' | 'success' | 'error';
  currentGps?: { lat: number; lng: number; accuracy?: number };
  onRequestGps: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  project,
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenNewProject,
  onOpenDrive,
  isDriveConnected = false,
  onExportCsv,
  gpsStatus,
  currentGps,
  onRequestGps,
}) => {
  const [isOnline, setIsOnline] = React.useState<boolean>(() => navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      <header
        className={`bg-slate-900 text-white shadow-sm md:sticky md:top-3 z-40 border border-slate-800 rounded-2xl mx-auto transition-all w-[calc(100%-1.5rem)] sm:w-[calc(100%-3rem)] lg:w-[calc(100%-4rem)] ${
          activeTab === 'audit'
            ? 'max-w-4xl'
            : 'max-w-[calc(80rem-2rem)] sm:max-w-[calc(80rem-3rem)] lg:max-w-[calc(80rem-4rem)]'
        }`}
      >
        <div className="w-full px-3.5 sm:px-6">
          <div className="flex items-center justify-between gap-2.5 sm:gap-3 py-2.5 sm:py-3">
            
            {/* Brand & Active Site */}
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
              <div className="bg-amber-500 text-slate-950 p-2 rounded-xl flex items-center justify-center flex-shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="font-bold text-sm sm:text-base text-white tracking-tight truncate">
                    {project.name}
                  </h1>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                  <span>SitePro</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>{project.clientName || 'General'}</span>
                  <span className="hidden sm:inline" aria-hidden="true"> &middot; </span>
                  <span className="hidden sm:inline">{project.location || 'On-site'}</span>
                </p>
              </div>
            </div>

            {/* Utility Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onRequestGps}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] md:min-w-0 px-2.5 md:px-3 py-2 rounded-xl text-xs font-medium transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  gpsStatus === 'success'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
                title="Refresh GPS Location"
                aria-label="Refresh GPS Location"
              >
                <MapPin className="w-4 h-4 md:w-3.5 md:h-3.5" />
                <span className="hidden md:inline tabular-nums">
                  {gpsStatus === 'success' && currentGps
                    ? `${currentGps.lat.toFixed(2)}, ${currentGps.lng.toFixed(2)}`
                    : gpsStatus === 'locating'
                    ? 'Locating...'
                    : 'GPS'}
                </span>
              </button>

              <div
                className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium border ${
                  isOnline
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                }`}
                title={isOnline ? 'Online & Local Storage Synced' : 'Offline Mode (Local Storage Active)'}
              >
                {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-amber-400" />}
                <span className="text-[11px] font-semibold">{isOnline ? 'Synced' : 'Offline'}</span>
              </div>

              <button
                type="button"
                onClick={onExportCsv}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Export Excel Report"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export</span>
              </button>

              <button
                type="button"
                onClick={onOpenDrive}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-0 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold border transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  isDriveConnected
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                }`}
                title="Save or Restore with Google Drive"
                aria-label="Google Drive Backup"
              >
                <Cloud className={`w-4 h-4 ${isDriveConnected ? 'text-emerald-400' : 'text-sky-400'}`} />
                <span className="hidden sm:inline">Drive</span>
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-0 px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Settings: Units & Necessary Items"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Settings</span>
              </button>

              <button
                type="button"
                onClick={onOpenNewProject}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-0 px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold border border-slate-700 transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                title="Manage Sites"
                aria-label="Manage Sites"
              >
                <Building2 className="w-4 h-4" />
                <span className="hidden sm:inline">Sites</span>
              </button>
            </div>
          </div>

          {/* Desktop/Tablet Navigation Tabs - Auditor & Overview */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-2 border-t border-slate-800/90 py-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                activeTab === 'audit'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Auditor</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                activeTab === 'overview'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Fixed Bottom Thumb Navigation Bar (15% viewport height cap compliant: 64px) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-2 h-16 px-2 gap-1.5 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`min-h-[48px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              activeTab === 'audit'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[11px] font-semibold tracking-tight leading-none">Auditor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-[48px] h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[11px] font-semibold tracking-tight leading-none">Overview</span>
          </button>
        </div>
      </nav>
    </>
  );
};
