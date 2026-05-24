'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  Link2, Globe, Type, ShieldCheck, Bot, GitMerge, Search
} from 'lucide-react';

const ENGINES = [
  {
    id: 'resolver',
    icon: Link2,
    label: 'URL Resolver',
    desc: 'Membongkar link & rantai redirect',
    color: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10 text-blue-500',
  },
  {
    id: 'domain',
    icon: Globe,
    label: 'Domain Analyzer',
    desc: 'Memeriksa rekam jejak & usia domain',
    color: 'from-violet-500 to-purple-500',
    bg: 'bg-violet-500/10 text-violet-500',
  },
  {
    id: 'homograph',
    icon: Type,
    label: 'Homograph Check',
    desc: 'Mendeteksi karakter tipuan penipu',
    color: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-500/10 text-orange-500',
  },
  {
    id: 'threatintel',
    icon: ShieldCheck,
    label: 'Threat Intelligence',
    desc: 'Mencocokkan database blacklist global',
    color: 'from-red-500 to-rose-500',
    bg: 'bg-red-500/10 text-red-500',
  },
  {
    id: 'gemini',
    icon: Bot,
    label: 'Gemini AI',
    desc: 'Menganalisis manipulasi psikologis',
    color: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-500/10 text-emerald-500',
  },
  {
    id: 'verdict',
    icon: GitMerge,
    label: 'Verdict Engine',
    desc: 'Menyimpulkan seluruh hasil analisa',
    color: 'from-primary to-primary/80',
    bg: 'bg-primary/10 text-primary',
  }
];

export default function WorkflowDiagram({ isScanning = false }: { isScanning?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (isScanning) {
      // Bersihkan interval lama sebelum memulai yang baru (penting saat scan ulang!)
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      hasStarted.current = true;
      setActiveIndex(0); // Reset ke awal agar selalu mulai dari langkah pertama

      let currentStep = 0;
      // Maju satu per satu, berhenti di langkah terakhir-1 (sebelum Verdict)
      // agar tidak menampilkan "Verdict" sebelum hasil benar-benar ada
      intervalRef.current = setInterval(() => {
        currentStep++;
        if (currentStep < ENGINES.length - 1) {
          setActiveIndex(currentStep);
        } else {
          // Sudah di langkah terakhir — berhenti, jangan loop
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setActiveIndex(ENGINES.length - 2); // Tetap tampilkan Gemini AI (langkah sebelum Verdict)
        }
      }, 1800);

    } else {
      // Scan selesai — bersihkan interval dan tampilkan Verdict sebentar
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (hasStarted.current) {
        setActiveIndex(ENGINES.length - 1); // Tampilkan "Verdict Engine"
        setTimeout(() => {
          hasStarted.current = false;
          setActiveIndex(0);
        }, 1200);
      }
    }

    // Cleanup saat komponen unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isScanning]);

  // If not scanning and not recently started, we can just render nothing 
  // since page.tsx hides it anyway, but we return a sleek idle state just in case.
  if (!isScanning && !hasStarted.current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-50">
        <Search className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
        <p className="text-sm font-medium text-muted-foreground">Menunggu input untuk dianalisis...</p>
      </div>
    );
  }

  const activeEngine = ENGINES[activeIndex];
  const Icon = activeEngine.icon;

  return (
    <section className="py-24 px-4 flex justify-center">
      <div className="relative w-full max-w-sm">
        
        {/* Core Scanner Card */}
        <div className="relative bg-card rounded-3xl border border-border/50 shadow-2xl p-8 overflow-hidden">
          
          {/* Animated Background Glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={activeEngine.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.15, scale: 1 }}
                exit={{ opacity: 0, scale: 1.2 }}
                transition={{ duration: 0.8 }}
                className={`absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gradient-to-br ${activeEngine.color} blur-3xl`}
              />
            </AnimatePresence>
          </div>

          <div className="relative z-10 flex flex-col items-center text-center">
            
            {/* Spinning Radar Ring */}
            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
              <motion.div
                className={`absolute inset-0 rounded-full border-t-2 border-r-2 border-transparent bg-gradient-to-tr ${activeEngine.color}`}
                style={{ WebkitMaskImage: 'radial-gradient(circle, transparent 60%, black 61%)' }}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              />
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeEngine.id}
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 45 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className={`relative z-10 w-14 h-14 flex items-center justify-center rounded-2xl ${activeEngine.bg} shadow-xl backdrop-blur-sm border border-white/10`}
                >
                  <Icon className="w-7 h-7" />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Changing Text */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeEngine.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border/50 text-[10px] font-bold uppercase tracking-widest mb-3">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-gradient-to-r ${activeEngine.color}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 bg-gradient-to-r ${activeEngine.color}`}></span>
                  </span>
                  Menganalisis
                </div>
                
                <h3 className="text-xl font-bold font-heading mb-2">{activeEngine.label}</h3>
                <p className="text-sm text-muted-foreground">{activeEngine.desc}</p>
              </motion.div>
            </AnimatePresence>

          </div>
        </div>

        {/* Progress Bar (Visual only, pulses) */}
        <div className="absolute -bottom-1.5 left-8 right-8 h-1.5 bg-muted rounded-full overflow-hidden shadow-sm">
          <motion.div 
            className={`h-full bg-gradient-to-r ${activeEngine.color}`}
            initial={{ width: "20%" }}
            animate={{ width: ["20%", "100%", "20%"] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          />
        </div>

      </div>
    </section>
  );
}
