import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
  useMapsLibrary,
  useAdvancedMarkerRef,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { ConstructionProject, FencePostEntry, GpsCoordinate, PostType } from '../types';
import {
  getGoogleMapsApiKey,
  getProjectMapData,
  ReportMapType,
  StaticMapScope,
} from '../utils/staticMap';
import { getProjectSettings, formatChainage, parseChainage } from '../utils/geo';
import {
  MapPin,
  Crosshair,
  Search,
  Maximize2,
  Route,
  Layers,
  X,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  Ruler,
  Target
} from 'lucide-react';

interface SiteReportMapProps {
  project: ConstructionProject;
  currentGps?: { lat: number; lng: number; accuracy?: number };
  onUpdateProject: (updated: ConstructionProject) => void;
  scope?: StaticMapScope;
  readOnly?: boolean;
}

type PinMode = 'browse' | 'site' | 'road_start' | 'road_end';

interface ActiveInfo {
  id: string;
  title: string;
  subtitle: string;
  coords: GpsCoordinate;
  anchor: google.maps.marker.AdvancedMarkerElement | null;
}

const POST_LABELS: Record<PostType, string> = {
  angle_post: 'Angle Post',
  intermediate_post: 'Intermediate Post',
  strut_post: 'Strut Post',
  gate_post: 'Gate Post',
};

const POST_PIN_COLORS: Record<PostType, { bg: string; border: string; glyph: string }> = {
  angle_post: { bg: '#f59e0b', border: '#b45309', glyph: '#0f172a' },
  intermediate_post: { bg: '#2563eb', border: '#1d4ed8', glyph: '#ffffff' },
  strut_post: { bg: '#4f46e5', border: '#3730a3', glyph: '#ffffff' },
  gate_post: { bg: '#0d9488', border: '#115e59', glyph: '#ffffff' },
};

function notifyQuotaIfNeeded(err: unknown) {
  const text = String(err ?? '');
  if (
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('QuotaExceeded') ||
    text.includes('429')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

function calculateDistanceMeters(p1: GpsCoordinate, p2: GpsCoordinate): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
  const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
  const lat1 = p1.lat * (Math.PI / 180);
  const lat2 = p2.lat * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface PlaceSearchBarProps {
  onSelectPlace: (coords: GpsCoordinate, label: string) => void;
}

const PlaceSearchBar: React.FC<PlaceSearchBarProps> = ({ onSelectPlace }) => {
  const placesLib = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
        }
        setIsSearching(true);
        setSearchError(null);
        const res = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
        });
        setSuggestions(res.suggestions || []);
      } catch (err) {
        notifyQuotaIfNeeded(err);
        setSuggestions([]);
        setSearchError('Unable to fetch place suggestions.');
      } finally {
        setIsSearching(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [placesLib, query]);

  const handleChoose = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      if (place.location) {
        const label =
          place.formattedAddress ||
          place.displayName ||
          suggestion.placePrediction.text.text;
        onSelectPlace(
          {
            lat: place.location.lat(),
            lng: place.location.lng(),
            timestamp: Date.now(),
          },
          label
        );
      }
      setQuery('');
      setSuggestions([]);
      sessionTokenRef.current = null;
    } catch (err) {
      notifyQuotaIfNeeded(err);
      setSearchError('Unable to resolve selected place.');
    }
  };

  return (
    <div className="relative flex-1 min-w-[200px]">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search site address or landmark..."
          aria-label="Search site address or landmark"
          className="w-full min-h-[44px] pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setSearchError(null);
            }}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {(suggestions.length > 0 || isSearching || searchError) && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {isSearching && suggestions.length === 0 && (
            <div className="px-3.5 py-2.5 text-xs text-slate-500">Searching places...</div>
          )}
          {searchError && (
            <div className="px-3.5 py-2.5 text-xs text-rose-600">{searchError}</div>
          )}
          {suggestions.map((s, idx) => (
            <button
              key={s.placePrediction?.placeId || idx}
              type="button"
              onClick={() => void handleChoose(s)}
              className="w-full text-left px-3.5 py-2.5 min-h-[44px] text-xs text-slate-700 hover:bg-amber-50 hover:text-slate-900 border-b last:border-b-0 border-slate-100 flex items-start gap-2 transition"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
              <span className="leading-snug">{s.placePrediction?.text.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface GpsAccuracyOverlayProps {
  currentGps?: { lat: number; lng: number; accuracy?: number };
  showAccuracyCircle: boolean;
}

const GpsAccuracyOverlay: React.FC<GpsAccuracyOverlayProps> = ({ currentGps, showAccuracyCircle }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !currentGps || !showAccuracyCircle) return;

    const radius = currentGps.accuracy ?? 15; // meters
    const circle = new mapsLib.Circle({
      map,
      center: { lat: currentGps.lat, lng: currentGps.lng },
      radius,
      fillColor: '#0ea5e9',
      fillOpacity: 0.22,
      strokeColor: '#0284c7',
      strokeOpacity: 0.9,
      strokeWeight: 1.5,
    });

    return () => {
      circle.setMap(null);
    };
  }, [map, mapsLib, currentGps, showAccuracyCircle]);

  return null;
};

interface MapOverlaysProps {
  roadStart?: GpsCoordinate;
  roadEnd?: GpsCoordinate;
  gpsPosts: Array<FencePostEntry & { gps: GpsCoordinate }>;
  allPoints: GpsCoordinate[];
  fitTrigger: number;
  showRoadPolyline: boolean;
  showFencePolyline: boolean;
  measurePoints?: GpsCoordinate[];
  currentGps?: { lat: number; lng: number; accuracy?: number };
  showAccuracyCircle: boolean;
}

const MapOverlays: React.FC<MapOverlaysProps> = ({
  roadStart,
  roadEnd,
  gpsPosts,
  allPoints,
  fitTrigger,
  showRoadPolyline,
  showFencePolyline,
  measurePoints,
  currentGps,
  showAccuracyCircle,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const coreLib = useMapsLibrary('core');

  // Draw road alignment polyline, fence posts sequence polyline, and distance measurement line
  useEffect(() => {
    if (!map || !mapsLib) return;

    const polylines: google.maps.Polyline[] = [];

    if (showRoadPolyline && roadStart && roadEnd) {
      polylines.push(
        new mapsLib.Polyline({
          map,
          path: [
            { lat: roadStart.lat, lng: roadStart.lng },
            { lat: roadEnd.lat, lng: roadEnd.lng },
          ],
          strokeColor: '#059669',
          strokeOpacity: 0.95,
          strokeWeight: 4.5,
          geodesic: true,
        })
      );
    }

    if (showFencePolyline && gpsPosts.length >= 2) {
      polylines.push(
        new mapsLib.Polyline({
          map,
          path: gpsPosts.map((p) => ({ lat: p.gps.lat, lng: p.gps.lng })),
          strokeColor: '#d97706',
          strokeOpacity: 0.9,
          strokeWeight: 3.5,
          geodesic: true,
        })
      );
    }

    if (measurePoints && measurePoints.length === 2) {
      polylines.push(
        new mapsLib.Polyline({
          map,
          path: [
            { lat: measurePoints[0].lat, lng: measurePoints[0].lng },
            { lat: measurePoints[1].lat, lng: measurePoints[1].lng },
          ],
          strokeColor: '#7c3aed',
          strokeOpacity: 0.95,
          strokeWeight: 4,
          geodesic: true,
        })
      );
    }

    return () => {
      polylines.forEach((line) => line.setMap(null));
    };
  }, [map, mapsLib, roadStart, roadEnd, gpsPosts, showRoadPolyline, showFencePolyline, measurePoints]);

  // Fit bounds when requested or when points change significantly
  const pointsSignature = allPoints
    .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join('|');

  useEffect(() => {
    if (!map || !coreLib || allPoints.length === 0) return;

    if (allPoints.length === 1) {
      map.panTo({ lat: allPoints[0].lat, lng: allPoints[0].lng });
      const currentZoom = map.getZoom() ?? 0;
      if (currentZoom < 15) {
        map.setZoom(17);
      }
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    allPoints.forEach((pt) => bounds.extend({ lat: pt.lat, lng: pt.lng }));
    map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
  }, [map, coreLib, pointsSignature, fitTrigger]);

  return <GpsAccuracyOverlay currentGps={currentGps} showAccuracyCircle={showAccuracyCircle} />;
};

interface InteractivePinMarkerProps {
  id: string;
  position: GpsCoordinate;
  title: string;
  subtitle: string;
  pinBg: string;
  pinBorder: string;
  pinGlyphColor: string;
  glyphText?: string;
  draggable?: boolean;
  onDragEnd?: (coords: GpsCoordinate) => void;
  onOpenInfo: (info: ActiveInfo) => void;
}

const InteractivePinMarker: React.FC<InteractivePinMarkerProps> = ({
  id,
  position,
  title,
  subtitle,
  pinBg,
  pinBorder,
  pinGlyphColor,
  glyphText,
  draggable = false,
  onDragEnd,
  onOpenInfo,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: position.lat, lng: position.lng }}
      title={title}
      draggable={draggable}
      onClick={() =>
        onOpenInfo({
          id,
          title,
          subtitle,
          coords: position,
          anchor: marker,
        })
      }
      onDragEnd={(e) => {
        if (!onDragEnd || !e.latLng) return;
        onDragEnd({
          lat: e.latLng.lat(),
          lng: e.latLng.lng(),
          timestamp: Date.now(),
        });
      }}
    >
      <Pin
        background={pinBg}
        borderColor={pinBorder}
        glyphColor={pinGlyphColor}
        glyphText={glyphText}
      />
    </AdvancedMarker>
  );
};

export const SiteReportMap: React.FC<SiteReportMapProps> = ({
  project,
  currentGps,
  onUpdateProject,
  scope = 'all',
  readOnly = false,
}) => {
  const apiKey = getGoogleMapsApiKey();
  const settings = getProjectSettings(project);
  const isImperial = settings.unitSystem === 'imperial';
  const lengthUnit = isImperial ? 'ft' : 'm';
  const unitFactor = isImperial ? 3.28084 : 1.0;

  const [mapType, setMapType] = useState<ReportMapType>('satellite');
  const [showAccuracyCircle, setShowAccuracyCircle] = useState<boolean>(true);
  const [pinMode, setPinMode] = useState<PinMode>('browse');
  const [fitTrigger, setFitTrigger] = useState(0);
  const [activeInfo, setActiveInfo] = useState<ActiveInfo | null>(null);

  // Distance Measurement Tool State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<GpsCoordinate[]>([]);

  // Polyline visualization toggles
  const [showRoadPolyline, setShowRoadPolyline] = useState<boolean>(true);
  const [showFencePolyline, setShowFencePolyline] = useState<boolean>(true);
  const [showInputPins, setShowInputPins] = useState<boolean>(true);

  const mapData = useMemo(() => getProjectMapData(project, scope), [project, scope]);
  const roadSection = project.roadSections[0];

  const initialCamera = useMemo(() => {
    if (mapData.sitePin) {
      return { center: { lat: mapData.sitePin.lat, lng: mapData.sitePin.lng }, zoom: 17 };
    }
    if (mapData.allPoints.length > 0) {
      return {
        center: { lat: mapData.allPoints[0].lat, lng: mapData.allPoints[0].lng },
        zoom: 16,
      };
    }
    if (currentGps) {
      return { center: { lat: currentGps.lat, lng: currentGps.lng }, zoom: 16 };
    }
    return { center: { lat: 20, lng: 0 }, zoom: 2 };
  }, [mapData.sitePin, mapData.allPoints, currentGps]);

  const applySitePin = useCallback(
    (coords: GpsCoordinate, label?: string, source: 'gps' | 'search' | 'pin' = 'pin') => {
      const updated: ConstructionProject = {
        ...project,
        siteCoordinates: {
          lat: coords.lat,
          lng: coords.lng,
          accuracy: coords.accuracy,
          timestamp: coords.timestamp ?? Date.now(),
          label: label ?? project.siteCoordinates?.label ?? project.location,
          source,
        },
        ...(label ? { location: label } : {}),
        updatedAt: Date.now(),
      };
      onUpdateProject(updated);
    },
    [project, onUpdateProject]
  );

  const applyRoadPin = useCallback(
    (which: 'start' | 'end', coords: GpsCoordinate) => {
      const baseSections =
        project.roadSections.length > 0
          ? [...project.roadSections]
          : [
              {
                id: `road-${Date.now()}`,
                sectionName: 'Access Road Alignment',
                chainageStart: '0+000',
                chainageEnd: '0+000',
                lengthMeters: 0,
                widthMeters: project.settings?.defaultRoadWidth ?? 7.5,
                subBaseThicknessMm: 150,
                wmmThicknessMm: 200,
                primeCoatRequired: true,
                acThicknessMm: 50,
                earthworkCutDepthMeters: 0,
                sideDrainLengthMeters: 0,
                createdAt: Date.now(),
              },
            ];

      baseSections[0] = {
        ...baseSections[0],
        ...(which === 'start' ? { startGps: coords } : { endGps: coords }),
      };

      onUpdateProject({
        ...project,
        roadSections: baseSections,
        updatedAt: Date.now(),
      });
    },
    [project, onUpdateProject]
  );

  const measuredDistanceMeters = useMemo(() => {
    if (measurePoints.length !== 2) return 0;
    return calculateDistanceMeters(measurePoints[0], measurePoints[1]);
  }, [measurePoints]);

  const measuredDisplayValue = Number((measuredDistanceMeters * unitFactor).toFixed(2));

  const handleApplyMeasuredToRoad = () => {
    if (measurePoints.length !== 2) return;
    const baseSections =
      project.roadSections.length > 0
        ? [...project.roadSections]
        : [
            {
              id: `road-${Date.now()}`,
              sectionName: 'Access Road Alignment',
              chainageStart: '0+000',
              chainageEnd: formatChainage(measuredDisplayValue),
              lengthMeters: measuredDisplayValue,
              widthMeters: settings.defaultRoadWidth,
              subBaseThicknessMm: 150,
              wmmThicknessMm: 200,
              primeCoatRequired: true,
              acThicknessMm: 50,
              earthworkCutDepthMeters: 0,
              sideDrainLengthMeters: 0,
              createdAt: Date.now(),
            },
          ];
    const startNum = parseChainage(baseSections[0].chainageStart) ?? 0;
    baseSections[0] = {
      ...baseSections[0],
      lengthMeters: measuredDisplayValue,
      chainageEnd: formatChainage(startNum + measuredDisplayValue),
    };
    if (baseSections.length > 1) {
      for (let i = 1; i < baseSections.length; i++) {
        baseSections[i] = { ...baseSections[i], lengthMeters: 0 };
      }
    }
    onUpdateProject({
      ...project,
      roadSections: baseSections,
      updatedAt: Date.now(),
    });
    setIsMeasuring(false);
    setMeasurePoints([]);
  };

  const handleApplyMeasuredToFence = () => {
    if (measurePoints.length !== 2) return;
    const baseSegments =
      project.fenceMeshSegments.length > 0
        ? [...project.fenceMeshSegments]
        : [
            {
              id: `mesh-${Date.now()}`,
              segmentName: 'Main Boundary Span',
              lengthMeters: measuredDisplayValue,
              meshHeightMeters: settings.defaultMeshHeight,
              meshGauge: '10 Gauge',
              barbedWireStrands: 3,
              hasTensionWire: true,
              createdAt: Date.now(),
            },
          ];
    baseSegments[0] = {
      ...baseSegments[0],
      lengthMeters: measuredDisplayValue,
    };
    if (baseSegments.length > 1) {
      for (let i = 1; i < baseSegments.length; i++) {
        baseSegments[i] = { ...baseSegments[i], lengthMeters: 0 };
      }
    }
    onUpdateProject({
      ...project,
      fenceMeshSegments: baseSegments,
      updatedAt: Date.now(),
    });
    setIsMeasuring(false);
    setMeasurePoints([]);
  };

  const handleMapClick = (ev: MapMouseEvent) => {
    setActiveInfo(null);
    if (!ev.detail.latLng) return;

    const coords: GpsCoordinate = {
      lat: ev.detail.latLng.lat,
      lng: ev.detail.latLng.lng,
      timestamp: Date.now(),
    };

    if (isMeasuring) {
      if (measurePoints.length === 0 || measurePoints.length === 2) {
        setMeasurePoints([coords]);
      } else if (measurePoints.length === 1) {
        setMeasurePoints([measurePoints[0], coords]);
      }
      return;
    }

    if (pinMode === 'browse') return;

    if (pinMode === 'site') {
      applySitePin(coords, undefined, 'pin');
    } else if (pinMode === 'road_start') {
      applyRoadPin('start', coords);
    } else if (pinMode === 'road_end') {
      applyRoadPin('end', coords);
    }
    setPinMode('browse');
  };

  if (!apiKey) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Google Maps API key not configured</p>
          <p className="mt-0.5 text-amber-800">
            Configure your Google Maps Platform API key in environment settings to render live interactive and printable static maps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['marker', 'places']}>
      <div className="space-y-3">
        {/* Controls Toolbar */}
        {!readOnly && (
        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
          <PlaceSearchBar
            onSelectPlace={(coords, label) => {
              applySitePin(coords, label, 'search');
              setFitTrigger((n) => n + 1);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            {currentGps && (
              <button
                type="button"
                onClick={() => {
                  applySitePin(
                    {
                      lat: currentGps.lat,
                      lng: currentGps.lng,
                      accuracy: currentGps.accuracy,
                      timestamp: Date.now(),
                    },
                    undefined,
                    'gps'
                  );
                  setFitTrigger((n) => n + 1);
                }}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition whitespace-nowrap"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Lock Current GPS</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsMeasuring(!isMeasuring);
                if (!isMeasuring) {
                  setPinMode('browse');
                  setMeasurePoints([]);
                }
              }}
              className={`min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-1.5 transition whitespace-nowrap ${
                isMeasuring
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>{isMeasuring ? 'Measuring Active' : 'Measure Distance'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPinMode(pinMode === 'site' ? 'browse' : 'site');
                if (pinMode !== 'site') setIsMeasuring(false);
              }}
              className={`min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-1.5 transition whitespace-nowrap ${
                pinMode === 'site'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{pinMode === 'site' ? 'Tap Map for Site' : 'Pin Site'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPinMode(pinMode === 'road_start' ? 'browse' : 'road_start');
                if (pinMode !== 'road_start') setIsMeasuring(false);
              }}
              className={`min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-1.5 transition whitespace-nowrap ${
                pinMode === 'road_start'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <Route className="w-3.5 h-3.5" />
              <span>{pinMode === 'road_start' ? 'Tap Map for Start' : 'Pin Road A'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPinMode(pinMode === 'road_end' ? 'browse' : 'road_end');
                if (pinMode !== 'road_end') setIsMeasuring(false);
              }}
              className={`min-h-[44px] sm:min-h-[38px] px-3 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-1.5 transition whitespace-nowrap ${
                pinMode === 'road_end'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <Route className="w-3.5 h-3.5" />
              <span>{pinMode === 'road_end' ? 'Tap Map for End' : 'Pin Road B'}</span>
            </button>

            {mapData.allPoints.length > 0 && (
              <button
                type="button"
                onClick={() => setFitTrigger((n) => n + 1)}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition whitespace-nowrap"
                title="Fit all site markers in view"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fit</span>
              </button>
            )}
          </div>
        </div>
        )}

        {/* Distance Measurement Active Floating Card */}
        {isMeasuring && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-600 text-white rounded-lg shrink-0">
                <Ruler className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-purple-900">
                  {measurePoints.length === 0
                    ? 'Distance Tool: Click Point 1 on map'
                    : measurePoints.length === 1
                    ? 'Point 1 set. Click Point 2 on map to measure distance.'
                    : `Measured Distance: ${measuredDisplayValue.toLocaleString()} ${lengthUnit}`}
                </div>
                <div className="text-purple-700 text-[11px] mt-0.5">
                  {measurePoints.length === 2
                    ? 'Apply measured distance directly to road length or fence mesh planning.'
                    : 'Real-time geodetic distance calculation for road & fence planning.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {measurePoints.length === 2 && (
                <>
                  <button
                    type="button"
                    onClick={handleApplyMeasuredToRoad}
                    className="min-h-[36px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition"
                  >
                    Apply to Road ({measuredDisplayValue} {lengthUnit})
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyMeasuredToFence}
                    className="min-h-[36px] px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition"
                  >
                    Apply to Fence Mesh
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setMeasurePoints([])}
                className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 font-semibold rounded-lg transition"
              >
                Reset Points
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMeasuring(false);
                  setMeasurePoints([]);
                }}
                className="min-h-[36px] px-2.5 py-1.5 text-purple-700 hover:text-purple-900 font-semibold"
              >
                Close Tool
              </button>
            </div>
          </div>
        )}

        {/* Map Type (Satellite vs Roadmap), GPS Accuracy Circle Toggle & Polyline Layer Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Satellite vs Roadmap Toggle */}
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {(['satellite', 'roadmap', 'hybrid'] as ReportMapType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMapType(t)}
                  className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition ${
                    mapType === t
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* GPS Accuracy Circle Overlay Toggle */}
            <button
              type="button"
              onClick={() => setShowAccuracyCircle(!showAccuracyCircle)}
              className={`px-3 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5 border transition ${
                showAccuracyCircle
                  ? 'bg-sky-50 text-sky-700 border-sky-300'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
              title="Toggle GPS Accuracy Circle Overlay on Map"
            >
              <Target className="w-3.5 h-3.5 text-sky-600" />
              <span>Accuracy Ring: {showAccuracyCircle ? 'On' : 'Off'}</span>
            </button>

            {/* Polyline Path Layer Toggles */}
            <div className="inline-flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setShowRoadPolyline(!showRoadPolyline)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 transition ${
                  showRoadPolyline ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Toggle Road Route Polyline Overlay"
              >
                {showRoadPolyline ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>Road Path</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFencePolyline(!showFencePolyline)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 transition ${
                  showFencePolyline ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Toggle Fencing Posts Sequence Polyline Overlay"
              >
                {showFencePolyline ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>Fence Path</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInputPins(!showInputPins)}
                className={`px-2.5 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1 transition ${
                  showInputPins ? 'bg-violet-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Toggle Input-Captured Location Pins"
              >
                {showInputPins ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>Input Pins ({mapData.inputLocations.length})</span>
              </button>
            </div>
          </div>

          <div className="text-slate-500">
            {isMeasuring ? (
              <span className="font-semibold text-purple-700">
                Distance Tool: Click 2 points on map to measure.
              </span>
            ) : pinMode !== 'browse' ? (
              <span className="font-semibold text-amber-700">
                Click or tap map for{' '}
                {pinMode === 'site'
                  ? 'Site Reference Pin'
                  : pinMode === 'road_start'
                  ? 'Road Start (A)'
                  : 'Road End (B)'}
                .
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Polylines connect road route &amp; logged post sequence.</span>
              </span>
            )}
          </div>
        </div>

        {/* Interactive Map Container */}
        <div className="w-full h-[360px] sm:h-[440px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={initialCamera.center}
            defaultZoom={initialCamera.zoom}
            mapTypeId={mapType}
            gestureHandling="greedy"
            streetViewControl={false}
            fullscreenControl={true}
            mapTypeControl={false}
            onClick={handleMapClick}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <MapOverlays
              roadStart={mapData.roadStart}
              roadEnd={mapData.roadEnd}
              gpsPosts={mapData.gpsPosts}
              allPoints={mapData.allPoints}
              fitTrigger={fitTrigger}
              showRoadPolyline={showRoadPolyline}
              showFencePolyline={showFencePolyline}
              measurePoints={measurePoints}
              currentGps={currentGps}
              showAccuracyCircle={showAccuracyCircle}
            />

            {/* Distance Measurement Points */}
            {measurePoints.map((pt, idx) => (
              <InteractivePinMarker
                key={`measure-${idx}`}
                id={`measure-${idx}`}
                position={pt}
                title={`Measure Point ${idx + 1}`}
                subtitle="Distance Measurement Marker"
                pinBg="#7c3aed"
                pinBorder="#5b21b6"
                pinGlyphColor="#ffffff"
                glyphText={String(idx + 1)}
                onOpenInfo={setActiveInfo}
              />
            ))}

            {/* Site Reference Pin */}
            {mapData.sitePin && (
              <InteractivePinMarker
                id="site-pin"
                position={mapData.sitePin}
                title={`Site Reference: ${project.name}`}
                subtitle={project.location || 'Site Anchor Pin (Drag to adjust)'}
                pinBg="#e11d48"
                pinBorder="#9f1239"
                pinGlyphColor="#ffffff"
                glyphText="S"
                draggable
                onDragEnd={(coords) => applySitePin(coords, undefined, 'pin')}
                onOpenInfo={setActiveInfo}
              />
            )}

            {/* Road Start Pin */}
            {mapData.roadStart && (
              <InteractivePinMarker
                id="road-start"
                position={mapData.roadStart}
                title={`Road Start (${roadSection?.chainageStart || '0+000'})`}
                subtitle="Road Alignment Start"
                pinBg="#059669"
                pinBorder="#065f46"
                pinGlyphColor="#ffffff"
                glyphText="A"
                draggable
                onDragEnd={(coords) => applyRoadPin('start', coords)}
                onOpenInfo={setActiveInfo}
              />
            )}

            {/* Road End Pin */}
            {mapData.roadEnd && (
              <InteractivePinMarker
                id="road-end"
                position={mapData.roadEnd}
                title={`Road End (${roadSection?.chainageEnd || '0+000'})`}
                subtitle="Road Alignment End"
                pinBg="#059669"
                pinBorder="#065f46"
                pinGlyphColor="#ffffff"
                glyphText="B"
                draggable
                onDragEnd={(coords) => applyRoadPin('end', coords)}
                onOpenInfo={setActiveInfo}
              />
            )}

            {/* Logged Fence Posts with GPS */}
            {mapData.gpsPosts.map((post, idx) => {
              const colors = POST_PIN_COLORS[post.postType];
              return (
                <InteractivePinMarker
                  key={post.id}
                  id={post.id}
                  position={post.gps}
                  title={`Post #${idx + 1} · ${POST_LABELS[post.postType]}`}
                  subtitle={`Height: ${post.heightMeters}m`}
                  pinBg={colors.bg}
                  pinBorder={colors.border}
                  pinGlyphColor={colors.glyph}
                  onOpenInfo={setActiveInfo}
                />
              );
            })}

            {/* Captured Input Location Pins */}
            {showInputPins &&
              mapData.inputLocations.map((loc, idx) => (
                <InteractivePinMarker
                  key={loc.id}
                  id={loc.id}
                  position={loc.gps}
                  title={`Input: ${loc.fieldLabel}`}
                  subtitle={`${loc.valueSummary ? `${loc.valueSummary} · ` : ''}Captured ${new Date(loc.capturedAt).toLocaleTimeString()}`}
                  pinBg="#7c3aed"
                  pinBorder="#5b21b6"
                  pinGlyphColor="#ffffff"
                  glyphText={String(idx + 1)}
                  onOpenInfo={setActiveInfo}
                />
              ))}

            {/* Current Surveyor Live GPS Indicator */}
            {currentGps && (
              <AdvancedMarker
                position={{ lat: currentGps.lat, lng: currentGps.lng }}
                title="Current Device GPS"
              >
                <div
                  className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-md"
                  title={`Live GPS: ${currentGps.lat.toFixed(6)}, ${currentGps.lng.toFixed(6)}`}
                />
              </AdvancedMarker>
            )}

            {activeInfo && activeInfo.anchor && (
              <InfoWindow
                anchor={activeInfo.anchor}
                onCloseClick={() => setActiveInfo(null)}
                maxWidth={240}
              >
                <div className="text-slate-900 space-y-1 p-0.5">
                  <div className="font-bold text-xs">{activeInfo.title}</div>
                  <div className="text-[11px] text-slate-600">{activeInfo.subtitle}</div>
                  <div className="text-[11px] font-mono text-slate-800 tabular-nums pt-0.5">
                    {activeInfo.coords.lat.toFixed(6)}°, {activeInfo.coords.lng.toFixed(6)}°
                  </div>
                  {activeInfo.coords.accuracy !== undefined && (
                    <div className="text-[10px] text-slate-500 tabular-nums">
                      Accuracy: &plusmn;{Math.round(activeInfo.coords.accuracy)} m
                    </div>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </div>

        {/* Coordinate Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-slate-500 font-medium">Site Anchor (S)</div>
              <div className="font-mono font-semibold text-slate-900 tabular-nums truncate mt-0.5">
                {mapData.sitePin
                  ? `${mapData.sitePin.lat.toFixed(6)}, ${mapData.sitePin.lng.toFixed(6)}`
                  : 'Not pinned yet'}
              </div>
            </div>
            {!readOnly && mapData.sitePin && (
              <button
                type="button"
                onClick={() =>
                  onUpdateProject({ ...project, siteCoordinates: undefined, updatedAt: Date.now() })
                }
                aria-label="Clear site pin"
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="min-w-0">
            <div className="text-slate-500 font-medium">Road Route Polyline (A &rarr; B)</div>
            <div className="font-mono font-semibold text-slate-900 tabular-nums truncate mt-0.5">
              {mapData.roadStart && mapData.roadEnd
                ? `Active (${roadSection?.lengthMeters ?? 0}m)`
                : 'Road GPS A/B needed'}
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-slate-500 font-medium">Fence Posts Polyline</div>
            <div className="font-semibold text-slate-900 tabular-nums mt-0.5">
              {mapData.gpsPosts.length} posts connected
            </div>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-slate-500 font-medium">Input Locations Captured</div>
              <div className="font-semibold text-violet-700 tabular-nums mt-0.5">
                {mapData.inputLocations.length} GPS pin{mapData.inputLocations.length === 1 ? '' : 's'}
              </div>
            </div>
            {!readOnly && mapData.inputLocations.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onUpdateProject({ ...project, inputLocations: [], updatedAt: Date.now() })
                }
                aria-label="Clear captured input locations"
                title="Clear captured input locations"
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </APIProvider>
  );
};
