import React, { useRef, useState } from 'react';
import { ConstructionProject } from '../types';
import { createDefaultProjectSettings } from '../utils/geo';
import {
  downloadLocalDeviceBackup,
  formatStorageBytes,
  getDeviceStorageFootprintBytes,
  parseLocalDeviceBackupFile,
} from '../utils/deviceStorage';
import { Building2, Plus, Trash2, X, ArrowRight, HardDrive, Download, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';

interface SiteManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: ConstructionProject;
  savedProjects: ConstructionProject[];
  onSwitchProject: (project: ConstructionProject) => void;
  onCreateProject: (newProj: ConstructionProject) => void;
  onDeleteProject: (projectId: string) => void;
  onRestoreProjects?: (projects: ConstructionProject[], mode: 'merge' | 'replace') => void;
}

export const SiteManagerModal: React.FC<SiteManagerModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  savedProjects,
  onSwitchProject,
  onCreateProject,
  onDeleteProject,
  onRestoreProjects,
}) => {
  const [newSiteName, setNewSiteName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ fileName: string; projects: ConstructionProject[] } | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;

    const newProj: ConstructionProject = {
      id: `site-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newSiteName.trim(),
      clientName: newClient.trim() || 'Client',
      location: newLocation.trim() || 'Site Location',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      fencePosts: [],
      fenceMeshSegments: [],
      rrmWalls: [],
      roadSections: [],
      inputLocations: [],
      entityMeasurements: [],
      settings: createDefaultProjectSettings(),
      auditNotes: '',
      auditInfo: {
        auditorName: '',
        auditDate: new Date().toISOString().split('T')[0],
        auditStatus: 'pending',
        generalRemarks: '',
        verifiedCustomItems: {},
      },
    };

    onCreateProject(newProj);
    setNewSiteName('');
    setNewClient('');
    setNewLocation('');
    setIsCreating(false);
  };

  const deviceBytes = getDeviceStorageFootprintBytes(savedProjects);

  const handleDownloadDeviceBackup = () => {
    const fileName = downloadLocalDeviceBackup(savedProjects);
    setDeviceNotice({
      type: 'success',
      text: `Saved "${fileName}" (${savedProjects.length} site${savedProjects.length === 1 ? '' : 's'}) to your device Downloads folder.`,
    });
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDeviceNotice(null);
    try {
      const parsed = await parseLocalDeviceBackupFile(file);
      setPendingImport({ fileName: file.name, projects: parsed });
    } catch (err) {
      setDeviceNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to read selected backup file.',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/90">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 pt-2.5 pb-4 sm:py-4 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2 bg-amber-400 rounded-xl text-slate-950 shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg tracking-tight truncate">Site Projects &amp; Multi-Site Manager</h3>
                <p className="text-xs text-slate-400 truncate">Switch between sites or add a new construction site</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close site manager"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto space-y-6 flex-1">
          
          {/* Create New Site Toggle / Form */}
          {!isCreating ? (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="w-full min-h-[46px] py-3 px-4 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-sm shadow-xs transition flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Construction Site</span>
            </button>
          ) : (
            <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-sm">Create New Site</h4>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="min-h-[36px] px-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Site / Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. East Expressway Perimeter & Road"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Client Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Municipal Dept"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Sector</label>
                  <input
                    type="text"
                    placeholder="e.g. Sector 7"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm shadow-xs transition"
              >
                Create &amp; Switch to New Site
              </button>
            </form>
          )}

          {/* Saved Sites List */}
          {(() => {
            const uniqueProjects = Array.from(
              new Map(savedProjects.map((proj) => [proj.id, proj])).values()
            );
            return (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700">All Saved Sites ({uniqueProjects.length})</h4>
            
            <div className="space-y-2.5">
              {uniqueProjects.map((proj) => {
                const isCurrent = proj.id === currentProject.id;
                const postCount = proj.fencePosts.length;
                const roadCount = proj.roadSections.length;
                const isConfirmingDelete = pendingDeleteId === proj.id;

                return (
                  <div
                    key={proj.id}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                      isCurrent
                        ? 'bg-amber-50/70 border-amber-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-bold text-slate-900 truncate">{proj.name}</span>
                        {isCurrent && (
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                            &middot; Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {proj.clientName} &middot; {proj.location} &middot; {postCount} Posts, {roadCount} Road Sections
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {!isCurrent && !isConfirmingDelete && (
                        <button
                          type="button"
                          onClick={() => onSwitchProject(proj)}
                          className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1.5"
                        >
                          <span>Switch</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {uniqueProjects.length > 1 && !isCurrent && (
                        isConfirmingDelete ? (
                          <div className="flex items-center space-x-1.5 flex-1 sm:flex-none">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteProject(proj.id);
                                setPendingDeleteId(null);
                              }}
                              className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[38px] px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(null)}
                              className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(proj.id)}
                            aria-label={`Delete ${proj.name}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                            title="Delete site"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
            );
          })()}

          {/* Local Device Storage & File Backup */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-900">Local Device Storage</h4>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Auto-saved on this device (localStorage + IndexedDB) &middot; {formatStorageBytes(deviceBytes)}
                  </p>
                </div>
              </div>
            </div>

            {deviceNotice && (
              <div
                className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${
                  deviceNotice.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {deviceNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span>{deviceNotice.text}</span>
              </div>
            )}

            {pendingImport && onRestoreProjects && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs text-slate-800">
                  <strong className="font-bold">Restore from &ldquo;{pendingImport.fileName}&rdquo;</strong> ({pendingImport.projects.length} site{pendingImport.projects.length === 1 ? '' : 's'})
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreProjects(pendingImport.projects, 'merge');
                      setDeviceNotice({
                        type: 'success',
                        text: `Merged ${pendingImport.projects.length} site(s) from "${pendingImport.fileName}" into local device storage.`,
                      });
                      setPendingImport(null);
                    }}
                    className="min-h-[38px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
                  >
                    Merge with Device Sites
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreProjects(pendingImport.projects, 'replace');
                      setDeviceNotice({
                        type: 'success',
                        text: `Replaced device workspace with ${pendingImport.projects.length} site(s) from "${pendingImport.fileName}".`,
                      });
                      setPendingImport(null);
                    }}
                    className="min-h-[38px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition"
                  >
                    Replace All Sites
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingImport(null)}
                    className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleDownloadDeviceBackup}
                className="flex-1 min-h-[42px] px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold rounded-xl text-xs transition inline-flex items-center justify-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Save Backup to Device (.json)</span>
              </button>

              {onRestoreProjects && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 min-h-[42px] px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold rounded-xl text-xs transition inline-flex items-center justify-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Load Backup from Device</span>
                  </button>
                </>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
