import React, { useState, useEffect } from 'react';
import { ConstructionProject } from '../types';
import { getProjectSettings } from '../utils/geo';
import { cleanVariance, computeMeasurements, formatVariance, roundTo } from '../utils/calculations';
import { 
  ShieldCheck, 
  CheckCircle2, 
  UserCheck, 
  Save, 
  RefreshCw,
  AlertTriangle,
  Clock,
  ChevronDown
} from 'lucide-react';

interface AuditorVerificationModuleProps {
  project: ConstructionProject;
  onUpdateProject: (updated: ConstructionProject) => void;
  embedded?: boolean;
}

export const AuditorVerificationModule: React.FC<AuditorVerificationModuleProps> = ({
  project,
  onUpdateProject,
  embedded = false,
}) => {
  const settings = getProjectSettings(project);
  const { items, customItems } = settings;
  const enabledCustom = customItems.filter(c => c.enabled);
  const m = computeMeasurements(project);

  const anyPostsEnabled =
    items.anglePosts.enabled ||
    items.intermediatePosts.enabled ||
    items.strutPosts.enabled ||
    items.gatePosts.enabled;

  const postUnit = m.postUnit;

  const plannedPosts = m.totalPosts;
  const plannedMesh = m.meshLen;
  const plannedRrm = m.rrmVol;
  const plannedRrmRounded = roundTo(plannedRrm, 2);
  const plannedRoad = m.roadLen;
  const plannedSideDrain = m.sideDrainLen;

  const audit = project.auditInfo || {
    auditorName: '',
    auditDate: new Date().toISOString().split('T')[0],
    auditStatus: 'pending' as const,
    generalRemarks: '',
    verifiedPostCount: plannedPosts,
    verifiedMeshLength: plannedMesh,
    verifiedRrmVolume: plannedRrmRounded,
    verifiedRoadLength: plannedRoad,
    verifiedSideDrainLength: plannedSideDrain,
    verifiedCustomItems: {},
  };

  const [auditorName, setAuditorName] = useState<string>(audit.auditorName);
  const [auditDate, setAuditDate] = useState<string>(audit.auditDate);
  const [auditStatus, setAuditStatus] = useState<'pending' | 'verified_with_variance' | 'fully_compliant'>(audit.auditStatus);
  const [generalRemarks, setGeneralRemarks] = useState<string>(audit.generalRemarks);
  
  const [verifiedPosts, setVerifiedPosts] = useState<number>(audit.verifiedPostCount ?? plannedPosts);
  const [verifiedMesh, setVerifiedMesh] = useState<number>(audit.verifiedMeshLength ?? plannedMesh);
  const [verifiedRrm, setVerifiedRrm] = useState<number>(audit.verifiedRrmVolume ?? plannedRrmRounded);
  const [verifiedRoad, setVerifiedRoad] = useState<number>(audit.verifiedRoadLength ?? plannedRoad);
  const [verifiedSideDrain, setVerifiedSideDrain] = useState<number>(audit.verifiedSideDrainLength ?? plannedSideDrain);
  const [verifiedCustom, setVerifiedCustom] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    enabledCustom.forEach(c => {
      init[c.id] = audit.verifiedCustomItems?.[c.id] ?? c.quantity;
    });
    return init;
  });

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const toggleCard = (key: string) => {
    setCollapsedCards(prev => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const currentAudit = project.auditInfo;
    if (currentAudit) {
      setAuditorName(currentAudit.auditorName || '');
      setAuditDate(currentAudit.auditDate || new Date().toISOString().split('T')[0]);
      setAuditStatus(currentAudit.auditStatus || 'pending');
      setGeneralRemarks(currentAudit.generalRemarks || '');
      setVerifiedPosts(currentAudit.verifiedPostCount ?? plannedPosts);
      setVerifiedMesh(currentAudit.verifiedMeshLength ?? plannedMesh);
      setVerifiedRrm(currentAudit.verifiedRrmVolume ?? plannedRrmRounded);
      setVerifiedRoad(currentAudit.verifiedRoadLength ?? plannedRoad);
      setVerifiedSideDrain(currentAudit.verifiedSideDrainLength ?? plannedSideDrain);
      const nextCustom: Record<string, number> = {};
      enabledCustom.forEach(c => {
        nextCustom[c.id] = currentAudit.verifiedCustomItems?.[c.id] ?? c.quantity;
      });
      setVerifiedCustom(nextCustom);
    } else {
      setAuditorName('');
      setAuditDate(new Date().toISOString().split('T')[0]);
      setAuditStatus('pending');
      setGeneralRemarks('');
      setVerifiedPosts(plannedPosts);
      setVerifiedMesh(plannedMesh);
      setVerifiedRrm(plannedRrmRounded);
      setVerifiedRoad(plannedRoad);
      setVerifiedSideDrain(plannedSideDrain);
      const nextCustom: Record<string, number> = {};
      enabledCustom.forEach(c => {
        nextCustom[c.id] = c.quantity;
      });
      setVerifiedCustom(nextCustom);
    }
  }, [project.id]);

  // Variances (rounded cleanly to prevent floating-point drift)
  const postVariance = cleanVariance(verifiedPosts, plannedPosts, 0);
  const meshVariance = cleanVariance(verifiedMesh, plannedMesh, 2);
  const rrmVariance = cleanVariance(verifiedRrm, plannedRrmRounded, 2);
  const roadVariance = cleanVariance(verifiedRoad, plannedRoad, 2);
  const sideDrainVariance = cleanVariance(verifiedSideDrain, plannedSideDrain, 2);

  const handleSyncFromLogged = () => {
    setVerifiedPosts(plannedPosts);
    setVerifiedMesh(plannedMesh);
    setVerifiedRrm(plannedRrmRounded);
    setVerifiedRoad(plannedRoad);
    setVerifiedSideDrain(plannedSideDrain);
    const nextCustom: Record<string, number> = {};
    enabledCustom.forEach(c => {
      nextCustom[c.id] = c.quantity;
    });
    setVerifiedCustom(nextCustom);
  };

  const handleSaveAudit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ConstructionProject = {
      ...project,
      auditInfo: {
        auditorName: auditorName.trim() || 'Independent Technical Auditor',
        auditDate,
        auditStatus,
        generalRemarks: generalRemarks.trim(),
        verifiedPostCount: Number(verifiedPosts),
        verifiedMeshLength: Number(verifiedMesh),
        verifiedRrmVolume: Number(verifiedRrm),
        verifiedRoadLength: Number(verifiedRoad),
        verifiedSideDrainLength: Number(verifiedSideDrain),
        verifiedCustomItems: verifiedCustom,
      },
      updatedAt: Date.now(),
    };

    onUpdateProject(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const inputClass =
    'w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition';

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-6 pb-12'}>
      
      {!embedded && (
        <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-200/90">
          <div className="text-xs font-semibold text-indigo-600 mb-1.5">
            Technical Inspector &middot; Audit Verification
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 mb-2">
            Physical Site Audit &amp; Compliance Verification
          </h2>
          <p className="text-slate-600 text-sm max-w-2xl leading-relaxed">
            Verify logged quantities against physical on-site measurements and counts, document variances, and record official audit sign-off.
          </p>
        </div>
      )}

      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span className="text-sm font-semibold">Audit verification record saved and synced with project reports.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Auditor Input Form */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 lg:col-span-1">
          <button
            type="button"
            onClick={() => toggleCard('signOff')}
            aria-expanded={!collapsedCards.signOff}
            className="w-full min-h-[44px] flex items-center justify-between gap-2.5 text-left group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl flex-shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 group-hover:text-slate-700 transition">Auditor Sign-Off</h3>
                {collapsedCards.signOff && (
                  <p className="text-xs text-slate-500 truncate">
                    {auditorName || 'No inspector'} &middot; {auditDate}
                  </p>
                )}
              </div>
            </div>
            <span className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0 transition">
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${collapsedCards.signOff ? '-rotate-90' : 'rotate-0'}`}
              />
            </span>
          </button>

          {!collapsedCards.signOff && (
          <form onSubmit={handleSaveAudit} className="space-y-4 mt-5">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Auditor / Inspector Name</label>
              <input
                type="text"
                placeholder="e.g. J. Tenzin (Senior Inspector)"
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Audit Inspection Date</label>
              <input
                type="date"
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Compliance Status</label>
              <select
                value={auditStatus}
                onChange={(e) => setAuditStatus(e.target.value as 'pending' | 'verified_with_variance' | 'fully_compliant')}
                className={`${inputClass} font-semibold`}
              >
                <option value="pending">Pending Physical Audit</option>
                <option value="verified_with_variance">Verified with Variance</option>
                <option value="fully_compliant">Fully Compliant &amp; Approved</option>
              </select>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-800">Physically Verified Counts</h4>
                <button
                  type="button"
                  onClick={handleSyncFromLogged}
                  className="min-h-[40px] px-2.5 -mr-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg inline-flex items-center gap-1 transition"
                  title="Copy current logged totals"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync Logged</span>
                </button>
              </div>

              {anyPostsEnabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Verified Total Posts ({postUnit})
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={verifiedPosts}
                    onChange={(e) => setVerifiedPosts(parseInt(e.target.value) || 0)}
                    className={`${inputClass} font-bold text-indigo-700`}
                  />
                </div>
              )}

              {items.chainLinkMesh.enabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Verified Mesh Length ({items.chainLinkMesh.unit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={verifiedMesh}
                    onChange={(e) => setVerifiedMesh(parseFloat(e.target.value) || 0)}
                    className={`${inputClass} font-bold text-indigo-700`}
                  />
                </div>
              )}

              {items.rrmWall.enabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Verified RRM Wall Volume ({items.rrmWall.unit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={verifiedRrm}
                    onChange={(e) => setVerifiedRrm(parseFloat(e.target.value) || 0)}
                    className={`${inputClass} font-bold text-indigo-700`}
                  />
                </div>
              )}

              {items.roadMeasurement.enabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Verified Road Length ({items.roadMeasurement.unit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    value={verifiedRoad}
                    onChange={(e) => setVerifiedRoad(parseFloat(e.target.value) || 0)}
                    className={`${inputClass} font-bold text-indigo-700`}
                  />
                </div>
              )}

              {items.sideDrain.enabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Verified Side Drain ({items.sideDrain.unit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    value={verifiedSideDrain}
                    onChange={(e) => setVerifiedSideDrain(parseFloat(e.target.value) || 0)}
                    className={`${inputClass} font-bold text-indigo-700`}
                  />
                </div>
              )}

              {enabledCustom.map((c) => (
                <div key={c.id}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Verified {c.name} ({c.unit})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={verifiedCustom[c.id] ?? c.quantity}
                    onChange={(e) =>
                      setVerifiedCustom(prev => ({
                        ...prev,
                        [c.id]: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className={`${inputClass} font-bold text-indigo-700`}
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Auditor Remarks &amp; Observations</label>
              <textarea
                rows={3}
                placeholder="Note construction quality, core tests, or discrepancies..."
                value={generalRemarks}
                onChange={(e) => setGeneralRemarks(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition inline-flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Verification Record</span>
            </button>
          </form>
          )}
        </div>

        {/* Variance & Compliance Comparison Table */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 lg:col-span-2 flex flex-col justify-between gap-5 sm:gap-6">
          <div className="space-y-4 sm:space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start justify-between gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => toggleCard('reconciliation')}
                  aria-expanded={!collapsedCards.reconciliation}
                  className="text-left flex-1 min-w-0 group"
                >
                  <h3 className="font-bold text-slate-900 group-hover:text-slate-700 transition">Audit Variance &amp; Reconciliation</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Comparing logged measurements against physically verified inspection counts</p>
                </button>
                <button
                  type="button"
                  onClick={() => toggleCard('reconciliation')}
                  aria-expanded={!collapsedCards.reconciliation}
                  aria-label="Toggle Audit Variance & Reconciliation"
                  className="sm:hidden w-10 h-10 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 transition"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${collapsedCards.reconciliation ? '-rotate-90' : 'rotate-0'}`}
                  />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                  auditStatus === 'fully_compliant'
                    ? 'text-emerald-700'
                    : auditStatus === 'verified_with_variance'
                    ? 'text-amber-700'
                    : 'text-slate-600'
                }`}>
                  {auditStatus === 'fully_compliant' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : auditStatus === 'verified_with_variance' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                  <span>
                    {auditStatus === 'fully_compliant' ? 'Fully Compliant' : auditStatus === 'verified_with_variance' ? 'Discrepancy / Variance Found' : 'Pending Audit'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleCard('reconciliation')}
                  aria-expanded={!collapsedCards.reconciliation}
                  aria-label="Toggle Audit Variance & Reconciliation"
                  className="hidden sm:flex w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 items-center justify-center transition"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${collapsedCards.reconciliation ? '-rotate-90' : 'rotate-0'}`}
                  />
                </button>
              </div>
            </div>

            {!collapsedCards.reconciliation && (
              <>
                {/* Mobile Card List (zero horizontal scroll) */}
                <div className="sm:hidden space-y-2.5">
                  {[
                    ...(anyPostsEnabled ? [{
                      key: 'posts',
                      label: 'Chain-Link Posts Total',
                      logged: `${plannedPosts} ${postUnit}`,
                      verified: `${verifiedPosts} ${postUnit}`,
                      diff: postVariance,
                      diffLabel: `${formatVariance(postVariance, 0)} ${postUnit}`,
                    }] : []),
                    ...(items.chainLinkMesh.enabled ? [{
                      key: 'mesh',
                      label: 'Chain-Link Mesh Length',
                      logged: `${plannedMesh} ${items.chainLinkMesh.unit}`,
                      verified: `${verifiedMesh} ${items.chainLinkMesh.unit}`,
                      diff: meshVariance,
                      diffLabel: `${formatVariance(meshVariance, 2)} ${items.chainLinkMesh.unit}`,
                    }] : []),
                    ...(items.rrmWall.enabled ? [{
                      key: 'rrm',
                      label: 'RRM Wall Masonry Volume',
                      logged: `${plannedRrm.toFixed(2)} ${items.rrmWall.unit}`,
                      verified: `${verifiedRrm.toFixed(2)} ${items.rrmWall.unit}`,
                      diff: rrmVariance,
                      diffLabel: `${rrmVariance > 0 ? `+${rrmVariance.toFixed(2)}` : rrmVariance.toFixed(2)} ${items.rrmWall.unit}`,
                    }] : []),
                    ...(items.roadMeasurement.enabled ? [{
                      key: 'road',
                      label: 'Road Alignment Length',
                      logged: `${plannedRoad} ${items.roadMeasurement.unit}`,
                      verified: `${verifiedRoad} ${items.roadMeasurement.unit}`,
                      diff: roadVariance,
                      diffLabel: `${formatVariance(roadVariance, 2)} ${items.roadMeasurement.unit}`,
                    }] : []),
                    ...(items.sideDrain.enabled ? [{
                      key: 'drain',
                      label: 'Road Side Drain Length',
                      logged: `${plannedSideDrain} ${items.sideDrain.unit}`,
                      verified: `${verifiedSideDrain} ${items.sideDrain.unit}`,
                      diff: sideDrainVariance,
                      diffLabel: `${formatVariance(sideDrainVariance, 2)} ${items.sideDrain.unit}`,
                    }] : []),
                    ...enabledCustom.map((c) => {
                      const vVal = verifiedCustom[c.id] ?? c.quantity;
                      const diff = cleanVariance(vVal, c.quantity, 2);
                      return {
                        key: c.id,
                        label: c.name,
                        logged: `${c.quantity} ${c.unit}`,
                        verified: `${vVal} ${c.unit}`,
                        diff,
                        diffLabel: `${formatVariance(diff, 2)} ${c.unit}`,
                      };
                    }),
                  ].map((row) => (
                    <div key={row.key} className="p-3 bg-slate-50/90 border border-slate-200/80 rounded-xl space-y-2">
                      <div className="text-xs font-bold text-slate-900">{row.label}</div>
                      <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                        <div>
                          <div className="text-[11px] text-slate-500">Logged</div>
                          <div className="font-semibold text-slate-700 mt-0.5">{row.logged}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500">Verified</div>
                          <div className="font-bold text-indigo-700 mt-0.5">{row.verified}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-slate-500">Variance</div>
                          <div className={`font-bold mt-0.5 ${row.diff < 0 ? 'text-red-600' : row.diff > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {row.diffLabel}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop / Tablet Comparison Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                        <th className="py-3 pr-4">Work Component</th>
                        <th className="py-3 px-3 text-right">Logged</th>
                        <th className="py-3 px-3 text-right">Verified</th>
                        <th className="py-3 pl-3 text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {anyPostsEnabled && (
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="py-3 pr-4 font-semibold text-slate-900">Chain-Link Posts Total</td>
                          <td className="py-3 px-3 text-right text-slate-600">{plannedPosts} {postUnit}</td>
                          <td className="py-3 px-3 text-right font-bold text-indigo-700">{verifiedPosts} {postUnit}</td>
                          <td className={`py-3 pl-3 text-right font-bold ${postVariance < 0 ? 'text-red-600' : postVariance > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {formatVariance(postVariance, 0)} {postUnit}
                          </td>
                        </tr>
                      )}
                      {items.chainLinkMesh.enabled && (
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="py-3 pr-4 font-semibold text-slate-900">Chain-Link Mesh Length</td>
                          <td className="py-3 px-3 text-right text-slate-600">{plannedMesh} {items.chainLinkMesh.unit}</td>
                          <td className="py-3 px-3 text-right font-bold text-indigo-700">{verifiedMesh} {items.chainLinkMesh.unit}</td>
                          <td className={`py-3 pl-3 text-right font-bold ${meshVariance < 0 ? 'text-red-600' : meshVariance > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {formatVariance(meshVariance, 2)} {items.chainLinkMesh.unit}
                          </td>
                        </tr>
                      )}
                      {items.rrmWall.enabled && (
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="py-3 pr-4 font-semibold text-slate-900">RRM Wall Masonry Volume</td>
                          <td className="py-3 px-3 text-right text-slate-600">{plannedRrm.toFixed(2)} {items.rrmWall.unit}</td>
                          <td className="py-3 px-3 text-right font-bold text-indigo-700">{verifiedRrm.toFixed(2)} {items.rrmWall.unit}</td>
                          <td className={`py-3 pl-3 text-right font-bold ${rrmVariance < 0 ? 'text-red-600' : rrmVariance > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {rrmVariance > 0 ? `+${rrmVariance.toFixed(2)}` : rrmVariance.toFixed(2)} {items.rrmWall.unit}
                          </td>
                        </tr>
                      )}
                      {items.roadMeasurement.enabled && (
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="py-3 pr-4 font-semibold text-slate-900">Road Alignment Length</td>
                          <td className="py-3 px-3 text-right text-slate-600">{plannedRoad} {items.roadMeasurement.unit}</td>
                          <td className="py-3 px-3 text-right font-bold text-indigo-700">{verifiedRoad} {items.roadMeasurement.unit}</td>
                          <td className={`py-3 pl-3 text-right font-bold ${roadVariance < 0 ? 'text-red-600' : roadVariance > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {formatVariance(roadVariance, 2)} {items.roadMeasurement.unit}
                          </td>
                        </tr>
                      )}
                      {items.sideDrain.enabled && (
                        <tr className="hover:bg-slate-50/70 transition">
                          <td className="py-3 pr-4 font-semibold text-slate-900">Road Side Drain Length</td>
                          <td className="py-3 px-3 text-right text-slate-600">{plannedSideDrain} {items.sideDrain.unit}</td>
                          <td className="py-3 px-3 text-right font-bold text-indigo-700">{verifiedSideDrain} {items.sideDrain.unit}</td>
                          <td className={`py-3 pl-3 text-right font-bold ${sideDrainVariance < 0 ? 'text-red-600' : sideDrainVariance > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {formatVariance(sideDrainVariance, 2)} {items.sideDrain.unit}
                          </td>
                        </tr>
                      )}
                      {enabledCustom.map((c) => {
                        const vVal = verifiedCustom[c.id] ?? c.quantity;
                        const diff = cleanVariance(vVal, c.quantity, 2);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 pr-4 font-semibold text-slate-900">{c.name}</td>
                            <td className="py-3 px-3 text-right text-slate-600">{c.quantity} {c.unit}</td>
                            <td className="py-3 px-3 text-right font-bold text-indigo-700">{vVal} {c.unit}</td>
                            <td className={`py-3 pl-3 text-right font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                              {formatVariance(diff, 2)} {c.unit}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50/90 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span>Inspector Signature Record</span>
                    <span className="tabular-nums">Date &middot; {auditDate}</span>
                  </div>
                  <div className="text-sm text-slate-800">
                    {generalRemarks ? `"${generalRemarks}"` : 'No remarks recorded yet.'}
                  </div>
                  <div className="text-xs text-slate-500 pt-2 border-t border-slate-200/80">
                    Inspected by: <span className="font-semibold text-slate-800">{auditorName || 'Pending Inspector Assignment'}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
