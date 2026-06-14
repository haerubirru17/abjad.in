'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Mic, MicOff, Send, Bot, User, Volume2,
  VolumeX, MessageSquare, Loader2, Maximize2, Minimize2,
  History, Plus, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThreatLabSandbox from './ThreatLabSandbox';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════
interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  audioUrl?: string | null;
}

interface ChatSession {
  id: string;
  timestamp: number;
  title: string;
  messages: ChatMessage[];
  scanContext?: ScanContext | null;
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
  if (t.includes('apk') || t.includes('kurir') || t.includes('undangan nikah') || t.includes('aplikasi palsu')) return 'APK_VIRUS';
  if (t.includes('malware') || t.includes('virus') || t.includes('spyware') || t.includes('ransomware') || t.includes('keylogger')) return 'MALWARE';
  if (t.includes('kebocoran data') || t.includes('bocor') || t.includes('data breach') || t.includes('dark web') || t.includes('nik bocor')) return 'DATA_LEAK';
  if (t.includes('dns') || t.includes('wifi') || t.includes('spoofing dns') || t.includes('mitm') || t.includes('pembajakan wifi')) return 'DNS_SPOOFING';
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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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

  // ── Helper: Cek kesamaan context scan ──────────────────────
  const isSameContext = useCallback((a: ScanContext | null | undefined, b: ScanContext | null | undefined) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.verdict === b.verdict && a.score === b.score && a.explanation === b.explanation;
  }, []);

  // ── Fungsi Sesi Baru ──────────────────────────────────────
  const startNewSession = useCallback((context: ScanContext | null = null) => {
    const newId = `session_${Date.now()}`;
    let title = 'Tanya Jawab Umum';
    if (context?.verdict) {
      const label = context.verdict === 'MALICIOUS' ? 'Berbahaya' : context.verdict === 'SUSPICIOUS' ? 'Mencurigakan' : 'Aman';
      title = `Scan: ${label} (${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`;
    }
    
    // greeting message
    let greeting: string;
    if (context?.verdict) {
      const verdictEmoji = context.verdict === 'MALICIOUS' ? '🚨' : context.verdict === 'SUSPICIOUS' ? '⚠️' : '✅';
      const verdictLabel = context.verdict === 'MALICIOUS' ? 'BERBAHAYA' : context.verdict === 'SUSPICIOUS' ? 'MENCURIGAKAN' : 'AMAN';
      const scoreText = context.score !== undefined ? ` (Skor Ancaman: ${context.score}/100)` : '';
      // Kategori Ancaman hanya dimunculkan jika verdict bukan SAFE
      const categoryText = context.category && context.verdict !== 'SAFE'
        ? `\nKategori Ancaman: ${context.category}`
        : '';
      const snippetText = context.explanation
        ? `\n\n📋 Ringkasan: ${context.explanation.slice(0, 220)}${context.explanation.length > 220 ? '...' : ''}`
        : '';
      const panelHint = context.verdict !== 'SAFE'
        ? '\n\n👉 Panel kanan sudah menampilkan analogi visual & penjelasan untuk kasus ini. Klik tombol "Tanya AI tentang ini" di sana, atau langsung tanya di bawah!'
        : '\n\n👉 Meskipun link ini aman, kamu bisa tanya apa saja seputar keamanan digital — aku siap membantu!';
      greeting = `${verdictEmoji} Hai! Aku sudah menganalisis hasil scan kamu.\n\nStatus: ${verdictLabel}${scoreText}${categoryText}${snippetText}${panelHint}`;
    } else {
      greeting = `Halo! Aku AbjadIn, asisten keamanan digitalmu. Kamu bisa tanya apa saja seputar keamanan online. Atau scan dulu link yang ingin kamu periksa ya!`;
    }

    const newSession: ChatSession = {
      id: newId,
      timestamp: Date.now(),
      title,
      messages: [{ role: 'assistant', text: greeting }],
      scanContext: context
    };

    setSessions(prev => {
      const updated = [newSession, ...prev];
      localStorage.setItem('abjadin_chat_sessions', JSON.stringify(updated));
      return updated;
    });
    setCurrentSessionId(newId);
    setMessages(newSession.messages);

    // Sync visual lab
    if (context?.verdict) {
      const detected = detectTopicFromText(greeting);
      if (detected) {
        setActiveLabTopic(detected);
      } else {
        if (context.category?.toLowerCase().includes('phishing')) setActiveLabTopic('PHISHING');
        else if (context.category?.toLowerCase().includes('malware')) setActiveLabTopic('MALWARE');
        else setActiveLabTopic(null);
      }
    } else {
      setActiveLabTopic(null);
    }
  }, []);

  // ── Muat Sesi ─────────────────────────────────────────────
  const loadSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
      setMessages(session.messages);
      if (session.scanContext) {
        const detected = detectTopicFromText(session.messages[session.messages.length - 1]?.text || '');
        setActiveLabTopic(detected || null);
      } else {
        setActiveLabTopic(null);
      }
      setShowHistory(false);
    }
  }, [sessions]);

  // ── Hapus Sesi ────────────────────────────────────────────
  const deleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      localStorage.setItem('abjadin_chat_sessions', JSON.stringify(updated));
      
      if (currentSessionId === sessionId) {
        if (updated.length > 0) {
          setTimeout(() => {
            const first = updated[0];
            setCurrentSessionId(first.id);
            setMessages(first.messages);
            if (first.scanContext) {
              const detected = detectTopicFromText(first.messages[first.messages.length - 1]?.text || '');
              setActiveLabTopic(detected || null);
            } else {
              setActiveLabTopic(null);
            }
          }, 50);
        } else {
          setTimeout(() => startNewSession(null), 50);
        }
      }
      return updated;
    });
  }, [currentSessionId, startNewSession]);

  // ── Muat Sesi dari localStorage saat Mount ──────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('abjadin_chat_sessions');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as ChatSession[];
          setSessions(parsed);
        } catch (e) {
          console.error('Failed to parse chat sessions', e);
        }
      }
    }
  }, []);

  // ── Auto-save Sesi saat state messages berubah ─────────────
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      setSessions(prev => {
        const sessionIndex = prev.findIndex(s => s.id === currentSessionId);
        if (sessionIndex !== -1) {
          if (JSON.stringify(prev[sessionIndex].messages) !== JSON.stringify(messages)) {
            const updated = [...prev];
            updated[sessionIndex] = { ...updated[sessionIndex], messages };
            localStorage.setItem('abjadin_chat_sessions', JSON.stringify(updated));
            return updated;
          }
        }
        return prev;
      });
    }
  }, [messages, currentSessionId]);

  // ── Kelola Sesi saat Modal Dibuka atau Scan Baru ──────────
  useEffect(() => {
    if (isOpen) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('abjadin_chat_sessions') : null;
      let currentSessionsList = sessions;
      if (stored && sessions.length === 0) {
        try {
          currentSessionsList = JSON.parse(stored) as ChatSession[];
          setSessions(currentSessionsList);
        } catch (e) {
          /* ignore */
        }
      }

      if (currentSessionsList.length > 0) {
        const currentSession = currentSessionsList.find(s => s.id === currentSessionId);
        if (isSameContext(currentSession?.scanContext, scanContext)) {
          if (currentSession) {
            setMessages(currentSession.messages);
            return;
          }
        }
        
        if (scanContext?.verdict) {
          startNewSession(scanContext);
        } else {
          const mostRecent = currentSessionsList[0];
          setCurrentSessionId(mostRecent.id);
          setMessages(mostRecent.messages);
          if (mostRecent.scanContext) {
            const detected = detectTopicFromText(mostRecent.messages[mostRecent.messages.length - 1]?.text || '');
            setActiveLabTopic(detected || null);
          } else {
            setActiveLabTopic(null);
          }
        }
      } else {
        startNewSession(scanContext);
      }
    }
  }, [isOpen, scanContext]);

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
          generateAudio: voiceMode, // Hanya buat audio di backend jika dalam mode suara
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
                  {/* History toggle */}
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={`p-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer ${
                      showHistory ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Riwayat Percakapan"
                  >
                    <History className="w-4 h-4" />
                  </button>
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
                <div className={`relative w-full md:w-[42%] flex flex-col h-full border-r border-border/50 bg-card ${
                  mobileActiveTab !== 'chat' ? 'hidden md:flex' : 'flex'
                }`}>
                   {/* History Overlay */}
                   <AnimatePresence>
                     {showHistory && (
                       <motion.div
                         initial={{ x: '-100%' }}
                         animate={{ x: 0 }}
                         exit={{ x: '-100%' }}
                         transition={{ type: 'tween', duration: 0.25 }}
                         className="absolute inset-0 bg-background/95 backdrop-blur-sm z-30 flex flex-col border-r border-border/50"
                       >
                         <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
                           <h4 className="font-bold text-xs text-foreground flex items-center gap-2">
                             <History className="w-4 h-4 text-primary" /> Riwayat Chat
                           </h4>
                           <button
                             type="button"
                             onClick={() => setShowHistory(false)}
                             className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                           >
                             <X className="w-4 h-4" />
                           </button>
                         </div>

                         {/* Action Button: Start New Chat */}
                         <div className="p-3 border-b border-border/50 bg-muted/10">
                           <button
                             type="button"
                             onClick={() => {
                               startNewSession(null);
                               setShowHistory(false);
                             }}
                             className="w-full py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
                           >
                             <Plus className="w-4 h-4" /> Mulai Chat Baru
                           </button>
                         </div>

                         {/* History List */}
                         <div className="flex-1 overflow-y-auto p-3 space-y-2">
                           {sessions.length === 0 ? (
                             <p className="text-center text-xs text-muted-foreground py-8">Belum ada riwayat chat.</p>
                           ) : (
                             sessions.map(s => {
                               const isActive = s.id === currentSessionId;
                               const dateStr = new Date(s.timestamp).toLocaleDateString('id-ID', {
                                 day: 'numeric',
                                 month: 'short',
                                 hour: '2-digit',
                                 minute: '2-digit'
                               });

                               return (
                                 <div
                                   key={s.id}
                                   onClick={() => loadSession(s.id)}
                                   className={`group w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                     isActive
                                       ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                                       : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                                   }`}
                                 >
                                   <div className="flex flex-col min-w-0">
                                     <span className="text-xs truncate font-bold">{s.title}</span>
                                     <span className="text-[9px] opacity-70 mt-0.5">{dateStr}</span>
                                   </div>
                                   <button
                                     type="button"
                                     onClick={(e) => deleteSession(s.id, e)}
                                     className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                     title="Hapus riwayat"
                                   >
                                     <Trash2 className="w-3.5 h-3.5" />
                                   </button>
                                 </div>
                               );
                             })
                           )}
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>
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
                                {msg.role === 'assistant' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (msg.audioUrl) {
                                        playAudio(msg.audioUrl);
                                      } else {
                                        speakBrowser(msg.text);
                                      }
                                    }}
                                    className="mt-2 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary cursor-pointer transition-colors"
                                  >
                                    <Volume2 className="w-3 h-3" /> Putar ulang suara
                                  </button>
                                )
                                      }
                                    }}
                                    className="mt-2 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary cursor-pointer transition-colors"
                                  >
                                    <Volume2 className="w-3 h-3" /> Putar ulang suara
                                  </button>
                                )}
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