import { ConstructionProject, EntityCalcBasis, ProjectSettings } from '../types';

export function isAreaUnit(unit?: string): boolean {
  const u = (unit || '').trim().toLowerCase();
  return u === 'm²' || u === 'ft²' || u === 'sqm' || u === 'sqft' || u === 'sq.m' || u === 'sq.ft';
}

export function isVolumeUnit(unit?: string): boolean {
  const u = (unit || '').trim().toLowerCase();
  return u === 'm³' || u === 'ft³' || u === 'cum' || u === 'cuft' || u === 'cu.m' || u === 'cu.ft' || u === 'brass';
}

export function isLengthUnit(unit?: string): boolean {
  const u = (unit || '').trim().toLowerCase();
  return u === 'm' || u === 'ft' || u === 'yd' || u === 'km';
}

export function getUnitLabels(settings: ProjectSettings): {
  lengthUnit: string;
  areaUnit: string;
  volumeUnit: string;
} {
  if (settings.unitSystem === 'imperial') {
    return { lengthUnit: 'ft', areaUnit: 'ft²', volumeUnit: 'ft³' };
  }
  if (settings.unitSystem === 'metric') {
    return { lengthUnit: 'm', areaUnit: 'm²', volumeUnit: 'm³' };
  }
  // For 'custom', detect dominant dimension system from configured standard items
  const samples = [
    settings.items.roadMeasurement.unit,
    settings.items.sideDrain.unit,
    settings.items.chainLinkMesh.unit,
    settings.items.rrmWall.unit,
  ].map((u) => (u || '').trim().toLowerCase());

  const imperialScore = samples.filter((u) => u === 'ft' || u === 'ft²' || u === 'ft³' || u === 'yd').length;
  const metricScore = samples.filter((u) => u === 'm' || u === 'm²' || u === 'm³' || u === 'km').length;

  if (imperialScore > metricScore) {
    return { lengthUnit: 'ft', areaUnit: 'ft²', volumeUnit: 'ft³' };
  }
  return { lengthUnit: 'm', areaUnit: 'm²', volumeUnit: 'm³' };
}

export function getUnitForBasis(
  basis: EntityCalcBasis,
  lengthUnit: string,
  areaUnit: string,
  volumeUnit: string,
  currentUnit?: string
): string {
  const trimmed = (currentUnit || '').trim();
  const countUnits = new Set(['pcs', 'nos', 'sets', 'ea', 'units', 'rolls', 'bags', 'kg', 'tons']);
  if (basis === 'nos') {
    return countUnits.has(trimmed.toLowerCase()) ? trimmed : 'pcs';
  }
  if (basis === 'length') {
    return lengthUnit;
  }
  if (basis === 'area') {
    return areaUnit;
  }
  if (basis === 'volume') {
    return volumeUnit;
  }
  return trimmed || volumeUnit;
}

export function convertStandardDimUnit(
  unit: string,
  lengthUnit: string,
  areaUnit: string,
  volumeUnit: string
): string {
  const u = (unit || '').trim();
  const lower = u.toLowerCase();
  if (lower === 'm' || lower === 'ft') return lengthUnit;
  if (lower === 'm²' || lower === 'ft²') return areaUnit;
  if (lower === 'm³' || lower === 'ft³') return volumeUnit;
  return u;
}

// Calculate distance between two GPS coordinates in meters using Haversine formula
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatGps(lat?: number, lng?: number): string {
  if (lat === undefined || lng === undefined) return 'No GPS logged';
  return `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;
}

export function formatChainage(totalDistance: number): string {
  const safe = Math.max(0, Number.isFinite(totalDistance) ? totalDistance : 0);
  const rounded = Math.round(safe * 100) / 100;
  const km = Math.floor(rounded / 1000);
  const rem = Number((rounded - km * 1000).toFixed(2));
  const intPart = Math.floor(rem);
  const decPart = rem - intPart;
  const paddedInt = String(intPart).padStart(3, '0');
  if (decPart > 0) {
    const decStr = Number(decPart.toFixed(2)).toString().slice(1);
    return `${km}+${paddedInt}${decStr}`;
  }
  return `${km}+${paddedInt}`;
}

export function parseChainage(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  if (cleaned.includes('+')) {
    const parts = cleaned.split('+');
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
    const major = Number(parts[0].trim());
    const minor = Number(parts[1].trim());
    if (Number.isNaN(major) || Number.isNaN(minor) || major < 0 || minor < 0) return null;
    return major * 1000 + minor;
  }
  const numeric = Number(cleaned);
  if (Number.isNaN(numeric) || numeric < 0) return null;
  return numeric;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  unitSystem: 'metric',
  defaultPostHeight: 2.4,
  defaultMeshHeight: 2.0,
  defaultRoadWidth: 7.5,
  defaultRrmHeight: 0.6,
  compactMode: false,
  items: {
    anglePosts: { enabled: true, label: 'Angle Posts (Corner / End)', unit: 'pcs' },
    intermediatePosts: { enabled: true, label: 'Intermediate Posts', unit: 'pcs' },
    strutPosts: { enabled: true, label: 'Strut Posts', unit: 'pcs' },
    gatePosts: { enabled: false, label: 'Gate Posts', unit: 'pcs' },
    chainLinkMesh: { enabled: true, label: 'Chain-Link Mesh Length', unit: 'm', quickSteps: [1, 5, 10, 50] },
    rrmWall: { enabled: true, label: 'RRM Foundation Wall Volume', unit: 'm³', quickSteps: [1, 5, 10] },
    roadMeasurement: { enabled: true, label: 'Road Measurement (Length & Width)', unit: 'm', quickSteps: [10, 50, 100, 500] },
    sideDrain: { enabled: false, label: 'Road Side Drain Length', unit: 'm', quickSteps: [10, 25, 50, 100] },
  },
  customItems: [],
};

export function createDefaultProjectSettings(): ProjectSettings {
  return {
    unitSystem: DEFAULT_PROJECT_SETTINGS.unitSystem,
    defaultPostHeight: DEFAULT_PROJECT_SETTINGS.defaultPostHeight,
    defaultMeshHeight: DEFAULT_PROJECT_SETTINGS.defaultMeshHeight,
    defaultRoadWidth: DEFAULT_PROJECT_SETTINGS.defaultRoadWidth,
    defaultRrmHeight: DEFAULT_PROJECT_SETTINGS.defaultRrmHeight,
    compactMode: DEFAULT_PROJECT_SETTINGS.compactMode,
    items: {
      anglePosts: { ...DEFAULT_PROJECT_SETTINGS.items.anglePosts },
      intermediatePosts: { ...DEFAULT_PROJECT_SETTINGS.items.intermediatePosts },
      strutPosts: { ...DEFAULT_PROJECT_SETTINGS.items.strutPosts },
      gatePosts: { ...DEFAULT_PROJECT_SETTINGS.items.gatePosts },
      chainLinkMesh: {
        ...DEFAULT_PROJECT_SETTINGS.items.chainLinkMesh,
        quickSteps: [...(DEFAULT_PROJECT_SETTINGS.items.chainLinkMesh.quickSteps ?? [1, 5, 10, 50])],
      },
      rrmWall: {
        ...DEFAULT_PROJECT_SETTINGS.items.rrmWall,
        quickSteps: [...(DEFAULT_PROJECT_SETTINGS.items.rrmWall.quickSteps ?? [1, 5, 10])],
      },
      roadMeasurement: {
        ...DEFAULT_PROJECT_SETTINGS.items.roadMeasurement,
        quickSteps: [...(DEFAULT_PROJECT_SETTINGS.items.roadMeasurement.quickSteps ?? [10, 50, 100, 500])],
      },
      sideDrain: {
        ...DEFAULT_PROJECT_SETTINGS.items.sideDrain,
        quickSteps: [...(DEFAULT_PROJECT_SETTINGS.items.sideDrain.quickSteps ?? [10, 25, 50, 100])],
      },
    },
    customItems: [],
  };
}

export function getProjectSettings(project: ConstructionProject): ProjectSettings {
  const s = project.settings;
  if (!s) {
    return createDefaultProjectSettings();
  }

  return {
    unitSystem: s.unitSystem || 'metric',
    defaultPostHeight: s.defaultPostHeight ?? 2.4,
    defaultMeshHeight: s.defaultMeshHeight ?? 2.0,
    defaultRoadWidth: s.defaultRoadWidth ?? 7.5,
    defaultRrmHeight: s.defaultRrmHeight ?? 0.6,
    compactMode: s.compactMode ?? false,
    items: {
      anglePosts: { ...DEFAULT_PROJECT_SETTINGS.items.anglePosts, ...s.items?.anglePosts },
      intermediatePosts: { ...DEFAULT_PROJECT_SETTINGS.items.intermediatePosts, ...s.items?.intermediatePosts },
      strutPosts: { ...DEFAULT_PROJECT_SETTINGS.items.strutPosts, ...s.items?.strutPosts },
      gatePosts: { ...DEFAULT_PROJECT_SETTINGS.items.gatePosts, ...s.items?.gatePosts },
      chainLinkMesh: { ...DEFAULT_PROJECT_SETTINGS.items.chainLinkMesh, ...s.items?.chainLinkMesh },
      rrmWall: { ...DEFAULT_PROJECT_SETTINGS.items.rrmWall, ...s.items?.rrmWall },
      roadMeasurement: { ...DEFAULT_PROJECT_SETTINGS.items.roadMeasurement, ...s.items?.roadMeasurement },
      sideDrain: { ...DEFAULT_PROJECT_SETTINGS.items.sideDrain, ...s.items?.sideDrain },
    },
    customItems: Array.isArray(s.customItems) ? s.customItems : [],
  };
}

export const INITIAL_DEMO_PROJECT: ConstructionProject = {
  id: 'proj-new-1',
  name: 'New Site Measurement Project',
  clientName: '',
  location: '',
  createdAt: 0,
  updatedAt: 0,
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
