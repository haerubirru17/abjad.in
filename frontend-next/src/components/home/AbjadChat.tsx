'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mic, MicOff, Send, Bot, User, Volume2,
  VolumeX, MessageSquare, Loader2, Maximize2, Minimize2
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
// Helper: Deteksi topik dari teks jawaban AI untuk sinkronisasi panel kanan
// ════════════════════════════════════════════════════════════════
function detectTopicFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes('homograph') || t.includes('karakter palsu') || t.includes('cyrillic') || t.includes('spoofing huruf')) return 'HOMOGRAPH';
  if (t.includes('judi') || t.includes('slot') || t.includes('gacor') || t.includes('maxwin') || t.includes('togel') || t.includes('scatter')) return 'JUDOL';
  if (t.includes('phishing') || t.includes('pencurian data') || t.includes('halaman login palsu') || t.includes('website palsu')) return 'PHISHING';
  if (t.includes('malware') || t.includes('virus') || t.includes('spyware') || t.includes('ransomware') || t.includes('keylogger')) return 'MALWARE';
  if (t.includes('pemendek url') || t.includes('bit.ly') || t.includes('shortener') || t.includes('link pendek') || t.includes('s.id')) return 'URL_SHORTENER';
  if (t.includes('rekayasa sosial') || t.includes('social engineering') || t.includes('manipulasi psikologis') || t.includes('urgensi palsu')) return 'SOCIAL_ENGINEERING';
  if (t.includes('tld') || t.includes('top-level domain') || t.includes('ekstensi domain') || t.includes('apa itu url') || t.includes('arti url') || t.includes('singkatan url') || t.includes('subdomain') || t.includes('protokol') || t.includes('https') || t.includes('gembok ssl') || t.includes('apa itu web') || t.includes('apa itu domain') || t.includes('struktur url') || t.includes('anatomi url')) return 'TECH_BASICS';
  return null;
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
  const [activeLabTopic, setActiveLabTopic] = useState<string | null>(null); // Remote control panel kanan
  const [isLabUpdating, setIsLabUpdating] = useState(false); // Animasi update panel kanan
  const [isMaximized, setIsMaximized] = useState(true); // Default: full screen

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
  const isTransitioningRef = useRef(false);                            // Cegah mic restart saat transisi (kirim/bicara)
  const startVoiceListeningRef = useRef<() => void>(() => {});
  const sendMessageRef = useRef<(text: string) => void>(() => {});     // Bug #1: anti stale-closure

  // ── stopMic: matikan mikrofon TANPA mengubah voiceMode ────
  // Digunakan saat transisi: kirim pesan, AI bicara, dsb.
  const stopMicRef = useRef<() => void>(() => {});
  const stopMic = useCallback(() => {
    isTransitioningRef.current = true; // Cegah onend dari restart mic
    if (vadTimerRef.current) { clearTimeout(vadTimerRef.current); vadTimerRef.current = null; }
    accumulatedTextRef.current = '';
    if (recognitionRef.current) {
      try { (recognitionRef.current as any).abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setLiveTranscript('');
    // Reset transitioning setelah delay agar onend punya waktu fire
    setTimeout(() => { isTransitioningRef.current = false; }, 200);
  }, []);

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

  // ── Greeting saat pertama buka — berisi Scan Summary kontekstual ────────────────
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      let greeting: string;
      if (scanContext?.verdict) {
        const verdictEmoji = scanContext.verdict === 'MALICIOUS' ? '🚨' : scanContext.verdict === 'SUSPICIOUS' ? '⚠️' : '✅';
        const verdictLabel = scanContext.verdict === 'MALICIOUS' ? 'BERBAHAYA' : scanContext.verdict === 'SUSPICIOUS' ? 'MENCURIGAKAN' : 'AMAN';
        const scoreText = scanContext.score !== undefined ? ` (Skor Ancaman: ${scanContext.score}/100)` : '';
        const categoryText = scanContext.category ? `\nKategori Ancaman: ${scanContext.category}` : '';
        const snippetText = scanContext.explanation
          ? `\n\n📋 Ringkasan: ${scanContext.explanation.slice(0, 220)}${scanContext.explanation.length > 220 ? '...' : ''}`
          : '';
        const panelHint = scanContext.verdict !== 'SAFE'
          ? '\n\n👉 Panel kanan sudah menampilkan analogi visual & penjelasan untuk kasus ini. Klik tombol "Tanya AI tentang ini" di sana, atau langsung tanya di bawah!'
          : '\n\n👉 Meskipun link ini aman, kamu bisa tanya apa saja seputar keamanan digital — aku siap membantu!';
        greeting = `${verdictEmoji} Hai! Aku sudah menganalisis hasil scan kamu.\n\nStatus: ${verdictLabel}${scoreText}${categoryText}${snippetText}${panelHint}`;
      } else {
        greeting = `Halo! Aku AbjadIn, asisten keamanan digitalmu. Kamu bisa tanya apa saja seputar keamanan online. Atau scan dulu link yang ingin kamu periksa ya!`;
      }
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

    // ★ MATIKAN MIC sebelum kirim — cegah feedback loop
    if (voiceModeRef.current) {
      stopMicRef.current();
    }

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

      // ── Sinkronisasi panel kanan: deteksi topik dari jawaban AI ──
      const detectedTopic = detectTopicFromText(data.reply);
      if (detectedTopic) {
        setIsLabUpdating(true);
        setTimeout(() => {
          setActiveLabTopic(detectedTopic);
          setIsLabUpdating(false);
        }, 400);
      }

      // Voice mode: auto-play audio (natural conversation flow)
      // Chat mode:  TIDAK auto-play — user bisa tekan tombol "Putar ulang" jika mau
      if (ttsEnabledRef.current && voiceModeRef.current) {
        if (data.audioBase64) {
          // Cloud TTS tersedia → pakai WaveNet, restart mic setelah selesai
          playAudio(data.audioBase64, () => {
            if (voiceModeRef.current && !isLoadingRef.current) {
              setTimeout(() => startVoiceListeningRef.current(), 400);
            }
          });
        } else {
          // Fallback: browser TTS jika tidak ada API key
          speakBrowser(data.reply);
        }
      } else if (voiceModeRef.current) {
        // TTS dimatikan tapi masih voice mode → restart mic langsung
        setTimeout(() => startVoiceListeningRef.current(), 400);
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Maaf, ${errMsg}. Coba lagi ya.`,
      }]);
      // Jika error di voice mode, restart listening
      if (voiceModeRef.current) {
        setTimeout(() => startVoiceListeningRef.current(), 800);
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false; // Bug #2: release flag setelah selesai
    }
  }, [isLoading, messages, scanContext]);

  // Sync refs agar callbacks speech recognition selalu pakai versi terbaru
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);
  useEffect(() => { stopMicRef.current = stopMic; }, [stopMic]);

  // ── Browser TTS (INSTANT — Web Speech SynthesisAPI) ───────
  // Dipakai di voice mode: tidak perlu network, langsung bicara
  const speakBrowser = useCallback((text: string) => {
    if (!ttsEnabledRef.current) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // ★ MATIKAN MIC sebelum AI mulai bicara — cegah feedback loop
    stopMicRef.current();

    // Hentikan utterance & watchdog sebelumnya
    if (uttWatchdogRef.current) { clearInterval(uttWatchdogRef.current); uttWatchdogRef.current = null; }
    window.speechSynthesis.cancel();

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
        setTimeout(() => startVoiceListeningRef.current(), 400);
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
    // ★ MATIKAN MIC sebelum audio AI diputar — cegah feedback loop
    stopMicRef.current();
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
      // Hanya trigger barge-in jika ada transkrip yang bermakna (>= 2 karakter)
      const hasTranscript = event.results.length > 0 && event.results[event.resultIndex][0].transcript.trim().length >= 2;
      if (hasTranscript && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
        setIsSpeaking(false);
      }
      // Bug #3: BARGE-IN browser TTS — cancel langsung jika user mulai bicara
      if (hasTranscript && typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
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

      const currentFullText = accumulatedTextRef.current + (interim ? ' ' + interim : '');
      setLiveTranscript(currentFullText);

      // ★ VAD 2200ms — dipicu oleh FINAL maupun INTERIM text
      // Ini memastikan VAD tetap responsif meski browser lambat mengirim status final
      if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
      const candidateText = accumulatedTextRef.current.trim() || currentFullText.trim();
      if (candidateText && candidateText.length >= 3) {
        vadTimerRef.current = setTimeout(() => {
          // Ambil teks terbaik: prioritaskan final, fallback ke interim
          const toSend = accumulatedTextRef.current.trim() || currentFullText.trim();
          if (toSend && toSend.length >= 3) {
            accumulatedTextRef.current = '';
            setLiveTranscript('');
            sendMessageRef.current(toSend); // sendMessage akan memanggil stopMic
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
      // ★ JANGAN restart jika sedang transisi (kirim pesan / AI bicara)
      if (isTransitioningRef.current) return;
      // Hanya restart jika: voice mode aktif, tidak loading, tidak submit, & TIDAK ada error fatal
      if (voiceModeRef.current && !isLoadingRef.current && !isSubmittingRef.current && !hasFatalErrorRef.current) {
        // Berikan delay restart yang sedikit lebih panjang untuk error jaringan agar server tidak overload
        const restartDelay = networkErrorCountRef.current > 0 ? 2000 : 1000;
        setTimeout(() => {
          if (voiceModeRef.current && !hasFatalErrorRef.current && !isTransitioningRef.current) {
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

            {/* Main Split Modal — ukuran responsif berdasarkan isMaximized */}
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`fixed z-50 flex flex-col bg-card shadow-2xl border border-border/50 overflow-hidden transition-all duration-300 ${
                isMaximized
                  ? 'inset-2 md:inset-4 rounded-2xl'
                  : 'inset-x-4 top-20 bottom-4 md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[92vw] md:max-w-6xl md:h-[85vh] md:max-h-[750px] rounded-3xl'
              }`}
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
                  {/* Minimize / Maximize toggle */}
                  <button
                    onClick={() => setIsMaximized(!isMaximized)}
                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                    title={isMaximized ? 'Perkecil jendela' : 'Perbesar jendela'}
                  >
                    {isMaximized
                      ? <Minimize2 className="w-4 h-4" />
                      : <Maximize2 className="w-4 h-4" />
                    }
                  </button>
                  {/* Close */}
                  <button
                    onClick={() => { onClose(); stopListening(); stopAudio(); setVoiceMode(false); }}
                    className="p-2 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer text-muted-foreground"
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
                <div className={`w-full md:w-[58%] h-full bg-muted/5 overflow-y-auto border-l border-border/20 flex flex-col ${
                  mobileActiveTab !== 'lab' ? 'hidden md:flex' : 'flex'
                }`}>
                  {/* Mini header panel kanan dengan Live indicator */}
                  <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-2.5 border-b border-border/30 bg-card/80 backdrop-blur-sm flex-shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">💡 Virtual Threat Lab</span>
                    {isLabUpdating ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping inline-block" />
                        Memperbarui...
                      </span>
                    ) : activeLabTopic ? (
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                        Live
                      </span>
                    ) : null}
                  </div>
                  <div className="flex-1 overflow-y-auto p-6">
                    <motion.div
                      key={activeLabTopic || 'default'}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ThreatLabSandbox
                        scanContext={scanContext}
                        activeTopicOverride={activeLabTopic}
                        onAskAbout={(question) => {
                          setMobileActiveTab('chat');
                          sendMessageRef.current(question);
                        }}
                      />
                    </motion.div>
                  </div>
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
// Component Kanan: ThreatLabSandbox — terintegrasi dengan AI Chat
// Props: activeTopicOverride mengoverride tampilan berdasarkan
// topik yang dideteksi dari percakapan AI (dua arah)
// ════════════════════════════════════════════════════════════════
function ThreatLabSandbox({
  scanContext,
  activeTopicOverride,
  onAskAbout,
}: {
  scanContext: ScanContext | null;
  activeTopicOverride: string | null;
  onAskAbout: (question: string) => void;
}) {
  if (!scanContext) return null;

  const { verdict, category, explanation, flags = [] } = scanContext;

  // ── Resolve case: topicOverride dari AI mengoverride logika default ──
  type LabCase = 'homograph' | 'judol' | 'phishing' | 'safe' | 'malware' | 'shortener' | 'social' | 'basics';

  let activeCase: LabCase;
  if (activeTopicOverride) {
    const topicMap: Record<string, LabCase> = {
      HOMOGRAPH: 'homograph',
      JUDOL: 'judol',
      PHISHING: 'phishing',
      MALWARE: 'malware',
      URL_SHORTENER: 'shortener',
      SOCIAL_ENGINEERING: 'social',
      TECH_BASICS: 'basics',
    };
    activeCase = topicMap[activeTopicOverride] ?? (verdict === 'SAFE' ? 'safe' : 'phishing');
  } else {
    const isHomograph = flags.some(f => f.includes('HOMOGRAPH')) || !!(explanation?.toLowerCase().includes('homograph'));
    const isGambling = category?.toLowerCase().includes('judi') || category?.toLowerCase().includes('gambling') || flags.some(f => f.includes('ANTI_GAMBLING'));
    if (isHomograph) activeCase = 'homograph';
    else if (isGambling) activeCase = 'judol';
    else if (verdict === 'MALICIOUS' || verdict === 'SUSPICIOUS') activeCase = 'phishing';
    else activeCase = 'safe';
  }

  // ── Tombol Tanya AI — reusable di semua modul ──
  function AskAIButton({ question, label }: { question: string; label?: string }) {
    return (
      <button
        onClick={() => onAskAbout(question)}
        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-bold transition-all cursor-pointer group"
      >
        <span className="text-sm">💬</span>
        <span>{label || 'Tanya AI tentang ini →'}</span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-[10px]">↵</span>
      </button>
    );
  }

  // ── Case 1: Homograph Attack ──
  if (activeCase === 'homograph') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Deteksi Heuristik: Homograph Attack
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🎭 Teknik Spoofing Huruf Kembar</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Si Kembar Palsu&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bayangkan seseorang meniru tanda tangan Anda atau menggunakan topeng yang 100% mirip dengan wajah teman Anda. Secara visual, mata manusia tidak bisa membedakannya. Namun secara identitas hukum, ia adalah orang asing yang ingin mencuri kunci rumah Anda.
          </p>
          <AskAIButton question="Jelaskan lebih detail tentang teknik Homograph Attack dan bagaimana cara mendeteksinya?" />
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-4">
          <h3 className="font-bold text-xs text-foreground">🔍 Threat Sandbox: Perbedaan Karakter</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
              <span className="text-[10px] text-emerald-500 font-bold block mb-1">URL Asli (Latin)</span>
              <span className="font-mono text-base font-extrabold tracking-wider text-emerald-400">google.com</span>
              <span className="text-[10px] text-muted-foreground block mt-1">Huruf &apos;o&apos; Latin (Unicode U+006F)</span>
            </div>
            <div className="p-3.5 rounded-xl bg-destructive/5 border border-destructive/20 text-center">
              <span className="text-[10px] text-destructive font-bold block mb-1">URL Palsu (Cyrillic)</span>
              <span className="font-mono text-base font-extrabold tracking-wider text-destructive">g<span className="text-red-500 underline decoration-wavy font-black">оо</span>gle.com</span>
              <span className="text-[10px] text-muted-foreground block mt-1">Huruf &apos;о&apos; Cyrillic (Unicode U+043E)</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground italic leading-relaxed">
            *Komputer membaca kedua alamat sebagai dua server berbeda. Peretas memanfaatkan ini agar Anda mengira sedang di situs asli.
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-amber-500">📜 Cerita Kasus Nyata</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pada tahun 2017, peneliti menemukan situs tiruan <strong>apple.com</strong> menggunakan huruf Cyrillic &apos;а&apos; (U+0430) sebagai ganti huruf Latin &apos;a&apos;. Pengunjung diarahkan ke server peretas tanpa sadar.
          </p>
          <AskAIButton question="Bagaimana cara melindungi diri dari serangan Homograph? Apa yang harus aku lakukan jika menerima link mencurigakan?" label="Minta saran perlindungan dari AI →" />
        </div>
      </div>
    );
  }

  // ── Case 2: Judi Online ──
  if (activeCase === 'judol') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20">
            Deteksi Konten: Judi Online & Social Engineering
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🎣 Manipulasi Psikologis (Umpan Cepat)</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Umpan Pancing Beracun&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bagaikan seekor ikan yang melihat cacing gemuk melayang di dalam air. Umpan tampak sangat lezat (menang slot instan, gaji puluhan juta). Begitu digigit, kait tajam melukai Anda dan Anda kehilangan segalanya.
          </p>
          <AskAIButton question="Mengapa judi online selalu merugikan secara matematis? Apa maksud istilah slot gacor dan maxwin?" />
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30">
          <h3 className="font-bold text-xs text-foreground mb-4">🔄 Skema Alur Eksploitasi Judi/Loker Palsu</h3>
          <div className="flex flex-col gap-3">
            {[
              { step: '1. Umpan Menggiurkan', desc: 'Iklan menang mudah, bonus deposit besar, atau info loker palsu via SMS/WA.', color: 'purple' },
              { step: '2. Jebakan Halaman', desc: 'Situs meminta transfer deposit awal atau unggah foto KTP.', color: 'amber' },
              { step: '3. Kerugian Finansial', desc: 'Uang dibawa lari, rekening dikuras, atau data identitas disalahgunakan.', color: 'red' },
            ].map((item, i) => (
              <div key={i} className={`p-3 rounded-xl bg-${item.color}-500/5 border border-${item.color}-500/10`}>
                <span className={`text-[11px] font-bold text-${item.color}-400 block mb-1`}>{item.step}</span>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-purple-500">📜 Cerita Kasus Nyata</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Peretas judi online sering meretas sub-domain instansi pemerintah (.go.id) untuk menanam situs slot agar terlihat sah di mesin pencari Google.
          </p>
          <AskAIButton question="Bagaimana cara melaporkan situs judi online? Dan bagaimana memblokir kiriman link judi dari orang lain?" label="Minta cara melaporkan ke AI →" />
        </div>
      </div>
    );
  }

  // ── Case 3: Malware ──
  if (activeCase === 'malware') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
            Deteksi Ancaman: Malware / Perangkat Lunak Berbahaya
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🦠 Virus Digital — Spyware & Ransomware</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Parasit Tak Kasat Mata&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bayangkan seseorang diam-diam memasang kamera tersembunyi di rumahmu dan merekam semua aktivitasmu — termasuk saat kamu memasukkan PIN ATM. Begitulah spyware bekerja di perangkatmu, tanpa terlihat dan tanpa kamu sadari.
          </p>
          <AskAIButton question="Apa perbedaan antara virus, spyware, dan ransomware? Bagaimana cara tahu apakah perangkatku sudah terinfeksi?" />
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
          <h3 className="font-bold text-xs text-foreground">⚠️ Tanda-tanda Perangkat Terinfeksi:</h3>
          <div className="space-y-2">
            {[
              'Baterai cepat habis padahal jarang dipakai',
              'HP terasa panas meski tidak menjalankan aplikasi berat',
              'Ada aplikasi asing yang tidak kamu instal',
              'Data internet habis lebih cepat dari biasanya',
              'Performa HP tiba-tiba melambat drastis',
            ].map((sign, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-red-500 font-black">✕</span>
                <span>{sign}</span>
              </div>
            ))}
          </div>
          <AskAIButton question="Apa yang harus aku lakukan jika curiga HP atau komputerku terkena malware? Langkah pertama yang harus dilakukan?" label="Minta langkah darurat dari AI →" />
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-red-500">🛡️ Cara Pencegahan:</h3>
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            <li>Jangan install APK dari luar Play Store / App Store</li>
            <li>Selalu update sistem operasi dan aplikasi secara rutin</li>
            <li>Jangan klik link download dari WhatsApp/SMS yang tidak dikenal</li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Case 4: URL Shortener ──
  if (activeCase === 'shortener') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            Deteksi Teknik: Pemendek URL Berbahaya
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🔗 Link Tersembunyi — Apa yang Disembunyikan?</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Amplop Tertutup&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Menerima link pendek seperti menerima amplop tertutup dari orang tak dikenal. Kamu tidak tahu isinya sebelum membuka — surat resmi, atau tagihan palsu? Abjad.in membuka amplop itu untuk kamu, tanpa risiko.
          </p>
          <AskAIButton question="Apa itu pemendek URL seperti bit.ly dan s.id? Apakah semua link pendek berbahaya?" />
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
          <h3 className="font-bold text-xs text-foreground">🔍 Layanan yang Sering Disalahgunakan:</h3>
          <div className="grid grid-cols-3 gap-2">
            {['bit.ly', 's.id', 'cutt.ly', 'tinyurl.com', 'ow.ly', 'rb.gy'].map(svc => (
              <div key={svc} className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10 text-center">
                <span className="font-mono text-xs text-amber-500 font-bold">{svc}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground italic">*Layanan ini sah, tapi sering disalahgunakan penipu karena menyembunyikan tujuan link.</p>
          <AskAIButton question="Bagaimana cara melihat kemana sebenarnya sebuah link pendek mengarah tanpa harus mengkliknya?" label="Minta cara cek aman ke AI →" />
        </div>
      </div>
    );
  }

  // ── Case 5: Social Engineering ──
  if (activeCase === 'social') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">
            Deteksi Psikologis: Manipulasi Emosi
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🧠 Rekayasa Sosial — Menyerang Pikiran, Bukan Komputer</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Penipu Berseragam&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bayangkan seseorang berseragam petugas bank datang ke rumahmu dan bilang &quot;Rekening Anda akan diblokir dalam 10 menit — serahkan buku tabungan Anda sekarang!&quot; Kepanikan membuatmu tunduk tanpa bertanya. Itulah persis cara kerja social engineering digital.
          </p>
          <AskAIButton question="Apa saja contoh nyata teknik social engineering yang sering terjadi di Indonesia?" />
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
          <h3 className="font-bold text-xs text-foreground">🎭 Taktik Manipulasi yang Umum:</h3>
          <div className="space-y-2">
            {[
              { label: 'Urgensi Palsu', desc: '"Rekening diblokir dalam 5 menit!"' },
              { label: 'Iming-iming Hadiah', desc: '"Kamu terpilih menang undian Rp 50 juta!"' },
              { label: 'Ancaman Hukum', desc: '"Kamu akan dilaporkan ke polisi jika tidak transfer!"' },
              { label: 'Penyamaran Brand', desc: '"CS BCA/Shopee" meminta OTP via chat.' },
            ].map((t, i) => (
              <div key={i} className="p-2.5 rounded-xl bg-orange-500/5 border border-orange-500/10">
                <span className="text-[11px] font-bold text-orange-400 block">{t.label}</span>
                <span className="text-[10px] text-muted-foreground italic">{t.desc}</span>
              </div>
            ))}
          </div>
          <AskAIButton question="Bagaimana cara mengenali dan melawan teknik manipulasi psikologis dalam penipuan digital?" label="Minta strategi perlindungan dari AI →" />
        </div>
      </div>
    );
  }

  // ── Case 6: Generic Phishing (MALICIOUS/SUSPICIOUS) ──
  if (activeCase === 'phishing') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20 animate-pulse">
            Sinyal Bahaya: Phishing & Pencurian Kunci
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🏠 Replika Rumah Palsu (Phishing)</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Replika Pintu Depan&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bayangkan seseorang membangun replika pintu depan rumah Anda yang sangat mirip di pinggir jalan umum. Ketika Anda memasukkan kunci fisik (kata sandi/username), kunci tersebut disalin diam-diam oleh peretas di balik pintu, lalu digunakan untuk membobol rumah asli Anda.
          </p>
          <AskAIButton question="Bagaimana cara mengenali website phishing? Apa tanda-tanda yang harus diwaspadai?" />
        </div>
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
          <h3 className="font-bold text-xs text-foreground">🚨 Check-list Hasil Deteksi Berlapis:</h3>
          <div className="space-y-2">
            {[
              { label: 'Usia Domain Sangat Baru', desc: 'Situs baru terdaftar beberapa hari terakhir — pola umum penipuan cepat.' },
              { label: 'Visual Tiru-Tiruan', desc: 'Kode halaman meniru layout brand perbankan/sosmed resmi untuk menipu mata.' },
              { label: 'Reputasi Buruk', desc: 'Tidak ada otentikasi e-mail atau sertifikat kepemilikan yang valid.' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <span className="text-destructive font-black">✕</span>
                <span><strong>{item.label}:</strong> {item.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-destructive">🛡️ Cara Menghindar:</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Selalu periksa domain utama di address bar. Perusahaan perbankan resmi tidak pernah meminta konfirmasi kata sandi/OTP melalui link chat atau SMS.
          </p>
          <AskAIButton question="Jika saya sudah terlanjur memasukkan data di website phishing, apa yang harus saya lakukan sekarang?" label="Minta bantuan darurat dari AI →" />
        </div>
      </div>
    );
  }

  // ── Case 8: Basics (URL / Domain / SSL / TLD / IP) ──
  if (activeCase === 'basics') {
    const colorMap: Record<string, { bg: string; border: string; text: string }> = {
      emerald: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-500' },
      indigo: { bg: 'bg-indigo-500/5', border: 'border-indigo-500/10', text: 'text-indigo-500' },
      blue: { bg: 'bg-blue-500/5', border: 'border-blue-500/10', text: 'text-blue-500' },
      purple: { bg: 'bg-purple-500/5', border: 'border-purple-500/10', text: 'text-purple-500' },
      amber: { bg: 'bg-amber-500/5', border: 'border-amber-500/10', text: 'text-amber-500' },
    };

    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            Literasi Dasar: Infrastruktur Web
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">🔍 Anatomi & Struktur URL Website</h2>
        </div>

        {/* Anatomizer URL Visual */}
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-4 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Anatomi URL: https://sub.domain.com/path</h3>
          <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] sm:text-xs bg-muted/50 p-3 rounded-xl justify-center">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-bold" title="Protokol Keamanan (SSL/HTTPS)">https://</span>
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 font-bold" title="Subdomain">sub.</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold" title="Domain Utama">domain</span>
            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 border border-purple-500/20 font-bold" title="Top-Level Domain (TLD)">.com</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 font-bold" title="Path / Jalur Halaman">/path</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sama seperti alamat rumah Anda (Negara → Kota → Jalan → Nomor), alamat website (URL) memiliki struktur teratur yang membantu komputermu mencari server tujuan tanpa tersesat.
          </p>
        </div>

        {/* Breakdown Komponen URL */}
        <div className="space-y-2">
          {[
            {
              term: '1. Protokol (https:// vs http://)',
              desc: 'Aturan komunikasi data. HTTPS (dengan "S" = Secure) berarti koneksi dienkripsi dengan SSL (ikon gembok). http:// tanpa enkripsi sangat rawan disadap.',
              color: 'emerald',
            },
            {
              term: '2. Subdomain (contoh: sub.)',
              desc: 'Sub-bagian dari domain utama. Penipu sering memanfaatkannya untuk menyamarkan domain asli (contoh: login.klikbca.com.penipu.xyz — domain aslinya adalah penipu.xyz, bukan klikbca.com).',
              color: 'indigo',
            },
            {
              term: '3. Domain Utama',
              desc: 'Identitas utama website (seperti tokopedia, google, bca). Bagian ini harus didaftarkan dan dibayar secara resmi untuk kepemilikan.',
              color: 'blue',
            },
            {
              term: '4. TLD (Top-Level Domain / Ekstensi)',
              desc: 'Akhiran domain. TLD resmi lokal seperti .go.id (pemerintah) atau .ac.id (kampus) diawasi ketat. TLD murah seperti .xyz, .top, atau .win sering dibeli massal oleh peretas.',
              color: 'purple',
            },
            {
              term: '5. Path / Jalur Halaman (contoh: /path)',
              desc: 'Lokasi folder spesifik di server. Contoh: /login atau /promo.',
              color: 'amber',
            },
          ].map((item, i) => {
            const clr = colorMap[item.color] || colorMap.blue;
            return (
              <div key={i} className={`p-3.5 rounded-xl ${clr.bg} border ${clr.border}`}>
                <span className={`text-xs font-bold ${clr.text} block mb-1`}>{item.term}</span>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Tanya AI */}
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-primary">Tanya lebih lanjut seputar dasar web:</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => onAskAbout('Jelaskan apa bedanya HTTP dan HTTPS secara teknis dan apa risikonya jika mengakses http?')}
              className="px-3 py-2 text-[10px] text-left text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 rounded-lg transition-all"
            >
              💬 Apa bedanya HTTP vs HTTPS?
            </button>
            <button
              onClick={() => onAskAbout('Bagaimana cara membedakan mana subdomain dan mana domain utama pada link yang panjang agar tidak tertipu?')}
              className="px-3 py-2 text-[10px] text-left text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 rounded-lg transition-all"
            >
              💬 Cara bedakan domain & subdomain?
            </button>
            <button
              onClick={() => onAskAbout('Apa saja jenis-jenis TLD (ekstensi domain) di Indonesia yang diawasi ketat pemerintah dan mana yang berisiko tinggi?')}
              className="px-3 py-2 text-[10px] text-left text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 rounded-lg transition-all"
            >
              💬 Jenis-jenis TLD (Ekstensi Domain)
            </button>
            <button
              onClick={() => onAskAbout('Apa itu Alamat IP (IP Address) dan hubungannya dengan nama domain di internet?')}
              className="px-3 py-2 text-[10px] text-left text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 rounded-lg transition-all"
            >
              💬 Hubungan Domain & Alamat IP
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Case 9: SAFE ──
  return (
    <div className="space-y-6 text-foreground">
      <div>
        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
          Diagnosa Selesai: Sistem Aman
        </span>
        <h2 className="text-xl font-black mt-2 text-foreground">🛡️ Pintu Gerbang Pemeriksaan Berlapis</h2>
      </div>
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
        <h3 className="font-bold text-xs text-emerald-500 flex items-center gap-2">💡 Analogi Sederhana: &quot;Sistem Keamanan Bandara&quot;</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Link ini diibaratkan seperti seorang pelancong di bandara yang telah lolos dari pemeriksaan X-Ray berlapis, verifikasi paspor, dan detektor logam canggih. Tidak ditemukan ancaman apapun.
        </p>
        <AskAIButton question="Meskipun link ini aman, apa yang tetap harus aku waspadai saat browsing sehari-hari?" />
      </div>
      <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
        <h3 className="font-bold text-xs text-foreground">✅ Protokol Keamanan Abjad.in yang Telah Dilewati:</h3>
        <div className="space-y-2.5">
          {[
            'Domain lolos dari verifikasi blacklist lokal (TrustPositif Kominfo & Database Keamanan).',
            'Algoritma Machine Learning (ONNX) mengonfirmasi tidak adanya pola ejaan homograph mencurigakan.',
            'Struktur sertifikasi SSL/HTTPS terverifikasi diterbitkan oleh lembaga resmi yang valid.',
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-emerald-500 font-bold">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
        <h3 className="font-bold text-xs text-emerald-500">💡 Tips Literasi Keamanan Harian:</h3>
        <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
          <li>Selalu aktifkan Autentikasi Dua Faktor (2FA) di setiap akun media sosial dan perbankan Anda.</li>
          <li>Gunakan pengelola kata sandi (Password Manager) untuk membuat sandi yang kuat dan unik di setiap situs.</li>
          <li>Jangan pernah menggunakan kembali satu kata sandi yang sama untuk beberapa situs sekaligus.</li>
        </ul>
        <AskAIButton question="Apa tips keamanan digital paling penting yang harus diterapkan sehari-hari untuk melindungi akun dan data pribadi?" label="Minta tips lengkap dari AI →" />
      </div>
    </div>
  );
}
