import React, { useState, useRef, useEffect } from 'react';
import {
  Smartphone,
  Compass,
  Radio,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  BellRing,
  CheckCircle2,
  XCircle,
  Volume2,
  Send,
  Sparkles,
  LogIn,
  LogOut,
  LocateFixed,
  RefreshCw,
  Video,
  PhoneOff,
  BookmarkCheck,
  Heart,
} from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  EXPLORER_CHANNEL_PRESETS,
  ExplorerChannelPreset,
  formatCurrency,
} from '../data/catalog';
import { TripMemoryRecord } from './LiveCallModal';

interface MobileAppDualWorkspaceProps {
  activePortal: 'user' | 'explorer';
  onSwitchPortal: (portal: 'user' | 'explorer') => void;
  travelerLoggedIn: boolean;
  explorerLoggedIn: boolean;
  travelerEmail: string;
  onChangeTravelerEmail: (v: string) => void;
  explorerEmail: string;
  onChangeExplorerEmail: (v: string) => void;
  onLoginTraveler: () => void;
  onLogoutTraveler: () => void;
  onLoginExplorer: () => void;
  onLogoutExplorer: () => void;
  preferredLanguage: string;
  onChangeLanguage: (code: string) => void;
  currencyCode: string;
  onChangeCurrency: (code: string) => void;
  liveRates: Record<string, number>;
  creditsBalanceUsd: number;
  streakScore: number;
  loyaltyDiscountPct: number;
  userLiveLocation: { lat: number; lng: number } | null;
  onRequestLiveLocation: () => void;
  tripMemories: TripMemoryRecord[];
  onSaveTripMemory: (memory: TripMemoryRecord) => void;
}

export function MobileAppDualWorkspace({
  activePortal,
  onSwitchPortal,
  travelerLoggedIn,
  explorerLoggedIn,
  travelerEmail,
  onChangeTravelerEmail,
  explorerEmail,
  onChangeExplorerEmail,
  onLoginTraveler,
  onLogoutTraveler,
  onLoginExplorer,
  onLogoutExplorer,
  preferredLanguage,
  onChangeLanguage,
  currencyCode,
  onChangeCurrency,
  liveRates,
  creditsBalanceUsd,
  streakScore,
  loyaltyDiscountPct,
  userLiveLocation,
  onRequestLiveLocation,
  tripMemories,
  onSaveTripMemory,
}: MobileAppDualWorkspaceProps) {
  const [mobileViewLayout, setMobileViewLayout] = useState<'dual' | 'user_only' | 'explorer_only'>(
    activePortal === 'user' ? 'user_only' : 'explorer_only'
  );

  useEffect(() => {
    setMobileViewLayout(activePortal === 'user' ? 'user_only' : 'explorer_only');
  }, [activePortal]);

  // Separate Bottom Navigation Tabs for User Mobile App vs Explorer Mobile App
  const [userMobileTab, setUserMobileTab] = useState<'spots' | 'call' | 'memories' | 'login'>('spots');
  const [explorerMobileTab, setExplorerMobileTab] = useState<'alerts' | 'camera' | 'translate' | 'login'>('alerts');

  // Selected Channel & Live Synced Call State between User Phone and Explorer Phone
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    EXPLORER_CHANNEL_PRESETS[0]?.id || 'ch_01'
  );
  const selectedChannel: ExplorerChannelPreset =
    EXPLORER_CHANNEL_PRESETS.find((c) => c.id === selectedChannelId) ||
    EXPLORER_CHANNEL_PRESETS[0];

  const [mobileCallState, setMobileCallState] = useState<
    'idle' | 'ringing' | 'connected' | 'rejected' | 'ended'
  >('idle');
  const [explorerLocalLang, setExplorerLocalLang] = useState<string>(
    selectedChannel.spokenLanguageCode || 'ja'
  );

  // User Phone Camera & Mic
  const [userCamOn, setUserCamOn] = useState<boolean>(true);
  const [userMicOn, setUserMicOn] = useState<boolean>(true);
  const [userInstructionText, setUserInstructionText] = useState<string>(
    'Pan camera right toward the lantern stall and ask the artisan about the craft.'
  );
  const [translatedInstructionForExplorer, setTranslatedInstructionForExplorer] = useState<string>(
    '提灯の屋台の方へカメラを向けて、職人さんに工芸品について尋ねてください。'
  );

  // Explorer Phone Camera & Mic & Live Video Translation
  const [explorerCamOn, setExplorerCamOn] = useState<boolean>(true);
  const [explorerMicOn, setExplorerMicOn] = useState<boolean>(true);
  const [explorerUseWebcam, setExplorerUseWebcam] = useState<boolean>(false);
  const [explorerFacing, setExplorerFacing] = useState<'environment' | 'user'>('environment');
  const [explorerSpeechText, setExplorerSpeechText] = useState<string>(
    SUPPORTED_LANGUAGES.find((l) => l.code === selectedChannel.spokenLanguageCode)
      ?.sampleExplorerSpeech ||
      'こんにちは！ここは地元の人しか知らない築100年の茶屋通りです。'
  );
  const [liveTranslatedSubtitleForUser, setLiveTranslatedSubtitleForUser] = useState<string>(
    'Hello! This is a 100-year-old teahouse alley known only to locals. Let us look at the artisan craft.'
  );
  const [isTranslatingMobile, setIsTranslatingMobile] = useState<boolean>(false);
  const [isGeneratingMobileMemory, setIsGeneratingMobileMemory] = useState<boolean>(false);
  const [latestMobileMemory, setLatestMobileMemory] = useState<TripMemoryRecord | null>(null);

  const explorerVideoRef = useRef<HTMLVideoElement | null>(null);
  const explorerStreamRef = useRef<MediaStream | null>(null);

  const userLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === preferredLanguage) || SUPPORTED_LANGUAGES[0];
  const explorerLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === explorerLocalLang) || SUPPORTED_LANGUAGES[1];

  const discountedRateUsd = Number(
    (selectedChannel.sessionRateUsd * (1 - loyaltyDiscountPct / 100)).toFixed(2)
  );

  // Trigger mobile vibration + chime
  const triggerPhoneVibrateAndChime = (pattern: number[], freq = 580) => {
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
        }, 320);
      }
    } catch {
      // Ignore audio error
    }
  };

  // Start Explorer Hardware Webcam if toggled
  const handleToggleExplorerWebcam = async () => {
    if (explorerUseWebcam) {
      explorerStreamRef.current?.getTracks().forEach((t) => t.stop());
      explorerStreamRef.current = null;
      setExplorerUseWebcam(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: explorerFacing },
        audio: true,
      });
      explorerStreamRef.current = stream;
      if (explorerVideoRef.current) {
        explorerVideoRef.current.srcObject = stream;
      }
      setExplorerUseWebcam(true);
      setExplorerCamOn(true);
    } catch {
      setExplorerUseWebcam(false);
    }
  };

  useEffect(() => {
    return () => {
      explorerStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Step 1: User Phone sends Join Call Request -> Vibrates Explorer Phone!
  const handleUserRingExplorerPhone = () => {
    triggerPhoneVibrateAndChime([300, 120, 300, 120, 450], 560);
    setMobileCallState('ringing');
    setUserMobileTab('call');
    setExplorerMobileTab('alerts');
  };

  // Step 2A: Explorer Phone Accepts Call -> Both phones connect live with camera & translation!
  const handleExplorerPhoneAccept = () => {
    triggerPhoneVibrateAndChime([180, 90, 220], 680);
    setMobileCallState('connected');
    setExplorerCamOn(true);
    setExplorerMobileTab('camera');
    setUserMobileTab('call');
  };

  // Step 2B: Explorer Phone Rejects Call -> User Phone receives instant rejection & refund alert!
  const handleExplorerPhoneReject = () => {
    triggerPhoneVibrateAndChime([450, 150, 450], 280);
    setMobileCallState('rejected');
    setUserMobileTab('call');
  };

  // Step 3A: Explorer speaks in Local Language -> AI translates live onto User Phone Video!
  const handleExplorerTranslateToUserPhone = async () => {
    if (!explorerSpeechText.trim()) return;
    setIsTranslatingMobile(true);
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: explorerSpeechText,
          sourceLanguage: explorerLangObj.name,
          targetLanguage: userLangObj.name,
          contextMode: 'narration',
        }),
      });
      const data = await res.json();
      const translated = data?.translatedText || `[${userLangObj.name}]: ${explorerSpeechText}`;
      setLiveTranslatedSubtitleForUser(translated);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(translated);
        u.lang = preferredLanguage;
        window.speechSynthesis.speak(u);
      }
    } catch {
      setLiveTranslatedSubtitleForUser(`[${userLangObj.name}]: ${explorerSpeechText}`);
    } finally {
      setIsTranslatingMobile(false);
    }
  };

  // Step 3B: User Phone sends instruction -> AI translates into Explorer's Local Language on Explorer Phone!
  const handleUserSendInstructionToExplorerPhone = async () => {
    if (!userInstructionText.trim()) return;
    setIsTranslatingMobile(true);
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userInstructionText,
          sourceLanguage: userLangObj.name,
          targetLanguage: explorerLangObj.name,
          contextMode: 'instruction',
        }),
      });
      const data = await res.json();
      setTranslatedInstructionForExplorer(
        data?.translatedText || `[${explorerLangObj.name}]: ${userInstructionText}`
      );
    } catch {
      setTranslatedInstructionForExplorer(`[${explorerLangObj.name}]: ${userInstructionText}`);
    } finally {
      setIsTranslatingMobile(false);
    }
  };

  // Step 4: End Call -> Automatically Generate Gemini Trip Memory & Save to Traveler Account!
  const handleEndMobileCallAndGenerateMemory = async () => {
    setMobileCallState('ended');
    setIsGeneratingMobileMemory(true);
    setUserMobileTab('memories');

    let memoryTitle = `${selectedChannel.liveEventTag} with ${selectedChannel.explorerName}`;
    let summaryText = `Explored ${selectedChannel.liveEventTag} live via mobile camera with ${selectedChannel.explorerName}. Viewed traditional architecture, local craft stalls, and scenic viewpoints with live ${explorerLangObj.name} to ${userLangObj.name} AI translation.`;
    let placesShown = [
      selectedChannel.liveEventTag,
      `Artisan Alley (${selectedChannel.explorerName})`,
      'Historic Panoramic Viewpoint',
    ];
    let culturalHighlight = `Live narration translated from ${explorerLangObj.name} into ${userLangObj.name}.`;

    try {
      const res = await fetch('/api/ai/trip-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeName: selectedChannel.liveEventTag,
          explorerName: selectedChannel.explorerName,
          mood: selectedChannel.mood,
          liveEventTag: selectedChannel.liveEventTag,
          explorerNarration: liveTranslatedSubtitleForUser || explorerSpeechText,
          instructionsSent: [userInstructionText],
          targetLanguage: userLangObj.name,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.summaryText) {
        memoryTitle = String(data.memoryTitle || memoryTitle).slice(0, 155);
        summaryText = String(data.summaryText).slice(0, 1950);
        if (Array.isArray(data.placesShown) && data.placesShown.length > 0) {
          placesShown = data.placesShown.slice(0, 6).map((p: unknown) => String(p));
        }
        if (data.culturalHighlight) {
          culturalHighlight = String(data.culturalHighlight).slice(0, 480);
        }
      }
    } catch {
      // Fallback already populated
    }

    const record: TripMemoryRecord = {
      id: `mem_mob_${Date.now()}`,
      placeName: selectedChannel.liveEventTag,
      explorerName: selectedChannel.explorerName,
      memoryTitle,
      summaryText,
      placesShown,
      culturalHighlight,
      languageCode: preferredLanguage,
      createdAtLabel: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setLatestMobileMemory(record);
    onSaveTripMemory(record);
    setIsGeneratingMobileMemory(false);
  };

  return (
    <section className="space-y-6">
      {/* Top Control Header for Mobile Application Mode */}
      <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-emerald-500 text-slate-950 text-xs font-mono font-bold uppercase flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              SEPARATE MOBILE APPLICATIONS · USER APP + EXPLORER APP
            </span>
            <span className="text-xs font-mono text-slate-400">
              Live Synced Notifications · Mobile Vibration · Camera &amp; 34-Language AI Video Translation
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-display font-semibold text-white">
            Interactive Mobile App Experience (Separate User &amp; Explorer Mobile Apps)
          </h2>
        </div>

        {/* Switch between User Mobile App Portal and Explorer Mobile App Portal */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => {
              onSwitchPortal('user');
              setMobileViewLayout('user_only');
            }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mobileViewLayout === 'user_only'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            User Mobile Portal (user.explorer.live)
          </button>
          <button
            type="button"
            onClick={() => {
              onSwitchPortal('explorer');
              setMobileViewLayout('explorer_only');
            }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mobileViewLayout === 'explorer_only'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Explorer Mobile Portal (explorer.explorer.live)
          </button>
          <button
            type="button"
            onClick={() => setMobileViewLayout('dual')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mobileViewLayout === 'dual'
                ? 'bg-white text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Compare Both Phones
          </button>
        </div>
      </div>

      {/* =====================================================================
          SIDE-BY-SIDE OR SINGLE MOBILE PHONE VIEWPORTS
         ===================================================================== */}
      <div
        className={`grid gap-8 items-start ${
          mobileViewLayout === 'dual'
            ? 'grid-cols-1 xl:grid-cols-2'
            : 'grid-cols-1 max-w-md mx-auto'
        }`}
      >
        {/* ===================================================================
            PHONE 1: USER (TRAVELER) MOBILE APPLICATION (user.explorer.live)
           =================================================================== */}
        {(mobileViewLayout === 'dual' || mobileViewLayout === 'user_only') && (
          <div className="rounded-[36px] bg-slate-950 border-4 border-emerald-500/60 shadow-2xl overflow-hidden flex flex-col min-h-[720px] justify-between">
            {/* Phone Status Bar & App Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-5 pt-3 pb-3.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="text-emerald-400 font-bold">USER MOBILE APP · 5G</span>
                <span>user.explorer.live</span>
                <span>{travelerLoggedIn ? 'LOGGED IN' : 'GUEST'}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                    <Compass className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-display font-semibold text-white">
                      Explorer — User Mobile App
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Credits: {formatCurrency(creditsBalanceUsd, currencyCode, liveRates)} ·{' '}
                      {loyaltyDiscountPct}% Streak Discount
                    </p>
                  </div>
                </div>

                <select
                  value={preferredLanguage}
                  onChange={(e) => onChangeLanguage(e.target.value)}
                  aria-label="User Mobile Language"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-emerald-400 font-mono"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Phone 1 Body Content */}
            <div className="p-5 flex-1 space-y-4 overflow-y-auto">
              {/* USER TAB 1: SPOTS & JOIN CALL REQUEST */}
              {userMobileTab === 'spots' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-emerald-400 font-mono">
                      <LocateFixed className="w-4 h-4" />
                      <span>
                        {userLiveLocation
                          ? `Present GPS: ${userLiveLocation.lat.toFixed(3)}, ${userLiveLocation.lng.toFixed(3)}`
                          : 'Present Live GPS Ready'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onRequestLiveLocation}
                      className="px-2.5 py-1 bg-emerald-500 text-slate-950 font-semibold rounded-lg text-[11px]"
                    >
                      Lock GPS
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      Select Live Local Explorer Spot (32+ Global Spots)
                    </label>
                    <select
                      value={selectedChannelId}
                      onChange={(e) => {
                        setSelectedChannelId(e.target.value);
                        const ch = EXPLORER_CHANNEL_PRESETS.find((c) => c.id === e.target.value);
                        if (ch) setExplorerLocalLang(ch.spokenLanguageCode);
                      }}
                      className="w-full px-3 py-2.5 text-xs bg-slate-900 border border-slate-700 text-white rounded-xl"
                    >
                      {EXPLORER_CHANNEL_PRESETS.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.liveEventTag} — {ch.explorerName} ({ch.mood})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Spot Preview Card */}
                  <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 space-y-3 pb-4">
                    <div className="relative h-44">
                      <img
                        src={selectedChannel.previewImage}
                        alt={selectedChannel.liveEventTag}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/85 text-[11px] font-mono text-emerald-400">
                        Guide: {selectedChannel.explorerName} · Speaks {explorerLangObj.name}
                      </div>
                    </div>

                    <div className="px-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-display font-semibold text-white">
                          {selectedChannel.liveEventTag}
                        </h4>
                        <span className="font-mono text-sm font-bold text-emerald-400">
                          {formatCurrency(discountedRateUsd, currencyCode, liveRates)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Pre-call payment held in escrow. Tapping below vibrates{' '}
                        {selectedChannel.explorerName}&apos;s Explorer Mobile App immediately.
                      </p>

                      <button
                        type="button"
                        onClick={handleUserRingExplorerPhone}
                        className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                      >
                        <BellRing className="w-4 h-4" />
                        Pay {formatCurrency(discountedRateUsd, currencyCode, liveRates)} &amp; Ring Explorer Mobile
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* USER TAB 2: LIVE VIDEO CALL, USER CAMERA & AI TRANSLATION */}
              {userMobileTab === 'call' && (
                <div className="space-y-4">
                  {mobileCallState === 'ringing' && (
                    <div className="p-5 rounded-2xl bg-emerald-950/40 border-2 border-emerald-500 text-center space-y-3">
                      <BellRing className="w-8 h-8 text-emerald-400 mx-auto animate-bounce" />
                      <h4 className="text-sm font-semibold text-white">
                        Ringing {selectedChannel.explorerName}&apos;s Mobile App...
                      </h4>
                      <p className="text-xs text-slate-300">
                        Check the <strong>Explorer Mobile App</strong> to tap{' '}
                        <strong>Accept &amp; Stream</strong> or <strong>Reject &amp; Notify</strong>!
                      </p>
                    </div>
                  )}

                  {mobileCallState === 'rejected' && (
                    <div className="p-5 rounded-2xl bg-red-950/50 border-2 border-red-500 text-center space-y-2">
                      <XCircle className="w-8 h-8 text-red-400 mx-auto" />
                      <h4 className="text-sm font-semibold text-white">
                        Notification: Explorer Declined Call Request
                      </h4>
                      <p className="text-xs text-slate-300">
                        Your pre-call escrow of{' '}
                        <span className="font-mono text-emerald-400 font-semibold">
                          {formatCurrency(discountedRateUsd, currencyCode, liveRates)}
                        </span>{' '}
                        was automatically refunded to your User Wallet.
                      </p>
                    </div>
                  )}

                  {/* Explorer Live Video Feed with Translated Subtitles on User's Phone */}
                  <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 relative aspect-video">
                    {explorerCamOn ? (
                      <img
                        src={selectedChannel.previewImage}
                        alt={selectedChannel.liveEventTag}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                        Explorer Camera Paused
                      </div>
                    )}

                    {/* User Picture-in-Picture Camera Option */}
                    <div className="absolute top-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-slate-700 text-[10px] font-mono text-white flex items-center gap-1.5">
                      {userCamOn ? (
                        <Camera className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <CameraOff className="w-3 h-3 text-amber-400" />
                      )}
                      <span>My Cam: {userCamOn ? 'ON' : 'OFF'}</span>
                    </div>

                    {/* Live AI Translated Video Subtitle Overlay */}
                    <div className="absolute bottom-2 left-2 right-2 bg-slate-950/90 backdrop-blur-md border border-emerald-500/40 rounded-xl p-2.5 space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
                        <span>
                          LIVE AI TRANSLATION ({explorerLangObj.name} → {userLangObj.name})
                        </span>
                        <Volume2 className="w-3 h-3" />
                      </div>
                      <p className="text-xs font-semibold text-white">
                        &ldquo;{liveTranslatedSubtitleForUser}&rdquo;
                      </p>
                    </div>
                  </div>

                  {/* User Camera & Mic Privacy Controls */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUserCamOn((v) => !v)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        userCamOn
                          ? 'bg-slate-900 border border-slate-700 text-white'
                          : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {userCamOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                      {userCamOn ? 'Turn My Cam OFF' : 'Turn My Cam ON'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserMicOn((v) => !v)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                        userMicOn
                          ? 'bg-slate-900 border border-slate-700 text-white'
                          : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {userMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                      {userMicOn ? 'My Mic: ON' : 'My Mic: Muted'}
                    </button>
                  </div>

                  {/* Send Multilanguage Instruction to Explorer Phone */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <span className="text-[11px] font-mono text-emerald-400 block">
                      Send Instruction in {userLangObj.name} (AI Translates to {explorerLangObj.name})
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={userInstructionText}
                        onChange={(e) => setUserInstructionText(e.target.value)}
                        className="flex-1 px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleUserSendInstructionToExplorerPhone}
                        disabled={isTranslatingMobile}
                        className="px-3 py-2 bg-emerald-500 text-slate-950 text-xs font-semibold rounded-lg flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        Send
                      </button>
                    </div>
                  </div>

                  {/* End Call & Auto-Generate Gemini Trip Memory */}
                  <button
                    type="button"
                    onClick={handleEndMobileCallAndGenerateMemory}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                  >
                    <PhoneOff className="w-4 h-4" />
                    End Call &amp; Auto-Generate Gemini Trip Memory
                  </button>
                </div>
              )}

              {/* USER TAB 3: GEMINI TRIP MEMORIES SAVED IN TRAVELER ACCOUNT */}
              {userMobileTab === 'memories' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-display font-semibold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Traveler Account Trip Memories ({tripMemories.length})
                    </h4>
                    <span className="text-[10px] font-mono text-emerald-400">
                      GEMINI AUTO-SUMMARY
                    </span>
                  </div>

                  {isGeneratingMobileMemory && (
                    <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 font-mono">
                      Gemini is generating a summary of the places {selectedChannel.explorerName} showed...
                    </div>
                  )}

                  {latestMobileMemory && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/30 border-2 border-emerald-500/50 space-y-1.5">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase flex items-center gap-1">
                        <BookmarkCheck className="w-3.5 h-3.5" />
                        JUST SAVED AFTER CALL
                      </span>
                      <p className="text-xs font-semibold text-white">
                        {latestMobileMemory.memoryTitle}
                      </p>
                      <p className="text-xs text-slate-300">{latestMobileMemory.summaryText}</p>
                    </div>
                  )}

                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {tripMemories.map((m) => (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-emerald-400">
                          <span>{m.placeName}</span>
                          <span>{m.createdAtLabel}</span>
                        </div>
                        <p className="text-xs font-semibold text-white">{m.memoryTitle}</p>
                        <p className="text-xs text-slate-300 leading-relaxed">{m.summaryText}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* USER TAB 4: SEPARATE USER MOBILE LOGIN (user.explorer.live) */}
              {userMobileTab === 'login' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <span className="text-[11px] font-mono text-emerald-400 uppercase block">
                      USER LOGIN DOMAIN · user.explorer.live
                    </span>
                    <h4 className="text-base font-display font-semibold text-white">
                      Traveler Mobile Account
                    </h4>
                    <input
                      type="email"
                      value={travelerEmail}
                      onChange={(e) => onChangeTravelerEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl font-mono"
                    />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <select
                        value={currencyCode}
                        onChange={(e) => onChangeCurrency(e.target.value)}
                        className="px-2.5 py-2 bg-slate-950 border border-slate-700 text-emerald-400 rounded-xl font-mono"
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} ({c.symbol.trim()})
                          </option>
                        ))}
                      </select>
                      <div className="px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 font-mono text-[11px]">
                        Streak: {streakScore} pts
                      </div>
                    </div>

                    {travelerLoggedIn ? (
                      <button
                        type="button"
                        onClick={onLogoutTraveler}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Log Out of User Mobile App
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onLoginTraveler}
                        className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Log In to User Mobile App (user.explorer.live)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Phone 1 Bottom Navigation Bar (48px thumb targets) */}
            <div className="bg-slate-900 border-t border-slate-800 grid grid-cols-4 h-14 px-2">
              <button
                type="button"
                onClick={() => setUserMobileTab('spots')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  userMobileTab === 'spots' ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <Compass className="w-4 h-4" />
                <span>Spots &amp; Map</span>
              </button>
              <button
                type="button"
                onClick={() => setUserMobileTab('call')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  userMobileTab === 'call' ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Live Call</span>
              </button>
              <button
                type="button"
                onClick={() => setUserMobileTab('memories')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  userMobileTab === 'memories' ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <Heart className="w-4 h-4" />
                <span>Memories ({tripMemories.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setUserMobileTab('login')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  userMobileTab === 'login' ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>User Login</span>
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            PHONE 2: LOCAL EXPLORER MOBILE APPLICATION (explorer.explorer.live)
           =================================================================== */}
        {(mobileViewLayout === 'dual' || mobileViewLayout === 'explorer_only') && (
          <div className="rounded-[36px] bg-slate-950 border-4 border-amber-500/60 shadow-2xl overflow-hidden flex flex-col min-h-[720px] justify-between">
            {/* Explorer Phone Status Bar & App Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-5 pt-3 pb-3.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="text-amber-400 font-bold">EXPLORER MOBILE APP · 5G</span>
                <span>explorer.explorer.live</span>
                <span>{explorerLoggedIn ? 'GUIDE ONLINE' : 'OFFLINE'}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-display font-semibold text-white">
                      Explorer — Guide Mobile App
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Guide: {selectedChannel.explorerName} · Speaks {explorerLangObj.name}
                    </p>
                  </div>
                </div>

                <select
                  value={explorerLocalLang}
                  onChange={(e) => {
                    setExplorerLocalLang(e.target.value);
                    const found = SUPPORTED_LANGUAGES.find((l) => l.code === e.target.value);
                    if (found) setExplorerSpeechText(found.sampleExplorerSpeech);
                  }}
                  aria-label="Explorer Spoken Language"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-amber-400 font-mono"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Phone 2 Body Content */}
            <div className="p-5 flex-1 space-y-4 overflow-y-auto">
              {/* EXPLORER TAB 1: INCOMING CALL NOTIFICATIONS & VIBRATION ALERTS */}
              {explorerMobileTab === 'alerts' && (
                <div className="space-y-4">
                  <div
                    className={`p-5 rounded-2xl border-2 space-y-3 ${
                      mobileCallState === 'ringing'
                        ? 'bg-emerald-950/50 border-emerald-400 shadow-lg'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 text-[10px] font-mono font-bold uppercase">
                        {mobileCallState === 'ringing'
                          ? 'INCOMING CALL · MOBILE VIBRATING!'
                          : 'CALL NOTIFICATION STANDBY'}
                      </span>
                      <BellRing
                        className={`w-5 h-5 text-amber-400 ${
                          mobileCallState === 'ringing' ? 'animate-bounce' : ''
                        }`}
                      />
                    </div>

                    <h4 className="text-base font-display font-semibold text-white">
                      {selectedChannel.liveEventTag}
                    </h4>
                    <p className="text-xs text-slate-300">
                      Caller: <span className="text-white font-semibold">{travelerEmail}</span> ·
                      Escrow Paid:{' '}
                      <span className="font-mono text-emerald-400 font-semibold">
                        {formatCurrency(discountedRateUsd, currencyCode, liveRates)}
                      </span>
                    </p>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                      <span className="text-[10px] font-mono text-slate-400 block">
                        User Instruction Translated to {explorerLangObj.name}:
                      </span>
                      <p className="font-semibold text-emerald-300">
                        &ldquo;{translatedInstructionForExplorer}&rdquo;
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleExplorerPhoneAccept}
                        className="py-3 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Accept &amp; Stream
                      </button>
                      <button
                        type="button"
                        onClick={handleExplorerPhoneReject}
                        className="py-3 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject &amp; Notify
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleUserRingExplorerPhone}
                    className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    Test Incoming Call Vibration Alert on Explorer Phone
                  </button>
                </div>
              )}

              {/* EXPLORER TAB 2: EXPLORER MOBILE CAMERA & VIDEO STREAM */}
              {explorerMobileTab === 'camera' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setExplorerCamOn((v) => !v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                        explorerCamOn
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {explorerCamOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                      {explorerCamOn ? 'Explorer Cam: ON' : 'Explorer Cam: OFF'}
                    </button>

                    <button
                      type="button"
                      onClick={handleToggleExplorerWebcam}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-amber-300 flex items-center gap-1.5"
                    >
                      <Video className="w-3.5 h-3.5" />
                      {explorerUseWebcam ? 'Using Device Camera' : 'Use Device Webcam'}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExplorerFacing((f) => (f === 'environment' ? 'user' : 'environment'))
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {explorerFacing === 'environment' ? 'Rear Lens' : 'Front Lens'}
                    </button>
                  </div>

                  {/* Explorer Live Camera Viewport */}
                  <div className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 relative aspect-video">
                    {explorerCamOn ? (
                      explorerUseWebcam ? (
                        <video
                          ref={explorerVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={selectedChannel.previewImage}
                          alt={selectedChannel.liveEventTag}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                        Explorer Camera Turned Off
                      </div>
                    )}

                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/85 text-[10px] font-mono text-amber-400">
                      BROADCASTING TO USER · {selectedChannel.liveEventTag}
                    </div>

                    <div className="absolute bottom-2 left-2 right-2 bg-slate-950/90 border border-amber-500/40 rounded-xl p-2.5 space-y-0.5">
                      <span className="text-[10px] font-mono text-amber-400 block">
                        LIVE SUBTITLE SENT TO USER ({userLangObj.name}):
                      </span>
                      <p className="text-xs font-semibold text-white">
                        &ldquo;{liveTranslatedSubtitleForUser}&rdquo;
                      </p>
                    </div>
                  </div>

                  {/* Quick Speak in Local Language inside Camera Tab */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <span className="text-[11px] font-mono text-amber-400 block">
                      Speak in {explorerLangObj.name} → AI Translates Live to {userLangObj.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={explorerSpeechText}
                        onChange={(e) => setExplorerSpeechText(e.target.value)}
                        className="flex-1 px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleExplorerTranslateToUserPhone}
                        disabled={isTranslatingMobile}
                        className="px-3 py-2 bg-amber-500 text-slate-950 text-xs font-semibold rounded-lg flex items-center gap-1 whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Translate Live
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* EXPLORER TAB 3: LIVE VIDEO & VOICE LANGUAGE TRANSLATION */}
              {explorerMobileTab === 'translate' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <span className="text-[11px] font-mono text-amber-400 uppercase block">
                      EXPLORER LOCAL SPEECH → USER LANGUAGE ({explorerLangObj.name} →{' '}
                      {userLangObj.name})
                    </span>
                    <textarea
                      rows={3}
                      value={explorerSpeechText}
                      onChange={(e) => setExplorerSpeechText(e.target.value)}
                      className="w-full p-2.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={handleExplorerTranslateToUserPhone}
                      disabled={isTranslatingMobile}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <Volume2 className="w-4 h-4" />
                      {isTranslatingMobile
                        ? 'Translating Live...'
                        : `Translate to ${userLangObj.name} & Speak on User Phone`}
                    </button>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                      <span className="text-[10px] font-mono text-slate-400 block">
                        User Phone Receives ({userLangObj.name}):
                      </span>
                      <p className="font-semibold text-emerald-400">
                        &ldquo;{liveTranslatedSubtitleForUser}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* EXPLORER TAB 4: SEPARATE EXPLORER MOBILE LOGIN (explorer.explorer.live) */}
              {explorerMobileTab === 'login' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <span className="text-[11px] font-mono text-amber-400 uppercase block">
                      EXPLORER LOGIN DOMAIN · explorer.explorer.live
                    </span>
                    <h4 className="text-base font-display font-semibold text-white">
                      Local Explorer Guide Mobile Account
                    </h4>
                    <input
                      type="email"
                      value={explorerEmail}
                      onChange={(e) => onChangeExplorerEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-xl font-mono"
                    />
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Spoken Guide Language:</span>
                      <span className="font-mono text-amber-400">{explorerLangObj.name}</span>
                    </div>

                    {explorerLoggedIn ? (
                      <button
                        type="button"
                        onClick={onLogoutExplorer}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Log Out of Explorer Mobile App
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onLoginExplorer}
                        className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Log In to Explorer Mobile App (explorer.explorer.live)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Phone 2 Bottom Navigation Bar (48px thumb targets) */}
            <div className="bg-slate-900 border-t border-slate-800 grid grid-cols-4 h-14 px-2">
              <button
                type="button"
                onClick={() => setExplorerMobileTab('alerts')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  explorerMobileTab === 'alerts' ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                <BellRing className="w-4 h-4" />
                <span>Call Alerts</span>
              </button>
              <button
                type="button"
                onClick={() => setExplorerMobileTab('camera')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  explorerMobileTab === 'camera' ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Guide Cam</span>
              </button>
              <button
                type="button"
                onClick={() => setExplorerMobileTab('translate')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  explorerMobileTab === 'translate' ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                <span>AI Translate</span>
              </button>
              <button
                type="button"
                onClick={() => setExplorerMobileTab('login')}
                className={`flex flex-col items-center justify-center text-[10px] font-semibold ${
                  explorerMobileTab === 'login' ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Guide Login</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
