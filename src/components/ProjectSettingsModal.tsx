import React, { useState, useEffect } from 'react';
import { ConstructionProject, CustomAuditItem, ProjectSettings } from '../types';
import { getProjectSettings } from '../utils/geo';
import { Settings, X, Save, Ruler, ListChecks, Building2, Plus, Trash2 } from 'lucide-react';

interface ProjectSettingsModalProps {
  project: ConstructionProject;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProject: (updated: ConstructionProject) => void;
  initialTab?: 'info' | 'units' | 'items';
}

type StandardItemKey = keyof ProjectSettings['items'];

const UNIT_PRESETS: Record<StandardItemKey, string[]> = {
  anglePosts: ['pcs', 'nos', 'sets', 'ea'],
  intermediatePosts: ['pcs', 'nos', 'sets', 'ea'],
  strutPosts: ['pcs', 'nos', 'sets', 'ea'],
  gatePosts: ['pcs', 'nos', 'sets', 'ea'],
  chainLinkMesh: ['m', 'ft', 'yd', 'rolls', 'm²', 'ft²'],
  rrmWall: ['m³', 'ft³', 'brass', 'm', 'ft'],
  roadMeasurement: ['m', 'ft', 'km', 'yd'],
  sideDrain: ['m', 'ft', 'yd'],
};

const CUSTOM_UNIT_OPTIONS = ['pcs', 'nos', 'm', 'ft', 'yd', 'km', 'm²', 'ft²', 'm³', 'ft³', 'rolls', 'bags', 'kg', 'tons', 'sets'];

function parseQuickSteps(raw: string, fallback: number[]): number[] {
  const nums = raw
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0);
  return nums.length > 0 ? nums : fallback;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  project,
  isOpen,
  onClose,
  onUpdateProject,
  initialTab = 'items',
}) => {
  const [activeModalTab, setActiveModalTab] = useState<'info' | 'units' | 'items'>(initialTab);
  const [projectName, setProjectName] = useState(project.name);
  const [clientName, setClientName] = useState(project.clientName);
  const [location, setLocation] = useState(project.location);
  const [settings, setSettings] = useState<ProjectSettings>(() => getProjectSettings(project));
  const [quickStepsDraft, setQuickStepsDraft] = useState<Record<string, string>>({});

  // New custom item form state
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<'fencing' | 'road' | 'general'>('general');
  const [newItemUnit, setNewItemUnit] = useState('pcs');
  const [newItemSteps, setNewItemSteps] = useState('1, 5, 10');

  useEffect(() => {
    if (isOpen) {
      const currentSettings = getProjectSettings(project);
      setProjectName(project.name);
      setClientName(project.clientName);
      setLocation(project.location);
      setSettings(currentSettings);
      setQuickStepsDraft({
        chainLinkMesh: (currentSettings.items.chainLinkMesh.quickSteps || [1, 5, 10, 50]).join(', '),
        rrmWall: (currentSettings.items.rrmWall.quickSteps || [1, 5, 10]).join(', '),
        roadMeasurement: (currentSettings.items.roadMeasurement.quickSteps || [10, 50, 100, 500]).join(', '),
        sideDrain: (currentSettings.items.sideDrain.quickSteps || [10, 25, 50, 100]).join(', '),
      });
      setActiveModalTab(initialTab);
    }
  }, [project.id, isOpen, initialTab]);

  if (!isOpen) return null;

  const applyUnitSystem = (system: 'metric' | 'imperial') => {
    const isMetric = system === 'metric';
    setSettings(prev => ({
      ...prev,
      unitSystem: system,
      defaultPostHeight: isMetric ? 2.4 : 8,
      defaultMeshHeight: isMetric ? 2.0 : 6.5,
      defaultRoadWidth: isMetric ? 7.5 : 24,
      defaultRrmHeight: isMetric ? 0.6 : 2,
      items: {
        ...prev.items,
        anglePosts: { ...prev.items.anglePosts, unit: 'pcs' },
        intermediatePosts: { ...prev.items.intermediatePosts, unit: 'pcs' },
        strutPosts: { ...prev.items.strutPosts, unit: 'pcs' },
        gatePosts: { ...prev.items.gatePosts, unit: 'pcs' },
        chainLinkMesh: { ...prev.items.chainLinkMesh, unit: isMetric ? 'm' : 'ft' },
        rrmWall: { ...prev.items.rrmWall, unit: isMetric ? 'm³' : 'ft³' },
        roadMeasurement: { ...prev.items.roadMeasurement, unit: isMetric ? 'm' : 'ft' },
        sideDrain: { ...prev.items.sideDrain, unit: isMetric ? 'm' : 'ft' },
      },
    }));
  };

  const toggleStandardItem = (key: StandardItemKey) => {
    setSettings(prev => ({
      ...prev,
      items: {
        ...prev.items,
        [key]: {
          ...prev.items[key],
          enabled: !prev.items[key].enabled,
        },
      },
    }));
  };

  const updateStandardItemUnit = (key: StandardItemKey, unit: string) => {
    setSettings(prev => ({
      ...prev,
      unitSystem: 'custom',
      items: {
        ...prev.items,
        [key]: {
          ...prev.items[key],
          unit,
        },
      },
    }));
  };

  const applyScopePreset = (preset: 'all' | 'fence' | 'road') => {
    setSettings(prev => ({
      ...prev,
      items: {
        anglePosts: { ...prev.items.anglePosts, enabled: preset === 'all' || preset === 'fence' },
        intermediatePosts: { ...prev.items.intermediatePosts, enabled: preset === 'all' || preset === 'fence' },
        strutPosts: { ...prev.items.strutPosts, enabled: preset === 'all' || preset === 'fence' },
        gatePosts: { ...prev.items.gatePosts, enabled: preset === 'all' },
        chainLinkMesh: { ...prev.items.chainLinkMesh, enabled: preset === 'all' || preset === 'fence' },
        rrmWall: { ...prev.items.rrmWall, enabled: preset === 'all' || preset === 'fence' },
        roadMeasurement: { ...prev.items.roadMeasurement, enabled: preset === 'all' || preset === 'road' },
        sideDrain: { ...prev.items.sideDrain, enabled: preset === 'all' || preset === 'road' },
      },
    }));
  };

  const handleAddCustomItem = () => {
    if (!newItemName.trim()) return;
    const steps = parseQuickSteps(newItemSteps, [1, 5, 10]);
    const item: CustomAuditItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      name: newItemName.trim(),
      category: newItemCategory,
      unit: newItemUnit.trim() || 'pcs',
      quantity: 0,
      verifiedQuantity: 0,
      quickSteps: steps,
      enabled: true,
    };
    setSettings(prev => ({
      ...prev,
      customItems: [...prev.customItems, item],
    }));
    setNewItemName('');
    setNewItemSteps('1, 5, 10');
  };

  const toggleCustomItem = (id: string) => {
    setSettings(prev => ({
      ...prev,
      customItems: prev.customItems.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c),
    }));
  };

  const updateCustomItemUnit = (id: string, unit: string) => {
    setSettings(prev => ({
      ...prev,
      customItems: prev.customItems.map(c => c.id === id ? { ...c, unit } : c),
    }));
  };

  const deleteCustomItem = (id: string) => {
    setSettings(prev => ({
      ...prev,
      customItems: prev.customItems.filter(c => c.id !== id),
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalizedSettings: ProjectSettings = {
      ...settings,
      items: {
        ...settings.items,
        chainLinkMesh: {
          ...settings.items.chainLinkMesh,
          unit: settings.items.chainLinkMesh.unit.trim() || 'm',
          quickSteps: parseQuickSteps(quickStepsDraft.chainLinkMesh || '', [1, 5, 10, 50]),
        },
        rrmWall: {
          ...settings.items.rrmWall,
          unit: settings.items.rrmWall.unit.trim() || 'm³',
          quickSteps: parseQuickSteps(quickStepsDraft.rrmWall || '', [1, 5, 10]),
        },
        roadMeasurement: {
          ...settings.items.roadMeasurement,
          unit: settings.items.roadMeasurement.unit.trim() || 'm',
          quickSteps: parseQuickSteps(quickStepsDraft.roadMeasurement || '', [10, 50, 100, 500]),
        },
        sideDrain: {
          ...settings.items.sideDrain,
          unit: settings.items.sideDrain.unit.trim() || 'm',
          quickSteps: parseQuickSteps(quickStepsDraft.sideDrain || '', [10, 25, 50, 100]),
        },
      },
    };

    const updated: ConstructionProject = {
      ...project,
      name: projectName.trim() || project.name,
      clientName: clientName.trim(),
      location: location.trim(),
      settings: finalizedSettings,
      updatedAt: Date.now(),
    };
    onUpdateProject(updated);
    onClose();
  };

  const standardKeys: StandardItemKey[] = [
    'anglePosts',
    'intermediatePosts',
    'strutPosts',
    'gatePosts',
    'chainLinkMesh',
    'rrmWall',
    'roadMeasurement',
    'sideDrain',
  ];

  const lengthUnitLabel = settings.unitSystem === 'imperial' ? 'ft' : 'm';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/90">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 pt-2.5 pb-4 sm:py-4 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2 bg-amber-400 rounded-xl text-slate-950 shrink-0">
                <Settings className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg tracking-tight truncate">Site Settings &amp; Audit Scope</h3>
                <p className="text-xs text-slate-400 truncate">Configure units, necessary items, and site details</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Settings Modal Tabs */}
        <div className="bg-slate-50 px-4 sm:px-6 py-2.5 border-b border-slate-200 flex space-x-2 overflow-x-auto no-scrollbar flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveModalTab('items')}
            className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 whitespace-nowrap shrink-0 transition ${
              activeModalTab === 'items'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Necessary Items</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModalTab('units')}
            className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 whitespace-nowrap shrink-0 transition ${
              activeModalTab === 'units'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Predetermined Units</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModalTab('info')}
            className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 whitespace-nowrap shrink-0 transition ${
              activeModalTab === 'info'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Site Info</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
            
            {/* TAB 1: NECESSARY ITEMS */}
            {activeModalTab === 'items' && (
              <div className="space-y-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Standard Measurement Items</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Select which items appear in Auditor measurement, Overview, and Reports.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => applyScopePreset('all')}
                        className="min-h-[40px] sm:min-h-[34px] px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                      >
                        All Items
                      </button>
                      <button
                        type="button"
                        onClick={() => applyScopePreset('fence')}
                        className="min-h-[40px] sm:min-h-[34px] px-3 py-1 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg transition"
                      >
                        Fencing Only
                      </button>
                      <button
                        type="button"
                        onClick={() => applyScopePreset('road')}
                        className="min-h-[40px] sm:min-h-[34px] px-3 py-1 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold rounded-lg transition"
                      >
                        Road Only
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {standardKeys.map((key) => {
                      const item = settings.items[key];
                      return (
                        <label
                          key={key}
                          className={`min-h-[48px] flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                            item.enabled
                              ? 'bg-amber-50/70 border-amber-300 text-slate-900'
                              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={item.enabled}
                              onChange={() => toggleStandardItem(key)}
                              className="w-5 h-5 sm:w-4 sm:h-4 rounded accent-slate-900 text-slate-900 focus:ring-amber-400"
                            />
                            <span className="text-xs font-bold truncate">{item.label}</span>
                          </div>
                          <span className="text-[11px] font-mono font-semibold text-slate-600 ml-2 flex-shrink-0">
                            {item.unit}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Necessary Items */}
                <div className="border-t border-slate-200 pt-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Custom Necessary Items</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Add extra site-specific items with their predetermined units (e.g., Barbed Wire, Culvert Pipe, Signage).</p>
                  </div>

                  {settings.customItems.length > 0 && (
                    <div className="space-y-2">
                      {settings.customItems.map((c) => (
                        <div
                          key={c.id}
                          className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border transition ${
                            c.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={c.enabled}
                              onChange={() => toggleCustomItem(c.id)}
                              className="w-5 h-5 sm:w-4 sm:h-4 rounded accent-slate-900 text-slate-900 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">{c.name}</div>
                              <div className="text-[11px] text-slate-500 capitalize">
                                {c.category} &middot; Steps: <span className="font-mono">{c.quickSteps.join(', ')}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={c.unit}
                              onChange={(e) => updateCustomItemUnit(c.id, e.target.value)}
                              className="w-20 min-h-[44px] sm:min-h-[36px] px-2 py-1 text-base sm:text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-center focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                              title="Predetermined Unit"
                            />
                            <button
                              type="button"
                              onClick={() => deleteCustomItem(c.id)}
                              aria-label={`Remove ${c.name}`}
                              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Remove custom item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Custom Item Form */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold text-slate-800">Add Necessary Item</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Item Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Barbed Wire / Culvert Pipe"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="w-full min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                          <select
                            value={newItemCategory}
                            onChange={(e) => setNewItemCategory(e.target.value as 'fencing' | 'road' | 'general')}
                            className="w-full min-h-[44px] sm:min-h-[40px] px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                          >
                            <option value="fencing">Fencing</option>
                            <option value="road">Road</option>
                            <option value="general">General</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Unit</label>
                          <select
                            value={newItemUnit}
                            onChange={(e) => setNewItemUnit(e.target.value)}
                            className="w-full min-h-[44px] sm:min-h-[40px] px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-xs font-mono focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                          >
                            {CUSTOM_UNIT_OPTIONS.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Quick-Tap Increments (comma-separated)</label>
                        <input
                          type="text"
                          value={newItemSteps}
                          onChange={(e) => setNewItemSteps(e.target.value)}
                          placeholder="1, 5, 10"
                          className="w-full min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-white border border-slate-300 rounded-xl text-base sm:text-xs font-mono focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCustomItem}
                        disabled={!newItemName.trim()}
                        className="min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Item</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PREDETERMINED UNITS & DEFAULTS */}
            {activeModalTab === 'units' && (
              <div className="space-y-6">
                {/* Unit System Quick Preset */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Measurement System Preset</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => applyUnitSystem('metric')}
                      className={`p-3.5 rounded-xl border text-left transition ${
                        settings.unitSystem === 'metric'
                          ? 'bg-amber-50 border-amber-400 text-slate-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">Metric (SI)</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">m, m², m³, pcs</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyUnitSystem('imperial')}
                      className={`p-3.5 rounded-xl border text-left transition ${
                        settings.unitSystem === 'imperial'
                          ? 'bg-amber-50 border-amber-400 text-slate-900 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">Imperial</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">ft, ft², ft³, pcs</div>
                    </button>
                  </div>
                </div>

                {/* Per-Item Predetermined Units & Quick-Tap Steps */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Predetermined Unit &amp; Quick-Tap Increments</h4>
                  <div className="space-y-2.5">
                    {standardKeys.map((key) => {
                      const item = settings.items[key];
                      const hasQuickSteps = key in quickStepsDraft;
                      return (
                        <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-800">{item.label}</span>
                            <select
                              value={UNIT_PRESETS[key].includes(item.unit) ? item.unit : 'custom'}
                              onChange={(e) => {
                                if (e.target.value !== 'custom') {
                                  updateStandardItemUnit(key, e.target.value);
                                }
                              }}
                              className="min-h-[44px] sm:min-h-[36px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-base sm:text-xs font-mono font-bold focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                            >
                              {UNIT_PRESETS[key].map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>

                          {hasQuickSteps && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pt-1">
                              <span className="text-[11px] text-slate-500">Quick-tap buttons:</span>
                              <input
                                type="text"
                                value={quickStepsDraft[key] || ''}
                                onChange={(e) => setQuickStepsDraft(prev => ({ ...prev, [key]: e.target.value }))}
                                className="w-full sm:w-44 min-h-[44px] sm:min-h-[36px] px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-base sm:text-xs font-mono sm:text-right focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                                placeholder="e.g. 1, 5, 10, 50"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Predetermined Default Dimensions */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Predetermined Default Dimensions</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Post Height ({lengthUnitLabel})</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0.1"
                        value={settings.defaultPostHeight}
                        onChange={(e) => setSettings(prev => ({ ...prev, defaultPostHeight: parseFloat(e.target.value) || 2.4 }))}
                        className="w-full min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs font-bold tabular-nums focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mesh Height ({lengthUnitLabel})</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0.1"
                        value={settings.defaultMeshHeight}
                        onChange={(e) => setSettings(prev => ({ ...prev, defaultMeshHeight: parseFloat(e.target.value) || 2.0 }))}
                        className="w-full min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs font-bold tabular-nums focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Road Width ({lengthUnitLabel})</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0.5"
                        value={settings.defaultRoadWidth}
                        onChange={(e) => setSettings(prev => ({ ...prev, defaultRoadWidth: parseFloat(e.target.value) || 7.5 }))}
                        className="w-full min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs font-bold tabular-nums focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">RRM Height ({lengthUnitLabel})</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0.1"
                        value={settings.defaultRrmHeight}
                        onChange={(e) => setSettings(prev => ({ ...prev, defaultRrmHeight: parseFloat(e.target.value) || 0.6 }))}
                        className="w-full min-h-[44px] sm:min-h-[40px] px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-xs font-bold tabular-nums focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SITE INFO */}
            {activeModalTab === 'info' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Project Information</h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Client Name</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Site Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition"
                    />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Sticky Footer */}
          <div className="px-4 sm:px-6 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-sm transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 sm:flex-none min-h-[44px] px-6 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-sm shadow-xs transition flex items-center justify-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
