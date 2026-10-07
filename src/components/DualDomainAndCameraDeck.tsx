import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  LogIn,
  LogOut,
  ShieldCheck,
  Radio,
  Aperture,
  Video,
  RefreshCw,
  Download,
  Globe,
  LocateFixed,
} from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  formatCurrency,
  GENERATED_ASSETS,
} from '../data/catalog';

interface DualDomainAndCameraDeckProps {
  domainRole: 'traveler' | 'explorer';
  onSwitchDomainRole: (role: 'traveler' | 'explorer') => void;
  travelerLoggedIn: boolean;
  explorerLoggedIn: boolean;
  travelerEmail: string;
  onChangeTravelerEmail: (val: string) => void;
  explorerEmail: string;
  onChangeExplorerEmail: (val: string) => void;
  onLoginTravelerDomain: (useGoogle: boolean) => void;
  onLogoutTravelerDomain: () => void;
  onLoginExplorerDomain: () => void;
  onLogoutExplorerDomain: () => void;
  preferredLanguage: string;
  onChangeLanguage: (code: string) => void;
  creditsBalanceUsd: number;
  streakScore: number;
  loyaltyDiscountPct: number;
  currencyCode: string;
  liveRates: Record<string, number>;
  userLiveLocation: { lat: number; lng: number } | null;
}

export function DualDomainAndCameraDeck({
  domainRole,
  onSwitchDomainRole,
  travelerLoggedIn,
  explorerLoggedIn,
  travelerEmail,
  onChangeTravelerEmail,
  explorerEmail,
  onChangeExplorerEmail,
  onLoginTravelerDomain,
  onLogoutTravelerDomain,
  onLoginExplorerDomain,
  onLogoutExplorerDomain,
  preferredLanguage,
  onChangeLanguage,
  creditsBalanceUsd,
  streakScore,
  loyaltyDiscountPct,
  currencyCode,
  liveRates,
  userLiveLocation,
}: DualDomainAndCameraDeckProps) {
  // User Camera & Mic State ("camers and microphone option for both user and explorer and user can off cam if he dont want to use it")
  const [userCamEnabled, setUserCamEnabled] = useState<boolean>(false);
  const [userMicEnabled, setUserMicEnabled] = useState<boolean>(true);
  const [userFacingMode, setUserFacingMode] = useState<'user' | 'environment'>('user');
  const [userCamStatus, setUserCamStatus] = useState<string>(
    'User Camera Off (Click "Turn User Cam On" to enable)'
  );

  // Explorer Camera & Mic State
  const [explorerCamEnabled, setExplorerCamEnabled] = useState<boolean>(true);
  const [explorerMicEnabled, setExplorerMicEnabled] = useState<boolean>(true);
  const [explorerFacingMode, setExplorerFacingMode] = useState<'environment' | 'user'>('environment');
  const [explorerHardwareStreamActive, setExplorerHardwareStreamActive] = useState<boolean>(false);

  // Snapshots & Video Cap
  const [capturedSnapshots, setCapturedSnapshots] = useState<string[]>([]);
  const [isRecordingCap, setIsRecordingCap] = useState<boolean>(false);
  const [recordedCapUrl, setRecordedCapUrl] = useState<string | null>(null);

  // Domain Passcodes for separate domain authentication UX
  const [travelerPasscode, setTravelerPasscode] = useState<string>('••••••••');
  const [explorerPasscode, setExplorerPasscode] = useState<string>('••••••••');

  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const userStreamRef = useRef<MediaStream | null>(null);

  const explorerVideoRef = useRef<HTMLVideoElement | null>(null);
  const explorerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const explorerStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Manage User Camera Hardware Stream
  useEffect(() => {
    if (!userCamEnabled) {
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach((t) => t.stop());
        userStreamRef.current = null;
      }
      setUserCamStatus('User Camera is OFF (Privacy Mode Active)');
      return;
    }

    let cancelled = false;
    async function startUserCamera() {
      try {
        setUserCamStatus('Starting User Camera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: userFacingMode },
          audio: userMicEnabled,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        userStreamRef.current = stream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
        setUserCamStatus(
          `User Camera LIVE (${userFacingMode === 'user' ? 'Front Selfie Cam' : 'Rear Cam'})`
        );
      } catch {
        setUserCamStatus('User Camera Active (Virtual Preview Mode)');
      }
    }

    startUserCamera();
    return () => {
      cancelled = true;
      if (userStreamRef.current) {
        userStreamRef.current.getTracks().forEach((t) => t.stop());
        userStreamRef.current = null;
      }
    };
  }, [userCamEnabled, userFacingMode]);

  // Sync User Mic track enable/disable
  useEffect(() => {
    if (userStreamRef.current) {
      userStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = userMicEnabled;
      });
    }
  }, [userMicEnabled]);

  // Toggle Explorer Mobile Camera Hardware or Animated Gimbal Stream
  const handleToggleExplorerHardwareCam = async () => {
    if (explorerHardwareStreamActive) {
      explorerStreamRef.current?.getTracks().forEach((t) => t.stop());
      explorerStreamRef.current = null;
      setExplorerHardwareStreamActive(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: explorerFacingMode },
        audio: explorerMicEnabled,
      });
      explorerStreamRef.current = stream;
      if (explorerVideoRef.current) {
        explorerVideoRef.current.srcObject = stream;
      }
      setExplorerHardwareStreamActive(true);
      setExplorerCamEnabled(true);
    } catch {
      setExplorerHardwareStreamActive(false);
      setExplorerCamEnabled(true);
    }
  };

  // Animated 4K Explorer Gimbal Canvas so Explorer Camera is always visible and recordable
  useEffect(() => {
    const canvas = explorerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = GENERATED_ASSETS.kyotoAlley;

    let animId = 0;
    let tick = 0;

    const draw = () => {
      tick += 0.014;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, w, h);

      if (explorerCamEnabled && img.complete && img.naturalWidth > 0) {
        const panX = Math.sin(tick) * 24;
        const panY = Math.cos(tick * 0.8) * 12;
        ctx.drawImage(img, -30 + panX, -15 + panY, w + 60, h + 30);
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Explorer Camera Paused', w / 2 - 85, h / 2);
      }

      // Overlay HUD
      ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
      ctx.fillRect(12, h - 42, w - 24, 30);
      ctx.fillStyle = '#10B981';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      const gpsText = userLiveLocation
        ? `GPS ${userLiveLocation.lat.toFixed(3)}, ${userLiveLocation.lng.toFixed(3)}`
        : 'LIVE 4K GIMBAL';
      ctx.fillText(
        `EXPLORER CAM (${explorerFacingMode.toUpperCase()}) · ${gpsText} · ${
          explorerMicEnabled ? 'MIC ON' : 'MIC MUTED'
        }`,
        20,
        h - 23
      );

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [explorerCamEnabled, explorerFacingMode, explorerMicEnabled, userLiveLocation]);

  const handleCaptureSnapshot = () => {
    const canvas = explorerCanvasRef.current;
    if (!canvas) return;
    setCapturedSnapshots((prev) => [canvas.toDataURL('image/png'), ...prev.slice(0, 3)]);
  };

  const handleRecordVideoClip = () => {
    const canvas = explorerCanvasRef.current;
    if (!canvas) return;

    if (isRecordingCap && recorderRef.current) {
      recorderRef.current.stop();
      setIsRecordingCap(false);
      return;
    }

    try {
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedCapUrl(URL.createObjectURL(blob));
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecordingCap(true);
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setIsRecordingCap(false);
        }
      }, 5000);
    } catch {
      setIsRecordingCap(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* PART 1: SEPARATE LOGIN DOMAINS FOR USER (user.explorer.live) & EXPLORER (explorer.explorer.live) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Domain 1: USER / TRAVELER LOGIN DOMAIN (`user.explorer.live`) */}
        <div
          className={`rounded-2xl border p-5 transition-colors flex flex-col justify-between space-y-4 ${
            domainRole === 'traveler'
              ? 'bg-slate-900 border-emerald-500/80 shadow-lg'
              : 'bg-slate-900/70 border-slate-800'
          }`}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-semibold text-emerald-400">
                  USER LOGIN DOMAIN · https://user.explorer.live
                </span>
              </div>
              <span
                className={`text-xs font-mono font-semibold ${
                  travelerLoggedIn ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {travelerLoggedIn ? '● USER LOGGED IN' : '○ USER LOGGED OUT'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-display font-semibold text-white">
                  User / Traveler Portal Login
                </h2>
                <p className="text-xs text-slate-400">
                  Separate domain for travelers to unlock Login Credits ({formatCurrency(creditsBalanceUsd, currencyCode, liveRates)}), {loyaltyDiscountPct}% Streak Discount ({streakScore} pts), and Live Map calls.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  User Domain ID / Email
                </label>
                <input
                  type="email"
                  value={travelerEmail}
                  onChange={(e) => onChangeTravelerEmail(e.target.value)}
                  placeholder="traveler@user.explorer.live"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  User Domain Access Key
                </label>
                <input
                  type="password"
                  value={travelerPasscode}
                  onChange={(e) => setTravelerPasscode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {!travelerLoggedIn ? (
                <>
                  <button
                    type="button"
                    onClick={() => onLoginTravelerDomain(false)}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Log In to user.explorer.live
                  </button>
                  <button
                    type="button"
                    onClick={() => onLoginTravelerDomain(true)}
                    className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                    Google Sign-In
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onLogoutTravelerDomain}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log Out of user.explorer.live
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSwitchDomainRole('traveler')}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap ${
                domainRole === 'traveler'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {domainRole === 'traveler' ? 'Active View: User Domain' : 'Enter User Domain View'}
            </button>
          </div>
        </div>

        {/* Domain 2: LOCAL EXPLORER LOGIN DOMAIN (`explorer.explorer.live`) */}
        <div
          className={`rounded-2xl border p-5 transition-colors flex flex-col justify-between space-y-4 ${
            domainRole === 'explorer'
              ? 'bg-slate-900 border-emerald-500/80 shadow-lg'
              : 'bg-slate-900/70 border-slate-800'
          }`}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-semibold text-emerald-400">
                  EXPLORER LOGIN DOMAIN · https://explorer.explorer.live
                </span>
              </div>
              <span
                className={`text-xs font-mono font-semibold ${
                  explorerLoggedIn ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {explorerLoggedIn ? '● EXPLORER LOGGED IN' : '○ EXPLORER LOGGED OUT'}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-display font-semibold text-white">
                Local Explorer Guide Domain Login
              </h2>
              <p className="text-xs text-slate-400">
                Separate domain for local explorers to select their native language (34 languages), receive vibrating Join Request alerts, and stream mobile camera video.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Explorer Domain Handle
                </label>
                <input
                  type="email"
                  value={explorerEmail}
                  onChange={(e) => onChangeExplorerEmail(e.target.value)}
                  placeholder="guide@explorer.explorer.live"
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Explorer Spoken Language (34)
                </label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => onChangeLanguage(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Explorer Domain Key
                </label>
                <input
                  type="password"
                  value={explorerPasscode}
                  onChange={(e) => setExplorerPasscode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {!explorerLoggedIn ? (
                <button
                  type="button"
                  onClick={onLoginExplorerDomain}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Log In to explorer.explorer.live
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLogoutExplorerDomain}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log Out of explorer.explorer.live
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSwitchDomainRole('explorer')}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap ${
                domainRole === 'explorer'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {domainRole === 'explorer'
                ? 'Active View: Explorer Domain'
                : 'Enter Explorer Domain View'}
            </button>
          </div>
        </div>
      </div>

      {/* PART 2: LIVE CAMERA & MICROPHONE OPTION STUDIO FOR BOTH USER & EXPLORER */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-display font-semibold text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-400" />
              Dual Camera & Microphone Control Studio (User &amp; Explorer Camera Options)
            </h3>
            <p className="text-xs text-slate-400">
              Independent camera and microphone toggles for both User and Explorer. The User can turn their camera OFF anytime for privacy while viewing the Explorer&apos;s live mobile camera feed.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <Globe className="w-3.5 h-3.5" />
            <span>
              AI Interpreter Language:{' '}
              {SUPPORTED_LANGUAGES.find((l) => l.code === preferredLanguage)?.name || 'English'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: USER CAMERA & MICROPHONE OPTION (User can turn cam OFF if they don't want to use it) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-mono text-emerald-400">
                  01 · USER CAMERA &amp; MIC (user.explorer.live)
                </span>
                <h4 className="text-sm font-semibold text-white">
                  {userCamStatus}
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setUserCamEnabled((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    userCamEnabled
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  }`}
                >
                  {userCamEnabled ? (
                    <>
                      <CameraOff className="w-3.5 h-3.5" />
                      Turn User Cam OFF
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      Turn User Cam ON
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setUserMicEnabled((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 whitespace-nowrap ${
                    userMicEnabled
                      ? 'bg-slate-900 border-slate-700 text-emerald-400'
                      : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {userMicEnabled ? (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      User Mic: ON
                    </>
                  ) : (
                    <>
                      <MicOff className="w-3.5 h-3.5" />
                      User Mic: MUTED
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setUserFacingMode((m) => (m === 'user' ? 'environment' : 'user'))
                  }
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-200 rounded-lg flex items-center gap-1 whitespace-nowrap"
                  title="Switch Front/Rear Camera"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  {userFacingMode === 'user' ? 'Front Cam' : 'Rear Cam'}
                </button>
              </div>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 aspect-video flex items-center justify-center">
              {userCamEnabled ? (
                <video
                  ref={userVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-6 space-y-2">
                  <CameraOff className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-white">
                    User Camera is Turned Off
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm">
                    You can explore any place with your camera off and still speak or type instructions to the Explorer, or click &ldquo;Turn User Cam ON&rdquo; above.
                  </p>
                </div>
              )}
              <div className="absolute bottom-2.5 left-2.5 bg-slate-950/85 border border-slate-800 px-2.5 py-1 rounded text-[11px] font-mono text-slate-200">
                User Feed · {userCamEnabled ? 'Cam ON' : 'Cam OFF'} ·{' '}
                {userMicEnabled ? 'Mic ON' : 'Mic Muted'}
              </div>
            </div>
          </div>

          {/* RIGHT: EXPLORER MOBILE CAMERA & MICROPHONE OPTION (explorer.explorer.live) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-mono text-emerald-400">
                  02 · EXPLORER MOBILE CAMERA &amp; MIC (explorer.explorer.live)
                </span>
                <h4 className="text-sm font-semibold text-white">
                  {explorerCamEnabled
                    ? `Explorer Mobile Camera LIVE (${
                        explorerFacingMode === 'environment' ? 'Rear 4K Street Lens' : 'Front Guide Lens'
                      })`
                    : 'Explorer Mobile Camera Paused'}
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setExplorerCamEnabled((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    explorerCamEnabled
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-900 border border-slate-700 text-slate-200'
                  }`}
                >
                  {explorerCamEnabled ? (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      Explorer Cam: ON
                    </>
                  ) : (
                    <>
                      <CameraOff className="w-3.5 h-3.5" />
                      Explorer Cam: OFF
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleToggleExplorerHardwareCam}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-700 hover:border-emerald-500/60 text-slate-200 rounded-lg flex items-center gap-1 whitespace-nowrap"
                >
                  <Video className="w-3.5 h-3.5 text-emerald-400" />
                  {explorerHardwareStreamActive ? 'Use Gimbal Feed' : 'Use Device Cam'}
                </button>

                <button
                  type="button"
                  onClick={() => setExplorerMicEnabled((v) => !v)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1 whitespace-nowrap ${
                    explorerMicEnabled
                      ? 'bg-slate-900 border-slate-700 text-emerald-400'
                      : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {explorerMicEnabled ? (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      Mic ON
                    </>
                  ) : (
                    <>
                      <MicOff className="w-3.5 h-3.5" />
                      Muted
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setExplorerFacingMode((m) =>
                      m === 'environment' ? 'user' : 'environment'
                    )
                  }
                  className="px-2.5 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-700 text-slate-200 rounded-lg flex items-center gap-1 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                  Flip Lens
                </button>
              </div>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 aspect-video">
              {explorerHardwareStreamActive ? (
                <video
                  ref={explorerVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <canvas
                  ref={explorerCanvasRef}
                  width={640}
                  height={360}
                  className="w-full h-full object-cover"
                />
              )}

              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  className="px-2.5 py-1 bg-slate-950/85 hover:bg-slate-900 border border-slate-700 text-white text-[11px] font-semibold rounded-lg flex items-center gap-1 whitespace-nowrap"
                >
                  <Aperture className="w-3.5 h-3.5 text-emerald-400" />
                  Snapshot ({capturedSnapshots.length})
                </button>

                <button
                  type="button"
                  onClick={handleRecordVideoClip}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg flex items-center gap-1 whitespace-nowrap ${
                    isRecordingCap
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-950/85 hover:bg-slate-900 border border-slate-700 text-white'
                  }`}
                >
                  <Video className="w-3.5 h-3.5 text-emerald-400" />
                  {isRecordingCap ? 'Recording...' : 'Record Video Cap'}
                </button>
              </div>
            </div>

            {(capturedSnapshots.length > 0 || recordedCapUrl) && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  {capturedSnapshots.map((snap, i) => (
                    <a
                      key={i}
                      href={snap}
                      download={`place-snapshot-${i + 1}.png`}
                      className="block w-14 h-9 rounded overflow-hidden border border-slate-700"
                      title="Download Place Snapshot"
                    >
                      <img src={snap} alt="Snapshot" className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
                {recordedCapUrl && (
                  <a
                    href={recordedCapUrl}
                    download="explorer-trip-cap.webm"
                    className="text-xs font-mono text-emerald-400 underline flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Recorded Video Cap (.webm)
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
