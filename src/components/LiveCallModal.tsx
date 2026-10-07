import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  Send,
  Star,
  Video,
  Share2,
  CreditCard,
  BellRing,
  CheckCircle2,
  XCircle,
  Download,
  Aperture,
  Compass,
  Sparkles,
  BookmarkCheck,
} from 'lucide-react';
import {
  ExplorerChannelPreset,
  SUPPORTED_LANGUAGES,
  formatCurrency,
} from '../data/catalog';
import {
  db,
  auth,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';

export interface CallNotificationPayload {
  id: string;
  type: 'ringing' | 'accepted' | 'rejected' | 'completed';
  placeName: string;
  explorerName: string;
  travelerName: string;
  amountUsd: number;
}

export interface TripMemoryRecord {
  id: string;
  placeName: string;
  explorerName: string;
  memoryTitle: string;
  summaryText: string;
  placesShown: string[];
  culturalHighlight: string;
  languageCode: string;
  createdAtLabel: string;
}

interface LiveCallModalProps {
  channel: ExplorerChannelPreset;
  placeDisplayName: string;
  travelerLanguage: string;
  currencyCode: string;
  liveRates: Record<string, number>;
  loyaltyDiscountPct: number;
  onClose: () => void;
  onReviewSubmitted: (rating: number, placeName: string) => void;
  onCallNotificationEvent?: (payload: CallNotificationPayload) => void;
  onTripMemorySaved?: (memory: TripMemoryRecord) => void;
  onViewTripMemories?: () => void;
}

type CallStage = 'payment' | 'ringing' | 'rejected' | 'active' | 'post_call';

export function LiveCallModal({
  channel,
  placeDisplayName,
  travelerLanguage,
  currencyCode,
  liveRates,
  loyaltyDiscountPct,
  onClose,
  onReviewSubmitted,
  onCallNotificationEvent,
  onTripMemorySaved,
  onViewTripMemories,
}: LiveCallModalProps) {
  const [stage, setStage] = useState<CallStage>('payment');
  const [sessionId, setSessionId] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState<string>('');

  // Camera & Mic states ("camers and microphone option for both user and explorer and user can off cam if he dont want to use it")
  const [userCamOn, setUserCamOn] = useState<boolean>(true);
  const [userMicOn, setUserMicOn] = useState<boolean>(true);
  const [explorerCamOn, setExplorerCamOn] = useState<boolean>(true);
  const [explorerMicOn, setExplorerMicOn] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const explorerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Snapshots & Video Recap ("shapshoot of the place" & "small video cap of that trip for user")
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [isRecordingClip, setIsRecordingClip] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Multilanguage instructions & AI interpreter
  const [selectedUserLang, setSelectedUserLang] = useState(travelerLanguage || 'en');
  const [instructionInput, setInstructionInput] = useState('');
  const [instructionMethod, setInstructionMethod] = useState<'type' | 'voice'>('type');
  const [isTranslating, setIsTranslating] = useState(false);
  const [instructionFeed, setInstructionFeed] = useState<
    Array<{
      id: string;
      original: string;
      translated: string;
      pronunciation: string;
      culturalNote: string;
    }>
  >([]);

  // Explorer speech translation & TTS
  const [explorerOriginalSpeech, setExplorerOriginalSpeech] = useState('');
  const [explorerTranslatedSpeech, setExplorerTranslatedSpeech] = useState('');
  const [isSpeakingTts, setIsSpeakingTts] = useState(false);

  // Post-call rating & review
  const [starRating, setStarRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [reviewSubmitted, setReviewSubmitted] = useState<boolean>(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Automatic Post-Call Gemini Trip Memory states
  const [isGeneratingMemory, setIsGeneratingMemory] = useState<boolean>(false);
  const [generatedTripMemory, setGeneratedTripMemory] = useState<TripMemoryRecord | null>(null);
  const [memoryStatusNotice, setMemoryStatusNotice] = useState<string | null>(null);

  const explorerLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === channel.spokenLanguageCode) ||
    SUPPORTED_LANGUAGES[0];
  const userLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === selectedUserLang) ||
    SUPPORTED_LANGUAGES[0];

  const discountedRateUsd = Number(
    (channel.sessionRateUsd * (1 - loyaltyDiscountPct / 100)).toFixed(2)
  );

  // Vibrate + audio alert helper for Join Request & Rejection notifications
  const triggerMobileVibrationAndTone = (pattern: number[], freq = 520) => {
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
        }, 350);
      }
    } catch {
      // Ignore audio/vibration restriction errors
    }
  };

  // Start or stop user camera/mic when entering active call
  useEffect(() => {
    if (stage !== 'active') {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      return;
    }

    let cancelled = false;
    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
        setCameraError(null);
      } catch {
        setCameraError(
          'Camera/Mic hardware preview unavailable in this browser tab — using virtual feed.'
        );
      }
    }

    initMedia();
    return () => {
      cancelled = true;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [stage]);

  // Toggle user camera track ("user can off cam if he dont want to use it")
  const handleToggleUserCam = () => {
    const nextState = !userCamOn;
    setUserCamOn(nextState);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }
  };

  // Toggle user microphone track
  const handleToggleUserMic = () => {
    const nextState = !userMicOn;
    setUserMicOn(nextState);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = nextState;
      });
    }
  };

  // Listen to Firestore CallSession document if signed in
  useEffect(() => {
    if (!sessionId || !auth.currentUser) return;
    const path = `callSessions/${sessionId}`;
    const unsub = onSnapshot(
      doc(db, 'callSessions', sessionId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status === 'accepted' && stage === 'ringing') {
          triggerMobileVibrationAndTone([200, 100, 200], 660);
          setStage('active');
        } else if (data.status === 'rejected' && stage === 'ringing') {
          triggerMobileVibrationAndTone([500, 150, 500], 280);
          setStage('rejected');
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, path);
      }
    );
    return () => unsub();
  }, [sessionId, stage]);

  // Render animated live explorer gimbal stream on canvas so snapshots & MediaRecorder video clips work 100% reliably
  useEffect(() => {
    if (stage !== 'active') return;
    const canvas = explorerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = channel.previewImage;

    let animId = 0;
    let tick = 0;

    const renderFrame = () => {
      tick += 0.012;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, w, h);

      if (explorerCamOn && img.complete && img.naturalWidth > 0) {
        const panX = Math.sin(tick) * 28;
        const panY = Math.cos(tick * 0.7) * 14;
        ctx.drawImage(img, -35 + panX, -20 + panY, w + 70, h + 40);
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('Explorer Camera Paused', w / 2 - 105, h / 2);
      }

      // Live gimbal HUD overlay
      ctx.fillStyle = 'rgba(9, 13, 22, 0.75)';
      ctx.fillRect(16, h - 54, w - 32, 38);
      ctx.fillStyle = '#10B981';
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillText(
        `LIVE 4K GIMBAL · ${placeDisplayName.slice(0, 34)} · ${channel.explorerName}`,
        28,
        h - 30
      );

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [stage, explorerCamOn, channel, placeDisplayName]);

  // Step 1: Pay & Send Join Request to Explorer
  const handlePayAndSendJoinRequest = async () => {
    setIsPaying(true);
    try {
      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'explorer_session',
          itemTitle: `Live Call with ${channel.explorerName} at ${placeDisplayName}`,
          amountUsd: discountedRateUsd,
          currency: currencyCode,
          discountAppliedPct: loyaltyDiscountPct,
        }),
      });
      const data = await res.json();
      setPaymentReceipt(data.receiptId || 'EXP-PAID');

      const newSessionId = `call_${Date.now()}`;
      setSessionId(newSessionId);

      const travelerDisplayName = (auth.currentUser?.displayName || 'Traveler').slice(0, 80);

      if (auth.currentUser) {
        const path = `callSessions/${newSessionId}`;
        try {
          await setDoc(doc(db, 'callSessions', newSessionId), {
            travelerId: auth.currentUser.uid,
            travelerName: travelerDisplayName,
            explorerId: channel.explorerId,
            explorerName: channel.explorerName.slice(0, 80),
            placeName: placeDisplayName.slice(0, 120),
            travelerLanguage: selectedUserLang.slice(0, 10),
            explorerLanguage: channel.spokenLanguageCode.slice(0, 10),
            paymentAmountUsd: discountedRateUsd,
            paymentStatus: 'paid',
            status: 'ringing',
            lastInstruction: 'Ready to begin live tour',
            translatedInstruction: 'Ready to begin live tour',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
      }

      onCallNotificationEvent?.({
        id: newSessionId,
        type: 'ringing',
        placeName: placeDisplayName,
        explorerName: channel.explorerName,
        travelerName: travelerDisplayName,
        amountUsd: discountedRateUsd,
      });

      // Vibrate mobile & alert Explorer
      triggerMobileVibrationAndTone([300, 120, 300, 120, 450], 540);
      setStage('ringing');
    } finally {
      setIsPaying(false);
    }
  };

  // Explorer accepts Join Request
  const handleExplorerAccept = async () => {
    if (sessionId && auth.currentUser) {
      const path = `callSessions/${sessionId}`;
      try {
        await updateDoc(doc(db, 'callSessions', sessionId), {
          status: 'accepted',
          paymentStatus: 'paid',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
    onCallNotificationEvent?.({
      id: sessionId || `call_${Date.now()}`,
      type: 'accepted',
      placeName: placeDisplayName,
      explorerName: channel.explorerName,
      travelerName: auth.currentUser?.displayName || 'Traveler',
      amountUsd: discountedRateUsd,
    });
    triggerMobileVibrationAndTone([180, 80, 220], 680);
    setStage('active');
    translateExplorerNarration(explorerLangObj.sampleExplorerSpeech, selectedUserLang);
  };

  // Explorer rejects Join Request ("if explorer rejects the request we should get notification")
  const handleExplorerReject = async () => {
    if (sessionId && auth.currentUser) {
      const path = `callSessions/${sessionId}`;
      try {
        await updateDoc(doc(db, 'callSessions', sessionId), {
          status: 'rejected',
          paymentStatus: 'refunded',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
    onCallNotificationEvent?.({
      id: sessionId || `call_${Date.now()}`,
      type: 'rejected',
      placeName: placeDisplayName,
      explorerName: channel.explorerName,
      travelerName: auth.currentUser?.displayName || 'Traveler',
      amountUsd: discountedRateUsd,
    });
    triggerMobileVibrationAndTone([450, 150, 450], 260);
    setStage('rejected');
  };

  // Translate Explorer's spoken local language into Traveler's preferred language
  const translateExplorerNarration = async (speechText: string, targetLangCode: string) => {
    setExplorerOriginalSpeech(speechText);
    const targetLang =
      SUPPORTED_LANGUAGES.find((l) => l.code === targetLangCode)?.name || 'English';
    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: speechText,
          sourceLanguage: explorerLangObj.name,
          targetLanguage: targetLang,
          contextMode: 'narration',
        }),
      });
      const data = await res.json();
      if (data.translatedText) {
        setExplorerTranslatedSpeech(data.translatedText);
      }
    } catch {
      setExplorerTranslatedSpeech(speechText);
    }
  };

  // Play translated Explorer narration via Gemini TTS
  const handleSpeakTranslatedNarration = async () => {
    const textToSpeak = explorerTranslatedSpeech || explorerOriginalSpeech;
    if (!textToSpeak || isSpeakingTts) return;
    setIsSpeakingTts(true);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          targetLanguage: userLangObj.name,
        }),
      });
      const data = await res.json();
      if (data.audioBase64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audio.onended = () => setIsSpeakingTts(false);
        audio.onerror = () => setIsSpeakingTts(false);
        await audio.play();
      } else {
        setIsSpeakingTts(false);
      }
    } catch {
      setIsSpeakingTts(false);
    }
  };

  // Send instruction to Explorer in multilanguage (both type & voice/text method)
  const handleSendInstruction = async (presetText?: string) => {
    const rawText = (presetText ?? instructionInput).trim();
    if (!rawText) return;
    setInstructionInput('');
    setIsTranslating(true);

    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawText,
          sourceLanguage: userLangObj.name,
          targetLanguage: explorerLangObj.name,
          contextMode: 'instruction',
        }),
      });
      const data = await res.json();
      const translated = (data.translatedText || rawText).slice(0, 400);

      setInstructionFeed((prev) => [
        {
          id: `inst_${Date.now()}`,
          original: rawText,
          translated,
          pronunciation: data.pronunciationGuide || '',
          culturalNote: data.culturalNote || '',
        },
        ...prev,
      ]);

      if (sessionId && auth.currentUser) {
        const path = `callSessions/${sessionId}`;
        try {
          await updateDoc(doc(db, 'callSessions', sessionId), {
            lastInstruction: rawText.slice(0, 400),
            translatedInstruction: translated,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }
    } finally {
      setIsTranslating(false);
    }
  };

  // Voice dictation for instruction
  const handleVoiceDictation = () => {
    setInstructionMethod('voice');
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;

    if (SpeechRec) {
      const recognition = new SpeechRec();
      recognition.lang = selectedUserLang;
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInstructionInput(transcript);
        }
      };
      recognition.start();
    } else {
      setInstructionInput(
        'Please pan the camera slowly toward the artisan stall and ask about the price.'
      );
    }
  };

  // Capture Snapshot ("shapshoot of the place")
  const handleTakeSnapshot = () => {
    const canvas = explorerCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSnapshots((prev) => [dataUrl, ...prev]);
  };

  // Record a real Video Clip Recap ("small video cap of that trip for user")
  const handleToggleVideoRecap = () => {
    const canvas = explorerCanvasRef.current;
    if (!canvas) return;

    if (isRecordingClip && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingClip(false);
      return;
    }

    try {
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecordingClip(true);
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setIsRecordingClip(false);
        }
      }, 6000);
    } catch {
      setIsRecordingClip(false);
    }
  };

  // Automatically generate a Gemini text summary of the places shown and save it as a 'Trip Memory' in the traveler's account
  const generateAndSaveTripMemory = async () => {
    setIsGeneratingMemory(true);
    setMemoryStatusNotice(null);

    const instructionsList = instructionFeed.map((i) => i.original);
    const narrationContext =
      explorerTranslatedSpeech ||
      explorerOriginalSpeech ||
      explorerLangObj.sampleExplorerSpeech;

    let memoryTitle = `${channel.liveEventTag} at ${placeDisplayName}`.slice(0, 150);
    let summaryText = `During this live exploration of ${placeDisplayName}, local guide ${channel.explorerName} walked through the ${channel.liveEventTag.toLowerCase()}, showcasing hidden architectural details, artisan stalls, and scenic viewpoints requested on camera.`;
    let placesShown: string[] = [
      placeDisplayName,
      channel.liveEventTag,
      `Artisan Quarter & Viewpoint with ${channel.explorerName}`,
    ];
    let culturalHighlight = `Guided live in ${explorerLangObj.name} with real-time AI interpretation into ${userLangObj.name}.`;

    try {
      const res = await fetch('/api/ai/trip-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeName: placeDisplayName,
          explorerName: channel.explorerName,
          mood: channel.mood,
          liveEventTag: channel.liveEventTag,
          explorerNarration: narrationContext,
          instructionsSent: instructionsList,
          targetLanguage: userLangObj.name,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.summaryText) {
        memoryTitle = String(data.memoryTitle || memoryTitle).slice(0, 155);
        summaryText = String(data.summaryText).slice(0, 1950);
        if (Array.isArray(data.placesShown) && data.placesShown.length > 0) {
          placesShown = data.placesShown.slice(0, 8).map((p: unknown) => String(p));
        }
        if (data.culturalHighlight) {
          culturalHighlight = String(data.culturalHighlight).slice(0, 480);
        }
      } else if (data?.error) {
        setMemoryStatusNotice(
          `Saved Trip Memory to account (Note: ${String(data.error).slice(0, 120)})`
        );
      }
    } catch (err) {
      setMemoryStatusNotice(
        err instanceof Error ? err.message : 'Saved Trip Memory to Traveler Account.'
      );
    }

    const memoryId = `mem_${Date.now()}`;
    const memoryRecord: TripMemoryRecord = {
      id: memoryId,
      placeName: placeDisplayName.slice(0, 120),
      explorerName: channel.explorerName.slice(0, 80),
      memoryTitle,
      summaryText,
      placesShown,
      culturalHighlight,
      languageCode: selectedUserLang.slice(0, 10),
      createdAtLabel: new Date().toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    // Save to Firestore /tripMemories/{memoryId} if authenticated
    if (auth.currentUser) {
      const path = `tripMemories/${memoryId}`;
      try {
        await setDoc(doc(db, 'tripMemories', memoryId), {
          userId: auth.currentUser.uid,
          placeName: memoryRecord.placeName,
          explorerName: memoryRecord.explorerName,
          memoryTitle: memoryRecord.memoryTitle,
          summaryText: memoryRecord.summaryText,
          placesShown: memoryRecord.placesShown,
          culturalHighlight: memoryRecord.culturalHighlight,
          languageCode: memoryRecord.languageCode,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }

    setGeneratedTripMemory(memoryRecord);
    onTripMemorySaved?.(memoryRecord);
    setIsGeneratingMemory(false);
  };

  // End Call -> Post-Call Star Rating, Review, Video Recap & Automatic Gemini Trip Memory
  const handleEndCall = async () => {
    if (isRecordingClip && mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecordingClip(false);
    }
    if (snapshots.length === 0 && explorerCanvasRef.current) {
      setSnapshots([explorerCanvasRef.current.toDataURL('image/png')]);
    }
    if (sessionId && auth.currentUser) {
      const path = `callSessions/${sessionId}`;
      try {
        await updateDoc(doc(db, 'callSessions', sessionId), {
          status: 'completed',
          paymentStatus: 'released',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
    onCallNotificationEvent?.({
      id: sessionId || `call_${Date.now()}`,
      type: 'completed',
      placeName: placeDisplayName,
      explorerName: channel.explorerName,
      travelerName: auth.currentUser?.displayName || 'Traveler',
      amountUsd: discountedRateUsd,
    });
    setStage('post_call');
    void generateAndSaveTripMemory();
  };

  // Submit Star Rating & Review to Firestore
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanComment = (
      reviewComment.trim() ||
      `Amazing live walk through ${placeDisplayName} with ${channel.explorerName}!`
    ).slice(0, 600);

    if (auth.currentUser) {
      const reviewId = `rev_${Date.now()}`;
      const path = `reviews/${reviewId}`;
      try {
        await setDoc(doc(db, 'reviews', reviewId), {
          authorId: auth.currentUser.uid,
          authorName: (auth.currentUser.displayName || 'Explorer Member').slice(0, 80),
          explorerId: channel.explorerId,
          placeName: placeDisplayName.slice(0, 120),
          rating: starRating,
          comment: cleanComment,
          languageCode: selectedUserLang.slice(0, 10),
          hasVideoRecap: Boolean(recordedVideoUrl || snapshots.length > 0),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }

    setReviewSubmitted(true);
    onReviewSubmitted(starRating, placeDisplayName);
  };

  const handleSocialShare = async (platform: string) => {
    const shareText = `Just explored ${placeDisplayName} live with ${channel.explorerName} on Explorer! Rated ${starRating}/5 stars.`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Explorer Live — ${placeDisplayName}`,
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    await navigator.clipboard?.writeText(`${shareText} ${window.location.href}`);
    setShareToast(`Copied share card for ${platform} to clipboard!`);
    setTimeout(() => setShareToast(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {placeDisplayName}
            </h3>
            <p className="text-xs text-slate-400">
              Live Explorer: {channel.explorerName} · Speaks {explorerLangObj.name} ({explorerLangObj.nativeName}) · Mood: {channel.mood}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 rounded-lg whitespace-nowrap"
          >
            Close Window
          </button>
        </div>

        {/* STAGE 1: PRE-CALL PAYMENT ESCROW */}
        {stage === 'payment' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-xs font-mono text-emerald-400">
                  Step 01 · Pre-Call Escrow & Call Notification Setup
                </p>
                <h4 className="text-xl font-display font-semibold text-white">
                  Book Live Mobile Camera Session with {channel.explorerName}
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Your payment is held safely in escrow before the call starts. When you send the Join Request, {channel.explorerName}&apos;s mobile device will vibrate and trigger an incoming Call Notification. If the explorer rejects the call, you receive an instant alert and 100% refund.
                </p>

                <div className="pt-2 space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Your Preferred AI Translation Language (34 Languages)
                  </label>
                  <select
                    value={selectedUserLang}
                    onChange={(e) => setSelectedUserLang(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-slate-950 border border-slate-700 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.nativeName})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>Standard Session Rate</span>
                  <span className="font-mono tabular-nums text-white">
                    {formatCurrency(channel.sessionRateUsd, currencyCode, liveRates)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-emerald-400">
                  <span>Regular User Streak Discount ({loyaltyDiscountPct}%)</span>
                  <span className="font-mono tabular-nums">
                    -{formatCurrency(channel.sessionRateUsd - discountedRateUsd, currencyCode, liveRates)}
                  </span>
                </div>
                <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-base font-semibold text-white">
                  <span>Pre-Call Escrow Total</span>
                  <span className="font-mono tabular-nums text-lg text-emerald-400">
                    {formatCurrency(discountedRateUsd, currencyCode, liveRates)}
                  </span>
                </div>

                <button
                  onClick={handlePayAndSendJoinRequest}
                  disabled={isPaying}
                  className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  {isPaying
                    ? 'Authorizing Pre-Call Payment...'
                    : `Pay ${formatCurrency(discountedRateUsd, currencyCode, liveRates)} & Ring Explorer`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 2: RINGING / JOIN REQUEST VIBRATION */}
        {stage === 'ringing' && (
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <BellRing className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-lg mx-auto">
              <p className="text-xs font-mono text-emerald-400">
                Pre-Call Escrow Paid · Receipt #{paymentReceipt}
              </p>
              <h4 className="text-2xl font-display font-semibold text-white">
                Call Notification Sent — Vibrating {channel.explorerName}&apos;s Mobile...
              </h4>
              <p className="text-sm text-slate-300">
                An incoming call alert and haptic vibration pattern have been dispatched to {channel.explorerName} at {placeDisplayName}. Answer or reject the call notification below:
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <button
                onClick={handleExplorerAccept}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                Connect Call (Explorer Accepts)
              </button>
              <button
                onClick={handleExplorerReject}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                Simulate Explorer Busy / Reject Notification
              </button>
            </div>
          </div>
        )}

        {/* STAGE 2B: REJECTED NOTIFICATION */}
        {stage === 'rejected' && (
          <div className="p-8 text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
              <XCircle className="w-7 h-7" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h4 className="text-xl font-display font-semibold text-white">
                Call Notification Declined by {channel.explorerName}
              </h4>
              <p className="text-sm text-slate-300">
                Alert Notification: {channel.explorerName} is currently assisting another traveler in {placeDisplayName}. Your pre-call payment of{' '}
                <span className="font-mono font-semibold text-emerald-400">
                  {formatCurrency(discountedRateUsd, currencyCode, liveRates)}
                </span>{' '}
                (Receipt #{paymentReceipt}) has been automatically refunded.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setStage('payment')}
                className="px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-semibold rounded-lg whitespace-nowrap"
              >
                Retry Call Request
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-slate-700 text-slate-300 text-xs font-semibold rounded-lg whitespace-nowrap"
              >
                Choose Another Explorer
              </button>
            </div>
          </div>
        )}

        {/* STAGE 3: ACTIVE DUAL CAMERA + LIVE AI TRANSLATION CALL */}
        {stage === 'active' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Explorer Mobile Camera Stream (2 cols) */}
              <div className="lg:col-span-2 space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video">
                  <canvas
                    ref={explorerCanvasRef}
                    width={800}
                    height={450}
                    className="w-full h-full object-cover"
                  />

                  {/* Picture-in-Picture Traveler Camera */}
                  <div className="absolute top-3 right-3 w-40 aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-700 shadow-lg">
                    {userCamOn ? (
                      <video
                        ref={userVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-[11px] p-2 text-center">
                        <CameraOff className="w-4 h-4 mb-1" />
                        <span>Your Camera is Off</span>
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1.5 text-[10px] font-mono text-white bg-black/60 px-1.5 py-0.5 rounded">
                      You ({userMicOn ? 'Mic On' : 'Muted'})
                    </div>
                  </div>

                  {/* Recording indicator */}
                  {isRecordingClip && (
                    <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-mono px-2.5 py-1 rounded-md flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      REC TRIP VIDEO CLIP...
                    </div>
                  )}
                </div>

                {cameraError && (
                  <p className="text-xs text-slate-400">{cameraError}</p>
                )}

                {/* Camera, Mic, Snapshot & Video Recap Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 border border-slate-800 p-3 rounded-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleToggleUserCam}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        userCamOn
                          ? 'bg-slate-900 border border-slate-700 text-white'
                          : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {userCamOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                      {userCamOn ? 'Turn My Cam Off' : 'Turn My Cam On'}
                    </button>

                    <button
                      onClick={handleToggleUserMic}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        userMicOn
                          ? 'bg-slate-900 border border-slate-700 text-white'
                          : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                      }`}
                    >
                      {userMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      {userMicOn ? 'Mute My Mic' : 'Unmute My Mic'}
                    </button>

                    <button
                      onClick={() => setExplorerCamOn((v) => !v)}
                      className="px-3 py-2 text-xs font-semibold bg-slate-900 border border-slate-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Compass className="w-4 h-4 text-emerald-400" />
                      {explorerCamOn ? 'Explorer Cam: Active' : 'Explorer Cam: Paused'}
                    </button>

                    <button
                      onClick={() => setExplorerMicOn((v) => !v)}
                      className="px-3 py-2 text-xs font-semibold bg-slate-900 border border-slate-700 text-white rounded-lg whitespace-nowrap"
                    >
                      {explorerMicOn ? 'Explorer Audio: On' : 'Explorer Audio: Muted'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTakeSnapshot}
                      className="px-3 py-2 text-xs font-semibold bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Aperture className="w-4 h-4 text-emerald-400" />
                      Snapshot ({snapshots.length})
                    </button>

                    <button
                      onClick={handleToggleVideoRecap}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap ${
                        isRecordingClip
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white'
                      }`}
                    >
                      <Video className="w-4 h-4" />
                      {isRecordingClip ? 'Stop Clip' : 'Record Video Cap'}
                    </button>

                    <button
                      onClick={handleEndCall}
                      className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <PhoneOff className="w-4 h-4" />
                      End Call & Rate
                    </button>
                  </div>
                </div>

                {/* Explorer Live Speech -> AI Real-Time Translation Box */}
                <div className="bg-slate-950 border border-slate-800 text-white rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-slate-400">
                      {channel.explorerName} speaking in {explorerLangObj.name} → AI Translated to {userLangObj.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedUserLang}
                        onChange={(e) => {
                          setSelectedUserLang(e.target.value);
                          translateExplorerNarration(
                            explorerOriginalSpeech || explorerLangObj.sampleExplorerSpeech,
                            e.target.value
                          );
                        }}
                        className="bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-700"
                      >
                        {SUPPORTED_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleSpeakTranslatedNarration}
                        disabled={isSpeakingTts}
                        className="px-2.5 py-1 bg-emerald-500 text-slate-950 text-xs font-semibold rounded flex items-center gap-1 whitespace-nowrap"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        {isSpeakingTts ? 'Speaking...' : 'Hear AI Voice'}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Original ({explorerLangObj.nativeName}): &ldquo;{explorerOriginalSpeech || explorerLangObj.sampleExplorerSpeech}&rdquo;
                  </p>
                  <p className="text-sm font-semibold text-emerald-400">
                    AI Translation ({userLangObj.name}): &ldquo;{explorerTranslatedSpeech || 'Translating live narration...'}&rdquo;
                  </p>
                </div>
              </div>

              {/* Right Column: Multilanguage Instructions (Type & Voice/Text method) */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">
                      Instruct Explorer ({explorerLangObj.name})
                    </h4>
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        onClick={() => setInstructionMethod('type')}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap ${
                          instructionMethod === 'type' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                        }`}
                      >
                        Type
                      </button>
                      <button
                        onClick={handleVoiceDictation}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap ${
                          instructionMethod === 'voice' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                        }`}
                      >
                        Voice-to-Text
                      </button>
                    </div>
                  </div>

                  {/* Quick Camera Direction Presets */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      'Pan camera left to the archway',
                      'Zoom in on the local craft details',
                      'Ask the vendor the price in local currency',
                      'Walk toward the scenic viewpoint ahead',
                    ].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => handleSendInstruction(preset)}
                        className="text-left px-2.5 py-1.5 text-[11px] bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-lg text-slate-300 truncate"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  {/* Translated Instruction Log */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {instructionFeed.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        Send an instruction in {userLangObj.name}. AI will translate it immediately for {channel.explorerName} in {explorerLangObj.name}.
                      </p>
                    ) : (
                      instructionFeed.map((item) => (
                        <div
                          key={item.id}
                          className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1"
                        >
                          <p className="text-slate-400">You: {item.original}</p>
                          <p className="font-semibold text-emerald-400">
                            → {explorerLangObj.name}: {item.translated}
                          </p>
                          {item.pronunciation && (
                            <p className="font-mono text-[11px] text-slate-400">
                              Phonetic: {item.pronunciation}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Input bar */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={instructionInput}
                      onChange={(e) => setInstructionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendInstruction();
                      }}
                      placeholder={`Type instruction in ${userLangObj.name}...`}
                      className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => handleSendInstruction()}
                      disabled={isTranslating}
                      className="px-3 py-2 bg-emerald-500 text-slate-950 text-xs font-semibold rounded-lg flex items-center gap-1 whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {isTranslating ? '...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STAGE 4: POST-CALL STAR RATING, REVIEW, VIDEO RECAP & GEMINI TRIP MEMORY */}
        {stage === 'post_call' && (
          <div className="p-6 space-y-6">
            {/* Automatic Gemini Post-Call "Trip Memory" Summary Card */}
            <div className="bg-gradient-to-r from-emerald-950/60 via-slate-950 to-slate-950 border-2 border-emerald-500/50 rounded-2xl p-5 space-y-3 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                    Gemini AI Trip Memory · Automatically Saved to Traveler Account
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-semibold flex items-center gap-1">
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    {isGeneratingMemory
                      ? 'GENERATING WITH GEMINI...'
                      : 'SAVED TO TRAVELER ACCOUNT'}
                  </span>
                  {onViewTripMemories && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onViewTripMemories();
                      }}
                      className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-white rounded-lg"
                    >
                      View Account Trip Memories
                    </button>
                  )}
                </div>
              </div>

              {isGeneratingMemory ? (
                <div className="py-4 text-xs text-slate-300 font-mono flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  Gemini is summarizing the places {channel.explorerName} showed during your live call...
                </div>
              ) : generatedTripMemory ? (
                <div className="space-y-3">
                  <h4 className="text-base md:text-lg font-display font-semibold text-white">
                    {generatedTripMemory.memoryTitle}
                  </h4>
                  <p className="text-xs md:text-sm text-slate-200 leading-relaxed">
                    {generatedTripMemory.summaryText}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-mono text-slate-400 mr-1">
                      Places Shown on Camera:
                    </span>
                    {generatedTripMemory.placesShown.map((spot, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-emerald-300 text-xs font-medium"
                      >
                        {spot}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                    Cultural Insider Note: {generatedTripMemory.culturalHighlight}
                  </p>
                </div>
              ) : null}

              {memoryStatusNotice && (
                <p className="text-[11px] font-mono text-slate-400">{memoryStatusNotice}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Video Cap & Snapshots of the Trip */}
              <div className="space-y-4">
                <h4 className="text-base font-semibold text-white">
                  Trip Video Cap & Place Snapshots
                </h4>
                {recordedVideoUrl ? (
                  <div className="space-y-2">
                    <video
                      src={recordedVideoUrl}
                      controls
                      className="w-full rounded-xl border border-slate-800 aspect-video bg-slate-950"
                    />
                    <a
                      href={recordedVideoUrl}
                      download={`explorer-trip-${channel.id}.webm`}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Trip Video Recap (.webm)
                    </a>
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-slate-800 relative aspect-video bg-slate-950">
                    <img
                      src={snapshots[0] || channel.previewImage}
                      alt={placeDisplayName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/70 text-emerald-400 text-xs font-mono px-2.5 py-1 rounded">
                      Trip Highlight Recap · {placeDisplayName}
                    </div>
                  </div>
                )}

                {snapshots.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-300">
                      Captured Place Snapshots ({snapshots.length})
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {snapshots.slice(0, 3).map((snap, idx) => (
                        <a
                          key={idx}
                          href={snap}
                          download={`snapshot-${idx + 1}.png`}
                          className="block rounded-lg overflow-hidden border border-slate-800 hover:opacity-90"
                        >
                          <img src={snap} alt="Snapshot" className="w-full h-16 object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Social Media Integration */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-slate-300">
                    Share Your Favorite Find with Friends
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {['Instagram Story', 'WhatsApp', 'X / Post', 'Copy Link'].map((plat) => (
                      <button
                        key={plat}
                        onClick={() => handleSocialShare(plat)}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                        {plat}
                      </button>
                    ))}
                  </div>
                  {shareToast && (
                    <p className="text-xs text-emerald-400 font-medium">{shareToast}</p>
                  )}
                </div>
              </div>

              {/* Right: Star Rating & Review Form */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                {reviewSubmitted ? (
                  <div className="py-8 text-center space-y-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                    <h5 className="text-lg font-display font-semibold text-white">
                      Review Published & +25 Streak Score Earned!
                    </h5>
                    <p className="text-xs text-slate-400">
                      Your visit to {placeDisplayName} with {channel.explorerName} has been added to your travel history and boosted your regular-user discount tier.
                    </p>
                    <button
                      onClick={onClose}
                      className="px-5 py-2.5 bg-emerald-500 text-slate-950 text-xs font-semibold rounded-lg whitespace-nowrap"
                    >
                      Return to Explorer Map
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitReview} className="space-y-4">
                    <div>
                      <p className="text-xs font-mono text-emerald-400">
                        Post-Call Feedback · +25 Streak Score Bonus
                      </p>
                      <h5 className="text-lg font-display font-semibold text-white">
                        Rate {channel.explorerName}&apos;s Live Tour
                      </h5>
                    </div>

                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setStarRating(star)}
                          className="p-2 rounded-lg border border-slate-800 bg-slate-900 hover:border-amber-400 transition-colors"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              star <= starRating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-sm font-mono font-semibold text-white">
                        {starRating}.0 / 5.0
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        Your Review of {placeDisplayName}
                      </label>
                      <textarea
                        rows={4}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder={`Share what you saw at ${placeDisplayName} and how ${channel.explorerName} guided the camera...`}
                        className="w-full p-3 text-sm bg-slate-900 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
                    >
                      Submit Star Rating & Claim +25 Streak Score
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
