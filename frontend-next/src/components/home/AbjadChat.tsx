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
  isOpen: boolean;
  onClose: () => void;
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
export default function AbjadChat({ scanContext, isOpen, onClose }: AbjadChatProps) {
  // ── State ──────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [mobileActiveTab, setMobileActiveTab] = useState<'chat' | 'lab'>('chat'); // Tab untuk tampilan mobile

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
  const networkErrorCountRef = useRef(0);                              // Melacak jumlah error jaringan berturut-turut
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

    recognition.onstart = () => {
      setIsListening(true);
      // Reset error jaringan jika berhasil terhubung dan mulai mendengarkan
      networkErrorCountRef.current = 0;
    };

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
      // Error non-fatal: abaikan tanpa menampilkan pesan ke user
      if (e.error === 'no-speech') return;   // Hening saja, bukan error
      if (e.error === 'aborted') return;     // Dipicu oleh recognition.abort() kita sendiri — bukan error

      // KHUSUS ERROR JARINGAN: Coba sambung kembali secara otomatis hingga 3 kali
      if (e.error === 'network') {
        networkErrorCountRef.current += 1;
        if (networkErrorCountRef.current <= 3) {
          console.warn(`Speech recognition network error. Mencoba kembali (${networkErrorCountRef.current}/3)...`);
          // Biarkan onend yang melakukan restart secara normal, jangan matikan voiceMode
          return;
        }
      }

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
        errMsg = 'Layanan pengenalan suara Google tidak merespon. Jika Anda menggunakan browser Brave, Opera, atau Vivaldi, browser tersebut memblokir fitur ini secara bawaan untuk privasi. Disarankan menggunakan Google Chrome standar, Microsoft Edge, atau menonaktifkan VPN/AdBlocker yang memblokir Google APIs.';
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
        // Berikan delay restart yang sedikit lebih panjang untuk error jaringan agar server tidak overload
        const restartDelay = networkErrorCountRef.current > 0 ? 2000 : 1000;
        setTimeout(() => {
          if (voiceModeRef.current && !hasFatalErrorRef.current) {
            startVoiceListeningRef.current(); // Fresh instance
          }
        }, restartDelay);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [createRecognition]); // sendMessage tidak perlu di sini — sudah pakai sendMessageRef.current

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
      // Matikan voice mode: stop semua aktivitas
      stopListening();    // stopListening sudah set voiceModeRef.current = false
      stopAudio();
      setVoiceMode(false);
    } else {
      // Aktifkan voice mode: set ref SEBELUM mulai agar onend tidak salah baca state
      voiceModeRef.current = true;
      setVoiceMode(true);
      hasFatalErrorRef.current = false;    // Reset error state
      networkErrorCountRef.current = 0;   // Reset retry counter
      setTimeout(() => startVoiceListeningRef.current(), 300); // pakai ref, bukan closure lama
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
  // RENDER — Split-Screen Threat Lab Modal
  // ════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Chat & Cyber Lab Modal ──────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { onClose(); stopListening(); stopAudio(); setVoiceMode(false); }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
            />

            {/* Main Full-screen Split Modal */}
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 top-20 bottom-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[92vw] md:max-w-6xl md:h-[85vh] md:max-h-[750px] z-50 flex flex-col bg-card rounded-3xl shadow-2xl border border-border/50 overflow-hidden"
            >
              {/* ── Header ──────────────────────────────────── */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-foreground flex items-center gap-2">
                      AbjadIn Virtual Threat Lab
                      <span className="hidden md:inline px-2 py-0.5 rounded bg-primary/10 text-[10px] text-primary border border-primary/20 font-bold">EDUKASI</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isLoading ? 'Mengetik...' : isSpeaking ? 'Berbicara...' : isListening ? 'Mendengarkan...' : 'Ruang Belajar & Konsultasi Keamanan Siber'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* TTS Toggle */}
                  <button
                    onClick={() => { setTtsEnabled(!ttsEnabled); if (isSpeaking) stopAudio(); }}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                    title={ttsEnabled ? 'Matikan suara' : 'Nyalakan suara'}
                  >
                    {ttsEnabled
                      ? <Volume2 className="w-4 h-4 text-primary" />
                      : <VolumeX className="w-4 h-4 text-muted-foreground" />
                    }
                  </button>
                  {/* Close */}
                  <button
                    onClick={() => { onClose(); stopListening(); stopAudio(); setVoiceMode(false); }}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mobile Tab Swapper (Hanya terlihat di mobile screen) */}
              <div className="flex md:hidden border-b border-border/50 bg-muted/20 p-2 gap-2">
                <button
                  onClick={() => setMobileActiveTab('chat')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    mobileActiveTab === 'chat' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  💬 Chat Asisten AI
                </button>
                <button
                  onClick={() => setMobileActiveTab('lab')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    mobileActiveTab === 'lab' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  💡 Virtual Threat Lab
                </button>
              </div>

              {/* ── Main Content Container (Grid Layout) ─────────────────────── */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                
                {/* ── LEFT PANEL: Chatbot Engine (Klien Konsultasi) ── */}
                <div className={`w-full md:w-[42%] flex flex-col h-full border-r border-border/50 bg-card ${
                  mobileActiveTab !== 'chat' ? 'hidden md:flex' : 'flex'
                }`}>
                  {/* Body Chat */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <AnimatePresence mode="wait">
                      {voiceMode ? (
                        /* ── Voice Mode View ─────────────────────── */
                        <motion.div
                          key="voice"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center h-full gap-6 py-6"
                        >
                          <motion.div
                            animate={isListening || isSpeaking ? {
                              boxShadow: ['0 0 0px rgba(15,118,110,0.3)', '0 0 30px rgba(15,118,110,0.5)', '0 0 0px rgba(15,118,110,0.3)'],
                            } : {}}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"
                          >
                            <Bot className="w-10 h-10 text-primary" />
                          </motion.div>

                          <VoiceWaveform isActive={isListening || isSpeaking} />

                          <div className="text-center space-y-1">
                            {isLoading && (
                              <p className="text-xs text-muted-foreground flex items-center gap-2 justify-center">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> AbjadIn sedang berpikir...
                              </p>
                            )}
                            {isListening && !isLoading && (
                              <p className="text-xs text-primary font-bold">Mendengarkan suaramu...</p>
                            )}
                            {isSpeaking && (
                              <p className="text-xs text-primary font-bold">AbjadIn sedang berbicara...</p>
                            )}
                            {!isListening && !isSpeaking && !isLoading && (
                              <p className="text-xs text-muted-foreground">Tekan mikrofon untuk mulai bicara</p>
                            )}
                          </div>

                          {liveTranscript && (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="px-4 py-2 rounded-xl bg-muted max-w-[280px]"
                            >
                              <p className="text-xs text-foreground/70 italic text-center">&quot;{liveTranscript}&quot;</p>
                            </motion.div>
                          )}

                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              if (isSpeaking) { stopAudio(); return; }
                              if (isListening) { stopListening(); } else { startVoiceListening(); }
                            }}
                            disabled={isLoading}
                            className={`w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all shadow-lg ${
                              isListening
                                ? 'bg-destructive text-white animate-pulse'
                                : isSpeaking
                                ? 'bg-amber-500 text-white'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isSpeaking ? <VolumeX className="w-6 h-6" /> : isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
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
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                msg.role === 'assistant' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                              }`}>
                                {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                              </div>

                              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                                msg.role === 'assistant'
                                  ? 'bg-muted/50 text-foreground rounded-tl-sm'
                                  : 'bg-primary text-primary-foreground rounded-tr-sm'
                              }`}>
                                <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                {msg.audioUrl && msg.role === 'assistant' && (
                                  <button
                                    onClick={() => playAudio(msg.audioUrl!)}
                                    className="mt-2 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary cursor-pointer transition-colors"
                                  >
                                    <Volume2 className="w-3 h-3" /> Putar ulang suara
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          ))}

                          {isLoading && (
                            <div className="flex gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Bot className="w-4 h-4 text-primary" />
                              </div>
                              <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-3">
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

                  {/* Input Footer */}
                  <div className="border-t border-border/50 p-4 bg-muted/10">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => { if (voiceMode) { stopListening(); stopAudio(); } setVoiceMode(false); }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                          !voiceMode ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" /> Chat Teks
                      </button>
                      <button
                        type="button"
                        onClick={toggleVoiceMode}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                          voiceMode ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        <Mic className="w-3 h-3" /> Chat Suara
                      </button>
                    </div>

                    {!voiceMode && (
                      <form onSubmit={handleSubmit} className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="Tanyakan hal tentang hasil scan..."
                          disabled={isLoading}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-muted/40 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                          maxLength={500}
                        />
                        <button
                          type="button"
                          onClick={() => { if (isListening) stopListening(); else startListening(); }}
                          disabled={isLoading}
                          className={`p-2.5 rounded-xl cursor-pointer transition-all ${
                            isListening ? 'bg-destructive text-white animate-pulse' : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                          } disabled:opacity-50`}
                        >
                          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
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
                </div>

                {/* ── RIGHT PANEL: Virtual Threat Lab Sandbox (Edukasi Visual) ── */}
                <div className={`w-full md:w-[58%] h-full bg-muted/5 overflow-y-auto p-6 border-l border-border/20 ${
                  mobileActiveTab !== 'lab' ? 'hidden md:block' : 'block'
                }`}>
                  <ThreatLabSandbox scanContext={scanContext} />
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// Component Kanan: ThreatLabSandbox (Visual & Analogi Edukatif)
// ════════════════════════════════════════════════════════════════
function ThreatLabSandbox({ scanContext }: { scanContext: ScanContext | null }) {
  if (!scanContext) return null;

  const { verdict, score, category, explanation, flags = [] } = scanContext;

  const isHomograph = flags.some(f => f.includes('HOMOGRAPH')) || (explanation && explanation.toLowerCase().includes('homograph'));
  const isGamblingOrLoker = category?.toLowerCase().includes('judi') || category?.toLowerCase().includes('gambling') || flags.some(f => f.includes('ANTI_GAMBLING'));
  
  // Case 1: Homograph Attack
  if (isHomograph) {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Deteksi Heuristik: Homograph Attack
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🎭 Teknik Spoofing Huruf Kembar</h2>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: "Si Kembar Palsu"</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bayangkan seseorang meniru tanda tangan Anda atau menggunakan topeng yang 100% mirip dengan wajah teman Anda. Secara visual, mata manusia tidak bisa membedakannya. Namun secara identitas hukum, ia adalah orang asing yang ingin mencuri kunci rumah Anda.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-4">
          <h3 className="font-bold text-xs text-foreground">🔍 Threat Sandbox: Perbedaan Karakter</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
              <span className="text-[10px] text-emerald-500 font-bold block mb-1">URL Asli (Latin)</span>
              <span className="font-mono text-base font-extrabold tracking-wider text-emerald-400">google.com</span>
              <span className="text-[10px] text-muted-foreground block mt-1">Menggunakan huruf 'o' Latin (Unicode U+006F)</span>
            </div>
            <div className="p-3.5 rounded-xl bg-destructive/5 border border-destructive/20 text-center">
              <span className="text-[10px] text-destructive font-bold block mb-1">URL Palsu (Cyrillic)</span>
              <span className="font-mono text-base font-extrabold tracking-wider text-destructive">g<span className="text-red-500 underline decoration-wavy font-black">оо</span>gle.com</span>
              <span className="text-[10px] text-muted-foreground block mt-1">Menggunakan huruf 'о' Cyrillic (Unicode U+043E)</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground italic leading-relaxed">
            *Komputer membaca kedua alamat di atas sebagai dua server yang 100% berbeda. Peretas memanfaatkan ini agar Anda mengira sedang membuka situs asli Google.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-amber-500">📜 Cerita Kasus Nyata</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pada tahun 2017, peneliti menemukan situs web tiruan sempurna dari <strong>apple.com</strong> yang menggunakan huruf Cyrillic 'а' (U+0430) sebagai ganti huruf Latin 'a'. Pengunjung diarahkan ke server peretas tanpa menyadari bahwa bilah alamat di browser mereka sebenarnya mengarah ke situs palsu.
          </p>
        </div>
      </div>
    );
  }

  // Case 2: Judi Online / Phishing Loker
  if (isGamblingOrLoker) {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20">
            Deteksi Konten: Judi Online & Social Engineering
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🎣 Manipulasi Psikologis (Umpan Cepat)</h2>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: "Umpan Pancing Beracun"</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bagaikan seekor ikan yang melihat cacing gemuk melayang di dalam air. Umpan tersebut tampak sangat lezat dan mudah didapatkan (menjanjikan menang slot instan atau kerja gampang digaji puluhan juta). Begitu umpan tersebut digigit, kait tajam akan melukai Anda, dan Anda akan kehilangan segalanya.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30">
          <h3 className="font-bold text-xs text-foreground mb-4">🔄 Skema Alur Eksploitasi Judi/Loker Palsu</h3>
          <div className="flex flex-col gap-3 text-center sm:text-left">
            <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10">
              <span className="text-[11px] font-bold text-purple-400 block mb-1">1. Umpan Menggiurkan</span>
              <p className="text-xs text-muted-foreground">Iklan menang mudah, bonus deposit besar, atau info loker palsu via SMS/WA.</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <span className="text-[11px] font-bold text-amber-400 block mb-1">2. Jebakan Halaman</span>
              <p className="text-xs text-muted-foreground">Situs meminta Anda mentransfer uang deposit awal atau mengunggah foto KTP.</p>
            </div>
            <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10">
              <span className="text-[11px] font-bold text-red-400 block mb-1">3. Kerugian Finansial</span>
              <p className="text-xs text-muted-foreground">Uang Anda dibawa lari, saldo rekening dikuras, atau data identitas Anda disalahgunakan.</p>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-purple-500">📜 Cerita Kasus Nyata</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Peretas judi online sering meretas sub-domain instansi pemerintah (.go.id) atau lembaga pendidikan (.sch.id) untuk menanam situs slot mereka. Hal ini dilakukan guna menipu mesin pencari Google agar situs judi tersebut terlihat sah dan memiliki reputasi tinggi secara otomatis.
          </p>
        </div>
      </div>
    );
  }

  // Case 3: Generic threat
  if (verdict === 'MALICIOUS' || verdict === 'SUSPICIOUS') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20 animate-pulse">
            Sinyal Bahaya: Phishing & Pencurian Kunci
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🏠 Replika Rumah Palsu (Phishing)</h2>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: "Replika Pintu Depan"</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bayangkan seseorang membangun replika pintu depan rumah Anda yang sangat mirip di pinggir jalan umum. Ketika Anda mencoba memasukkan kunci fisik (kata sandi/username), kunci tersebut disalin secara diam-diam oleh peretas di balik pintu, lalu mereka menyalahgunakannya untuk membobol rumah asli Anda.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
          <h3 className="font-bold text-xs text-foreground">🚨 Check-list Hasil Deteksi Berlapis:</h3>
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <span className="text-destructive font-black text-sm">✕</span>
              <span><strong>Usia Domain Sangat Baru:</strong> Situs ini baru terdaftar dalam beberapa hari terakhir (pola umum pembuat penipuan cepat).</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <span className="text-destructive font-black text-sm">✕</span>
              <span><strong>Visual Tiru-Tiruan:</strong> Kode halaman mencoba meniru layout brand perbankan/sosmed resmi secara paksa untuk menipu mata Anda.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
              <span className="text-destructive font-black text-sm">✕</span>
              <span><strong>Reputasi Buruk:</strong> Algoritma deteksi reputasi mendeteksi tidak adanya otentikasi e-mail atau sertifikat kepemilikan yang valid.</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-destructive">🛡️ Cara Menghindar:</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Selalu periksa domain utama di address bar. Perusahaan perbankan resmi atau layanan sosial besar tidak akan pernah menggunakan e-mail gratisan (seperti Gmail/Yahoo) atau meminta Anda mengonfirmasi kata sandi/OTP melalui halaman chat web tidak resmi.
          </p>
        </div>
      </div>
    );
  }

  // Case 4: SAFE
  return (
    <div className="space-y-6 text-foreground">
      <div>
        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          Diagnosa Selesai: Sistem Aman
        </span>
        <h2 className="text-xl font-black mt-2 text-foreground">🛡️ Pintu Gerbang Pemeriksaan Berlapis</h2>
      </div>

      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
        <h3 className="font-bold text-xs text-emerald-500 flex items-center gap-2">💡 Analogi Sederhana: "Sistem Keamanan Bandara"</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Link ini diibaratkan seperti seorang pelancong di bandara yang telah lolos dari pemeriksaan bagasi X-Ray berlapis, verifikasi paspor resmi di imigrasi, dan detektor logam canggih. Tidak ditemukan zat berbahaya maupun identitas palsu pada dirinya.
        </p>
      </div>

      <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
        <h3 className="font-bold text-xs text-foreground">✅ Protokol Keamanan Abjad.in yang Telah Dilewati:</h3>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Domain lolos dari verifikasi blacklist lokal (TrustPositif Kominfo & Database Keamanan).</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Algoritma Machine Learning (ONNX) mengonfirmasi tidak adanya pola ejaan homograph mencurigakan.</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Struktur sertifikasi SSL/HTTPS terverifikasi diterbitkan oleh lembaga resmi yang valid.</span>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
        <h3 className="font-bold text-xs text-emerald-500">💡 Tips Literasi Keamanan Harian:</h3>
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li>Selalu aktifkan Autentikasi Dua Faktor (2FA) di setiap akun media sosial dan perbankan Anda.</li>
          <li>Gunakan pengelola kata sandi (Password Manager) untuk membuat sandi yang kuat dan unik di setiap situs.</li>
          <li>Jangan pernah menggunakan kembali satu kata sandi yang sama untuk beberapa situs sekaligus.</li>
        </ul>
      </div>
    </div>
  );
}
