import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Search,
  Navigation,
  Heart,
  Video,
  Share2,
  WifiOff,
  Check,
  SlidersHorizontal,
  Compass,
  LocateFixed,
  MapPin,
} from 'lucide-react';
import {
  EXPLORER_CHANNEL_PRESETS,
  ExplorerChannelPreset,
  MOOD_CATEGORIES,
  MoodCategory,
  SUPPORTED_LANGUAGES,
  formatCurrency,
} from '../data/catalog';

export interface LiveGmpPlaceInfo {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number;
}

interface MapExplorerViewProps {
  userLiveLocation: { lat: number; lng: number } | null;
  liveLocationStatus: string;
  onRequestLiveLocation: () => void;
  selectedMood: MoodCategory;
  onSelectMood: (mood: MoodCategory) => void;
  maxBudgetUsd: number;
  onChangeMaxBudget: (val: number) => void;
  budgetSort: 'asc' | 'desc';
  onChangeBudgetSort: (val: 'asc' | 'desc') => void;
  currencyCode: string;
  liveRates: Record<string, number>;
  loyaltyDiscountPct: number;
  wishlistIds: Set<string>;
  onToggleWishlist: (channel: ExplorerChannelPreset, gmpPlace: LiveGmpPlaceInfo | null) => void;
  onStartLiveCall: (channel: ExplorerChannelPreset, placeDisplayName: string) => void;
  offlinePacks: string[];
  onSaveOfflinePack: (channelId: string, label: string) => void;
}

interface RouteOverlayProps {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  travelMode: 'WALKING' | 'DRIVING' | 'TRANSIT';
  onRouteComputed: (summary: { distanceKm: string; durationMin: string } | null) => void;
}

interface MapPolylineInstance {
  setMap: (map: unknown) => void;
  setOptions: (opts: Record<string, unknown>) => void;
}

function RouteOverlay({
  origin,
  destination,
  travelMode,
  onRouteComputed,
}: RouteOverlayProps) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<MapPolylineInstance[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !routesLib || !origin || !destination) {
      onRouteComputed(null);
      return;
    }

    const request = {
      origin,
      destination,
      travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    (routesLib.Route as any)
      .computeRoutes(request)
      .then(({ routes }: { routes: any[] }) => {
        if (!routes || routes.length === 0) {
          onRouteComputed(null);
          return;
        }
        const primaryRoute = routes[0];
        const newPolylines: MapPolylineInstance[] = primaryRoute.createPolylines();
        newPolylines.forEach((polyline: MapPolylineInstance) => {
          polyline.setOptions({
            strokeColor: '#10B981',
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        const distKm = ((primaryRoute.distanceMeters || 0) / 1000).toFixed(1);
        const durMin = Math.max(1, Math.round((primaryRoute.durationMillis || 0) / 60000)).toString();
        onRouteComputed({ distanceKm: distKm, durationMin: durMin });
      })
      .catch((err: any) => {
        const msg = String(err?.message || err || '');
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onRouteComputed(null);
      });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, origin, destination, travelMode, onRouteComputed]);

  return null;
}

export function MapExplorerView({
  userLiveLocation,
  liveLocationStatus,
  onRequestLiveLocation,
  selectedMood,
  onSelectMood,
  maxBudgetUsd,
  onChangeMaxBudget,
  budgetSort,
  onChangeBudgetSort,
  currencyCode,
  liveRates,
  loyaltyDiscountPct,
  wishlistIds,
  onToggleWishlist,
  onStartLiveCall,
  offlinePacks,
  onSaveOfflinePack,
}: MapExplorerViewProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState<ExplorerChannelPreset>(
    EXPLORER_CHANNEL_PRESETS[0]
  );
  const [useMyLiveGpsOnMap, setUseMyLiveGpsOnMap] = useState<boolean>(true);
  const [routeFromMyLiveGps, setRouteFromMyLiveGps] = useState<boolean>(true);

  // Live Google Maps Places API (New) results
  const [livePlacesByChannel, setLivePlacesByChannel] = useState<
    Record<string, LiveGmpPlaceInfo>
  >({});
  const [nearbyGmpPlaces, setNearbyGmpPlaces] = useState<LiveGmpPlaceInfo[]>([]);
  const [selectedNearbyPlace, setSelectedNearbyPlace] = useState<LiveGmpPlaceInfo | null>(null);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);

  // Route navigation states
  const [travelMode, setTravelMode] = useState<'WALKING' | 'DRIVING' | 'TRANSIT'>('WALKING');
  const [routeSummary, setRouteSummary] = useState<{
    distanceKm: string;
    durationMin: string;
  } | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Pan map to user's present live location when acquired and search nearby attractions
  useEffect(() => {
    if (!userLiveLocation || !useMyLiveGpsOnMap) return;
    if (map) {
      map.panTo(userLiveLocation);
      map.setZoom(14);
    }

    if (!placesLib) return;
    let cancelled = false;
    setIsLoadingPlaces(true);

    async function searchAroundUserLiveLocation() {
      try {
        const { places } = await (placesLib!.Place as any).searchByText({
          textQuery:
            selectedMood === 'All Moods'
              ? 'popular cultural landmarks viewpoints cafes'
              : selectedMood,
          locationBias: {
            center: userLiveLocation,
            radius: 5000,
          },
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating'],
          maxResultCount: 6,
        });

        if (cancelled || !places || places.length === 0) {
          setIsLoadingPlaces(false);
          return;
        }

        const mapped: LiveGmpPlaceInfo[] = places.map((p: any) => {
          const loc = p.location;
          const lat = typeof loc?.lat === 'function' ? loc.lat() : Number(loc?.lat ?? userLiveLocation!.lat);
          const lng = typeof loc?.lng === 'function' ? loc.lng() : Number(loc?.lng ?? userLiveLocation!.lng);
          return {
            id: String(p.id || `gmp_${Date.now()}`),
            displayName: String(p.displayName || 'Local Spot'),
            formattedAddress: String(p.formattedAddress || ''),
            location: { lat, lng },
            rating: typeof p.rating === 'number' ? p.rating : undefined,
          };
        });

        setNearbyGmpPlaces(mapped);
        setSelectedNearbyPlace(mapped[0] || null);
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } finally {
        if (!cancelled) setIsLoadingPlaces(false);
      }
    }

    searchAroundUserLiveLocation();
    return () => {
      cancelled = true;
    };
  }, [userLiveLocation, useMyLiveGpsOnMap, placesLib, map, selectedMood]);

  // Filter & sort the 32 Explorer Channel Presets
  const filteredChannels = useMemo(() => {
    return EXPLORER_CHANNEL_PRESETS.filter((ch) => {
      if (selectedMood !== 'All Moods' && ch.mood !== selectedMood) return false;
      if (ch.estimatedSpotBudgetUsd > maxBudgetUsd) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const liveName = livePlacesByChannel[ch.id]?.displayName?.toLowerCase() || '';
        return (
          ch.explorerName.toLowerCase().includes(q) ||
          ch.gmpSearchQuery.toLowerCase().includes(q) ||
          ch.mood.toLowerCase().includes(q) ||
          ch.liveEventTag.toLowerCase().includes(q) ||
          liveName.includes(q)
        );
      }
      return true;
    }).sort((a, b) =>
      budgetSort === 'asc'
        ? a.estimatedSpotBudgetUsd - b.estimatedSpotBudgetUsd
        : b.estimatedSpotBudgetUsd - a.estimatedSpotBudgetUsd
    );
  }, [selectedMood, maxBudgetUsd, budgetSort, searchQuery, livePlacesByChannel]);

  // Query Google Maps Platform Places API (New) when a specific global channel is selected
  useEffect(() => {
    if (!placesLib || !activeChannel || useMyLiveGpsOnMap) return;

    let cancelled = false;
    setIsLoadingPlaces(true);

    async function fetchLivePlaces() {
      try {
        const { places } = await (placesLib!.Place as any).searchByText({
          textQuery: activeChannel.gmpSearchQuery,
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating'],
          maxResultCount: 5,
        });

        if (cancelled || !places || places.length === 0) {
          setIsLoadingPlaces(false);
          return;
        }

        const mapped: LiveGmpPlaceInfo[] = places.map((p: any) => {
          const loc = p.location;
          const lat = typeof loc?.lat === 'function' ? loc.lat() : Number(loc?.lat ?? activeChannel.mapViewportCenter.lat);
          const lng = typeof loc?.lng === 'function' ? loc.lng() : Number(loc?.lng ?? activeChannel.mapViewportCenter.lng);
          return {
            id: String(p.id || `gmp_${Date.now()}`),
            displayName: String(p.displayName || activeChannel.gmpSearchQuery),
            formattedAddress: String(p.formattedAddress || ''),
            location: { lat, lng },
            rating: typeof p.rating === 'number' ? p.rating : undefined,
          };
        });

        setLivePlacesByChannel((prev) => ({
          ...prev,
          [activeChannel.id]: mapped[0],
        }));
        setNearbyGmpPlaces(mapped);
        setSelectedNearbyPlace(mapped[1] || mapped[0] || null);

        if (map && mapped[0]?.location) {
          map.panTo(mapped[0].location);
          map.setZoom(14);
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } finally {
        if (!cancelled) setIsLoadingPlaces(false);
      }
    }

    fetchLivePlaces();
    return () => {
      cancelled = true;
    };
  }, [placesLib, activeChannel, map, useMyLiveGpsOnMap]);

  // Custom search against Google Maps Platform Places API (New)
  const handleCustomGmpSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placesLib || !searchQuery.trim()) return;
    setIsLoadingPlaces(true);
    try {
      const { places } = await (placesLib.Place as any).searchByText({
        textQuery: searchQuery.trim(),
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating'],
        maxResultCount: 5,
      });
      if (places && places.length > 0) {
        const mapped: LiveGmpPlaceInfo[] = places.map((p: any) => {
          const loc = p.location;
          const lat = typeof loc?.lat === 'function' ? loc.lat() : Number(loc?.lat ?? 0);
          const lng = typeof loc?.lng === 'function' ? loc.lng() : Number(loc?.lng ?? 0);
          return {
            id: String(p.id || `gmp_${Date.now()}`),
            displayName: String(p.displayName || searchQuery),
            formattedAddress: String(p.formattedAddress || ''),
            location: { lat, lng },
            rating: typeof p.rating === 'number' ? p.rating : undefined,
          };
        });
        setNearbyGmpPlaces(mapped);
        setSelectedNearbyPlace(mapped[0]);
        if (map && mapped[0]?.location) {
          map.panTo(mapped[0].location);
          map.setZoom(14);
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      setIsLoadingPlaces(false);
    }
  };

  const handleCenterOnMyLiveLocation = () => {
    setUseMyLiveGpsOnMap(true);
    setRouteFromMyLiveGps(true);
    onRequestLiveLocation();
    if (map && userLiveLocation) {
      map.panTo(userLiveLocation);
      map.setZoom(15);
    }
  };

  const activeLivePlace =
    livePlacesByChannel[activeChannel.id] || nearbyGmpPlaces[0] || null;
  const activeDisplayName =
    activeLivePlace?.displayName || activeChannel.liveEventTag;

  const routeOrigin =
    routeFromMyLiveGps && userLiveLocation
      ? userLiveLocation
      : activeLivePlace?.location || activeChannel.mapViewportCenter;

  const handleShareSpot = async (channel: ExplorerChannelPreset, placeTitle: string) => {
    const text = `Explore ${placeTitle} live with ${channel.explorerName} on Explorer!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: placeTitle, text, url: window.location.href });
        return;
      } catch {
        // Fallback
      }
    }
    await navigator.clipboard?.writeText(`${text} ${window.location.href}`);
    setShareToast(`Share link copied for ${placeTitle}`);
    setTimeout(() => setShareToast(null), 2500);
  };

  return (
    <div className="space-y-8">
      {/* Live Location & Search Command Deck */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Present Live Location Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCenterOnMyLiveLocation}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap ${
                useMyLiveGpsOnMap
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              <LocateFixed className="w-4 h-4" />
              My Present Live Location
            </button>

            <div className="text-xs text-slate-400 font-mono tabular-nums">
              {userLiveLocation ? (
                <span className="text-emerald-400">
                  Live GPS Active: {userLiveLocation.lat.toFixed(4)}, {userLiveLocation.lng.toFixed(4)}
                </span>
              ) : (
                <span>{liveLocationStatus}</span>
              )}
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleCustomGmpSearch} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search places near your live location or across 32+ global explorer channels..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl whitespace-nowrap"
            >
              Search Map
            </button>
          </form>
        </div>

        {/* Budget Slider, Sort & Mood Filter Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {MOOD_CATEGORIES.map((mood) => (
              <button
                key={mood}
                onClick={() => onSelectMood(mood)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  selectedMood === mood
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-300 hover:text-white'
                }`}
              >
                {mood}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Budget Cap:</span>
              <span className="font-mono font-semibold text-white tabular-nums">
                {formatCurrency(maxBudgetUsd, currencyCode, liveRates)}
              </span>
              <input
                type="range"
                min={15}
                max={100}
                step={5}
                value={maxBudgetUsd}
                onChange={(e) => onChangeMaxBudget(Number(e.target.value))}
                className="w-24 accent-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => onChangeBudgetSort('asc')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  budgetSort === 'asc'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Low → High
              </button>
              <button
                onClick={() => onChangeBudgetSort('desc')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  budgetSort === 'desc'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                High → Low
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Live Location Google Map + Active Channel & Call Trigger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Google Map Centered on Present Live Location (7 columns) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                {useMyLiveGpsOnMap && userLiveLocation
                  ? 'Viewing Places Around Your Present Live Location'
                  : `Viewing Explorer Channel: ${activeDisplayName}`}
              </h3>
              <p className="text-xs text-slate-400">
                {isLoadingPlaces
                  ? 'Scanning verified places via Google Maps Places API (New)...'
                  : 'Click any marker or place below to compute real-time route navigation'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRouteFromMyLiveGps((v) => !v)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border whitespace-nowrap ${
                  routeFromMyLiveGps
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
              >
                {routeFromMyLiveGps ? 'Origin: My Live GPS' : 'Origin: Explorer Spot'}
              </button>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['WALKING', 'TRANSIT', 'DRIVING'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTravelMode(mode)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap ${
                      travelMode === mode
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode === 'WALKING' ? 'Walk' : mode === 'TRANSIT' ? 'Transit' : 'Drive'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Map Viewport Container */}
          <div className="w-full h-[460px] relative">
            <Map
              defaultCenter={userLiveLocation || activeChannel.mapViewportCenter}
              defaultZoom={14}
              mapId="DEMO_MAP_ID"
              gestureHandling="greedy"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              {/* User's Present Live GPS Location Marker */}
              {userLiveLocation && (
                <AdvancedMarker position={userLiveLocation}>
                  <div className="px-2.5 py-1 rounded-full bg-emerald-500 text-slate-950 font-mono text-[11px] font-semibold shadow-lg border-2 border-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
                    YOU (LIVE GPS)
                  </div>
                </AdvancedMarker>
              )}

              {/* Active Explorer Channel Marker */}
              <AdvancedMarker
                position={
                  activeLivePlace?.location || activeChannel.mapViewportCenter
                }
              >
                <Pin
                  background="#0F172A"
                  borderColor="#10B981"
                  glyphColor="#10B981"
                />
              </AdvancedMarker>

              {/* Nearby Verified Google Maps Places Markers */}
              {nearbyGmpPlaces.map((place) => (
                <AdvancedMarker
                  key={place.id}
                  position={place.location}
                  onClick={() => setSelectedNearbyPlace(place)}
                >
                  <Pin
                    background={
                      selectedNearbyPlace?.id === place.id ? '#10B981' : '#334155'
                    }
                    borderColor="#FFFFFF"
                    glyphColor="#FFFFFF"
                  />
                </AdvancedMarker>
              ))}

              {/* Modern Routes API Polyline Renderer */}
              <RouteOverlay
                origin={routeOrigin}
                destination={selectedNearbyPlace?.location || null}
                travelMode={travelMode}
                onRouteComputed={setRouteSummary}
              />
            </Map>
          </div>

          {/* Bottom Map Bar: Route Summary & Verified Nearby Places */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Navigation className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white">
                  {routeFromMyLiveGps && userLiveLocation
                    ? 'From Your Present Live Location'
                    : activeDisplayName}
                </span>
                {selectedNearbyPlace && (
                  <>
                    <span>→</span>
                    <span className="font-semibold text-emerald-400">
                      {selectedNearbyPlace.displayName}
                    </span>
                  </>
                )}
              </div>
              {routeSummary && (
                <div className="font-mono text-xs text-emerald-400 font-semibold tabular-nums">
                  {routeSummary.distanceKm} km · {routeSummary.durationMin} mins ({travelMode.toLowerCase()})
                </div>
              )}
            </div>

            {nearbyGmpPlaces.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                  Verified Places (Tap to Route):
                </span>
                {nearbyGmpPlaces.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedNearbyPlace(p)}
                    className={`px-2.5 py-1 text-xs rounded-lg border whitespace-nowrap shrink-0 transition-colors ${
                      selectedNearbyPlace?.id === p.id
                        ? 'bg-emerald-500 text-slate-950 border-emerald-500 font-semibold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    {p.displayName}
                    {p.rating ? ` · ★ ${p.rating.toFixed(1)}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Explorer Spotlight & Instant Call Trigger (5 columns) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="relative h-56 bg-slate-950 overflow-hidden">
              <img
                src={activeChannel.previewImage}
                alt={activeDisplayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 text-white space-y-1">
                <p className="text-xs text-emerald-400 font-mono">
                  {activeChannel.mood} · {activeChannel.liveEventTag}
                </p>
                <h3 className="text-xl font-display font-semibold">
                  {activeDisplayName}
                </h3>
                {activeLivePlace?.formattedAddress && (
                  <p className="text-xs text-slate-300 truncate">
                    {activeLivePlace.formattedAddress}
                  </p>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="font-semibold text-white">
                  Guide: {activeChannel.explorerName}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Speaks{' '}
                  {SUPPORTED_LANGUAGES.find(
                    (l) => l.code === activeChannel.spokenLanguageCode
                  )?.name || 'Local Language'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-emerald-400">
                  {formatCurrency(
                    activeChannel.sessionRateUsd * (1 - loyaltyDiscountPct / 100),
                    currencyCode,
                    liveRates
                  )}{' '}
                  ({loyaltyDiscountPct}% Loyalty Off)
                </span>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed">
                Send a Pre-Paid Join Request to trigger a live call notification and haptic vibration on{' '}
                <span className="font-semibold text-white">{activeChannel.explorerName}</span>&apos;s mobile device. Direct their camera in your language while AI translates both ways.
              </p>

              {shareToast && (
                <p className="text-xs font-medium text-emerald-400">{shareToast}</p>
              )}
            </div>
          </div>

          <div className="p-5 pt-0 space-y-2.5">
            <button
              onClick={() => onStartLiveCall(activeChannel, activeDisplayName)}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Video className="w-4 h-4" />
              Send Call Notification ({formatCurrency(
                activeChannel.sessionRateUsd * (1 - loyaltyDiscountPct / 100),
                currencyCode,
                liveRates
              )})
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onToggleWishlist(activeChannel, activeLivePlace)}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  wishlistIds.has(activeChannel.id)
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    wishlistIds.has(activeChannel.id) ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
                {wishlistIds.has(activeChannel.id) ? 'Saved' : 'Wishlist'}
              </button>

              <button
                onClick={() =>
                  onSaveOfflinePack(
                    activeChannel.id,
                    `${activeDisplayName} (${activeChannel.explorerName})`
                  )
                }
                className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                {offlinePacks.includes(activeChannel.id) ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Cached
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    Offline Pack
                  </>
                )}
              </button>

              <button
                onClick={() => handleShareSpot(activeChannel, activeDisplayName)}
                className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 32+ Mood-Based Live Explorer Channels Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-display font-semibold text-white">
              01. Global Live Explorer Channels ({filteredChannels.length} Available)
            </h3>
            <p className="text-xs text-slate-400">
              Select any channel to pan the map to that destination or trigger an instant live call notification.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredChannels.map((ch) => {
            const isSelected = ch.id === activeChannel.id && !useMyLiveGpsOnMap;
            const livePlace = livePlacesByChannel[ch.id];
            const langName =
              SUPPORTED_LANGUAGES.find((l) => l.code === ch.spokenLanguageCode)
                ?.name || ch.spokenLanguageCode;
            const isWished = wishlistIds.has(ch.id);

            return (
              <div
                key={ch.id}
                onClick={() => {
                  setUseMyLiveGpsOnMap(false);
                  setRouteFromMyLiveGps(false);
                  setActiveChannel(ch);
                }}
                className={`cursor-pointer bg-slate-900 rounded-xl border p-4 transition-colors flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-emerald-500 bg-slate-800/70'
                    : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{ch.mood}</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-400">
                      {formatCurrency(ch.estimatedSpotBudgetUsd, currencyCode, liveRates)}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-white line-clamp-1">
                    {livePlace?.displayName || ch.liveEventTag}
                  </h4>

                  <p className="text-xs text-slate-400">
                    {ch.explorerName} · Speaks {langName}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveChannel(ch);
                      onStartLiveCall(
                        ch,
                        livePlace?.displayName || ch.liveEventTag
                      );
                    }}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    Call {formatCurrency(
                      ch.sessionRateUsd * (1 - loyaltyDiscountPct / 100),
                      currencyCode,
                      liveRates
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWishlist(ch, livePlace || null);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg"
                    aria-label="Save to Wishlist"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        isWished ? 'fill-rose-500 text-rose-500' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
