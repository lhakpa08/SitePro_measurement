import React from 'react';
import { ConstructionProject } from '../types';
import {
  Settings,
  Compass,
  ShieldCheck,
  Building2,
  MapPin,
  LayoutDashboard,
  Scale,
  Cloud,
  Sun,
  Moon,
} from 'lucide-react';
import { AppTab, ThemeMode } from '../utils/deviceStorage';

interface NavbarProps {
  project: ConstructionProject;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
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
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenNewProject,
  onOpenDrive,
  isDriveConnected = false,
  gpsStatus,
  currentGps,
  onRequestGps,
}) => {
  const isDark = theme === 'dark';

  return (
    <>
      <header className="bg-white dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 md:sticky md:top-0 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Bar Row */}
          <div className="flex items-center justify-between gap-3 sm:gap-4 py-3">
            {/* Brand & Active Site */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg bg-slate-950 dark:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-bold text-sm sm:text-base text-slate-950 dark:text-white tracking-tight truncate leading-tight">
                  {project.name}
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                  <span className="font-semibold text-slate-900 dark:text-amber-400">SitePro</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>{project.clientName || 'General'}</span>
                  <span className="hidden sm:inline" aria-hidden="true"> &middot; </span>
                  <span className="hidden sm:inline">{project.location || 'On-site'}</span>
                </p>
              </div>
            </div>

            {/* Clean Workspace Utility Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={onRequestGps}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
                  gpsStatus === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/70'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                }`}
                title="Refresh GPS Location"
                aria-label="Refresh GPS Location"
              >
                <MapPin className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${gpsStatus === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`} />
                <span className="hidden md:inline tabular-nums">
                  {gpsStatus === 'success' && currentGps
                    ? `${currentGps.lat.toFixed(2)}, ${currentGps.lng.toFixed(2)}`
                    : gpsStatus === 'locating'
                    ? 'Locating...'
                    : 'GPS'}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenDrive}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
                  isDriveConnected
                    ? 'bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/70 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                }`}
                title="Save or Restore with Google Drive"
                aria-label="Google Drive Backup"
              >
                <Cloud className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${isDriveConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`} />
                <span className="hidden sm:inline">Drive</span>
              </button>

              <button
                type="button"
                onClick={onToggleTheme}
                aria-pressed={isDark}
                aria-label={isDark ? 'Switch to High-Contrast Light Mode' : 'Switch to High-Contrast Dark Mode'}
                title={isDark ? 'Switch to Light Mode (Daylight High Contrast)' : 'Switch to Dark Mode (Low Glare High Contrast)'}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-amber-300 text-xs font-semibold border border-slate-300 dark:border-slate-600 transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400"
              >
                {isDark ? (
                  <Sun className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-800" />
                )}
                <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold border border-slate-300 dark:border-slate-600 transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400"
                title="Settings: Units & Necessary Items"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-700 dark:text-slate-300" />
                <span className="hidden sm:inline">Settings</span>
              </button>

              <button
                type="button"
                onClick={onOpenNewProject}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-slate-950 dark:bg-amber-400 hover:bg-slate-800 dark:hover:bg-amber-300 text-white dark:text-slate-950 text-xs font-bold transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400"
                title="Manage Sites"
                aria-label="Manage Sites"
              >
                <Building2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-400 dark:text-slate-950" />
                <span className="hidden sm:inline">Sites</span>
              </button>
            </div>
          </div>

          {/* Desktop/Tablet Primary Navigation Tabs */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`py-2.5 px-1 border-b-2 text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
                activeTab === 'audit'
                  ? 'border-slate-950 dark:border-amber-400 text-slate-950 dark:text-amber-400'
                  : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Auditor</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`py-2.5 px-1 border-b-2 text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
                activeTab === 'overview'
                  ? 'border-slate-950 dark:border-amber-400 text-slate-950 dark:text-amber-400'
                  : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('entity')}
              className={`py-2.5 px-1 border-b-2 text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
                activeTab === 'entity'
                  ? 'border-slate-950 dark:border-amber-400 text-slate-950 dark:text-amber-400'
                  : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>Entity Measurements</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Fixed Bottom Thumb Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-300 dark:border-slate-700 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 h-16 px-2 gap-1 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`min-h-[48px] h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
              activeTab === 'audit'
                ? 'bg-slate-950 dark:bg-amber-400 text-white dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[11px] font-bold tracking-tight leading-none">Auditor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-[48px] h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
              activeTab === 'overview'
                ? 'bg-slate-950 dark:bg-amber-400 text-white dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[11px] font-bold tracking-tight leading-none">Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('entity')}
            className={`min-h-[48px] h-12 rounded-lg flex flex-col items-center justify-center gap-1 px-1 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:focus-visible:ring-amber-400 ${
              activeTab === 'entity'
                ? 'bg-slate-950 dark:bg-amber-400 text-white dark:text-slate-950'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span className="text-[10.5px] sm:text-[11px] font-bold tracking-tight leading-none truncate max-w-full">
              Entity Meas.
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
