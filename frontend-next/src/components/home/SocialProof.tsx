'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, Database, Cpu, Layers, Zap, Globe } from 'lucide-react';

const stats = [
  {
    icon: Database,
    value: '500K+',
    label: 'URL Phishing Terindeks',
    desc: 'Data JPCERT/CC (2019–2026), TrustPositif Kominfo, & anti-judol Indonesia',
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
  },
  {
    icon: Layers,
    value: '6 Lapisan',
    label: 'Defense-in-Depth',
    desc: 'Whitelist → Blacklist Lokal → ML ONNX → Safe Browsing → Web Risk → Gemini AI',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    icon: Cpu,
    value: '~95%',
    label: 'Akurasi Model ML',
    desc: 'Random Forest dilatih pada dataset PhiUSIIL (235K+ URL) dengan fitur leksikal 24 dimensi',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    icon: Zap,
    value: '<500ms',
    label: 'Response Time',
    desc: 'Early-exit cache + in-memory blacklist untuk deteksi instan tanpa API eksternal',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  {
    icon: ShieldCheck,
    value: '4 Sumber Intel',
    label: 'Threat Intelligence',
    desc: 'Google Safe Browsing, Google Web Risk, PhishTank, dan blacklist lokal Indonesia',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
  },
  {
    icon: Globe,
    value: '100% Lokal',
    label: 'Konteks Indonesia',
    desc: 'Domain judol, phishing loker palsu (piphis-loker), dan hoaks berbahasa Indonesia',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
];

export default function SocialProof() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-primary mb-3">
              Dibangun dengan Data Nyata
            </span>
            <h2 className="text-3xl md:text-4xl font-bold font-heading text-foreground mb-4">
              Teknologi yang Bisa Diverifikasi
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Setiap klaim di bawah ini didasarkan pada dataset publik, model terlatih, dan pipeline yang dapat diaudit secara terbuka.
            </p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="group rounded-2xl border border-border/50 bg-card p-6 hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${stat.bg} mb-4`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <p className={`text-3xl font-extrabold font-heading ${stat.color} mb-1`}>
                  {stat.value}
                </p>
                <p className="font-semibold text-foreground mb-2">{stat.label}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{stat.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
