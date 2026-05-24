'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mic, MicOff, Send, Bot, User, Volume2,
  VolumeX, MessageSquare, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════
interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  audioUrl?: string | null;
}

interface ScanContext {
  verdict?: string;
  score?: number;
  category?: string;
  explanation?: string;
  flags?: string[];
}

interface AbjadChatProps {
  scanContext: ScanContext | null;
}

// ════════════════════════════════════════════════════════════════
// Waveform Animation (saat voice mode aktif)
// ════════════════════════════════════════════════════════════════
function VoiceWaveform({ isActive }: { isActive: boolean }) {
  const bars = 24;
  return (
    <div className="flex items-center justify-center gap-[3px] h-20">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-primary/80"
          animate={isActive ? {
            height: [8, 20 + Math.random() * 40, 12, 30 + Math.random() * 30, 8],
          } : { height: 8 }}
          transition={isActive ? {
            duration: 0.6 + Math.random() * 0.4,
            repeat: Infinity,
            repeatType: 'mirror',
            delay: i * 0.03,
          } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════
export default function AbjadChat({ scanContext }: AbjadChatProps) {
  // ── State ──────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);

  // ── Refs ───────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<unknown>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedTextRef = useRef<string>('');
  const isSubmittingRef = useRef(false);                               // Bug #2: guard double-send
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);                // Bug #3: cached voices
  const uttWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null); // Bug #1: Chrome onend fix
  // Refs untuk menghindari stale closure di speech recognition callbacks
  const voiceModeRef = useRef(false);
  const isLoadingRef = useRef(false);
  const ttsEnabledRef = useRef(true);
  const hasFatalErrorRef = useRef(false);                              // Melacak error fatal agar tidak loop mic
  const startVoiceListeningRef = useRef<() => void>(() => {});
  const sendMessageRef = useRef<(text: string) => void>(() => {});     // Bug #1: anti stale-closure

  // ── Sync refs dengan state ─────────────────────────────────
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);

  // ── Pre-load & cache voices (Bug #3: getVoices() bersifat async) ──
  useEffect(() => {
    const load = () => { voicesRef.current = window.speechSynthesis?.getVoices() || []; };
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  // ── Auto scroll ke bawah saat pesan baru ──────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript]);

  // ── Greeting saat pertama buka ────────────────────────────
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const greeting = scanContext?.verdict
        ? `Halo! Aku AbjadIn, asisten keamanan digitalmu. Aku sudah lihat hasil scan kamu tadi. Ada yang ingin kamu tanyakan tentang hasilnya?`
        : `Halo! Aku AbjadIn, asisten keamanan digitalmu. Kamu bisa tanya apa saja seputar keamanan online. Atau scan dulu link yang ingin kamu periksa ya!`;

      setMessages([{ role: 'assistant', text: greeting }]);
    }
  }, [isOpen, scanContext?.verdict]);

  // ── Cleanup saat close ────────────────────────────────────
  useEffect(() => {
    return () => {
      stopListening();
      stopAudio();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ── Send Message to Backend ───────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    // Bug #2: tolak jika sedang loading ATAU sedang menunggu response sebelumnya
    if (!text.trim() || isLoading || isSubmittingRef.current) return;

    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
    isSubmittingRef.current = true; // Bug #2: set flag sebelum request
    setLiveTranscript('');

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history,
          scanContext: scanContext || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal mendapatkan jawaban');
      }

      const data = await response.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        text: data.reply,
        audioUrl: data.audioBase64 || null,
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Voice mode: prioritas Cloud TTS (Google WaveNet, jauh lebih natural)
      //             fallback ke browser TTS jika API key tidak tersedia
      // Chat mode:  selalu Cloud TTS untuk tombol putar ulang
      if (ttsEnabledRef.current) {
        if (voiceModeRef.current) {
          if (data.audioBase64) {
            // Cloud TTS tersedia → pakai WaveNet, restart mic setelah selesai
            playAudio(data.audioBase64, () => {
              if (voiceModeRef.current && !isLoadingRef.current) {
                setTimeout(() => startVoiceListeningRef.current(), 300);
              }
            });
          } else {
            // Fallback: browser TTS jika tidak ada API key
            speakBrowser(data.reply);
          }
        } else if (data.audioBase64) {
          playAudio(data.audioBase64);
        }
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Maaf, ${errMsg}. Coba lagi ya.`,
      }]);
      // Jika error di voice mode, restart listening
      if (voiceModeRef.current) {
        setTimeout(() => startVoiceListeningRef.current(), 500);
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false; // Bug #2: release flag setelah selesai
    }
  }, [isLoading, messages, scanContext]);

  // Sync sendMessageRef agar callbacks speech recognition selalu pakai versi terbaru
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ── Browser TTS (INSTANT — Web Speech SynthesisAPI) ───────
  // Dipakai di voice mode: tidak perlu network, langsung bicara
  const speakBrowser = useCallback((text: string) => {
    if (!ttsEnabledRef.current) return;

    // Hentikan utterance & watchdog sebelumnya
    if (uttWatchdogRef.current) { clearInterval(uttWatchdogRef.current); uttWatchdogRef.current = null; }
    window.speechSynthesis?.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Bug #3: gunakan cached voices, hindari getVoices() setiap call
    const idVoice = voicesRef.current.find(v => v.lang.startsWith('id')) ||
                    voicesRef.current.find(v => v.lang.startsWith('en-US'));
    if (idVoice) utterance.voice = idVoice;

    const onFinish = () => {
      if (uttWatchdogRef.current) { clearInterval(uttWatchdogRef.current); uttWatchdogRef.current = null; }
      setIsSpeaking(false);
      // Auto-restart mic setelah AI selesai bicara
      if (voiceModeRef.current && !isLoadingRef.current) {
        setTimeout(() => startVoiceListeningRef.current(), 300);
      }
    };

    setIsSpeaking(true);
    utterance.onend = onFinish;
    utterance.onerror = onFinish;
    window.speechSynthesis.speak(utterance);

    // Bug #1: Chrome watchdog — onend kadang tidak fire sama sekali
    // Cek setiap 250ms apakah speechSynthesis sudah berhenti
    uttWatchdogRef.current = setInterval(() => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        onFinish();
      }
    }, 250);
  }, []);

  // ── Cloud TTS Audio Playback ────────────────────────────────────────────
  // onFinished: opsional, dipanggil setelah audio selesai (dipakai voice mode untuk restart mic)
  const playAudio = (audioDataUrl: string, onFinished?: () => void) => {
    stopAudio();
    const audio = new Audio(audioDataUrl);
    audioRef.current = audio;
    setIsSpeaking(true);
    const handleEnd = () => {
      setIsSpeaking(false);
      onFinished?.();
    };
    audio.onended = handleEnd;
    audio.onerror = handleEnd;
    audio.play().catch(handleEnd);
  };

  const stopAudio = () => {
    // Stop Cloud TTS audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    // Stop browser TTS
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  // ── Speech Recognition ────────────────────────────────────
  const createRecognition = useCallback((continuous: boolean) => {
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition
      || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Maaf, browser kamu belum mendukung fitur suara. Coba gunakan Google Chrome ya.',
      }]);
      return null;
    }
    return new (SpeechRecognition as new () => any)();
  }, []);

  /**
   * Mode VOICE — continuous + VAD debounce + BARGE-IN
   * - Kirim pesan otomatis setelah 1.5 detik diam
   * - User bisa interupsi AI kapanpun, audio langsung berhenti
   */
  const startVoiceListening = useCallback(() => {
    const recognition = createRecognition(true);
    if (!recognition) return;

    recognition.lang = 'id-ID';
    recognition.continuous = true;
    recognition.interimResults = true;

    accumulatedTextRef.current = '';
    hasFatalErrorRef.current = false; // Reset status error fatal setiap mulai

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      // Bug #2: abaikan hasil jika sedang memproses request sebelumnya
      if (isSubmittingRef.current) return;

      // ── BARGE-IN: user bicara saat AI sedang ngomong (Cloud TTS)
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
        setIsSpeaking(false);
      }
      // Bug #3: BARGE-IN browser TTS — cancel langsung jika user mulai bicara
      if (window.speechSynthesis?.speaking) {
        if (uttWatchdogRef.current) { clearInterval(uttWatchdogRef.current); uttWatchdogRef.current = null; }
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }

      let newFinal = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          newFinal += t;
        } else {
          interim += t;
        }
      }

      if (newFinal) {
        accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + newFinal.trim();
      }

      setLiveTranscript(accumulatedTextRef.current + (interim ? ' ' + interim : ''));

      // Bug #2: VAD 2200ms (lebih natural, sesuai pola bicara Indonesia)
      if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
      if (accumulatedTextRef.current) {
        vadTimerRef.current = setTimeout(() => {
          const toSend = accumulatedTextRef.current.trim();
          // Bug #2: minimum 3 karakter agar tidak mengirim noise/suara pendek
          if (toSend && toSend.length >= 3) {
            accumulatedTextRef.current = '';
            setLiveTranscript('');
            sendMessageRef.current(toSend); // Bug #1: pakai ref, bukan closure
          }
        }, 2200);
      }
    };

    recognition.onerror = (e: any) => {
      console.error('Speech Recognition Error:', e.error);
      if (e.error === 'no-speech') return; // Bukan error fatal (hening saja)

      hasFatalErrorRef.current = true; // Tandai terjadi error fatal
      setIsListening(false);
      setLiveTranscript('');
      setVoiceMode(false);
      
      let errMsg = 'Terjadi kesalahan pada mikrofon.';
      if (e.error === 'not-allowed') {
        errMsg = 'Izin mikrofon ditolak. Harap aktifkan izin akses mikrofon di browser Anda untuk berbicara.';
      } else if (e.error === 'audio-capture') {
        errMsg = 'Mikrofon tidak terdeteksi. Pastikan perangkat mikrofon Anda sudah terhubung.';
      } else if (e.error === 'network') {
        errMsg = 'Koneksi jaringan bermasalah saat menggunakan asisten suara.';
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `⚠️ Fitur Suara Berhenti: ${errMsg}`
      }]);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Hanya restart jika: voice mode aktif, tidak loading, tidak submit, & TIDAK ada error fatal
      if (voiceModeRef.current && !isLoadingRef.current && !isSubmittingRef.current && !hasFatalErrorRef.current) {
        setTimeout(() => {
          if (voiceModeRef.current && !hasFatalErrorRef.current) {
            startVoiceListeningRef.current(); // Fresh instance
          }
        }, 1000); // 1 detik cooldown
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [createRecognition, sendMessage]);

  // Sync ref agar speakBrowser bisa memanggil startVoiceListening terbaru
  useEffect(() => {
    startVoiceListeningRef.current = startVoiceListening;
  }, [startVoiceListening]);

  /**
   * Mode TEXT — single utterance (klik mic di input box)
   */
  const startListening = useCallback(() => {
    const recognition = createRecognition(false);
    if (!recognition) return;

    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      setLiveTranscript(interim || final);
      if (final) {
        setInputText(final.trim()); // isi ke text input, tidak langsung kirim
        setLiveTranscript('');
      }
    };

    recognition.onerror = () => { setIsListening(false); setLiveTranscript(''); };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [createRecognition]);

  const stopListening = useCallback(() => {
    voiceModeRef.current = false; // Sync ref langsung untuk cegah restart async
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    accumulatedTextRef.current = '';
    if (recognitionRef.current) {
      (recognitionRef.current as any).abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setLiveTranscript('');
  }, []);

  // ── Toggle Voice Mode ─────────────────────────────────────
  const toggleVoiceMode = () => {
    if (voiceMode) {
      stopListening();
      stopAudio();
      setVoiceMode(false);
    } else {
      setVoiceMode(true);
      setTimeout(() => startVoiceListening(), 300); // beri waktu state update
    }
  };

  // ── Handle Submit (text input) ────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText);
    }
  };

  // ════════════════════════════════════════════════════════════
  // RENDER — Floating Button
  // ════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Floating Action Button ──────────────────────────── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full bg-primary text-primary-foreground shadow-2xl flex items-center justify-center cursor-pointer group"
            aria-label="Buka chat AbjadIn"
          >
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
            <Bot className="w-7 h-7 relative z-10" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Chat Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsOpen(false); stopListening(); stopAudio(); setVoiceMode(false); }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 bottom-4 top-16 sm:inset-auto sm:bottom-6 sm:right-6 sm:top-auto sm:w-[420px] sm:h-[600px] z-50 flex flex-col bg-card rounded-2xl shadow-2xl border border-border/50 overflow-hidden"
            >
              {/* ── Header ──────────────────────────────────── */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-foreground">AbjadIn</h3>
                    <p className="text-xs text-muted-foreground">
                      {isLoading ? 'Mengetik...' : isSpeaking ? 'Berbicara...' : isListening ? 'Mendengarkan...' : 'Asisten Keamanan Digital'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {/* TTS Toggle */}
                  <button
                    onClick={() => { setTtsEnabled(!ttsEnabled); if (isSpeaking) stopAudio(); }}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    title={ttsEnabled ? 'Matikan suara' : 'Nyalakan suara'}
                  >
                    {ttsEnabled
                      ? <Volume2 className="w-4 h-4 text-primary" />
                      : <VolumeX className="w-4 h-4 text-muted-foreground" />
                    }
                  </button>
                  {/* Close */}
                  <button
                    onClick={() => { setIsOpen(false); stopListening(); stopAudio(); setVoiceMode(false); }}
                    className="p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* ── Body ────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <AnimatePresence mode="wait">
                  {voiceMode ? (
                    /* ── Voice Mode View ─────────────────────── */
                    <motion.div
                      key="voice"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center h-full gap-6 py-8"
                    >
                      {/* Robot Avatar dengan glow saat aktif */}
                      <motion.div
                        animate={isListening || isSpeaking ? {
                          boxShadow: ['0 0 0px rgba(15,118,110,0.3)', '0 0 30px rgba(15,118,110,0.5)', '0 0 0px rgba(15,118,110,0.3)'],
                        } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center"
                      >
                        <Bot className="w-12 h-12 text-primary" />
                      </motion.div>

                      {/* Waveform */}
                      <VoiceWaveform isActive={isListening || isSpeaking} />

                      {/* Status Text */}
                      <div className="text-center space-y-1">
                        {isLoading && (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> AbjadIn sedang berpikir...
                          </p>
                        )}
                        {isListening && !isLoading && (
                          <p className="text-sm text-primary font-medium">Aku mendengarkan...</p>
                        )}
                        {isSpeaking && (
                          <p className="text-sm text-primary font-medium">AbjadIn berbicara...</p>
                        )}
                        {!isListening && !isSpeaking && !isLoading && (
                          <p className="text-sm text-muted-foreground">Tekan mikrofon untuk mulai bicara</p>
                        )}
                      </div>

                      {/* Live Transcript */}
                      {liveTranscript && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="px-4 py-2 rounded-xl bg-muted/50 max-w-[280px]"
                        >
                          <p className="text-sm text-foreground/70 italic text-center">&quot;{liveTranscript}&quot;</p>
                        </motion.div>
                      )}

                      {/* Mic Button (large) */}
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (isSpeaking) { stopAudio(); return; }
                          // Bug #1: voice mode harus pakai startVoiceListening (continuous), bukan startListening (single)
                          if (isListening) { stopListening(); } else { startVoiceListening(); }
                        }}
                        disabled={isLoading}
                        className={`w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all shadow-lg ${
                          isListening
                            ? 'bg-destructive text-white animate-pulse'
                            : isSpeaking
                            ? 'bg-amber-500 text-white'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isSpeaking ? <VolumeX className="w-7 h-7" /> : isListening ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                      </motion.button>
                    </motion.div>
                  ) : (
                    /* ── Chat History View ───────────────────── */
                    <motion.div
                      key="chat"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      {messages.map((msg, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 }}
                          className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          {/* Avatar */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            msg.role === 'assistant'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-accent text-accent-foreground'
                          }`}>
                            {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                          </div>

                          {/* Bubble */}
                          <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                            msg.role === 'assistant'
                              ? 'bg-muted/40 text-foreground rounded-tl-sm'
                              : 'bg-primary text-primary-foreground rounded-tr-sm'
                          }`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            {/* Play audio button */}
                            {msg.audioUrl && msg.role === 'assistant' && (
                              <button
                                onClick={() => playAudio(msg.audioUrl!)}
                                className="mt-2 flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary cursor-pointer transition-colors"
                              >
                                <Volume2 className="w-3.5 h-3.5" /> Putar ulang suara
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}

                      {/* Loading indicator */}
                      {isLoading && (
                        <div className="flex gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-primary" />
                          </div>
                          <div className="bg-muted/40 rounded-2xl rounded-tl-sm px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer (Input Area) ─────────────────────── */}
              <div className="border-t border-border/50 p-3 bg-card">
                {/* Mode toggle */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => { if (voiceMode) { stopListening(); stopAudio(); } setVoiceMode(false); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                      !voiceMode ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Chat
                  </button>
                  <button
                    onClick={toggleVoiceMode}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all ${
                      voiceMode ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" /> Suara
                  </button>
                </div>

                {/* Text input (shown in chat mode) */}
                {!voiceMode && (
                  <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Ketik pertanyaanmu..."
                      disabled={isLoading}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-muted/30 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                      maxLength={500}
                    />
                    {/* Mic button (inline) */}
                    <button
                      type="button"
                      onClick={() => { if (isListening) stopListening(); else startListening(); }}
                      disabled={isLoading}
                      className={`p-2.5 rounded-xl cursor-pointer transition-all ${
                        isListening
                          ? 'bg-destructive text-white animate-pulse'
                          : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                      } disabled:opacity-50`}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    {/* Send button */}
                    <Button
                      type="submit"
                      size="icon"
                      disabled={isLoading || !inputText.trim()}
                      className="rounded-xl cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
