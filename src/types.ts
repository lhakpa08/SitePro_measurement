export type ProjectType = 'fence' | 'road' | 'both';

export type PostType = 'angle_post' | 'intermediate_post' | 'strut_post' | 'gate_post';

export interface GpsCoordinate {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
}

export interface FencePostEntry {
  id: string;
  postNumber: number;
  postType: PostType;
  heightMeters: number;
  gps?: GpsCoordinate;
  notes?: string;
  createdAt: number;
}

export interface FenceMeshSegment {
  id: string;
  segmentName: string;
  lengthMeters: number;
  meshHeightMeters: number;
  meshGauge: string;
  barbedWireStrands: number;
  hasTensionWire: boolean;
  notes?: string;
  createdAt: number;
}

export interface RrmWallSegment {
  id: string;
  sectionName: string;
  lengthMeters: number;
  heightMeters: number;
  heightEntries?: number[];
  topWidthMeters: number;
  topWidthEntries?: number[];
  bottomWidthMeters: number;
  bottomWidthEntries?: number[];
  notes?: string;
  createdAt: number;
}

export interface RoadSectionEntry {
  id: string;
  chainageStart: string; // e.g. "0+000"
  chainageEnd: string;   // e.g. "0+250"
  sectionName: string;
  lengthMeters: number;
  widthMeters: number;
  widthEntries?: number[];
  
  // Layers thicknesses in mm
  subBaseThicknessMm: number; // GSB
  wmmThicknessMm: number;     // Wet Mix Macadam
  primeCoatRequired: boolean; // Prime coat
  acThicknessMm: number;      // Asphalt Concrete / DBM
  
  earthworkCutDepthMeters: number; // Excavation depth
  depthEntries?: number[];
  sideDrainLengthMeters: number;
  startGps?: GpsCoordinate;
  endGps?: GpsCoordinate;
  notes?: string;
  createdAt: number;
}

export interface CustomAuditItem {
  id: string;
  name: string;
  category: 'fencing' | 'road' | 'general';
  unit: string;
  quantity: number;
  verifiedQuantity?: number;
  quickSteps: number[];
  enabled: boolean;
}

export interface StandardItemConfig {
  enabled: boolean;
  label: string;
  unit: string;
  quickSteps?: number[];
}

export interface ProjectSettings {
  unitSystem: 'metric' | 'imperial' | 'custom';
  defaultPostHeight: number;
  defaultMeshHeight: number;
  defaultRoadWidth: number;
  defaultRrmHeight: number;
  compactMode?: boolean;
  items: {
    anglePosts: StandardItemConfig;
    intermediatePosts: StandardItemConfig;
    strutPosts: StandardItemConfig;
    gatePosts: StandardItemConfig;
    chainLinkMesh: StandardItemConfig;
    rrmWall: StandardItemConfig;
    roadMeasurement: StandardItemConfig;
    sideDrain: StandardItemConfig;
  };
  customItems: CustomAuditItem[];
}

export interface ConstructionProject {
  id: string;
  name: string;
  clientName: string;
  location: string;
  createdAt: number;
  updatedAt: number;
  fencePosts: FencePostEntry[];
  fenceMeshSegments: FenceMeshSegment[];
  rrmWalls: RrmWallSegment[];
  roadSections: RoadSectionEntry[];
  siteCoordinates?: GpsCoordinate & { label?: string; source?: 'gps' | 'search' | 'pin' };
  settings?: ProjectSettings;
  auditNotes?: string;
  auditInfo?: {
    auditorName: string;
    auditDate: string;
    auditStatus: 'pending' | 'verified_with_variance' | 'fully_compliant';
    generalRemarks: string;
    verifiedPostCount?: number;
    verifiedMeshLength?: number;
    verifiedRrmVolume?: number;
    verifiedRoadLength?: number;
    verifiedSideDrainLength?: number;
    verifiedCustomItems?: Record<string, number>;
  };
}
