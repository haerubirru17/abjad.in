'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import HeroSection from '@/components/home/HeroSection';
import SocialProof from '@/components/home/SocialProof';
import VerdictCard from '@/components/home/VerdictCard';
import WorkflowDiagram from '@/components/home/WorkflowDiagram';

interface VerdictResult {
  finalVerdict: 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS';
  confidenceScore: number;
  categories: string[];
  threatIntelHits: number;
  aiInsights: string;
  socialAdvice?: string;
  technicalFlags?: string[];
  rawData?: Record<string, unknown>;
}

interface AnalyzePayload {
  url?: string;
  text?: string;
  image?: string;
  imageMimeType?: string;
}

export default function Home() {
  const [result, setResult] = useState<VerdictResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (payload: AnalyzePayload) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    // Scroll to result area smoothly
    setTimeout(() => {
      document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          context: 'General user scanning via Abjad.in web app',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Gagal menganalisa. Silakan coba lagi.');
        return;
      }

      const data = await response.json();

      // Map Indonesian verdict to UI state
      const verdictMap: Record<string, 'SAFE' | 'SUSPICIOUS' | 'MALICIOUS'> = {
        AMAN: 'SAFE',
        MENCURIGAKAN: 'SUSPICIOUS',
        BERBAHAYA: 'MALICIOUS',
        BLOKIR: 'MALICIOUS',
      };

      // Collect all flags from all sources for EduPills
      // Backend returns `flagKeys` — an aggregated array of all detected flags
      const allFlags: string[] = [
        ...(data.flagKeys || []),
        ...(data.factorsNegative || []),
      ];

      setResult({
        finalVerdict: verdictMap[data.verdict] || 'SUSPICIOUS',
        confidenceScore: data.score ?? 0,
        categories: data.category ? [data.category] : [],
        threatIntelHits:
          (data.factorsNegative || []).filter((f: string) =>
            f.includes('MATCH') || f.includes('BLACKLIST') || f.includes('THREAT')
          ).length || 0,
        aiInsights: data.explanation || 'Analisa selesai.',
        technicalFlags: allFlags,
        rawData: data,
      });

      // Scroll into view after result sets
      setTimeout(() => {
        document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    } catch (err: unknown) {
      console.error('Analysis Error:', err);
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      <Header />

      <main className="flex-1 flex flex-col">
        <HeroSection onAnalyze={handleAnalyze} />

        {/* Results Section */}
        <div id="result-section" className="px-4 -mt-16 relative z-20 scroll-mt-24">
          {error && !result && !isLoading && (
            <div className="max-w-3xl mx-auto mt-8 mb-8 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-center font-medium">
              {error}
            </div>
          )}

          {/* Workflow Diagram as Loading State and Idle State */}
          {(!result) && <WorkflowDiagram isScanning={isLoading} />}

          {/* Actual Result Card */}
          {result && !isLoading && (
            <VerdictCard
              isLoading={isLoading}
              result={result}
              onReset={handleReset}
            />
          )}
        </div>

        <SocialProof />
      </main>

      <footer className="py-8 border-t border-border/50 bg-background text-center text-muted-foreground text-sm">
        <div className="container mx-auto px-4">
          <p>
            &copy; {new Date().getFullYear()} Abjad.in — Literasi Keamanan Digital Indonesia. Semua Hak Dilindungi.
          </p>
        </div>
      </footer>
    </div>
  );
}
