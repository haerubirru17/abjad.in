'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Lightbulb, Sparkles, ChevronRight, ChevronLeft, ArrowDown, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PresentationSlide {
  id: number;
  category: string;
  title: string;
  badge: string;
  icon: React.ReactNode;
  points: { title: string; desc: string }[];
  wowFactor?: string;
}

export default function AboutPresentation() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides: PresentationSlide[] = [
    {
      id: 0,
      category: '1. MASALAH / PROBLEM (30%)',
      title: 'Ancaman Digital & Target Audiens Utama',
      badge: 'Dampak Sosial Nyata',
      icon: <Target className="w-8 h-8 text-rose-500" />,
      points: [
        {
          title: 'Target Audiens yang Rentan',
          desc: 'Kelompok lansia, ibu rumah tangga, dan generasi muda Indonesia yang sering menjadi sasaran empuk kejahatan rekayasa sosial (social engineering).',
        },
        {
          title: 'Dampak Skalabilitas (Impact)',
          desc: 'Kerugian finansial nasional akibat penipuan digital mencapai triliunan rupiah tiap tahunnya. Abjad.in hadir meningkatkan literasi keamanan digital dan ketahanan siber nasional.',
        },
      ],
    },
    {
      id: 1,
      category: '2. SOLUSI / SOLUTION (40%)',
      title: 'Fungsional, Menyenangkan & Solutif',
      badge: 'User Experience & Proposisi Nilai',
      icon: <Lightbulb className="w-8 h-8 text-teal-500" />,
      points: [
        {
          title: 'Intuitif & Menyenangkan (Delightful)',
          desc: 'Input serbaguna (cukup paste Link, Teks chat mencurigakan, atau unggah Gambar screenshot promo). UI didesain modern, interaktif, dan mudah dimengerti siapa saja.',
        },
        {
          title: 'Proposisi Nilai (Value Proposition)',
          desc: 'Menyajikan "EduPills" (edukasi mikro terpersonalisasi). Pengguna tidak hanya diberi tahu aman/berbahaya, tapi diajarkan cara mengidentifikasi bahaya tersebut secara interaktif.',
        },
      ],
    },
    {
      id: 2,
      category: '3. KEUNIKAN / UNIQUENESS (30%)',
      title: 'Orisinalitas & The "Wow" Factor',
      badge: 'Out-of-the-Box AI Implementation',
      icon: <Sparkles className="w-8 h-8 text-amber-500" />,
      points: [
        {
          title: 'Detektor Homograph Canggih',
          desc: 'Mendeteksi serangan peniruan nama brand (homograph attack) dengan memecahkan kode punycode dan memindai karakter unicode confusable yang mirip secara visual.',
        },
        {
          title: 'Asisten AI Gemini Interaktif',
          desc: 'Setelah proses scan, pengguna dapat melakukan tanya jawab kontekstual dengan AI Gemini untuk membedah kasus keamanan siber secara mendalam dan personal.',
        },
      ],
      wowFactor: 'Faktor "Wow": AI Gemini digunakan secara elegan sebagai dinamis bypass (Smart Whitelist Override) untuk meminimalkan false positive pada brand terpercaya.',
    },
  ];

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const handlePrev = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const scrollToScanner = () => {
    document.getElementById('scanner-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="tentang" className="relative py-20 overflow-hidden bg-muted/20 border-b border-border/40 scroll-mt-16">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-primary/10 text-primary mb-3 text-xs font-bold border border-primary/20 tracking-wider uppercase">
            🏆 JuaraVibeCoding Submission Pitch
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold font-heading text-foreground tracking-tight">
            The Triple-Threat Vibe Presentasi
          </h2>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto text-sm md:text-base">
            Sebelum mencoba aplikasi scanner di bawah, silakan tinjau proposal presentasi konsep Abjad.in untuk juri.
          </p>
        </div>

        {/* Slide Deck Container */}
        <div className="relative bg-card border border-border/60 rounded-3xl p-6 md:p-10 shadow-xl overflow-hidden min-h-[460px] flex flex-col justify-between">
          
          {/* Header Slide info */}
          <div className="flex items-center justify-between border-b border-border/50 pb-5 mb-6">
            <div>
              <span className="text-xs font-bold text-primary tracking-wider uppercase block mb-1">
                {slides[currentSlide].category}
              </span>
              <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                {slides[currentSlide].badge}
              </span>
            </div>
            <div className="p-3 bg-muted/40 rounded-2xl">
              {slides[currentSlide].icon}
            </div>
          </div>

          {/* Main Slide Content with Animation */}
          <div className="flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <h3 className="text-2xl font-bold text-foreground font-heading">
                  {slides[currentSlide].title}
                </h3>

                <div className="grid md:grid-cols-2 gap-6 pt-2">
                  {slides[currentSlide].points.map((point, index) => (
                    <div key={index} className="p-5 rounded-2xl bg-muted/20 border border-border/30 hover:border-primary/20 transition-all duration-300">
                      <h4 className="font-bold text-foreground flex items-center gap-2 mb-2 text-base">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {point.title}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {point.desc}
                      </p>
                    </div>
                  ))}
                </div>

                {slides[currentSlide].wowFactor && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-start gap-2.5">
                    <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{slides[currentSlide].wowFactor}</span>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer Navigation controls */}
          <div className="flex items-center justify-between border-t border-border/50 pt-5 mt-6">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrev}
                className="rounded-xl w-10 h-10 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                className="rounded-xl w-10 h-10 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Pagination dots */}
            <div className="flex gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    currentSlide === i ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                />
              ))}
            </div>

            <Button
              onClick={scrollToScanner}
              className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 cursor-pointer text-xs md:text-sm"
            >
              <span>Main Scanner App</span>
              <ArrowDown className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
