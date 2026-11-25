import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import { ConstructionProject } from '../types';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  clearAccessToken,
  logout,
} from '../services/googleAuth';
import {
  DriveBackupFile,
  DriveAuthExpiredError,
  listDriveBackups,
  createDriveBackup,
  updateDriveBackup,
  downloadDriveBackup,
  deleteDriveFile,
  createDriveCsvReport,
} from '../services/googleDrive';
import {
  Cloud,
  X,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Save,
} from 'lucide-react';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: ConstructionProject;
  savedProjects: ConstructionProject[];
  onRestoreProjects: (projects: ConstructionProject[], mode: 'merge' | 'replace') => void;
  onDriveAuthChange?: (user: User | null, connected: boolean) => void;
}

type PendingAction =
  | { kind: 'overwrite'; file: DriveBackupFile; projects: ConstructionProject[] }
  | { kind: 'delete'; file: DriveBackupFile }
  | { kind: 'restore'; file: DriveBackupFile; projects: ConstructionProject[] };

function formatBytes(raw?: string): string {
  const bytes = Number(raw);
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  savedProjects,
  onRestoreProjects,
  onDriveAuthChange,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [files, setFiles] = useState<DriveBackupFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [saveScope, setSaveScope] = useState<'all' | 'current'>('all');
  const [backupFileName, setBackupFileName] = useState<string>(
    `SitePro_Backup_${new Date().toISOString().split('T')[0]}.json`
  );

  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const authChangeRef = useRef(onDriveAuthChange);
  authChangeRef.current = onDriveAuthChange;

  useEffect(() => {
    const unsubscribe = initAuth(
      (authUser) => {
        setUser(authUser);
        setNeedsAuth(false);
        authChangeRef.current?.(authUser, true);
      },
      (authUser) => {
        setUser(authUser);
        setNeedsAuth(true);
        authChangeRef.current?.(authUser, false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAuthExpired = useCallback(() => {
    clearAccessToken();
    setNeedsAuth(true);
    setPendingAction(null);
    onDriveAuthChange?.(user, false);
    setStatusBanner({
      type: 'error',
      text: 'Your Google Drive session expired. Please sign in with Google again.',
    });
  }, [onDriveAuthChange, user]);

  const loadFiles = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsLoadingFiles(true);
    try {
      const list = await listDriveBackups(token);
      setFiles(list);
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleAuthExpired();
      } else {
        setStatusBanner({
          type: 'error',
          text: err instanceof Error ? err.message : 'Unable to list files from Google Drive.',
        });
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, [handleAuthExpired]);

  useEffect(() => {
    if (isOpen) {
      setStatusBanner(null);
      setPendingAction(null);
      const token = getAccessToken();
      if (token) {
        setNeedsAuth(false);
        loadFiles();
      } else {
        setNeedsAuth(true);
      }
    }
  }, [isOpen, loadFiles]);

  if (!isOpen) return null;

  const projectsToSave = saveScope === 'all' ? savedProjects : [currentProject];

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setStatusBanner(null);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setNeedsAuth(false);
      onDriveAuthChange?.(result.user, true);
      await loadFiles();
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setFiles([]);
    setNeedsAuth(true);
    setPendingAction(null);
    setStatusBanner(null);
    onDriveAuthChange?.(null, false);
  };

  const handleCreateNewBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsSaving(true);
    setStatusBanner(null);
    try {
      const created = await createDriveBackup(
        token,
        projectsToSave,
        backupFileName || `SitePro_Backup_${new Date().toISOString().split('T')[0]}.json`
      );
      setStatusBanner({
        type: 'success',
        text: `Saved "${created.name}" (${projectsToSave.length} site${projectsToSave.length === 1 ? '' : 's'}) to your Google Drive.`,
      });
      await loadFiles();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleAuthExpired();
      } else {
        setStatusBanner({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to save backup to Google Drive.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCsvReport = async () => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsSaving(true);
    setStatusBanner(null);
    try {
      const created = await createDriveCsvReport(token, currentProject);
      setStatusBanner({
        type: 'success',
        text: `Uploaded report "${created.name}" to your Google Drive.`,
      });
      await loadFiles();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleAuthExpired();
      } else {
        setStatusBanner({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to upload report to Google Drive.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartRestore = async (file: DriveBackupFile) => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsLoadingFiles(true);
    setStatusBanner(null);
    try {
      const projects = await downloadDriveBackup(token, file.id);
      setPendingAction({ kind: 'restore', file, projects });
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleAuthExpired();
      } else {
        setStatusBanner({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to read backup file from Google Drive.',
        });
      }
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleConfirmOverwrite = async () => {
    if (!pendingAction || pendingAction.kind !== 'overwrite') return;
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setIsSaving(true);
    setStatusBanner(null);
    try {
      const updated = await updateDriveBackup(token, pendingAction.file.id, pendingAction.projects);
      setPendingAction(null);
      setStatusBanner({
        type: 'success',
        text: `Updated "${updated.name}" in your Google Drive.`,
      });
      await loadFiles();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleAuthExpired();
      } else {
        setStatusBanner({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to update file in Google Drive.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingAction || pendingAction.kind !== 'delete') return;
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    const targetName = pendingAction.file.name;
    setIsSaving(true);
    setStatusBanner(null);
    try {
      await deleteDriveFile(token, pendingAction.file.id);
      setPendingAction(null);
      setStatusBanner({
        type: 'success',
        text: `Deleted "${targetName}" from your Google Drive.`,
      });
      await loadFiles();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        handleAuthExpired();
      } else {
        setStatusBanner({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to delete file from Google Drive.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const jsonBackups = files.filter((f) => f.name.toLowerCase().endsWith('.json'));
  const reportFiles = files.filter((f) => !f.name.toLowerCase().endsWith('.json'));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/90">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 pt-2.5 pb-4 sm:py-4 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2 bg-amber-400 rounded-xl text-slate-950 shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg tracking-tight truncate">Google Drive Backup &amp; Sync</h3>
                <p className="text-xs text-slate-400 truncate">
                  Save, restore, or export your site projects to Google Drive
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Google Drive modal"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto space-y-5 flex-1">
          
          {statusBanner && (
            <div
              className={`p-3.5 rounded-xl border text-xs sm:text-sm font-medium flex items-start gap-2.5 ${
                statusBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              )}
              <span>{statusBanner.text}</span>
            </div>
          )}

          {/* Mandatory Confirmation Panel for Mutating / Destructive Operations */}
          {pendingAction && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-sm">
                    {pendingAction.kind === 'overwrite'
                      ? `Overwrite "${pendingAction.file.name}" in Google Drive?`
                      : pendingAction.kind === 'delete'
                      ? `Delete "${pendingAction.file.name}" from Google Drive?`
                      : `Restore ${pendingAction.projects.length} site${pendingAction.projects.length === 1 ? '' : 's'} from "${pendingAction.file.name}"?`}
                  </h4>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {pendingAction.kind === 'overwrite'
                      ? `This will replace the contents of "${pendingAction.file.name}" in Google Drive with your current local data (${pendingAction.projects.length} site${pendingAction.projects.length === 1 ? '' : 's'}).`
                      : pendingAction.kind === 'delete'
                      ? 'This will permanently delete the file from your Google Drive. This action cannot be undone.'
                      : 'Choose whether to merge these sites with your existing local sites or replace your local sites list.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  disabled={isSaving}
                  className="min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>

                {pendingAction.kind === 'overwrite' && (
                  <button
                    type="button"
                    onClick={handleConfirmOverwrite}
                    disabled={isSaving}
                    className="min-h-[44px] px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition"
                  >
                    {isSaving ? 'Updating...' : 'Confirm Overwrite'}
                  </button>
                )}

                {pendingAction.kind === 'delete' && (
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isSaving}
                    className="min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition"
                  >
                    {isSaving ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                )}

                {pendingAction.kind === 'restore' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreProjects(pendingAction.projects, 'merge');
                        setPendingAction(null);
                        setStatusBanner({
                          type: 'success',
                          text: `Merged ${pendingAction.projects.length} site(s) from Google Drive into your workspace.`,
                        });
                      }}
                      className="min-h-[44px] px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
                    >
                      Merge with Local Sites
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreProjects(pendingAction.projects, 'replace');
                        setPendingAction(null);
                        setStatusBanner({
                          type: 'success',
                          text: `Replaced local workspace with ${pendingAction.projects.length} site(s) from Google Drive.`,
                        });
                      }}
                      className="min-h-[44px] px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
                    >
                      Replace Local Sites
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {needsAuth ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs mx-auto flex items-center justify-center text-slate-700">
                <Cloud className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h4 className="font-bold text-slate-900 text-base">Connect your Google Drive</h4>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Sign in with your Google account to save project backups and audit reports directly to your own Google Drive, and restore them from any device.
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="gsi-material-button inline-flex items-center justify-center bg-white hover:bg-[#f8faff] active:bg-[#e8f0fe] text-[#1f1f1f] border border-[#747775] rounded-full px-5 min-h-[44px] text-sm font-medium shadow-xs transition disabled:opacity-60 cursor-pointer"
                >
                  <span className="gsi-material-button-content-wrapper flex items-center gap-3">
                    <span className="gsi-material-button-icon w-5 h-5 flex-shrink-0">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="block w-5 h-5">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </span>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Connected Account Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {user?.displayName || 'Google Account Connected'}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {user?.email || 'Connected to Google Drive'}
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={loadFiles}
                    disabled={isLoadingFiles}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>

              {/* Save to Google Drive Form */}
              <form onSubmit={handleCreateNewBackup} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Save Backup to Google Drive</h4>
                    <p className="text-xs text-slate-500">Creates a JSON backup file in your Drive that can be restored anytime.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Backup Scope</label>
                    <select
                      value={saveScope}
                      onChange={(e) => setSaveScope(e.target.value as 'all' | 'current')}
                      className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs font-semibold text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                    >
                      <option value="all">All Saved Sites ({savedProjects.length})</option>
                      <option value="current">Active Site Only ({currentProject.name})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">File Name</label>
                    <input
                      type="text"
                      value={backupFileName}
                      onChange={(e) => setBackupFileName(e.target.value)}
                      placeholder="SitePro_Backup.json"
                      required
                      className="w-full min-h-[44px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs font-mono text-slate-900 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="min-h-[44px] px-4 py-2 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs sm:text-sm transition inline-flex items-center justify-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>{isSaving ? 'Saving...' : 'Save New Backup to Drive'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveCsvReport}
                    disabled={isSaving}
                    className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 font-semibold rounded-xl text-xs sm:text-sm transition inline-flex items-center justify-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Save Site CSV to Drive</span>
                  </button>
                </div>
              </form>

              {/* Saved Backups List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700">
                    Project Backups in Google Drive ({jsonBackups.length})
                  </h4>
                </div>

                {isLoadingFiles && files.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    Loading files from Google Drive...
                  </div>
                ) : jsonBackups.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    No SitePro backup files found in your Google Drive yet. Click &ldquo;Save New Backup to Drive&rdquo; above to create one.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jsonBackups.map((file) => (
                      <div
                        key={file.id}
                        className="p-3.5 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{file.name}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                            {file.modifiedTime ? `Modified ${new Date(file.modifiedTime).toLocaleString()}` : 'Saved in Drive'}
                            {file.size ? ` · ${formatBytes(file.size)}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartRestore(file)}
                            disabled={isSaving || isLoadingFiles}
                            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5"
                            title="Load backup from Google Drive"
                          >
                            <DownloadCloud className="w-3.5 h-3.5" />
                            <span>Restore</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPendingAction({
                                kind: 'overwrite',
                                file,
                                projects: projectsToSave,
                              })
                            }
                            disabled={isSaving}
                            className="flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] px-3 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg transition inline-flex items-center justify-center gap-1.5"
                            title="Overwrite this Drive file with current data"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Update</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPendingAction({ kind: 'delete', file })}
                            disabled={isSaving}
                            aria-label={`Delete ${file.name}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete file from Google Drive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {reportFiles.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <h4 className="text-xs font-bold text-slate-700">
                      Saved Reports in Google Drive ({reportFiles.length})
                    </h4>
                    <div className="space-y-1.5">
                      {reportFiles.map((file) => (
                        <div
                          key={file.id}
                          className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-800 truncate">{file.name}</div>
                            <div className="text-[11px] text-slate-500 tabular-nums">
                              {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : 'CSV Report'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingAction({ kind: 'delete', file })}
                            disabled={isSaving}
                            aria-label={`Delete ${file.name}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition shrink-0"
                            title="Delete report from Google Drive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
