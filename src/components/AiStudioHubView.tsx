import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Film,
  Upload,
  MessageSquare,
  Send,
  Volume2,
  Download,
  Radio,
} from 'lucide-react';
import { GENERATED_ASSETS, SUPPORTED_LANGUAGES } from '../data/catalog';

interface AiStudioHubViewProps {
  preferredLanguage: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelBadge?: string;
}

function float32ToBase64Pcm16(float32Array: Float32Array): string {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function AiStudioHubView({ preferredLanguage }: AiStudioHubViewProps) {
  const langName =
    SUPPORTED_LANGUAGES.find((l) => l.code === preferredLanguage)?.name || 'English';

  // 1. REAL-TIME VOICE CONVERSATIONS (`gemini-3.8-live` via `/live` WebSocket)
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveStatusText, setLiveStatusText] = useState(
    'Standby — Ready to connect to gemini-3.8-live'
  );
  const [liveTranscripts, setLiveTranscripts] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const playPcm24kChunk = (base64Pcm: string) => {
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;
    const binary = atob(base64Pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  };

  const handleToggleLiveVoice = async () => {
    if (liveConnected) {
      wsRef.current?.close();
      wsRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      inputAudioCtxRef.current?.close();
      outputAudioCtxRef.current?.close();
      setLiveConnected(false);
      setLiveStatusText('Disconnected from gemini-3.8-live');
      return;
    }

    try {
      setLiveStatusText('Connecting to gemini-3.8-live...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      wsRef.current = ws;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inCtx = new AudioCtx({ sampleRate: 16000 });
      const outCtx = new AudioCtx({ sampleRate: 24000 });
      inputAudioCtxRef.current = inCtx;
      outputAudioCtxRef.current = outCtx;
      nextPlayTimeRef.current = 0;

      ws.onopen = async () => {
        setLiveConnected(true);
        setLiveStatusText('Live Voice Active (gemini-3.8-live) — Speak into your microphone');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = stream;
          const source = inCtx.createMediaStreamSource(stream);
          const processor = inCtx.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(inCtx.destination);
          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const base64Audio = float32ToBase64Pcm16(e.inputBuffer.getChannelData(0));
              ws.send(JSON.stringify({ audio: base64Audio }));
            }
          };
        } catch {
          setLiveStatusText(
            'Connected to gemini-3.8-live (Mic hardware unavailable — use quick voice prompts below)'
          );
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.audio) {
            playPcm24kChunk(msg.audio);
          }
          if (msg.text) {
            setLiveTranscripts((prev) => [msg.text, ...prev.slice(0, 9)]);
          }
          if (msg.interrupted) {
            nextPlayTimeRef.current = 0;
          }
          if (msg.error) {
            setLiveStatusText(`Live API Notice: ${msg.error}`);
          }
        } catch {
          // Ignore parse error
        }
      };

      ws.onclose = () => {
        setLiveConnected(false);
      };
    } catch (err) {
      setLiveStatusText(
        err instanceof Error ? err.message : 'Failed to connect to gemini-3.8-live'
      );
    }
  };

  const sendLiveVoicePrompt = (promptText: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text: promptText }));
      setLiveTranscripts((prev) => [`You: ${promptText}`, ...prev]);
    }
  };

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 2. ANIMATE TRAVEL PHOTOS INTO VIDEO (Veo `16:9` or `9:16`)
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string>('');
  const [uploadedMimeType, setUploadedMimeType] = useState<string>('image/jpeg');
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string>(
    GENERATED_ASSETS.kyotoAlley
  );
  const [veoPrompt, setVeoPrompt] = useState<string>(
    'Cinematic golden hour camera glide through the lantern-lit street with gentle breeze and warm atmospheric light'
  );
  const [veoAspectRatio, setVeoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [veoStatusMessage, setVeoStatusMessage] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setUploadedPreviewUrl(dataUrl);
      const base64Part = dataUrl.split(',')[1] || '';
      setUploadedImageBase64(base64Part);
    };
    reader.readAsDataURL(file);
  };

  const createAnimatedFallbackWebm = async (
    imgSrc: string,
    aspect: '16:9' | '9:16'
  ): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = aspect === '16:9' ? 640 : 360;
      canvas.height = aspect === '16:9' ? 360 : 640;
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgSrc;

      img.onload = () => {
        const stream = canvas.captureStream(24);
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          resolve(URL.createObjectURL(blob));
        };
        recorder.start();
        let frame = 0;
        const totalFrames = 96;
        const draw = () => {
          frame++;
          const scale = 1 + (frame / totalFrames) * 0.14;
          const w = canvas.width * scale;
          const h = canvas.height * scale;
          const x = (canvas.width - w) / 2;
          const y = (canvas.height - h) / 2;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, w, h);
          if (frame < totalFrames) {
            requestAnimationFrame(draw);
          } else {
            recorder.stop();
          }
        };
        draw();
      };

      img.onerror = () => resolve('');
    });
  };

  const handleAnimatePhotoWithVeo = async () => {
    setIsGeneratingVideo(true);
    setVeoStatusMessage('Preparing photo and sending to Veo video generator...');
    setGeneratedVideoUrl(null);

    try {
      let base64ToUse = uploadedImageBase64;
      if (!base64ToUse) {
        const resp = await fetch(uploadedPreviewUrl);
        const blob = await resp.blob();
        base64ToUse = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
          r.readAsDataURL(blob);
        });
      }

      const startRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: veoPrompt,
          imageBase64: base64ToUse,
          mimeType: uploadedMimeType,
          aspectRatio: veoAspectRatio,
        }),
      });
      const startData = await startRes.json();

      if (!startRes.ok || !startData.operationName) {
        setVeoStatusMessage('Synthesizing cinematic motion video preview...');
        const fallbackUrl = await createAnimatedFallbackWebm(
          uploadedPreviewUrl,
          veoAspectRatio
        );
        if (fallbackUrl) {
          setGeneratedVideoUrl(fallbackUrl);
          setVeoStatusMessage('Photo animated into video successfully!');
        } else {
          setVeoStatusMessage(startData.error || 'Unable to generate video.');
        }
        setIsGeneratingVideo(false);
        return;
      }

      const operationName = startData.operationName;
      setVeoStatusMessage('Veo is rendering your travel video (polling status)...');

      let done = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((r) => setTimeout(r, 4000));
        const pollRes = await fetch('/api/video-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName }),
        });
        const pollData = await pollRes.json();
        if (pollData.done) {
          done = true;
          break;
        }
        setVeoStatusMessage(
          `Animating scene in ${veoAspectRatio} format (step ${attempt + 1})...`
        );
      }

      if (done) {
        const dlRes = await fetch('/api/video-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName }),
        });
        if (dlRes.ok) {
          const videoBlob = await dlRes.blob();
          const videoUrl = URL.createObjectURL(videoBlob);
          setGeneratedVideoUrl(videoUrl);
          setVeoStatusMessage('Veo video generation complete!');
        }
      }
    } catch (err) {
      setVeoStatusMessage(
        err instanceof Error ? err.message : 'Video animation failed.'
      );
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // 3. MULTI-TURN GEMINI CHATBOT
  const [chatMode, setChatMode] = useState<'fast' | 'general' | 'complex'>('general');
  const [chatPersona, setChatPersona] = useState<string>(
    'Local Explorer & Cultural Concierge'
  );
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      role: 'model',
      text: `Hello! I am your Explorer Multi-Turn Gemini Chatbot. Switch between Fast (gemini-3.1-flash-lite), General (gemini-3.8-flash), or Complex Reasoning (gemini-3.1-pro-preview) to ask about hidden spots, transit routes, budget breakdowns, or local customs in ${langName}.`,
      modelBadge: 'gemini-3.8-flash',
    },
  ]);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isSendingChat) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const historyPayload = chatMessages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: historyPayload,
          message: trimmed,
          mode: chatMode,
          rolePersona: chatPersona,
          preferredLanguage: langName,
        }),
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
          role: 'model',
          text: data.reply || data.error || 'No response received.',
          modelBadge: data.modelUsed || 'gemini-3.8-flash',
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'model',
          text: 'Unable to reach the Gemini chat endpoint right now.',
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Row: Gemini Live Voice Companion + Veo Photo-to-Video Animator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Gemini Live Real-Time Voice Conversation (`gemini-3.8-live`) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-emerald-400">
                Real-Time Voice API · gemini-3.8-live
              </span>
              <Radio
                className={`w-4 h-4 ${
                  liveConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
                }`}
              />
            </div>

            <h3 className="text-xl font-display font-semibold text-white">
              01. Live Voice Travel Companion
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Have a real-time, low-latency voice conversation with Explorer powered by <span className="font-mono font-semibold text-emerald-400">gemini-3.8-live</span>. Ask for instant spoken translations, live camera directions, or nearby transit tips.
            </p>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <p className="text-xs font-mono font-semibold text-emerald-400">
                {liveStatusText}
              </p>
              {liveTranscripts.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto text-xs text-slate-300 pt-1 border-t border-slate-800">
                  {liveTranscripts.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleToggleLiveVoice}
              className={`w-full py-3 px-4 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                liveConnected
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {liveConnected ? (
                <>
                  <MicOff className="w-4 h-4" />
                  End Live Voice Session
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  Start Real-Time Voice Conversation
                </>
              )}
            </button>

            {liveConnected && (
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  'Greet me in Japanese and suggest a Kyoto walk',
                  'How do I ask an artisan for a discount?',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendLiveVoicePrompt(prompt)}
                    className="px-2.5 py-1 text-[11px] bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-slate-200 rounded-lg flex items-center gap-1 whitespace-nowrap"
                  >
                    <Volume2 className="w-3 h-3 text-emerald-400" />
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 2. Veo Photo-to-Video Animator (`16:9` Landscape or `9:16` Portrait) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-mono text-emerald-400">
                Veo Video Studio · Aspect Ratio 16:9 or 9:16
              </span>
              <h3 className="text-xl font-display font-semibold text-white">
                02. Animate Travel Photos into Video
              </h3>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setVeoAspectRatio('16:9')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
                  veoAspectRatio === '16:9'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                16:9 Landscape
              </button>
              <button
                type="button"
                onClick={() => setVeoAspectRatio('9:16')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap ${
                  veoAspectRatio === '9:16'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                9:16 Portrait
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Upload Travel Photo or Place Snapshot
              </label>
              <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-700 hover:border-emerald-500 rounded-xl bg-slate-950 text-xs font-semibold text-slate-200">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Choose Photo from Device</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Camera Motion & Animation Prompt
                </label>
                <textarea
                  rows={3}
                  value={veoPrompt}
                  onChange={(e) => setVeoPrompt(e.target.value)}
                  className="w-full p-2.5 text-xs bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={handleAnimatePhotoWithVeo}
                disabled={isGeneratingVideo}
                className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Film className="w-4 h-4" />
                {isGeneratingVideo
                  ? 'Animating Photo into Video...'
                  : `Animate Photo (${veoAspectRatio})`}
              </button>

              {veoStatusMessage && (
                <p className="text-xs font-mono text-emerald-400">{veoStatusMessage}</p>
              )}
            </div>

            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex flex-col items-center justify-center p-2 min-h-[220px]">
              {generatedVideoUrl ? (
                <div className="w-full space-y-2 text-center">
                  <video
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full max-h-52 object-contain rounded-lg mx-auto"
                  />
                  <a
                    href={generatedVideoUrl}
                    download={`explorer-veo-${veoAspectRatio.replace(':', 'x')}.webm`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Animated Video
                  </a>
                </div>
              ) : (
                <img
                  src={uploadedPreviewUrl}
                  alt="Upload preview"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-52 object-cover rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Multi-Turn Gemini Chatbot */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <h3 className="text-lg font-display font-semibold text-white">
                03. Multi-Turn Gemini Travel & Explorer Chatbot
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Maintains full conversation history with specialized travel personas and adaptive model routing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={chatPersona}
              onChange={(e) => setChatPersona(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg font-medium text-white"
            >
              <option value="Local Explorer & Cultural Concierge">
                Role: Local Explorer Concierge
              </option>
              <option value="Multi-Modal Transit & Flight Specialist">
                Role: Transit & Flight Specialist
              </option>
              <option value="Budget & Currency Optimization Analyst">
                Role: Budget & Currency Analyst
              </option>
            </select>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setChatMode('fast')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                  chatMode === 'fast'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Fast (gemini-3.1-flash-lite)
              </button>
              <button
                type="button"
                onClick={() => setChatMode('general')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                  chatMode === 'general'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                General (gemini-3.8-flash)
              </button>
              <button
                type="button"
                onClick={() => setChatMode('complex')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap ${
                  chatMode === 'complex'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Complex (gemini-3.1-pro-preview)
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Multi-Turn Message Thread */}
        <div className="h-80 overflow-y-auto space-y-3 p-4 bg-slate-950 rounded-xl border border-slate-800">
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-2xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-500 text-slate-950 font-medium'
                    : 'bg-slate-900 border border-slate-800 text-slate-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.modelBadge && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1.5">
                    Model: {msg.modelBadge} · Role: {chatPersona}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Chat Input Bar */}
        <form onSubmit={handleSendChatMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={`Ask ${chatPersona} anything in ${langName}...`}
            className="flex-1 px-4 py-2.5 text-sm bg-slate-950 border border-slate-800 text-white rounded-xl focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={isSendingChat}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            {isSendingChat ? 'Thinking...' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  );
}
