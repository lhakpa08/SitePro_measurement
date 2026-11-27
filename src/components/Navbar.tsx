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
} from 'lucide-react';
import { AppTab } from '../utils/deviceStorage';

interface NavbarProps {
  project: ConstructionProject;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
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
  gpsStatus,
  currentGps,
  onRequestGps,
}) => {
  return (
    <>
      <header className="bg-white border-b border-slate-200 md:sticky md:top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Bar Row */}
          <div className="flex items-center justify-between gap-4 py-3">
            {/* Brand & Active Site */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-bold text-sm sm:text-base text-slate-900 tracking-tight truncate leading-tight">
                  {project.name}
                </h1>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  <span className="font-medium text-slate-700">SitePro</span>
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
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                  gpsStatus === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
                title="Refresh GPS Location"
                aria-label="Refresh GPS Location"
              >
                <MapPin className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${gpsStatus === 'success' ? 'text-emerald-600' : 'text-slate-500'}`} />
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
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                  isDriveConnected
                    ? 'bg-emerald-50 hover:bg-emerald-100/70 text-emerald-800 border-emerald-200'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
                title="Save or Restore with Google Drive"
                aria-label="Google Drive Backup"
              >
                <Cloud className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${isDriveConnected ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">Drive</span>
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-200 transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                title="Settings: Units & Necessary Items"
                aria-label="Settings"
              >
                <Settings className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Settings</span>
              </button>

              <button
                type="button"
                onClick={onOpenNewProject}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-0 px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                title="Manage Sites"
                aria-label="Manage Sites"
              >
                <Building2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Sites</span>
              </button>
            </div>
          </div>

          {/* Desktop/Tablet Primary Navigation Tabs */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`py-2.5 px-1 border-b-2 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                activeTab === 'audit'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Auditor</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`py-2.5 px-1 border-b-2 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                activeTab === 'overview'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('entity')}
              className={`py-2.5 px-1 border-b-2 text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                activeTab === 'entity'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 h-16 px-2 gap-1 items-center">
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`min-h-[48px] h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
              activeTab === 'audit'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[11px] font-semibold tracking-tight leading-none">Auditor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`min-h-[48px] h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[11px] font-semibold tracking-tight leading-none">Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('entity')}
            className={`min-h-[48px] h-12 rounded-lg flex flex-col items-center justify-center gap-1 px-1 transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
              activeTab === 'entity'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span className="text-[10.5px] sm:text-[11px] font-semibold tracking-tight leading-none truncate max-w-full">
              Entity Meas.
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
