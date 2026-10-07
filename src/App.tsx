/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  Compass,
  Sparkles,
  Heart,
  Radio,
  LogIn,
  LogOut,
  Trash2,
  Star,
  Globe,
  WifiOff,
  Award,
  BellRing,
  LocateFixed,
  CheckCircle2,
  XCircle,
  UserCheck,
  ShieldCheck,
  Share2,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
} from 'lucide-react';
import {
  auth,
  db,
  signInWithGoogle,
  logOutUser,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  EXPLORER_CHANNEL_PRESETS,
  MoodCategory,
  ExplorerChannelPreset,
  formatCurrency,
  GENERATED_ASSETS,
} from './data/catalog';
import { MapExplorerView, LiveGmpPlaceInfo } from './components/MapExplorerView';
import { AiTravelPlannerView } from './components/AiTravelPlannerView';
import {
  ExplorerPortalView,
  ActiveCallNotificationItem,
} from './components/ExplorerPortalView';
import {
  LiveCallModal,
  CallNotificationPayload,
  TripMemoryRecord,
} from './components/LiveCallModal';
import { AiStudioHubView } from './components/AiStudioHubView';
import { DualDomainAndCameraDeck } from './components/DualDomainAndCameraDeck';
import { SeparateLoginPortalGateway } from './components/SeparateLoginPortalGateway';
import { MobileAppDualWorkspace } from './components/MobileAppDualWorkspace';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';

type ActiveTab =
  | 'explore_map'
  | 'ai_planner'
  | 'ai_studio_hub'
  | 'wishlist_budget'
  | 'explorer_portal'
  | 'mobile_app';

interface WishlistDoc {
  id: string;
  userId: string;
  placeId: string;
  placeName: string;
  city: string;
  moodCategory: string;
  estimatedCostUsd: number;
  lat: number;
  lng: number;
  notes: string;
}

interface SavedTripDoc {
  id: string;
  destination: string;
  travelDates: string;
  totalBudgetUsd: number;
  estimatedSpendUsd: number;
  discountAppliedPct: number;
  bookingStatus: string;
  summaryText: string;
}

interface ReviewDoc {
  id: string;
  authorName: string;
  placeName: string;
  rating: number;
  comment: string;
  languageCode: string;
}

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function App() {
  // Mandatory Google Maps Demo Key Quota Banner State
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  // ============================================================================
  // 1. PRESENT LIVE LOCATION (Continuous Geolocation GPS)
  // ============================================================================
  const [userLiveLocation, setUserLiveLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState<string>(
    'Acquiring your present live GPS location...'
  );

  const requestUserLiveLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLiveLocationStatus('Browser Geolocation unavailable');
      return;
    }
    setLiveLocationStatus('Locating your present live GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLiveLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLiveLocationStatus(
          `Live GPS Locked (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`
        );
      },
      () => {
        setLiveLocationStatus(
          'Allow browser location permission to lock onto your present GPS'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  }, []);

  useEffect(() => {
    requestUserLiveLocation();
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLiveLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setLiveLocationStatus(
            `Live GPS Locked (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`
          );
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [requestUserLiveLocation]);

  // ============================================================================
  // 2. DUAL-DOMAIN LOGIN PORTAL (Traveler Domain & Local Explorer Domain Log In / Log Out)
  // ============================================================================
  const [activeTab, setActiveTab] = useState<ActiveTab>('ai_planner');
  const [domainRole, setDomainRole] = useState<'traveler' | 'explorer'>('traveler');
  const [showSeparateLoginPortal, setShowSeparateLoginPortal] = useState<boolean>(false);
  const [showMobileAppWorkspace, setShowMobileAppWorkspace] = useState<boolean>(false);
  const [showLoginPortalModal, setShowLoginPortalModal] = useState<boolean>(false);

  // Firebase Auth + Portal Session Log In / Log Out states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [travelerSessionActive, setTravelerSessionActive] = useState<boolean>(true);
  const [explorerSessionActive, setExplorerSessionActive] = useState<boolean>(true);
  const [travelerEmail, setTravelerEmail] = useState<string>('alex@user.explorer.live');
  const [explorerEmail, setExplorerEmail] = useState<string>('kenji.sato@explorer.explorer.live');
  const [showDomainCameraDeck, setShowDomainCameraDeck] = useState<boolean>(false);
  const [customPortalDisplayName, setCustomPortalDisplayName] = useState<string>('Alex Rivera');
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const [streakScore, setStreakScore] = useState<number>(150);
  const [creditsBalanceUsd, setCreditsBalanceUsd] = useState<number>(300);
  const [spotsVisitedCount, setSpotsVisitedCount] = useState<number>(5);

  // Global Localization (34 Languages & 16 Currencies)
  const [preferredLanguage, setPreferredLanguage] = useState<string>('en');
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});

  // Map & Budget Filter States
  const [selectedMood, setSelectedMood] = useState<MoodCategory>('All Moods');
  const [maxBudgetUsd, setMaxBudgetUsd] = useState<number>(85);
  const [budgetSort, setBudgetSort] = useState<'asc' | 'desc'>('asc');

  // Persistent Firestore Collections: Wishlists, Saved Trips, Reviews
  const [wishlistItems, setWishlistItems] = useState<WishlistDoc[]>([
    {
      id: 'local_ch_01',
      userId: 'guest',
      placeId: 'ch_01',
      placeName: 'Gion Lantern Tea Alley',
      city: 'Gion District, Kyoto, Japan',
      moodCategory: 'Cultural & Historic',
      estimatedCostUsd: 25,
      lat: 35.0037,
      lng: 135.7785,
      notes: 'Live Explorer: Kenji Sato',
    },
    {
      id: 'local_ch_02',
      userId: 'guest',
      placeId: 'ch_02',
      placeName: 'Ravello Cliffside Lemon Grove Walk',
      city: 'Amalfi Coast, Campania, Italy',
      moodCategory: 'Romantic & Scenic',
      estimatedCostUsd: 35,
      lat: 40.6333,
      lng: 14.6029,
      notes: 'Live Explorer: Sofia Conti',
    },
  ]);
  const [activeShareWishlistId, setActiveShareWishlistId] = useState<string | null>(null);
  const [wishlistShareFeedback, setWishlistShareFeedback] = useState<{
    itemId: string;
    message: string;
  } | null>(null);
  const [savedTrips, setSavedTrips] = useState<SavedTripDoc[]>([]);
  const [recentReviews, setRecentReviews] = useState<ReviewDoc[]>([]);
  const [tripMemories, setTripMemories] = useState<TripMemoryRecord[]>(() => {
    const seedMemories: TripMemoryRecord[] = [
      {
        id: 'mem_seed_01',
        placeName: 'Gion Lantern Tea Alley, Kyoto',
        explorerName: 'Kenji Takahashi',
        memoryTitle: 'Evening Lantern Walk Through Higashiyama & Gion Tea Houses',
        summaryText:
          'Local explorer Kenji Takahashi guided the camera along the cobblestone alleys of Gion at dusk, pausing at a 100-year-old wooden machiya tea house, a traditional paper-lantern workshop, and the quiet shirakawa canal bridge.',
        placesShown: [
          'Gion Kobu Kaburenjo Lantern Lane',
          'Artisan Chochin Lantern Studio',
          'Shirakawa Canal Willow Bridge',
        ],
        culturalHighlight:
          'Evening lanterns are lit shortly before twilight to welcome guests to historic ochaya tea houses.',
        languageCode: 'en',
        createdAtLabel: 'Saved in Traveler Account',
      },
    ];
    try {
      const raw = localStorage.getItem('explorer_trip_memories_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return seedMemories;
  });

  const handleTripMemorySaved = useCallback((memory: TripMemoryRecord) => {
    setTripMemories((prev) => {
      const updated = [memory, ...prev.filter((m) => m.id !== memory.id)];
      try {
        localStorage.setItem('explorer_trip_memories_v1', JSON.stringify(updated));
      } catch {
        // Ignore storage error
      }
      return updated;
    });
  }, []);

  // Offline Accessibility Field Packs
  const [offlinePacks, setOfflinePacks] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('explorer_offline_packs');
      return raw ? JSON.parse(raw) : ['ch_01'];
    } catch {
      return ['ch_01'];
    }
  });

  // Active Live Call Modal
  const [activeCallTarget, setActiveCallTarget] = useState<{
    channel: ExplorerChannelPreset;
    placeDisplayName: string;
  } | null>(null);

  // ============================================================================
  // 3. LIVE CALL NOTIFICATIONS & VIBRATION ALERT ENGINE
  // ============================================================================
  const [callQueue, setCallQueue] = useState<ActiveCallNotificationItem[]>([
    {
      id: 'call_seed_01',
      travelerName: 'Elena Vance (traveler.explorer.live)',
      explorerName: 'Kenji Sato',
      placeName: 'Gion Lantern Tea Alley, Kyoto',
      paymentAmountUsd: 16.2,
      paymentStatus: 'paid',
      status: 'ringing',
      lastInstruction: 'Please pan camera toward the wooden bridge lanterns.',
      translatedInstruction: '木製の橋の提灯に向かってカメラをゆっくり動かしてください。',
    },
  ]);
  const [activeBannerNotification, setActiveBannerNotification] = useState<{
    id: string;
    title: string;
    subtitle: string;
    status: 'ringing' | 'accepted' | 'rejected' | 'completed';
    amountUsd: number;
  } | null>(null);

  const playNotificationToneAndVibrate = (
    pattern: number[] = [300, 120, 300],
    freq = 580
  ) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        setTimeout(() => {
          osc.stop();
          ctx.close();
        }, 380);
      }
    } catch {
      // Ignore audio restriction errors
    }
  };

  const handleTriggerSimulatedCallNotification = () => {
    const sampleChannel = EXPLORER_CHANNEL_PRESETS[0];
    const newId = `call_alert_${Date.now()}`;
    const locationLabel = userLiveLocation
      ? `Present Live Location (${userLiveLocation.lat.toFixed(3)}, ${userLiveLocation.lng.toFixed(3)})`
      : sampleChannel.liveEventTag;

    const newItem: ActiveCallNotificationItem = {
      id: newId,
      travelerName: `${
        currentUser?.displayName || customPortalDisplayName
      } (traveler.explorer.live)`,
      explorerName: sampleChannel.explorerName,
      placeName: locationLabel,
      paymentAmountUsd: 15.0,
      paymentStatus: 'paid',
      status: 'ringing',
      lastInstruction: 'Show me a 360° view of your present live location.',
      translatedInstruction:
        '現在のライブロケーションの360度ビューをカメラで見せてください。',
    };

    setCallQueue((prev) => [newItem, ...prev]);
    setActiveBannerNotification({
      id: newId,
      title: `Incoming Live Call Notification · ${locationLabel}`,
      subtitle: `Caller: ${newItem.travelerName} → Guide: ${newItem.explorerName} · Mobile Vibrating`,
      status: 'ringing',
      amountUsd: newItem.paymentAmountUsd,
    });
    playNotificationToneAndVibrate([350, 120, 350, 120, 450], 620);
  };

  const handleAcceptCallFromNotification = (callId: string) => {
    setCallQueue((prev) =>
      prev.map((c) => (c.id === callId ? { ...c, status: 'accepted' } : c))
    );
    const target = callQueue.find((c) => c.id === callId);
    setActiveBannerNotification({
      id: callId,
      title: `Call Accepted by ${target?.explorerName || 'Local Explorer'}`,
      subtitle: `Live camera stream connected at ${target?.placeName || 'Present Location'}`,
      status: 'accepted',
      amountUsd: target?.paymentAmountUsd || 15,
    });
    playNotificationToneAndVibrate([180, 90, 240], 720);
  };

  const handleRejectCallFromNotification = (callId: string) => {
    setCallQueue((prev) =>
      prev.map((c) =>
        c.id === callId
          ? { ...c, status: 'rejected', paymentStatus: 'refunded' }
          : c
      )
    );
    const target = callQueue.find((c) => c.id === callId);
    setActiveBannerNotification({
      id: callId,
      title: `Call Rejected Alert — Escrow Refunded`,
      subtitle: `${target?.explorerName || 'Local Explorer'} declined the Join Request at ${
        target?.placeName || 'Present Location'
      }. Traveler notified & refunded.`,
      status: 'rejected',
      amountUsd: target?.paymentAmountUsd || 15,
    });
    playNotificationToneAndVibrate([480, 150, 480], 280);
  };

  const handleModalCallNotificationEvent = (payload: CallNotificationPayload) => {
    setCallQueue((prev) => {
      const exists = prev.some((item) => item.id === payload.id);
      if (exists) {
        return prev.map((item) =>
          item.id === payload.id
            ? {
                ...item,
                status: payload.type,
                paymentStatus: payload.type === 'rejected' ? 'refunded' : 'paid',
              }
            : item
        );
      }
      return [
        {
          id: payload.id,
          travelerName: payload.travelerName,
          explorerName: payload.explorerName,
          placeName: payload.placeName,
          paymentAmountUsd: payload.amountUsd,
          paymentStatus: payload.type === 'rejected' ? 'refunded' : 'paid',
          status: payload.type,
          lastInstruction: 'Live camera tour requested',
          translatedInstruction: 'Live camera tour requested',
        },
        ...prev,
      ];
    });

    setActiveBannerNotification({
      id: payload.id,
      title:
        payload.type === 'ringing'
          ? `Call Notification Dispatched to ${payload.explorerName}`
          : payload.type === 'accepted'
          ? `Call Notification Accepted by ${payload.explorerName}`
          : payload.type === 'rejected'
          ? `Call Notification Rejected by ${payload.explorerName} (Escrow Refunded)`
          : `Live Explorer Call Completed at ${payload.placeName}`,
      subtitle: `${payload.placeName} · Pre-Call Escrow ${formatCurrency(
        payload.amountUsd,
        currencyCode,
        liveRates
      )}`,
      status: payload.type,
      amountUsd: payload.amountUsd,
    });
  };

  // Calculate regular-user loyalty discount from Streak Score (10% to 25%)
  const loyaltyDiscountPct = Math.min(25, Math.max(10, Math.floor(streakScore / 10)));

  // Fetch live currency exchange rates from Express backend
  useEffect(() => {
    fetch('/api/exchange-rates')
      .then((r) => r.json())
      .then((data) => {
        if (data?.rates) setLiveRates(data.rates);
      })
      .catch(() => {});
  }, []);

  // Firebase Auth listener & UserProfile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);

      if (user) {
        setTravelerSessionActive(true);
        setCustomPortalDisplayName(user.displayName || 'Explorer Member');
        const userPath = `users/${user.uid}`;
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data();
            setDomainRole(data.domainRole === 'explorer' ? 'explorer' : 'traveler');
            setPreferredLanguage(data.preferredLanguage || 'en');
            setCurrencyCode(data.preferredCurrency || 'USD');
            setStreakScore(typeof data.streakScore === 'number' ? data.streakScore : 150);
            setCreditsBalanceUsd(typeof data.creditsBalance === 'number' ? data.creditsBalance : 300);
            setSpotsVisitedCount(typeof data.spotsVisitedCount === 'number' ? data.spotsVisitedCount : 5);
          } else {
            await setDoc(userRef, {
              uid: user.uid,
              displayName: (user.displayName || 'Explorer Member').slice(0, 80),
              domainRole: 'traveler',
              preferredLanguage: 'en',
              preferredCurrency: 'USD',
              streakScore: 150,
              creditsBalance: 300,
              spotsVisitedCount: 5,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, userPath);
        }
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore listeners for Wishlists, SavedTrips, and Reviews when authenticated
  useEffect(() => {
    if (!authReady || !currentUser) {
      return;
    }

    const uid = currentUser.uid;
    const wishQuery = query(collection(db, 'wishlists'), where('userId', '==', uid));
    const unsubWish = onSnapshot(
      wishQuery,
      (snap) => {
        setWishlistItems(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<WishlistDoc, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'wishlists')
    );

    const tripQuery = query(collection(db, 'trips'), where('userId', '==', uid));
    const unsubTrips = onSnapshot(
      tripQuery,
      (snap) => {
        setSavedTrips(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SavedTripDoc, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'trips')
    );

    const revQuery = query(collection(db, 'reviews'), where('rating', '>=', 1));
    const unsubRevs = onSnapshot(
      revQuery,
      (snap) => {
        setRecentReviews(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ReviewDoc, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    const memQuery = query(collection(db, 'tripMemories'), where('userId', '==', uid));
    const unsubMems = onSnapshot(
      memQuery,
      (snap) => {
        if (!snap.empty) {
          const firestoreMems: TripMemoryRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              placeName: data.placeName || 'Explored Spot',
              explorerName: data.explorerName || 'Local Explorer',
              memoryTitle: data.memoryTitle || 'Live Call Trip Memory',
              summaryText: data.summaryText || '',
              placesShown: Array.isArray(data.placesShown) ? data.placesShown : [],
              culturalHighlight: data.culturalHighlight || '',
              languageCode: data.languageCode || 'en',
              createdAtLabel: 'Synced to Traveler Cloud Account',
            };
          });
          setTripMemories((prev) => {
            const existingIds = new Set(firestoreMems.map((m) => m.id));
            return [...firestoreMems, ...prev.filter((p) => !existingIds.has(p.id))];
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tripMemories')
    );

    return () => {
      unsubWish();
      unsubTrips();
      unsubRevs();
      unsubMems();
    };
  }, [authReady, currentUser]);

  // Switch between Traveler Domain (`traveler.explorer.live`) and Explorer Domain (`guide.explorer.live`)
  const handleSwitchDomainRole = async (nextRole: 'traveler' | 'explorer') => {
    setDomainRole(nextRole);
    if (nextRole === 'explorer') {
      setExplorerSessionActive(true);
      setActiveTab('explorer_portal');
    } else {
      setTravelerSessionActive(true);
      if (activeTab === 'explorer_portal') {
        setActiveTab('explore_map');
      }
    }

    if (currentUser) {
      const path = `users/${currentUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          displayName: (currentUser.displayName || customPortalDisplayName).slice(0, 80),
          domainRole: nextRole,
          preferredLanguage,
          preferredCurrency: currencyCode,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  // Explicit Log In / Log Out handlers for Traveler Domain & Explorer Domain
  const handleTravelerLogin = async (useGooglePopup: boolean) => {
    setAuthNotice(null);
    if (useGooglePopup) {
      try {
        await signInWithGoogle();
      } catch {
        setAuthNotice(
          'Activated User Login Portal session (user.explorer.live) with +300 Login Credits.'
        );
      }
    }
    setTravelerSessionActive(true);
    setDomainRole('traveler');
    setActiveTab('explore_map');
    setShowSeparateLoginPortal(false);
    setCreditsBalanceUsd((c) => Math.max(c, 300));
  };

  const handleTravelerLogout = async () => {
    setTravelerSessionActive(false);
    if (currentUser) {
      try {
        await logOutUser();
      } catch {
        // Ignore signOut error
      }
    }
    setAuthNotice('Logged out of User Login Portal (user.explorer.live).');
    setShowSeparateLoginPortal(true);
  };

  const handleExplorerLogin = () => {
    setExplorerSessionActive(true);
    setDomainRole('explorer');
    setActiveTab('explorer_portal');
    setShowSeparateLoginPortal(false);
    setAuthNotice('Logged into Local Explorer Login Portal (explorer.explorer.live).');
  };

  const handleExplorerLogout = () => {
    setExplorerSessionActive(false);
    setAuthNotice('Logged out of Local Explorer Login Portal (explorer.explorer.live).');
    setShowSeparateLoginPortal(true);
  };

  // Toggle Wishlist Item in Firestore
  const handleToggleWishlist = async (
    channel: ExplorerChannelPreset,
    gmpPlace: LiveGmpPlaceInfo | null
  ) => {
    const existing = wishlistItems.find((w) => w.placeId === channel.id);
    if (!currentUser) {
      if (existing) {
        setWishlistItems((prev) => prev.filter((w) => w.placeId !== channel.id));
      } else {
        setWishlistItems((prev) => [
          ...prev,
          {
            id: `local_${channel.id}`,
            userId: 'guest',
            placeId: channel.id,
            placeName: gmpPlace?.displayName || channel.liveEventTag,
            city: gmpPlace?.formattedAddress || channel.gmpSearchQuery,
            moodCategory: channel.mood,
            estimatedCostUsd: channel.estimatedSpotBudgetUsd,
            lat: gmpPlace?.location.lat ?? channel.mapViewportCenter.lat,
            lng: gmpPlace?.location.lng ?? channel.mapViewportCenter.lng,
            notes: `Live Explorer: ${channel.explorerName}`,
          },
        ]);
      }
      return;
    }

    if (existing) {
      const path = `wishlists/${existing.id}`;
      try {
        await deleteDoc(doc(db, 'wishlists', existing.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    } else {
      const wishId = `wish_${currentUser.uid.slice(0, 8)}_${channel.id}`;
      const path = `wishlists/${wishId}`;
      try {
        await setDoc(doc(db, 'wishlists', wishId), {
          userId: currentUser.uid,
          placeId: channel.id,
          placeName: (gmpPlace?.displayName || channel.liveEventTag).slice(0, 120),
          city: (gmpPlace?.formattedAddress || channel.gmpSearchQuery).slice(0, 80),
          moodCategory: channel.mood.slice(0, 40),
          estimatedCostUsd: channel.estimatedSpotBudgetUsd,
          lat: gmpPlace?.location.lat ?? channel.mapViewportCenter.lat,
          lng: gmpPlace?.location.lng ?? channel.mapViewportCenter.lng,
          notes: `Explorer: ${channel.explorerName} (${channel.liveEventTag})`.slice(0, 300),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  // Save Offline Pack for remote areas
  const handleSaveOfflinePack = (channelId: string) => {
    setOfflinePacks((prev) => {
      const next = prev.includes(channelId) ? prev : [...prev, channelId];
      try {
        localStorage.setItem('explorer_offline_packs', JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  // Post-Call Review Submitted -> Boost Streak Score & Spots Visited
  const handleReviewSubmitted = async () => {
    const nextStreak = streakScore + 25;
    const nextVisited = spotsVisitedCount + 1;
    setStreakScore(nextStreak);
    setSpotsVisitedCount(nextVisited);

    if (currentUser) {
      const path = `users/${currentUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          streakScore: nextStreak,
          creditsBalance: creditsBalanceUsd,
          spotsVisitedCount: nextVisited,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
  };

  // Build a direct deep-link URL to a specific wishlist spot
  const buildWishlistSpotDirectUrl = (item: WishlistDoc): string => {
    const baseUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://explorer.live';
    const params = new URLSearchParams({
      spot: item.placeId,
      place: item.placeName,
      lat: String(item.lat),
      lng: String(item.lng),
    });
    return `${baseUrl}?${params.toString()}`;
  };

  const handleCopyWishlistDirectLink = async (item: WishlistDoc) => {
    const directUrl = buildWishlistSpotDirectUrl(item);
    try {
      await navigator.clipboard?.writeText(directUrl);
    } catch {
      // Fallback if clipboard API is restricted
    }
    setWishlistShareFeedback({
      itemId: item.id,
      message: 'Direct link copied to clipboard!',
    });
    setTimeout(() => {
      setWishlistShareFeedback((prev) => (prev?.itemId === item.id ? null : prev));
    }, 3000);
  };

  const handleCopyWishlistSocialPost = async (item: WishlistDoc, platformLabel: string) => {
    const directUrl = buildWishlistSpotDirectUrl(item);
    const shareCaption = `Check out my favorite spot on Explorer: ${item.placeName} (${item.city}) — ${item.moodCategory} vibe! Explore live here: ${directUrl}`;
    if (platformLabel === 'Device Share' && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Explorer Wishlist — ${item.placeName}`,
          text: `Check out ${item.placeName} (${item.city}) on Explorer!`,
          url: directUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard?.writeText(shareCaption);
    } catch {
      // Ignore clipboard error
    }
    setWishlistShareFeedback({
      itemId: item.id,
      message: `${platformLabel} post & link copied!`,
    });
    setTimeout(() => {
      setWishlistShareFeedback((prev) => (prev?.itemId === item.id ? null : prev));
    }, 3000);
  };

  const wishlistIdSet = new Set(wishlistItems.map((w) => w.placeId));
  const ringingCallsCount = callQueue.filter((c) => c.status === 'ringing').length;
  const isCurrentDomainLoggedIn =
    domainRole === 'traveler'
      ? Boolean(currentUser || travelerSessionActive)
      : explorerSessionActive;

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      language={preferredLanguage}
    >
      <div className="min-h-screen flex flex-col bg-[#090D16] text-slate-100 pb-20 md:pb-10">
        {/* Mandatory Google Maps Platform Quota Warning Banner (Case A Demo Key) */}
        {gmpQuotaExceeded && (
          <div className="bg-amber-950 border-b border-amber-700 text-amber-200 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-white hover:text-amber-300"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* Strict 3-Zone Top Bar Contract */}
        <header className="flex items-center justify-between px-6 py-4 bg-slate-950/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('explore_map');
            }}
            className="text-xl font-display font-semibold tracking-tight text-white"
          >
            Explorer
          </a>

          {/* Zone 2: Context-Aware Navigation Links (Separate for User Portal vs Explorer Portal) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            {showSeparateLoginPortal ? (
              <>
                <button
                  onClick={() => {
                    setDomainRole('traveler');
                    setShowSeparateLoginPortal(false);
                    setActiveTab('explore_map');
                  }}
                  className="hover:text-emerald-400 transition-colors whitespace-nowrap flex items-center gap-1.5"
                >
                  <Compass className="w-4 h-4 text-emerald-400" />
                  Enter User Portal (user.explorer.live)
                </button>
                <button
                  onClick={() => {
                    setDomainRole('explorer');
                    setShowSeparateLoginPortal(false);
                    setActiveTab('explorer_portal');
                  }}
                  className="hover:text-amber-400 transition-colors whitespace-nowrap flex items-center gap-1.5"
                >
                  <Radio className="w-4 h-4 text-amber-400" />
                  Enter Explorer Portal (explorer.explorer.live · {ringingCallsCount} Alerts)
                </button>
              </>
            ) : domainRole === 'explorer' ? (
              <>
                <span className="text-amber-400 font-semibold flex items-center gap-1.5 whitespace-nowrap">
                  <Radio className="w-4 h-4" />
                  Explorer Portal Active (explorer.explorer.live)
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  Notifications ({ringingCallsCount}) · Live Camera · 34-Language AI Video Translation
                </span>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setShowSeparateLoginPortal(false);
                    setActiveTab('explore_map');
                  }}
                  className={`hover:text-white transition-colors whitespace-nowrap ${
                    !showSeparateLoginPortal && activeTab === 'explore_map'
                      ? 'text-emerald-400 underline underline-offset-8 decoration-2'
                      : ''
                  }`}
                >
                  Live Map
                </button>
                <button
                  onClick={() => {
                    setShowSeparateLoginPortal(false);
                    setActiveTab('ai_planner');
                  }}
                  className={`hover:text-white transition-colors whitespace-nowrap ${
                    !showSeparateLoginPortal && activeTab === 'ai_planner'
                      ? 'text-emerald-400 underline underline-offset-8 decoration-2'
                      : ''
                  }`}
                >
                  AI Budget, Dates &amp; Places
                </button>
                <button
                  onClick={() => {
                    setShowSeparateLoginPortal(false);
                    setActiveTab('ai_studio_hub');
                  }}
                  className={`hover:text-white transition-colors whitespace-nowrap ${
                    !showSeparateLoginPortal && activeTab === 'ai_studio_hub'
                      ? 'text-emerald-400 underline underline-offset-8 decoration-2'
                      : ''
                  }`}
                >
                  Voice, Veo & Chat
                </button>
                <button
                  onClick={() => {
                    setShowSeparateLoginPortal(false);
                    setActiveTab('wishlist_budget');
                  }}
                  className={`hover:text-white transition-colors whitespace-nowrap ${
                    !showSeparateLoginPortal && activeTab === 'wishlist_budget'
                      ? 'text-emerald-400 underline underline-offset-8 decoration-2'
                      : ''
                  }`}
                >
                  Wishlist ({wishlistItems.length})
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: Portal & Mobile App Switcher Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setShowMobileAppWorkspace((v) => !v);
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                showMobileAppWorkspace
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-400'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Mobile Apps (User &amp; Explorer)
            </button>

            <button
              onClick={() => {
                setDomainRole('traveler');
                setShowSeparateLoginPortal(false);
                setActiveTab('explore_map');
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                !showSeparateLoginPortal && domainRole === 'traveler'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-400'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              User Portal
            </button>

            <button
              onClick={() => {
                setDomainRole('explorer');
                setShowSeparateLoginPortal(false);
                setActiveTab('explorer_portal');
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                !showSeparateLoginPortal && domainRole === 'explorer'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Explorer Portal ({ringingCallsCount})
            </button>

            <button
              onClick={() => setShowSeparateLoginPortal(true)}
              className={`px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                showSeparateLoginPortal
                  ? 'bg-white text-slate-950'
                  : 'bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Login Portals
            </button>

            <PWAInstallButton />
          </div>
        </header>

        {/* Sub-Header Bar: Live Location Status, Separate Login Portal Status, Streak Score, 34-Language & 16-Currency */}
        <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-300">
              <button
                onClick={requestUserLiveLocation}
                className="font-mono font-semibold text-emerald-400 hover:underline flex items-center gap-1"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                {userLiveLocation
                  ? `Present Live Location: ${userLiveLocation.lat.toFixed(4)}, ${userLiveLocation.lng.toFixed(4)}`
                  : liveLocationStatus}
              </button>
              <span aria-hidden="true">·</span>
              <button
                onClick={() => setShowSeparateLoginPortal(true)}
                className="font-mono text-white hover:text-emerald-400 underline underline-offset-4"
              >
                Portal:{' '}
                {domainRole === 'traveler'
                  ? 'user.explorer.live (User Portal)'
                  : 'explorer.explorer.live (Explorer Portal)'}{' '}
                ({isCurrentDomainLoggedIn ? 'Logged In' : 'Logged Out'})
              </button>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                Streak: {streakScore} pts ({loyaltyDiscountPct}% Off)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Credits: {formatCurrency(creditsBalanceUsd, currencyCode, liveRates)}
              </span>
              <span aria-hidden="true">·</span>
              <span>Offline: {offlinePacks.length} Packs</span>
            </div>

            {/* Right Controls: Direct Separate Portal Switcher + Log In / Log Out Button + Language (34) + Currency (16) */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowSeparateLoginPortal(true)}
                className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-emerald-500/40 text-emerald-400 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap"
              >
                <ShieldCheck className="w-3 h-3" />
                Separate Login Portals
              </button>

              {isCurrentDomainLoggedIn ? (
                <button
                  onClick={() =>
                    domainRole === 'traveler'
                      ? handleTravelerLogout()
                      : handleExplorerLogout()
                  }
                  className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap"
                >
                  <LogOut className="w-3 h-3" />
                  Log Out ({domainRole === 'traveler' ? 'User Portal' : 'Explorer Portal'})
                </button>
              ) : (
                <button
                  onClick={() => setShowSeparateLoginPortal(true)}
                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg font-semibold flex items-center gap-1 whitespace-nowrap"
                >
                  <LogIn className="w-3 h-3" />
                  Log In ({domainRole === 'traveler' ? 'User Portal' : 'Explorer Portal'})
                </button>
              )}

              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  aria-label="Select Language"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium text-white"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                aria-label="Select Currency"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-semibold text-emerald-400"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol.trim()})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Global Real-Time Call Notification Alert Banner */}
        {activeBannerNotification && (
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
            <div
              className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl ${
                activeBannerNotification.status === 'ringing'
                  ? 'bg-emerald-950/80 border-emerald-500 text-white'
                  : activeBannerNotification.status === 'rejected'
                  ? 'bg-red-950/80 border-red-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 shrink-0">
                  <BellRing className="w-5 h-5 animate-bounce" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">
                    {activeBannerNotification.title}
                  </p>
                  <p className="text-xs text-slate-300">
                    {activeBannerNotification.subtitle} · Escrow:{' '}
                    <span className="font-mono font-semibold text-emerald-400">
                      {formatCurrency(
                        activeBannerNotification.amountUsd,
                        currencyCode,
                        liveRates
                      )}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {activeBannerNotification.status === 'ringing' && (
                  <>
                    <button
                      onClick={() =>
                        handleAcceptCallFromNotification(activeBannerNotification.id)
                      }
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Accept Call Notification
                    </button>
                    <button
                      onClick={() =>
                        handleRejectCallFromNotification(activeBannerNotification.id)
                      }
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject & Notify Caller
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setActiveTab('explorer_portal');
                    setActiveBannerNotification(null);
                  }}
                  className="px-3 py-2 bg-slate-950 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl whitespace-nowrap"
                >
                  Open Call Queue
                </button>
                <button
                  onClick={() => setActiveBannerNotification(null)}
                  className="px-2.5 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 space-y-10">
          {/* Dedicated Top Portal Banner: Strictly Switch Between User Portal and Explorer Portal */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-mono text-emerald-400">
                {domainRole === 'traveler'
                  ? 'ACTIVE PORTAL · USER / TRAVELER PORTAL (https://user.explorer.live)'
                  : 'ACTIVE PORTAL · LOCAL EXPLORER GUIDE PORTAL (https://explorer.explorer.live)'}
              </p>
              <h2 className="text-lg sm:text-xl font-display font-semibold text-white">
                {domainRole === 'traveler'
                  ? 'User Portal — Explore Live GPS Maps, AI Planner, Wishlist & Trip Memories'
                  : 'Explorer Portal — Incoming Call Notifications, Mobile Camera & 34-Language AI Video Translation'}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setDomainRole('traveler');
                    setActiveTab('explore_map');
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    domainRole === 'traveler'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  1. User Portal (user.explorer.live)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDomainRole('explorer');
                    setActiveTab('explorer_portal');
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    domainRole === 'explorer'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  2. Explorer Portal (explorer.explorer.live · {ringingCallsCount})
                </button>
              </div>

              {domainRole === 'traveler' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSeparateLoginPortal(false);
                    setActiveTab('ai_planner');
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    !showSeparateLoginPortal && activeTab === 'ai_planner'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                      : 'bg-slate-950 hover:bg-slate-800 border-emerald-500/40 text-emerald-400'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Budget, Dates &amp; Places
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowSeparateLoginPortal((v) => !v)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  showSeparateLoginPortal
                    ? 'bg-white text-slate-950 border-white'
                    : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                {domainRole === 'traveler' ? 'User Login Screen' : 'Explorer Login Screen'}
              </button>
            </div>
          </div>

          {/* SEPARATE MOBILE APPLICATIONS WORKSPACE (USER MOBILE APP OR EXPLORER MOBILE APP) */}
          {showMobileAppWorkspace && (
            <MobileAppDualWorkspace
              activePortal={domainRole === 'traveler' ? 'user' : 'explorer'}
              onSwitchPortal={(portal) => {
                setDomainRole(portal === 'user' ? 'traveler' : 'explorer');
                if (portal === 'explorer') {
                  setActiveTab('explorer_portal');
                } else {
                  setActiveTab('explore_map');
                }
              }}
              travelerLoggedIn={Boolean(currentUser || travelerSessionActive)}
              explorerLoggedIn={explorerSessionActive}
              travelerEmail={travelerEmail}
              onChangeTravelerEmail={setTravelerEmail}
              explorerEmail={explorerEmail}
              onChangeExplorerEmail={setExplorerEmail}
              onLoginTraveler={() => handleTravelerLogin(false)}
              onLogoutTraveler={handleTravelerLogout}
              onLoginExplorer={handleExplorerLogin}
              onLogoutExplorer={handleExplorerLogout}
              preferredLanguage={preferredLanguage}
              onChangeLanguage={setPreferredLanguage}
              currencyCode={currencyCode}
              onChangeCurrency={setCurrencyCode}
              liveRates={liveRates}
              creditsBalanceUsd={creditsBalanceUsd}
              streakScore={streakScore}
              loyaltyDiscountPct={loyaltyDiscountPct}
              userLiveLocation={userLiveLocation}
              onRequestLiveLocation={requestUserLiveLocation}
              tripMemories={tripMemories}
              onSaveTripMemory={handleTripMemorySaved}
            />
          )}

          {showSeparateLoginPortal ? (
            <SeparateLoginPortalGateway
              activePortal={domainRole === 'traveler' ? 'user' : 'explorer'}
              onSwitchPortal={(portal) => {
                setDomainRole(portal === 'user' ? 'traveler' : 'explorer');
              }}
              travelerEmail={travelerEmail}
              onChangeTravelerEmail={setTravelerEmail}
              explorerEmail={explorerEmail}
              onChangeExplorerEmail={setExplorerEmail}
              preferredLanguage={preferredLanguage}
              onChangeLanguage={setPreferredLanguage}
              currencyCode={currencyCode}
              onChangeCurrency={setCurrencyCode}
              userLiveLocation={userLiveLocation}
              liveLocationStatus={liveLocationStatus}
              onRequestLiveLocation={requestUserLiveLocation}
              onOpenMobileAppWorkspace={() => setShowMobileAppWorkspace(true)}
              onLoginUserPortal={(useGoogle: boolean, displayName: string) => {
                if (displayName.trim()) {
                  setCustomPortalDisplayName(displayName.trim());
                }
                handleTravelerLogin(useGoogle);
              }}
              onLoginExplorerPortal={(useGoogle: boolean, displayName: string) => {
                if (displayName.trim()) {
                  setCustomPortalDisplayName(displayName.trim());
                }
                if (useGoogle) {
                  signInWithGoogle().catch(() => {});
                }
                handleExplorerLogin();
              }}
            />
          ) : domainRole === 'explorer' ? (
            /* =================================================================
               DEDICATED SEPARATE EXPLORER PORTAL (explorer.explorer.live)
               Includes: Call Notifications + Mobile Vibration, Live Camera & Video,
               and 34-Language AI Video Translation
               ================================================================= */
            <ExplorerPortalView
              isLoggedInExplorer={explorerSessionActive}
              explorerDisplayName={
                currentUser?.displayName || `${customPortalDisplayName} (Verified Guide)`
              }
              explorerEmail={explorerEmail}
              onLoginExplorerPortal={handleExplorerLogin}
              onLogoutExplorerPortal={handleExplorerLogout}
              userLiveLocation={userLiveLocation}
              explorerLanguage={preferredLanguage}
              onChangeExplorerLanguage={setPreferredLanguage}
              currencyCode={currencyCode}
              liveRates={liveRates}
              callQueue={callQueue}
              onAcceptCallRequest={handleAcceptCallFromNotification}
              onRejectCallRequest={handleRejectCallFromNotification}
              onSimulateIncomingCall={handleTriggerSimulatedCallNotification}
            />
          ) : (
            /* =================================================================
               DEDICATED SEPARATE USER PORTAL (user.explorer.live)
               ================================================================= */
            <>
              {/* Hero Spotlight Banner on Map Tab */}
              {activeTab === 'explore_map' && (
                <section className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
                  <img
                    src={GENERATED_ASSETS.heroExplorer}
                    alt="Live Local Explorer streaming historic street market"
                    referrerPolicy="no-referrer"
                    className="w-full h-64 md:h-72 object-cover opacity-55"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090D16] via-[#090D16]/60 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6 md:left-8 md:right-8 flex flex-col md:flex-row md:items-end justify-between gap-4 text-white">
                    <div className="space-y-2 max-w-2xl">
                      <p className="text-xs font-mono text-emerald-400">
                        Present Live GPS Map · Separate Login Portals · Real-Time Call Notifications
                      </p>
                      <h1 className="text-2xl md:text-4xl font-display font-semibold tracking-tight">
                        Explore Around Your Present Live Location or Connect with 32+ Global Guides
                      </h1>
                      <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                        Your map automatically locks onto your present live GPS coordinates. Send instant Call Notifications with mobile vibration alerts, translate live across 34 languages, and switch between User &amp; Explorer Login Portals.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <button
                        onClick={requestUserLiveLocation}
                        className="px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <LocateFixed className="w-4 h-4" />
                        Center Present Live GPS
                      </button>
                      <button
                        onClick={() => setShowDomainCameraDeck((v) => !v)}
                        className="px-4 py-3 bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
                      >
                        {showDomainCameraDeck
                          ? 'Hide Camera & Domain Deck'
                          : 'Show Camera & Separate Domains'}
                      </button>
                      <button
                        onClick={() => setShowSeparateLoginPortal(true)}
                        className="px-4 py-3 bg-slate-900/90 hover:bg-slate-800 text-emerald-400 border border-emerald-500/50 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
                      >
                        Open Separate Login Portals
                      </button>
                    </div>
                  </div>
                </section>
              )}

          {/* SEPARATE LOGIN DOMAINS (USER vs EXPLORER) + DUAL CAMERA & MICROPHONE STUDIO */}
          {showDomainCameraDeck && (
            <DualDomainAndCameraDeck
              domainRole={domainRole}
              onSwitchDomainRole={handleSwitchDomainRole}
              travelerLoggedIn={Boolean(currentUser || travelerSessionActive)}
              explorerLoggedIn={explorerSessionActive}
              travelerEmail={travelerEmail}
              onChangeTravelerEmail={setTravelerEmail}
              explorerEmail={explorerEmail}
              onChangeExplorerEmail={setExplorerEmail}
              onLoginTravelerDomain={handleTravelerLogin}
              onLogoutTravelerDomain={handleTravelerLogout}
              onLoginExplorerDomain={handleExplorerLogin}
              onLogoutExplorerDomain={handleExplorerLogout}
              preferredLanguage={preferredLanguage}
              onChangeLanguage={setPreferredLanguage}
              creditsBalanceUsd={creditsBalanceUsd}
              streakScore={streakScore}
              loyaltyDiscountPct={loyaltyDiscountPct}
              currencyCode={currencyCode}
              liveRates={liveRates}
              userLiveLocation={userLiveLocation}
            />
          )}

          {/* TAB 1: INTERACTIVE GOOGLE MAP CENTERED ON PRESENT LIVE LOCATION & 32+ LIVE CHANNELS */}
          {activeTab === 'explore_map' && (
            <MapExplorerView
              userLiveLocation={userLiveLocation}
              liveLocationStatus={liveLocationStatus}
              onRequestLiveLocation={requestUserLiveLocation}
              selectedMood={selectedMood}
              onSelectMood={setSelectedMood}
              maxBudgetUsd={maxBudgetUsd}
              onChangeMaxBudget={setMaxBudgetUsd}
              budgetSort={budgetSort}
              onChangeBudgetSort={setBudgetSort}
              currencyCode={currencyCode}
              liveRates={liveRates}
              loyaltyDiscountPct={loyaltyDiscountPct}
              wishlistIds={wishlistIdSet}
              onToggleWishlist={handleToggleWishlist}
              onStartLiveCall={(channel, placeDisplayName) =>
                setActiveCallTarget({ channel, placeDisplayName })
              }
              offlinePacks={offlinePacks}
              onSaveOfflinePack={(id) => handleSaveOfflinePack(id)}
            />
          )}

          {/* TAB 2: AI TRAVEL PLANNER */}
          {activeTab === 'ai_planner' && (
            <AiTravelPlannerView
              userLiveLocation={userLiveLocation}
              preferredLanguage={preferredLanguage}
              currencyCode={currencyCode}
              liveRates={liveRates}
              loyaltyDiscountPct={loyaltyDiscountPct}
              onTripSaved={() => {}}
            />
          )}

          {/* TAB 2B: LIVE VOICE (gemini-3.8-live), VEO PHOTO ANIMATOR & MULTI-TURN GEMINI CHATBOT */}
          {activeTab === 'ai_studio_hub' && (
            <AiStudioHubView preferredLanguage={preferredLanguage} />
          )}

          {/* TAB 3: WISHLIST, BUDGET LIST & CURATED TRAVEL HISTORY */}
          {activeTab === 'wishlist_budget' && (
            <div className="space-y-8">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-semibold text-white">
                    Wishlist, Budget Tracker & Saved Travel History
                  </h2>
                  <p className="text-xs text-slate-400">
                    Your Streak Score ({streakScore} pts) unlocks a {loyaltyDiscountPct}% regular-user discount on all Explorer sessions and hotel bookings.
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                  <div className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-slate-400 block">Wishlist Budget Total</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      {formatCurrency(
                        wishlistItems.reduce((acc, item) => acc + item.estimatedCostUsd, 0),
                        currencyCode,
                        liveRates
                      )}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                    <span className="text-slate-400 block">Offline Remote Packs</span>
                    <span className="text-sm font-semibold text-white">
                      {offlinePacks.length} Saved
                    </span>
                  </div>
                </div>
              </div>

              {/* Wishlist & Budget Items */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-base font-display font-semibold text-white">
                  01. Saved Wishlist & Spot Budget List ({wishlistItems.length})
                </h3>
                {wishlistItems.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <p className="text-sm font-semibold text-white">
                      Your Wishlist is Empty
                    </p>
                    <p className="text-xs text-slate-400">
                      Save any of the 32+ mood channels on the Live Map to track spot budgets and offline access.
                    </p>
                    <button
                      onClick={() => setActiveTab('explore_map')}
                      className="mt-2 px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-semibold rounded-lg whitespace-nowrap"
                    >
                      Browse Live Map
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {wishlistItems.map((item) => {
                      const isShareOpen = activeShareWishlistId === item.id;
                      const directSpotUrl = buildWishlistSpotDirectUrl(item);
                      const socialShareText = `Check out my favorite spot on Explorer: ${item.placeName} in ${item.city} (${item.moodCategory})!`;
                      const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                        socialShareText
                      )}&url=${encodeURIComponent(directSpotUrl)}`;
                      const whatsappIntentUrl = `https://wa.me/?text=${encodeURIComponent(
                        `${socialShareText} ${directSpotUrl}`
                      )}`;
                      const facebookIntentUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                        directSpotUrl
                      )}&quote=${encodeURIComponent(socialShareText)}`;
                      const linkedinIntentUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                        directSpotUrl
                      )}`;
                      const isCopiedForThis =
                        wishlistShareFeedback?.itemId === item.id;

                      return (
                        <div key={item.id} className="py-4 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-0.5">
                              <p className="text-sm font-semibold text-white">
                                {item.placeName}
                              </p>
                              <p className="text-xs text-slate-400">
                                {item.moodCategory} · {item.city} · {item.notes}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                                {formatCurrency(
                                  item.estimatedCostUsd,
                                  currencyCode,
                                  liveRates
                                )}
                              </span>

                              {/* Direct Copy Link Quick Action */}
                              <button
                                type="button"
                                onClick={() => handleCopyWishlistDirectLink(item)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-950 hover:border-emerald-500/60 text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                title="Copy direct link to this spot"
                              >
                                {isCopiedForThis ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Copy Link</span>
                                  </>
                                )}
                              </button>

                              {/* Share to Social Media Toggle Button */}
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveShareWishlistId((prev) =>
                                    prev === item.id ? null : item.id
                                  )
                                }
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                  isShareOpen
                                    ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                                    : 'bg-slate-950 border-slate-700 hover:border-emerald-500/60 text-slate-200'
                                }`}
                                aria-expanded={isShareOpen}
                                aria-label={`Share ${item.placeName}`}
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Share</span>
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  if (currentUser && !item.id.startsWith('local_')) {
                                    try {
                                      await deleteDoc(doc(db, 'wishlists', item.id));
                                    } catch (err) {
                                      handleFirestoreError(
                                        err,
                                        OperationType.DELETE,
                                        `wishlists/${item.id}`
                                      );
                                    }
                                  } else {
                                    setWishlistItems((prev) =>
                                      prev.filter((w) => w.id !== item.id)
                                    );
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg"
                                aria-label="Remove from wishlist"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Inline Confirmation Feedback Toast */}
                          {isCopiedForThis && wishlistShareFeedback && (
                            <p className="text-xs font-mono text-emerald-400">
                              {wishlistShareFeedback.message}
                            </p>
                          )}

                          {/* Expandable Share & Social Media Drawer for Wishlist Item */}
                          {isShareOpen && (
                            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-300">
                                  Share Direct Link or Post &ldquo;{item.placeName}&rdquo; to Social Media
                                </span>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    readOnly
                                    value={directSpotUrl}
                                    aria-label="Direct spot link"
                                    className="px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-800 text-slate-300 rounded-lg w-56 sm:w-72"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleCopyWishlistDirectLink(item)}
                                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-lg flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <Copy className="w-3 h-3" />
                                    Copy URL
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
                                <a
                                  href={xIntentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() =>
                                    handleCopyWishlistSocialPost(item, 'X (Twitter)')
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                                  Post to X / Twitter
                                </a>

                                <a
                                  href={whatsappIntentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() =>
                                    handleCopyWishlistSocialPost(item, 'WhatsApp')
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                                  Share on WhatsApp
                                </a>

                                <a
                                  href={facebookIntentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() =>
                                    handleCopyWishlistSocialPost(item, 'Facebook')
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                                  Post to Facebook
                                </a>

                                <a
                                  href={linkedinIntentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() =>
                                    handleCopyWishlistSocialPost(item, 'LinkedIn')
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                                  Share on LinkedIn
                                </a>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyWishlistSocialPost(item, 'Instagram')
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <Copy className="w-3 h-3 text-emerald-400" />
                                  Copy Instagram Caption
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyWishlistSocialPost(item, 'Device Share')
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                                >
                                  <Share2 className="w-3 h-3 text-emerald-400" />
                                  Native Share
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 02. GEMINI AI TRIP MEMORIES (AUTOMATIC POST-CALL SUMMARIES SAVED IN TRAVELER ACCOUNT) */}
              <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-6 space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 block">
                        AUTOMATIC POST-CALL GEMINI SUMMARIES · TRAVELER ACCOUNT
                      </span>
                      <h3 className="text-lg font-display font-semibold text-white">
                        02. Saved Trip Memories ({tripMemories.length})
                      </h3>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Automatically generated by Gemini when a Live Explorer Call ends
                  </span>
                </div>

                {tripMemories.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">
                    No Trip Memories yet. Start any Live Explorer Call and click &ldquo;End Call &amp; Rate&rdquo; to automatically generate a Gemini Trip Memory summary of the places shown.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tripMemories.map((mem) => (
                      <div
                        key={mem.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono text-emerald-400 font-semibold">
                              {mem.placeName} · Guide: {mem.explorerName}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {mem.createdAtLabel}
                            </span>
                          </div>

                          <h4 className="text-sm font-display font-semibold text-white">
                            {mem.memoryTitle}
                          </h4>

                          <p className="text-xs text-slate-300 leading-relaxed">
                            {mem.summaryText}
                          </p>

                          {mem.placesShown.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[10px] font-mono text-slate-400">
                                Places Shown:
                              </span>
                              {mem.placesShown.map((spot, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] text-emerald-300"
                                >
                                  {spot}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {mem.culturalHighlight && (
                          <p className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 mt-2">
                            Highlight: {mem.culturalHighlight}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved AI Curated Trips & Community Reviews */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h3 className="text-base font-display font-semibold text-white">
                    03. Saved AI Travel Itineraries ({savedTrips.length})
                  </h3>
                  {savedTrips.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">
                      No curated AI trips saved yet. Generate an itinerary in the AI Planner tab and click &ldquo;Save Curated Trip to Account&rdquo;.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {savedTrips.map((t) => (
                        <div
                          key={t.id}
                          className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-white">
                              {t.destination} ({t.travelDates})
                            </span>
                            <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                              {formatCurrency(t.estimatedSpendUsd, currencyCode, liveRates)} ({t.bookingStatus})
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 line-clamp-3">
                            {t.summaryText}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-display font-semibold text-white">
                      03. Recent Post-Call Explorer Reviews
                    </h3>
                    <Award className="w-4 h-4 text-emerald-400" />
                  </div>
                  {recentReviews.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">
                      Complete a Live Explorer Call and submit a star rating to see verified trip reviews and earn +25 Streak Score.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentReviews.slice(0, 5).map((rev) => (
                        <div
                          key={rev.id}
                          className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-white">
                              {rev.placeName} · by {rev.authorName}
                            </span>
                            <span className="font-mono font-semibold text-amber-400 flex items-center gap-1">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              {rev.rating}.0
                            </span>
                          </div>
                          <p className="text-xs text-slate-300">{rev.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LOCAL EXPLORER PORTAL DOMAIN (`explorer.explorer.live`) */}
          {activeTab === 'explorer_portal' && (
            <ExplorerPortalView
              isLoggedInExplorer={explorerSessionActive}
              explorerDisplayName={
                currentUser?.displayName || `${customPortalDisplayName} (Verified Guide)`
              }
              explorerEmail={explorerEmail}
              onLoginExplorerPortal={handleExplorerLogin}
              onLogoutExplorerPortal={handleExplorerLogout}
              userLiveLocation={userLiveLocation}
              explorerLanguage={preferredLanguage}
              onChangeExplorerLanguage={setPreferredLanguage}
              currencyCode={currencyCode}
              liveRates={liveRates}
              callQueue={callQueue}
              onAcceptCallRequest={handleAcceptCallFromNotification}
              onRejectCallRequest={handleRejectCallFromNotification}
              onSimulateIncomingCall={handleTriggerSimulatedCallNotification}
            />
          )}
            </>
          )}
        </main>

        {/* Clean Minimal Footer */}
        <footer className="border-t border-slate-800 bg-slate-950 px-6 py-4 text-xs text-slate-400">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>Explorer — Live Remote Exploration & AI Travel Concierge</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-400">
                <WifiOff className="w-3.5 h-3.5" />
                Offline Remote Travel Cache Active ({offlinePacks.length} Packs)
              </span>
              <span>·</span>
              <a
                href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white"
              >
                Google Maps Platform Terms
              </a>
            </div>
          </div>
        </footer>

        {/* Mobile Fixed Bottom Tab Bar (Separate User Mode & Explorer Mode + Dual Mobile App Switch) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-5 items-center h-14">
          <button
            onClick={() => {
              setDomainRole('traveler');
              setShowSeparateLoginPortal(false);
              setActiveTab('explore_map');
            }}
            className={`flex flex-col items-center justify-center min-h-[44px] ${
              !showSeparateLoginPortal && domainRole === 'traveler' && activeTab === 'explore_map'
                ? 'text-emerald-400 font-semibold'
                : 'text-slate-400'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">User App</span>
          </button>
          <button
            onClick={() => {
              setDomainRole('explorer');
              setShowSeparateLoginPortal(false);
              setActiveTab('explorer_portal');
            }}
            className={`flex flex-col items-center justify-center min-h-[44px] ${
              !showSeparateLoginPortal && domainRole === 'explorer'
                ? 'text-amber-400 font-semibold'
                : 'text-slate-400'
            }`}
          >
            <Radio className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Guide App ({ringingCallsCount})</span>
          </button>
          <button
            onClick={() => setShowMobileAppWorkspace((v) => !v)}
            className={`flex flex-col items-center justify-center min-h-[44px] ${
              showMobileAppWorkspace ? 'text-emerald-400 font-semibold' : 'text-slate-400'
            }`}
          >
            <Smartphone className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Dual Phones</span>
          </button>
          <button
            onClick={() => {
              setDomainRole('traveler');
              setShowSeparateLoginPortal(false);
              setActiveTab('wishlist_budget');
            }}
            className={`flex flex-col items-center justify-center min-h-[44px] ${
              !showSeparateLoginPortal && activeTab === 'wishlist_budget'
                ? 'text-emerald-400 font-semibold'
                : 'text-slate-400'
            }`}
          >
            <Heart className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Memories</span>
          </button>
          <button
            onClick={() => setShowSeparateLoginPortal(true)}
            className={`flex flex-col items-center justify-center min-h-[44px] ${
              showSeparateLoginPortal ? 'text-white font-semibold' : 'text-slate-400'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Logins</span>
          </button>
        </nav>

        <OfflineIndicator />

        {/* Dedicated Dual-Domain Login & Logout Portal Modal */}
        {showLoginPortalModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-display font-semibold text-white">
                    Explorer Dual-Domain Login & Logout Portal
                  </h3>
                </div>
                <button
                  onClick={() => setShowLoginPortalModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-lg"
                >
                  Close Portal
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Your Display Name Across Portals
                  </label>
                  <input
                    type="text"
                    value={customPortalDisplayName}
                    onChange={(e) => setCustomPortalDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {authNotice && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-300">
                    {authNotice}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Domain 1: Traveler Portal (`traveler.explorer.live`) */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-mono text-emerald-400">
                        Domain 01 · traveler.explorer.live
                      </p>
                      <h4 className="text-base font-semibold text-white">
                        Traveler Portal Account
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Access present live location maps, 300 USD login credits, {loyaltyDiscountPct}% loyalty streak discounts, and AI Travel Planner cloud history.
                      </p>
                      <div className="pt-2 text-xs font-mono text-slate-300">
                        Status:{' '}
                        <span
                          className={
                            currentUser || travelerSessionActive
                              ? 'text-emerald-400 font-semibold'
                              : 'text-amber-400 font-semibold'
                          }
                        >
                          {currentUser || travelerSessionActive ? 'LOGGED IN' : 'LOGGED OUT'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => {
                          handleTravelerLogin(false);
                          handleSwitchDomainRole('traveler');
                        }}
                        className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Log In to Traveler Domain
                      </button>

                      <button
                        onClick={() => handleTravelerLogin(true)}
                        className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                        Sign In with Google OAuth
                      </button>

                      {(currentUser || travelerSessionActive) && (
                        <button
                          onClick={handleTravelerLogout}
                          className="w-full py-2 px-4 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Log Out of Traveler Domain
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Domain 2: Local Explorer Guide Portal (`guide.explorer.live`) */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-mono text-emerald-400">
                        Domain 02 · guide.explorer.live
                      </p>
                      <h4 className="text-base font-semibold text-white">
                        Local Explorer Guide Portal
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Receive incoming Call Notifications with mobile vibration alerts, accept or reject pre-paid Join Requests, and broadcast your live mobile camera.
                      </p>
                      <div className="pt-2 text-xs font-mono text-slate-300">
                        Status:{' '}
                        <span
                          className={
                            explorerSessionActive
                              ? 'text-emerald-400 font-semibold'
                              : 'text-amber-400 font-semibold'
                          }
                        >
                          {explorerSessionActive ? 'LOGGED IN' : 'LOGGED OUT'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => {
                          handleExplorerLogin();
                          setShowLoginPortalModal(false);
                        }}
                        className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Log In to Explorer Guide Domain
                      </button>

                      {explorerSessionActive && (
                        <button
                          onClick={handleExplorerLogout}
                          className="w-full py-2 px-4 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Log Out of Explorer Guide Domain
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active Live Explorer Video Call Modal */}
        {activeCallTarget && (
          <LiveCallModal
            channel={activeCallTarget.channel}
            placeDisplayName={activeCallTarget.placeDisplayName}
            travelerLanguage={preferredLanguage}
            currencyCode={currencyCode}
            liveRates={liveRates}
            loyaltyDiscountPct={loyaltyDiscountPct}
            onClose={() => setActiveCallTarget(null)}
            onReviewSubmitted={() => handleReviewSubmitted()}
            onCallNotificationEvent={handleModalCallNotificationEvent}
            onTripMemorySaved={handleTripMemorySaved}
            onViewTripMemories={() => {
              setShowSeparateLoginPortal(false);
              setDomainRole('traveler');
              setActiveTab('wishlist_budget');
            }}
          />
        )}
      </div>
    </APIProvider>
  );
}
