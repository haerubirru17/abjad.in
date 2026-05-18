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
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    };
  }, []);

  // ── Send Message to Backend ───────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
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

      // Auto-play TTS jika enabled
      if (ttsEnabled && data.audioBase64) {
        playAudio(data.audioBase64);
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Terjadi kesalahan';
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Maaf, ${errMsg}. Coba lagi ya.`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, scanContext, ttsEnabled]);

  // ── Audio Playback ────────────────────────────────────────
  const playAudio = (audioDataUrl: string) => {
    stopAudio();
    const audio = new Audio(audioDataUrl);
    audioRef.current = audio;
    setIsSpeaking(true);
    audio.onended = () => {
      setIsSpeaking(false);
      // Jika di voice mode, otomatis mulai dengarkan lagi
      if (voiceMode) {
        setTimeout(() => startListening(), 300);
      }
    };
    audio.onerror = () => setIsSpeaking(false);
    audio.play().catch(() => setIsSpeaking(false));
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  // ── Speech Recognition (Mic Input) ───────────────────────
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition
      || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Maaf, browser kamu belum mendukung fitur suara. Coba gunakan Google Chrome ya.',
      }]);
      return;
    }

    const recognition = new (SpeechRecognition as new () => SpeechRecognition)();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      setLiveTranscript(interim || final);
      if (final) {
        sendMessage(final);
        setLiveTranscript('');
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setLiveTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage]);

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setLiveTranscript('');
  };

  // ── Toggle Voice Mode ─────────────────────────────────────
  const toggleVoiceMode = () => {
    if (voiceMode) {
      // Exit voice mode → show chat history
      stopListening();
      stopAudio();
      setVoiceMode(false);
    } else {
      // Enter voice mode
      setVoiceMode(true);
      startListening();
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
                          if (isListening) { stopListening(); } else { startListening(); }
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
