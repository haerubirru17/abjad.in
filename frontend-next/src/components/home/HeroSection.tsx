'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, ShieldCheck, Link2, FileImage, MessageSquareText, X, Search, Upload } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface HeroSectionProps {
  onAnalyze: (payload: { url?: string; text?: string; image?: string; imageMimeType?: string }) => void;
}

type InputMode = 'url' | 'text' | 'image';

export default function HeroSection({ onAnalyze }: HeroSectionProps) {
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [inputValue, setInputValue] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Strip the data URL prefix to get raw base64
      const base64 = result.split(',')[1];
      setImagePreview(result);
      // Store base64 in inputValue temporarily
      setInputValue(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setInputMode('image');
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        setInputMode('image');
        const file = item.getAsFile();
        if (file) handleFileSelect(file);
        return;
      }
    }
  }, [handleFileSelect]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    if (inputMode === 'url') {
      onAnalyze({ url: inputValue.trim() });
    } else if (inputMode === 'text') {
      onAnalyze({ text: inputValue.trim() });
    } else if (inputMode === 'image') {
      onAnalyze({ image: inputValue, imageMimeType });
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setInputValue('');
    setInputMode('url');
  };

  const tabs: { mode: InputMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'url', icon: <Link2 className="w-4 h-4" />, label: 'Link / URL' },
    { mode: 'text', icon: <MessageSquareText className="w-4 h-4" />, label: 'Pesan / Chat' },
    { mode: 'image', icon: <FileImage className="w-4 h-4" />, label: 'Gambar' },
  ];

  return (
    <section className="relative pt-24 pb-36 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />

      <div className="container mx-auto px-4 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary mb-8 text-sm font-semibold border border-primary/20 shadow-sm">
            <ShieldAlert className="w-4 h-4" />
            <span>Literasi Keamanan Digital untuk Semua</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold font-heading text-foreground mb-6 tracking-tight leading-tight">
            Selidiki Keamanan{' '}
            <br className="hidden md:block" />
            <span className="text-primary">Link, Teks, & Gambar</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Bisa mendeteksi penipuan dari screenshot chat, brosur promo, hingga surat resmi palsu — disertai edukasi yang mudah dipahami.
          </p>
        </motion.div>

        {/* Main Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-3xl mx-auto relative z-10"
        >
          <form onSubmit={handleSubmit}>
            <div
              className={`bg-card rounded-2xl shadow-xl border transition-all duration-300 overflow-hidden ${
                isDragging ? 'border-primary shadow-primary/20 scale-[1.01]' : 'border-border/50'
              } focus-within:border-primary/40 focus-within:shadow-[0_8px_30px_rgb(15,118,110,0.12)]`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {/* Tab Switcher */}
              <div className="flex border-b border-border/50 bg-muted/30">
                {tabs.map((tab) => (
                  <button
                    key={tab.mode}
                    type="button"
                    onClick={() => { setInputMode(tab.mode); setInputValue(''); setImagePreview(null); }}
                    className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all duration-200 cursor-pointer flex-1 justify-center border-b-2 ${
                      inputMode === tab.mode
                        ? 'border-primary text-primary bg-background'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Input Area */}
              <div className="p-4">
                <AnimatePresence mode="wait">
                  {inputMode === 'image' ? (
                    <motion.div
                      key="image"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="min-h-[140px] flex items-center justify-center"
                    >
                      {imagePreview ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imagePreview} alt="Preview" className="max-h-48 rounded-xl object-contain mx-auto shadow-md" />
                          <button
                            type="button"
                            onClick={clearImage}
                            className="absolute -top-2 -right-2 p-1 bg-destructive text-white rounded-full shadow-md cursor-pointer hover:bg-destructive/80 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="flex flex-col items-center gap-3 text-muted-foreground cursor-pointer w-full"
                          onClick={() => fileInputRef.current?.click()}
                          onPaste={handlePaste}
                          tabIndex={0}
                        >
                          <Upload className="w-10 h-10 opacity-40" />
                          <div>
                            <p className="font-semibold text-foreground/70">Seret gambar ke sini atau klik untuk unggah</p>
                            <p className="text-sm mt-1">Atau tekan <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded border border-border">Ctrl+V</kbd> untuk paste screenshot langsung</p>
                          </div>
                          <p className="text-xs text-muted-foreground/60">Cocok untuk: poster loker, bukti transfer, flyer promo, QR code</p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                      />
                    </motion.div>
                  ) : inputMode === 'text' ? (
                    <motion.div
                      key="text"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <textarea
                        placeholder="Seret & lepas foto ke sini atau paste pesan berantaimu untuk mulai investigasi..."
                        className="w-full min-h-[140px] bg-transparent text-foreground placeholder:text-muted-foreground/60 text-base resize-none outline-none leading-relaxed"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onPaste={handlePaste}
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground/50 mt-1">Bisa mendeteksi penipuan dari screenshot chat, brosur promo, hingga surat resmi palsu.</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="url"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 py-3"
                    >
                      <Link2 className="w-6 h-6 text-muted-foreground flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Paste link atau URL yang ingin diinvestigasi..."
                        className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 text-lg outline-none"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onPaste={handlePaste}
                        autoFocus
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit Button */}
              <div className="px-4 pb-4">
                <Button
                  type="submit"
                  size="lg"
                  disabled={!inputValue.trim()}
                  className="w-full py-6 text-lg rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Search className="mr-2 w-5 h-5" />
                  Selidiki Sekarang
                </Button>
              </div>
            </div>
          </form>

          {/* Trust Badges */}
          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-foreground/60 font-medium">
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Didukung Google Web Risk</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Analisa AI Real-time</div>
            <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Gratis & Tanpa Akun</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
