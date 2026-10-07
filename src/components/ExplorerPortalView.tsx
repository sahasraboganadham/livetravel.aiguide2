import React, { useState, useEffect, useRef } from 'react';
import {
  BellRing,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  CheckCircle2,
  XCircle,
  Volume2,
  Compass,
  Radio,
  LogIn,
  LogOut,
  LocateFixed,
  Video,
  Aperture,
  RefreshCw,
  Download,
  Globe,
  Sparkles,
  Send,
  PhoneIncoming,
  ShieldCheck,
} from 'lucide-react';
import {
  SUPPORTED_LANGUAGES,
  EXPLORER_CHANNEL_PRESETS,
  ExplorerChannelPreset,
  formatCurrency,
} from '../data/catalog';

export interface ActiveCallNotificationItem {
  id: string;
  travelerName: string;
  explorerName: string;
  placeName: string;
  paymentAmountUsd: number;
  paymentStatus: string;
  status: 'ringing' | 'accepted' | 'rejected' | 'completed';
  lastInstruction: string;
  translatedInstruction: string;
}

interface BilingualTranscriptEntry {
  id: string;
  timestamp: string;
  speaker: 'Explorer (Local)' | 'User (Instruction)';
  sourceLangName: string;
  targetLangName: string;
  originalText: string;
  translatedText: string;
  pronunciationGuide?: string;
  culturalNote?: string;
}

interface ExplorerPortalViewProps {
  isLoggedInExplorer: boolean;
  explorerDisplayName: string;
  explorerEmail?: string;
  onLoginExplorerPortal: () => void;
  onLogoutExplorerPortal: () => void;
  userLiveLocation: { lat: number; lng: number } | null;
  explorerLanguage: string;
  onChangeExplorerLanguage: (code: string) => void;
  currencyCode: string;
  liveRates: Record<string, number>;
  callQueue: ActiveCallNotificationItem[];
  onAcceptCallRequest: (callId: string) => void;
  onRejectCallRequest: (callId: string) => void;
  onSimulateIncomingCall?: () => void;
}

export function ExplorerPortalView({
  isLoggedInExplorer,
  explorerDisplayName,
  explorerEmail = 'kenji.sato@explorer.explorer.live',
  onLoginExplorerPortal,
  onLogoutExplorerPortal,
  userLiveLocation,
  explorerLanguage,
  onChangeExplorerLanguage,
  currencyCode,
  liveRates,
  callQueue,
  onAcceptCallRequest,
  onRejectCallRequest,
  onSimulateIncomingCall,
}: ExplorerPortalViewProps) {
  // Camera & Video Stream States
  const [camActive, setCamActive] = useState<boolean>(true);
  const [cameraSourceMode, setCameraSourceMode] = useState<'webcam' | 'gimbal'>('gimbal');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [micActive, setMicActive] = useState<boolean>(true);
  const [selectedGimbalChannelId, setSelectedGimbalChannelId] = useState<string>(
    EXPLORER_CHANNEL_PRESETS[0]?.id || 'ch_01'
  );
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);

  // Snapshot & Video Cap Recording States
  const [capturedSnapshotUrl, setCapturedSnapshotUrl] = useState<string | null>(null);
  const [isRecordingClip, setIsRecordingClip] = useState<boolean>(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  // Live Video & Audio Language Translation States
  const [userTargetLang, setUserTargetLang] = useState<string>('en');
  const [localSpeechInput, setLocalSpeechInput] = useState<string>(
    SUPPORTED_LANGUAGES.find((l) => l.code === explorerLanguage)?.sampleExplorerSpeech ||
      'こんにちは！今、京都・祇園の石畳の路地をライブカメラで案内しています。'
  );
  const [incomingUserInstruction, setIncomingUserInstruction] = useState<string>(
    'Please pan the camera slowly toward the historic wooden tea house and ask about today’s matcha specials.'
  );
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isListeningVoice, setIsListeningVoice] = useState<boolean>(false);
  const [autoSpeakTranslation, setAutoSpeakTranslation] = useState<boolean>(true);

  // Live Subtitle Overlay displayed directly on the Explorer's Video Stream
  const [liveVideoSubtitle, setLiveVideoSubtitle] = useState<{
    original: string;
    translated: string;
    sourceLang: string;
    targetLang: string;
    pronunciation: string;
  }>({
    original: 'こんにちは！今、京都・祇園の石畳の路地をライブカメラで案内しています。',
    translated:
      'Hello! I am currently guiding you via live mobile camera through the cobblestone alleys of Gion, Kyoto.',
    sourceLang: 'Japanese',
    targetLang: 'English',
    pronunciation: 'Konnichiwa! Ima, Kyoto Gion no ishidatami no roji wo annai shite imasu.',
  });

  const [transcriptLog, setTranscriptLog] = useState<BilingualTranscriptEntry[]>([
    {
      id: 'tr_init_1',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      speaker: 'Explorer (Local)',
      sourceLangName: 'Japanese',
      targetLangName: 'English',
      originalText: 'こんにちは！今、京都・祇園の石畳の路地をライブカメラで案内しています。',
      translatedText:
        'Hello! I am currently guiding you via live mobile camera through the cobblestone alleys of Gion, Kyoto.',
      pronunciationGuide:
        'Konnichiwa! Ima, Kyoto Gion no ishidatami no roji wo annai shite imasu.',
      culturalNote: 'Gion tea alleys are quiet heritage zones; speaking softly is appreciated.',
    },
    {
      id: 'tr_init_2',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      speaker: 'User (Instruction)',
      sourceLangName: 'English',
      targetLangName: 'Japanese',
      originalText:
        'Can you show the lantern workshop entrance and ask if they ship internationally?',
      translatedText:
        '提灯工房の入り口をカメラで見せて、海外発送が可能か尋ねていただけますか？',
      pronunciationGuide:
        'Chōchin kōbō no iriguchi wo misete, kaigai hassō ga kanō ka tazunete itadakemasu ka?',
      culturalNote: 'Many Kyoto artisans accept international custom orders on request.',
    },
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const selectedGimbalChannel: ExplorerChannelPreset =
    EXPLORER_CHANNEL_PRESETS.find((c) => c.id === selectedGimbalChannelId) ||
    EXPLORER_CHANNEL_PRESETS[0];

  const explorerLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === explorerLanguage) || SUPPORTED_LANGUAGES[0];
  const userTargetLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === userTargetLang) || SUPPORTED_LANGUAGES[0];

  // Start or stop hardware webcam when cameraSourceMode === 'webcam'
  const startWebcamStream = async (desiredFacing: 'user' | 'environment') => {
    setCameraNotice(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: desiredFacing },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamActive(true);
      setCameraSourceMode('webcam');
      setCameraNotice(
        `Live Explorer Hardware Camera Active (${
          desiredFacing === 'environment' ? 'Rear Street Lens' : 'Front Guide Lens'
        })`
      );
    } catch {
      setCameraSourceMode('gimbal');
      setCamActive(true);
      setCameraNotice(
        'Browser webcam permission unavailable — streaming 4K Live Street Gimbal camera feed.'
      );
    }
  };

  const handleToggleCameraPower = () => {
    if (camActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCamActive(false);
      setCameraNotice('Explorer Camera turned OFF.');
    } else {
      setCamActive(true);
      if (cameraSourceMode === 'webcam') {
        startWebcamStream(facingMode);
      } else {
        setCameraNotice('Explorer 4K Gimbal Camera Active.');
      }
    }
  };

  const handleFlipCameraLens = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    if (camActive && cameraSourceMode === 'webcam') {
      startWebcamStream(nextFacing);
    }
  };

  const handleToggleMic = () => {
    const next = !micActive;
    setMicActive(next);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = next;
      });
    }
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Capture HD Snapshot of the Explorer's current camera view
  const handleCaptureSnapshot = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (cameraSourceMode === 'webcam' && videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Stamp live translated subtitle onto the snapshot
    ctx.fillStyle = 'rgba(9, 13, 22, 0.82)';
    ctx.fillRect(0, canvas.height - 84, canvas.width, 84);
    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `EXPLORER LIVE SNAPSHOT · ${selectedGimbalChannel.liveEventTag} (${selectedGimbalChannel.explorerName})`,
      16,
      canvas.height - 56
    );
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '13px sans-serif';
    ctx.fillText(liveVideoSubtitle.translated.slice(0, 78), 16, canvas.height - 32);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px monospace';
    ctx.fillText(
      `Original (${liveVideoSubtitle.sourceLang}): ${liveVideoSubtitle.original.slice(0, 65)}`,
      16,
      canvas.height - 12
    );

    setCapturedSnapshotUrl(canvas.toDataURL('image/png'));
  };

  // Record a 5-second Video Cap with Live Translated Subtitles
  const handleRecordVideoCap = () => {
    if (isRecordingClip) return;
    setIsRecordingClip(true);
    setRecordedVideoUrl(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      const canvasStream = canvas.captureStream(24);
      const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        setRecordedVideoUrl(URL.createObjectURL(blob));
        setIsRecordingClip(false);
      };

      recorder.start();
      let frame = 0;
      const interval = setInterval(() => {
        frame++;
        if (ctx) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 16px monospace';
          ctx.fillText(
            `LIVE EXPLORER VIDEO CAP · ${selectedGimbalChannel.explorerName}`,
            24,
            44
          );
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 18px sans-serif';
          ctx.fillText(selectedGimbalChannel.liveEventTag, 24, 80);
          ctx.fillStyle = '#34d399';
          ctx.font = '14px sans-serif';
          ctx.fillText(
            `[${liveVideoSubtitle.targetLang} AI Translation]: "${liveVideoSubtitle.translated.slice(
              0,
              64
            )}"`,
            24,
            290
          );
          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px monospace';
          ctx.fillText(
            `[${liveVideoSubtitle.sourceLang} Original]: "${liveVideoSubtitle.original.slice(
              0,
              64
            )}" · Frame ${frame}`,
            24,
            320
          );
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
        if (recorder.state !== 'inactive') recorder.stop();
      }, 4500);
    } catch {
      setIsRecordingClip(false);
    }
  };

  // Speak text aloud using browser SpeechSynthesis
  const speakTranslatedAudio = (text: string, langCode: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore TTS error
    }
  };

  // Voice Dictation in Explorer's Local Language
  const handleStartVoiceDictation = () => {
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: any }).webkitSpeechRecognition;

    if (!SpeechRec) {
      const sample =
        explorerLangObj.sampleExplorerSpeech ||
        'Welcome! Look at the traditional craftsmanship right in front of my camera.';
      setLocalSpeechInput(sample);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = explorerLanguage;
      recognition.interimResults = false;
      setIsListeningVoice(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setLocalSpeechInput(transcript);
        }
        setIsListeningVoice(false);
      };
      recognition.onerror = () => setIsListeningVoice(false);
      recognition.onend = () => setIsListeningVoice(false);
      recognition.start();
    } catch {
      setIsListeningVoice(false);
    }
  };

  // Translate Explorer's Local Speech -> User's Preferred Language & Overlay on Live Video
  const handleTranslateExplorerSpeechToUser = async () => {
    if (!localSpeechInput.trim()) return;
    setIsTranslating(true);
    const sourceLangName = explorerLangObj.name;
    const targetLangName = userTargetLangObj.name;

    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: localSpeechInput,
          sourceLanguage: sourceLangName,
          targetLanguage: targetLangName,
          contextMode: 'narration',
        }),
      });
      const data = await res.json();
      const translatedText =
        data?.translatedText ||
        `[${targetLangName} Live Interpretation]: ${localSpeechInput}`;
      const pronunciationGuide =
        data?.pronunciationGuide || explorerLangObj.sampleExplorerSpeech;
      const culturalNote =
        data?.culturalNote ||
        `Live narration translated from ${sourceLangName} into ${targetLangName}.`;

      setLiveVideoSubtitle({
        original: localSpeechInput,
        translated: translatedText,
        sourceLang: sourceLangName,
        targetLang: targetLangName,
        pronunciation: pronunciationGuide,
      });

      setTranscriptLog((prev) => [
        {
          id: `tr_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          speaker: 'Explorer (Local)',
          sourceLangName,
          targetLangName,
          originalText: localSpeechInput,
          translatedText,
          pronunciationGuide,
          culturalNote,
        },
        ...prev,
      ]);

      if (autoSpeakTranslation) {
        speakTranslatedAudio(translatedText, userTargetLang);
      }
    } catch {
      const fallbackText = `[${targetLangName} Live Subtitles]: ${localSpeechInput}`;
      setLiveVideoSubtitle({
        original: localSpeechInput,
        translated: fallbackText,
        sourceLang: sourceLangName,
        targetLang: targetLangName,
        pronunciation: explorerLangObj.sampleExplorerSpeech,
      });
    } finally {
      setIsTranslating(false);
    }
  };

  // Translate Incoming User Instruction -> Explorer's Local Language
  const handleTranslateUserInstructionToExplorer = async () => {
    if (!incomingUserInstruction.trim()) return;
    setIsTranslating(true);
    const sourceLangName = userTargetLangObj.name;
    const targetLangName = explorerLangObj.name;

    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: incomingUserInstruction,
          sourceLanguage: sourceLangName,
          targetLanguage: targetLangName,
          contextMode: 'instruction',
        }),
      });
      const data = await res.json();
      const translatedText =
        data?.translatedText ||
        `[${targetLangName}]: ${incomingUserInstruction}`;
      const pronunciationGuide =
        data?.pronunciationGuide || explorerLangObj.sampleExplorerSpeech;
      const culturalNote =
        data?.culturalNote ||
        `User camera instruction translated into ${targetLangName}.`;

      setLiveVideoSubtitle({
        original: incomingUserInstruction,
        translated: translatedText,
        sourceLang: sourceLangName,
        targetLang: targetLangName,
        pronunciation: pronunciationGuide,
      });

      setTranscriptLog((prev) => [
        {
          id: `tr_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          speaker: 'User (Instruction)',
          sourceLangName,
          targetLangName,
          originalText: incomingUserInstruction,
          translatedText,
          pronunciationGuide,
          culturalNote,
        },
        ...prev,
      ]);

      if (autoSpeakTranslation) {
        speakTranslatedAudio(translatedText, explorerLanguage);
      }
    } finally {
      setIsTranslating(false);
    }
  };

  const ringingCalls = callQueue.filter((c) => c.status === 'ringing');

  return (
    <div className="space-y-8">
      {/* =====================================================================
          DEDICATED LOCAL EXPLORER PORTAL HEADER (explorer.explorer.live)
         ===================================================================== */}
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border-2 border-amber-500/40 text-white rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                EXPLORER PORTAL · explorer.explorer.live
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
                  isLoggedInExplorer
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                    : 'bg-red-500/20 border border-red-500/40 text-red-300'
                }`}
              >
                {isLoggedInExplorer ? 'EXPLORER LOGGED IN' : 'EXPLORER LOGGED OUT'}
              </span>
              {ringingCalls.length > 0 && (
                <span className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-mono font-bold animate-pulse flex items-center gap-1.5">
                  <BellRing className="w-3.5 h-3.5" />
                  {ringingCalls.length} INCOMING CALL ALERT{ringingCalls.length > 1 ? 'S' : ''}
                </span>
              )}
            </div>

            <h2 className="text-2xl md:text-3xl font-display font-semibold">
              {isLoggedInExplorer
                ? `${explorerDisplayName} — Live Camera, Notifications & AI Translation Console`
                : 'Local Explorer Portal (explorer.explorer.live)'}
            </h2>

            <p className="text-xs md:text-sm text-slate-300 max-w-3xl">
              Account: <span className="font-mono text-amber-300">{explorerEmail}</span> ·{' '}
              {userLiveLocation
                ? `Present Live GPS: (${userLiveLocation.lat.toFixed(4)}, ${userLiveLocation.lng.toFixed(4)})`
                : 'GPS Standby'}{' '}
              · Receive mobile vibration call notifications, stream your mobile camera, and speak in your native language with live AI video translation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onSimulateIncomingCall && (
              <button
                onClick={onSimulateIncomingCall}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-lg whitespace-nowrap"
              >
                <PhoneIncoming className="w-4 h-4" />
                Simulate Incoming User Call (Vibrate + Ring)
              </button>
            )}

            {isLoggedInExplorer ? (
              <button
                onClick={onLogoutExplorerPortal}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                Log Out Explorer
              </button>
            ) : (
              <button
                onClick={onLoginExplorerPortal}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" />
                Log In Explorer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          01. EXPLORER INCOMING CALL NOTIFICATIONS & MOBILE VIBRATION QUEUE
         ===================================================================== */}
      <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <BellRing className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 block">
                01 · EXPLORER MOBILE VIBRATION & CALL NOTIFICATION ALERT CENTER
              </span>
              <h3 className="text-lg font-display font-semibold text-white">
                Incoming User Join Requests ({callQueue.length} Total · {ringingCalls.length} Ringing Now)
              </h3>
            </div>
          </div>

          {onSimulateIncomingCall && (
            <button
              onClick={onSimulateIncomingCall}
              className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5" />
              Trigger New Call Notification Alert
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {callQueue.map((call) => (
            <div
              key={call.id}
              className={`p-4 rounded-xl border-2 space-y-3 transition-all ${
                call.status === 'ringing'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-lg'
                  : call.status === 'accepted'
                  ? 'bg-slate-950 border-emerald-500/40'
                  : call.status === 'rejected'
                  ? 'bg-red-950/30 border-red-500/40'
                  : 'bg-slate-950 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                    call.status === 'ringing'
                      ? 'bg-emerald-500 text-slate-950 animate-pulse'
                      : call.status === 'accepted'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {call.status === 'ringing'
                    ? 'RINGING + VIBRATING MOBILE'
                    : call.status === 'accepted'
                    ? 'CONNECTED LIVE'
                    : call.status === 'rejected'
                    ? 'REJECTED (USER NOTIFIED)'
                    : call.status}
                </span>
                <span className="font-mono text-xs font-semibold text-amber-400">
                  Escrow: {formatCurrency(call.paymentAmountUsd, currencyCode, liveRates)} (
                  {call.paymentStatus})
                </span>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-white">{call.placeName}</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Caller (User): <span className="text-white font-medium">{call.travelerName}</span>
                </p>
              </div>

              {call.translatedInstruction && (
                <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs space-y-1">
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">
                    User Instruction (Translated for Explorer):
                  </span>
                  <span className="font-semibold text-emerald-300 block">
                    &ldquo;{call.translatedInstruction}&rdquo;
                  </span>
                </div>
              )}

              {call.status === 'ringing' ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => {
                      setCamActive(true);
                      onAcceptCallRequest(call.id);
                    }}
                    className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Accept & Stream
                  </button>
                  <button
                    onClick={() => onRejectCallRequest(call.id)}
                    className="py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject & Notify
                  </button>
                </div>
              ) : (
                <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1">
                  <span>
                    {call.status === 'accepted'
                      ? 'Streaming live camera & audio to User'
                      : 'User notified & escrow refunded'}
                  </span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* =====================================================================
          02 & 03. EXPLORER LIVE CAMERA/VIDEO STREAM + LIVE LANGUAGE TRANSLATION
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: EXPLORER LIVE MOBILE CAMERA & VIDEO BROADCASTER WITH SUBTITLES */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 block">
                02 · EXPLORER MOBILE CAMERA & LIVE VIDEO STREAM
              </span>
              <h3 className="text-lg font-display font-semibold text-white">
                Show Local Places via Camera with Live Translated Video Subtitles
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleToggleCameraPower}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors ${
                  camActive
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-red-600/20 border border-red-500/40 text-red-300'
                }`}
              >
                {camActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                {camActive ? 'Camera ON (Streaming)' : 'Camera OFF'}
              </button>

              <button
                onClick={handleToggleMic}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors ${
                  micActive
                    ? 'bg-slate-800 border border-emerald-500/40 text-emerald-400'
                    : 'bg-red-600/20 border border-red-500/40 text-red-300'
                }`}
              >
                {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                {micActive ? 'Mic ON' : 'Mic Muted'}
              </button>
            </div>
          </div>

          {/* Camera Feed Mode & Spot Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => startWebcamStream(facingMode)}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 ${
                  cameraSourceMode === 'webcam'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 border border-slate-700'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Use Device Mobile Camera
              </button>

              <button
                onClick={() => {
                  setCameraSourceMode('gimbal');
                  setCamActive(true);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 ${
                  cameraSourceMode === 'gimbal'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 border border-slate-700'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                4K Live Street Gimbal Feed
              </button>

              <button
                onClick={handleFlipCameraLens}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Lens: {facingMode === 'environment' ? 'Rear (Street)' : 'Front (Guide)'}
              </button>
            </div>

            <select
              value={selectedGimbalChannelId}
              onChange={(e) => setSelectedGimbalChannelId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs"
            >
              {EXPLORER_CHANNEL_PRESETS.slice(0, 12).map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Spot: {ch.liveEventTag} ({ch.explorerName})
                </option>
              ))}
            </select>
          </div>

          {/* LIVE VIDEO VIEWPORT WITH REAL-TIME AI TRANSLATED SUBTITLES OVERLAY */}
          <div className="rounded-2xl overflow-hidden bg-slate-950 aspect-video relative flex items-center justify-center border-2 border-slate-800 shadow-2xl">
            {camActive ? (
              cameraSourceMode === 'webcam' ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="relative w-full h-full">
                  <img
                    src={selectedGimbalChannel.previewImage}
                    alt={selectedGimbalChannel.liveEventTag}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )
            ) : (
              <div className="text-center space-y-2 p-6 text-slate-400">
                <CameraOff className="w-10 h-10 mx-auto text-red-400" />
                <p className="text-sm font-semibold text-white">
                  Explorer Camera Paused
                </p>
                <p className="text-xs max-w-md">
                  Click &ldquo;Camera ON (Streaming)&rdquo; above to resume live video broadcast to the User.
                </p>
              </div>
            )}

            {/* Top-Left Live Broadcast Telemetry */}
            <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 border border-slate-700 text-[11px] font-mono text-amber-400 font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                LIVE · {selectedGimbalChannel.liveEventTag} ({selectedGimbalChannel.explorerName})
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950/85 border border-slate-700 text-[11px] font-mono text-emerald-400">
                {explorerLangObj.name} → {userTargetLangObj.name} AI Subtitles ON
              </span>
            </div>

            {/* Bottom Live AI Video Language Translation Overlay */}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 backdrop-blur-md border border-emerald-500/40 rounded-xl p-3 space-y-1 shadow-lg">
              <div className="flex items-center justify-between text-[10px] font-mono text-emerald-400">
                <span>
                  LIVE AI VIDEO SUBTITLE ({liveVideoSubtitle.sourceLang} →{' '}
                  {liveVideoSubtitle.targetLang})
                </span>
                <button
                  onClick={() =>
                    speakTranslatedAudio(liveVideoSubtitle.translated, userTargetLang)
                  }
                  className="underline hover:text-white flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3" />
                  Speak Audio
                </button>
              </div>
              <p className="text-xs md:text-sm font-semibold text-white leading-snug">
                &ldquo;{liveVideoSubtitle.translated}&rdquo;
              </p>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                Original ({liveVideoSubtitle.sourceLang}): {liveVideoSubtitle.original}
              </p>
            </div>
          </div>

          {cameraNotice && (
            <p className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              {cameraNotice}
            </p>
          )}

          {/* Snapshot & Video Cap Capture Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCaptureSnapshot}
                className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white rounded-xl flex items-center gap-1.5"
              >
                <Aperture className="w-4 h-4 text-emerald-400" />
                Capture Place Snapshot
              </button>
              <button
                onClick={handleRecordVideoCap}
                disabled={isRecordingClip}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5"
              >
                <Video className="w-4 h-4" />
                {isRecordingClip
                  ? 'Recording 5s Video Cap...'
                  : 'Record Video Cap for User'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              {capturedSnapshotUrl && (
                <a
                  href={capturedSnapshotUrl}
                  download={`explorer-snapshot-${Date.now()}.png`}
                  className="text-xs font-mono text-emerald-400 underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Snapshot
                </a>
              )}
              {recordedVideoUrl && (
                <a
                  href={recordedVideoUrl}
                  download={`explorer-video-cap-${Date.now()}.webm`}
                  className="text-xs font-mono text-amber-400 underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Video Cap (.webm)
                </a>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: LIVE VIDEO & VOICE LANGUAGE TRANSLATION STUDIO (34 LANGUAGES) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 block">
                  03 · LIVE CAMERA & VOICE LANGUAGE TRANSLATION (34 LANGUAGES)
                </span>
                <h3 className="text-lg font-display font-semibold text-white">
                  Explorer Local Speech ⇄ User Language AI Interpreter
                </h3>
              </div>
              <Globe className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>

            {/* Language Pair Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3">
              <div>
                <label className="block text-[10px] font-mono uppercase text-amber-400 mb-1">
                  Explorer Speaks (Local Language)
                </label>
                <select
                  value={explorerLanguage}
                  onChange={(e) => {
                    onChangeExplorerLanguage(e.target.value);
                    const found = SUPPORTED_LANGUAGES.find((l) => l.code === e.target.value);
                    if (found) setLocalSpeechInput(found.sampleExplorerSpeech);
                  }}
                  className="w-full px-2.5 py-2 text-xs bg-slate-900 border border-slate-700 text-white rounded-lg"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-emerald-400 mb-1">
                  User Hears / Reads (Target Language)
                </label>
                <select
                  value={userTargetLang}
                  onChange={(e) => setUserTargetLang(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-slate-900 border border-slate-700 text-white rounded-lg"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.nativeName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Explorer Speaks in Local Language -> AI Translates for User */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300">
                  A. Explorer Speaks in {explorerLangObj.name} ({explorerLangObj.nativeName})
                </span>
                <button
                  onClick={handleStartVoiceDictation}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${
                    isListeningVoice
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'bg-slate-900 border border-slate-700 text-emerald-400 hover:bg-slate-800'
                  }`}
                >
                  <Mic className="w-3 h-3" />
                  {isListeningVoice ? 'Listening...' : 'Voice Mic Input'}
                </button>
              </div>

              <textarea
                rows={2}
                value={localSpeechInput}
                onChange={(e) => setLocalSpeechInput(e.target.value)}
                placeholder={`Speak or type in ${explorerLangObj.name}...`}
                className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-white rounded-lg"
              />

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSpeakTranslation}
                    onChange={(e) => setAutoSpeakTranslation(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  Auto-speak translated audio (TTS)
                </label>

                <button
                  onClick={handleTranslateExplorerSpeechToUser}
                  disabled={isTranslating}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isTranslating
                    ? 'Translating Live...'
                    : `Translate to ${userTargetLangObj.name} & Overlay`}
                </button>
              </div>
            </div>

            {/* User Instruction -> AI Translates into Explorer's Local Language */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <span className="text-xs font-semibold text-emerald-300 block">
                B. Incoming User Instruction → Translate into {explorerLangObj.name}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={incomingUserInstruction}
                  onChange={(e) => setIncomingUserInstruction(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-white rounded-lg"
                />
                <button
                  onClick={handleTranslateUserInstructionToExplorer}
                  disabled={isTranslating}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  To {explorerLangObj.name}
                </button>
              </div>
            </div>

            {/* Live Bilingual Translation Log */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-[11px] font-mono uppercase text-slate-400 block">
                Live Video Translation Transcript ({transcriptLog.length})
              </span>
              {transcriptLog.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span
                      className={
                        item.speaker === 'Explorer (Local)'
                          ? 'text-amber-400 font-semibold'
                          : 'text-emerald-400 font-semibold'
                      }
                    >
                      {item.speaker} ({item.sourceLangName} → {item.targetLangName})
                    </span>
                    <button
                      onClick={() =>
                        speakTranslatedAudio(
                          item.translatedText,
                          item.speaker === 'Explorer (Local)'
                            ? userTargetLang
                            : explorerLanguage
                        )
                      }
                      className="text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <Volume2 className="w-3 h-3" />
                      Play
                    </button>
                  </div>
                  <p className="text-slate-300">{item.originalText}</p>
                  <p className="font-semibold text-emerald-400">
                    → &ldquo;{item.translatedText}&rdquo;
                  </p>
                  {item.pronunciationGuide && (
                    <p className="text-[11px] font-mono text-slate-400">
                      Pronunciation: {item.pronunciationGuide}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
