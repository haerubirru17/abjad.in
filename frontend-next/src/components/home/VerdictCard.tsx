'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, RefreshCw,
  BookOpen, ChevronDown, ChevronUp, Share2, RotateCcw, Info,
  CheckCircle2, XCircle, SkipForward, AlertCircle, Wifi, Database
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

// ============================================================
// Kamus Edukasi Interaktif
// Setiap flag dari backend dipetakan ke penjelasan yang ramah.
// ============================================================
const EDUCATION_DICT: Record<string, { title: string; desc: string; tip: string }> = {
  PHISHING: {
    title: 'Apa itu Phishing?',
    desc: 'Phishing adalah teknik penipuan di mana penjahat siber membuat halaman web palsu yang meniru tampilan asli bank, marketplace, atau media sosial untuk mencuri kata sandi dan data rekening Anda.',
    tip: 'Selalu periksa ejaan domain (nama website) dengan teliti. BCA asli ada di "bca.co.id", bukan "bca-online.com" atau "klikbca-update.com".',
  },
  JUDI_ONLINE: {
    title: 'Mengapa Judi Online Selalu Merugikan?',
    desc: 'Sistem judi online dirancang secara matematis (algoritma RTP) agar bandar selalu untung dalam jangka panjang. Kemenangan kecil di awal adalah trik psikologis untuk memancing kecanduan. Tidak ada "pola gacor" atau "bocoran RTP" yang nyata — semuanya adalah ilusi yang diciptakan untuk menguras uangmu.',
    tip: 'Jika seseorang mengirimimu link slot dengan janji "pasti menang" atau "terbukti maxwin", itu adalah jebakan. Blokir dan laporkan.',
  },
  MALWARE: {
    title: 'Apa itu Malware?',
    desc: 'Malware adalah perangkat lunak berbahaya (virus, spyware, ransomware) yang dirancang untuk merusak perangkatmu, mencuri data, atau memata-matai aktivitasmu tanpa sepengetahuanmu. Sering disebarkan lewat link unduhan palsu.',
    tip: 'Jangan pernah menginstal aplikasi dari luar toko resmi (Play Store/App Store), terutama file berformat .APK yang dikirim via WhatsApp.',
  },
  MENCURIGAKAN: {
    title: 'Mengapa Link Ini Mencurigakan?',
    desc: 'Link ini belum terbukti aman. Beberapa karakteristiknya cocok dengan pola penipuan, meskipun buktinya belum cukup kuat untuk dikategorikan berbahaya. Tetap waspada dan hindari memasukkan data pribadi.',
    tip: 'Saat ragu, cari informasi resmi langsung dari website atau aplikasi resmi perusahaan tersebut, bukan dari link yang diterima via chat.',
  },
  DOMAIN_TOO_YOUNG: {
    title: 'Apa itu "Umur Domain" dan mengapa ini mencurigakan?',
    desc: '"Domain" adalah nama alamat website (seperti tokopedia.com atau bca.co.id). Website resmi perusahaan besar biasanya sudah berumur bertahun-tahun. Penipu selalu membuat domain baru setiap beberapa hari untuk menghindari diblokir, lalu langsung menghilang setelah korban tertipu.',
    tip: 'Website resmi yang memintamu login atau transfer uang, tapi domainnya baru berumur beberapa hari? Itu hampir 100% penipuan.',
  },
  URL_SHORTENER: {
    title: 'Mengapa URL Pendek (Bit.ly, s.id) Bisa Berbahaya?',
    desc: 'Layanan pemendek URL menyembunyikan alamat asli tujuan link. Penipu sering memanfaatkannya agar korban tidak bisa melihat nama domain berbahaya sebelum klik. Sistem kami membongkar link tersebut untuk memeriksa tujuan akhirnya.',
    tip: 'Jika ada link bit.ly atau s.id yang mengarahkanmu ke halaman login bank atau memintamu untuk install aplikasi, jangan pernah diikuti.',
  },
  HOMOGRAPH: {
    title: 'Apa itu Serangan Homograph?',
    desc: 'Ini adalah teknik penipuan tingkat tinggi di mana penipu mengganti satu atau beberapa huruf dalam nama domain dengan karakter yang terlihat hampir sama dari alfabet lain (misalnya: huruf "а" Cyrillic vs huruf "a" Latin). Secara visual tampilannya identik, tapi alamatnya berbeda sepenuhnya.',
    tip: 'Contoh: "goog1e.com" (angka 1, bukan huruf l) atau "bса.co.id" (huruf Cyrillic). Selalu ketik manual alamat website penting, jangan klik dari link.',
  },
  SOCIAL_ENGINEERING: {
    title: 'Apa itu Social Engineering (Rekayasa Sosial)?',
    desc: 'Ini adalah teknik manipulasi psikologis yang memanfaatkan emosi manusia (keserakahan, ketakutan, urgensi, atau kasih sayang) agar korban mengambil keputusan ceroboh tanpa berpikir panjang. Contoh: "Selamat Anda menang!", "Rekening Anda akan diblokir!", "Paket Anda tertahan bea cukai".',
    tip: 'Aturan emas: JIKA ADA URGENSI MENDADAK yang memaksamu KLIK atau TRANSFER SEKARANG, itu adalah tanda penipuan. Berhenti sejenak, verifikasi dulu melalui saluran resmi.',
  },
  IP_ADDRESS: {
    title: 'Mengapa IP Address sebagai URL itu Mencurigakan?',
    desc: 'Website resmi selalu menggunakan nama domain (seperti "tokopedia.com"). Jika sebuah link mengarahkan ke angka IP langsung (seperti "http://192.168.1.1/login"), itu hampir pasti adalah halaman penipuan atau jebakan.',
    tip: 'Tidak ada bank, marketplace, atau layanan resmi manapun yang menggunakan alamat IP sebagai URL untuk login. Hindari link semacam ini.',
  },
  CROSS_COUNTRY: {
    title: 'Apa itu Cross-Country Redirect?',
    desc: 'Link ini melewati beberapa server di berbagai negara sebelum sampai ke tujuan akhir. Teknik ini digunakan penipu agar jejaknya sulit dilacak oleh pihak berwajib. Website resmi Indonesia tidak perlu melewati server Rusia, Kamboja, atau Panama.',
    tip: 'Jika sebuah link "toko Indonesia" tapi servernya terdeteksi di negara lain yang tidak terkait, itu adalah tanda merah yang serius.',
  },
};

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

interface EduPillProps {
  flagKey: string;
  label: string;
  isBad?: boolean;
}

function EduPill({ flagKey, label, isBad = true }: EduPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const edu = EDUCATION_DICT[flagKey];

  return (
    <div className="rounded-xl overflow-hidden border border-border/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold cursor-pointer transition-colors duration-200 ${
          isBad
            ? 'bg-destructive/5 text-destructive hover:bg-destructive/10'
            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
        }`}
      >
        <div className="flex items-center gap-2">
          {isBad
            ? <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            : <Info className="w-4 h-4 flex-shrink-0" />}
          <span className="text-left">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-normal opacity-70">
          {edu && <><BookOpen className="w-3.5 h-3.5" /> Pelajari</>}
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      <AnimatePresence>
        {isOpen && edu && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-muted/30 border-t border-border/30 space-y-3">
              <h4 className="font-bold text-foreground text-sm">{edu.title}</h4>
              <p className="text-sm text-foreground/70 leading-relaxed">{edu.desc}</p>
              <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-primary/80 font-medium leading-relaxed">{edu.tip}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Pipeline Trace
// ============================================================
interface PipelineStep {
  step: string;
  status: 'ok' | 'hit' | 'miss' | 'failed' | 'skipped';
  detail?: string | null;
}

function PipelineTrace({ steps }: { steps: PipelineStep[] }) {
  const [open, setOpen] = useState(false);

  const failedCount = steps.filter(s => s.status === 'failed').length;

  const cfg = {
    ok:      { icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200',  badge: 'bg-emerald-100 text-emerald-700',  label: 'Berhasil' },
    hit:     { icon: Database,      color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',        badge: 'bg-blue-100 text-blue-700',        label: 'Ditemukan' },
    miss:    { icon: Wifi,          color: 'text-slate-400',   bg: 'bg-slate-50 border-slate-200',     badge: 'bg-slate-100 text-slate-500',      label: 'Tidak Ada' },
    failed:  { icon: XCircle,       color: 'text-red-600',     bg: 'bg-red-50 border-red-200',         badge: 'bg-red-100 text-red-700',          label: 'Gagal' },
    skipped: { icon: SkipForward,   color: 'text-slate-400',   bg: 'bg-slate-50 border-slate-200',     badge: 'bg-slate-100 text-slate-500',      label: 'Dilewati' },
  };

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-semibold"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <span>Laporan Pemindaian ({steps.length} tahap)</span>
          {failedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
              {failedCount} gagal
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-border/30">
              {steps.map((s, i) => {
                const c = cfg[s.status] || cfg.ok;
                const Icon = c.icon;
                return (
                  <div key={i} className={`flex items-start gap-3 px-4 py-3 border-l-2 ${c.bg}`}>
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${c.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{s.step}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.badge}`}>
                          {c.label}
                        </span>
                      </div>
                      {s.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">{s.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {failedCount > 0 && (
              <div className="px-4 py-3 bg-red-50 border-t border-red-200">
                <p className="text-xs text-red-700 font-medium">
                  ⚠️ {failedCount} tahap gagal. Kemungkinan API key tidak valid, kuota habis, atau timeout. Cek Cloud Run logs untuk detail.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Loading State
// ============================================================
const LOADING_MESSAGES = [
  'Mengekstrak tautan dari pesan Anda...',
  'Memeriksa riwayat domain di seluruh dunia...',
  'AI sedang menganalisis pola psikologis penipuan...',
  'Membandingkan dengan database ancaman global...',
  'Menyusun laporan dan nasihat untuk Anda...',
];

function LoadingCard() {
  const [msgIndex, setMsgIndex] = useState(0);

  // Cycle through messages
  if (typeof window !== 'undefined') {
    setTimeout(() => setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length), 1800);
  }

  return (
    <div className="max-w-3xl mx-auto mt-8 mb-24">
      <Card className="border-border/50 shadow-xl">
        <CardContent className="p-12 flex flex-col items-center justify-center text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="mb-6"
          >
            <RefreshCw className="w-12 h-12 text-primary" />
          </motion.div>
          <h3 className="text-xl font-bold font-heading mb-2">Sedang Menyelidiki...</h3>
          <AnimatePresence mode="wait">
            <motion.p
              key={msgIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              className="text-muted-foreground text-sm min-h-[24px]"
            >
              {LOADING_MESSAGES[msgIndex]}
            </motion.p>
          </AnimatePresence>
          <div className="w-full max-w-md mt-8">
            <Progress value={null} className="h-1.5 w-full animate-pulse bg-primary/20" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Main VerdictCard
// ============================================================
export default function VerdictCard({
  result,
  isLoading,
  onReset,
}: {
  result: VerdictResult | null;
  isLoading: boolean;
  onReset?: () => void;
}) {
  if (isLoading) return <LoadingCard />;
  if (!result) return null;

  const isSafe = result.finalVerdict === 'SAFE';
  const isMalicious = result.finalVerdict === 'MALICIOUS';

  // ---- Colors ----
  const headerClasses = isSafe
    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800'
    : isMalicious
    ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-800'
    : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800';

  const VerdictIcon = isSafe ? ShieldCheck : isMalicious ? ShieldAlert : AlertTriangle;
  const iconColor = isSafe ? 'text-emerald-500' : isMalicious ? 'text-red-500' : 'text-amber-500';
  const verdictLabel = isSafe ? 'Aman' : isMalicious ? 'Berbahaya!' : 'Mencurigakan';

  // ---- Build Technical Flags ----
  // Map categories to display labels and edu keys
  const technicalPills: { label: string; key: string; isBad: boolean }[] = [];
  result.categories.forEach((cat) => {
    const catClean = cat.replace(/ /g, '_').toUpperCase();
    const labelMap: Record<string, string> = {
      PHISHING: 'Teridentifikasi Pola Phishing (Pencuri Data)',
      JUDI_ONLINE: 'Situs Judi Online (Slot / Togel)',
      MALWARE: 'Mengandung Malware / Virus',
      MENCURIGAKAN: 'Pola Mencurigakan Terdeteksi',
    };
    technicalPills.push({
      label: labelMap[catClean] || cat,
      key: catClean,
      isBad: true,
    });
  });

  // ---- Inference-based pills (from URL string and AI text, not just backend flags) ----
  // These work even when the target domain is offline/unreachable.
  const rawUrl: string = (result.rawData as Record<string, string>)?.originalUrl || '';
  const aiText = result.aiInsights.toLowerCase();

  // Judol keywords in URL
  const JUDOL_KEYWORDS = ['slot', 'gacor', 'maxwin', 'rtp', 'togel', 'sbobet', 'jackpot', 'pragmatic', 'zeus', 'scatter'];
  if (result.categories.some((c) => c.includes('JUDI'))) {
    const foundKeywords = JUDOL_KEYWORDS.filter((kw) => rawUrl.toLowerCase().includes(kw));
    if (foundKeywords.length > 0) {
      technicalPills.push({
        label: `Kata Kunci Judi di Nama Website ("${foundKeywords.slice(0, 2).join('", "')}")`,
        key: 'JUDI_ONLINE',
        isBad: true,
      });
    }
  }

  // Phishing keywords in URL / AI explanation
  const PHISHING_URL_KEYWORDS = ['login', 'verify', 'secure', 'update', 'confirm', 'account', 'signin', 'wallet', 'hadiah', 'klaim', 'menang'];
  const foundPhishingKw = PHISHING_URL_KEYWORDS.filter(
    (kw) => rawUrl.toLowerCase().includes(kw) || aiText.includes(kw)
  );
  if (foundPhishingKw.length > 0 && result.categories.some((c) => c.includes('PHISHING'))) {
    technicalPills.push({
      label: `Kata Kunci Penipuan di URL ("${foundPhishingKw.slice(0, 2).join('", "')}")`,
      key: 'SOCIAL_ENGINEERING',
      isBad: true,
    });
  }

  // Typosquatting / brand impersonation from AI text
  const BRANDS = ['google', 'facebook', 'instagram', 'whatsapp', 'bca', 'mandiri', 'bni', 'shopee', 'tokopedia', 'gojek'];
  if (BRANDS.some((b) => aiText.includes(b)) && result.categories.some((c) => c.includes('PHISHING'))) {
    technicalPills.push({
      label: 'Meniru Tampilan / Nama Brand Resmi (Typosquatting)',
      key: 'HOMOGRAPH',
      isBad: true,
    });
  }

  // Suspicious TLD in URL
  const SUSPICIOUS_TLDS = ['.vip', '.top', '.xyz', '.click', '.bet', '.win', '.casino', '.loan', '.cloud'];
  if (SUSPICIOUS_TLDS.some((tld) => rawUrl.toLowerCase().includes(tld))) {
    technicalPills.push({
      label: `Ekstensi Domain Tidak Lazim & Berisiko Tinggi`,
      key: 'DOMAIN_TOO_YOUNG',
      isBad: true,
    });
  }

  // IP address as hostname
  if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(rawUrl)) {
    technicalPills.push({
      label: 'Menggunakan Alamat IP Langsung, Bukan Nama Website',
      key: 'IP_ADDRESS',
      isBad: true,
    });
  }

  // Social engineering signals from AI
  if (aiText.includes('rekayasa') || aiText.includes('psikologi') || aiText.includes('manipulasi') || aiText.includes('menang') || aiText.includes('hadiah')) {
    if (!technicalPills.some((p) => p.key === 'SOCIAL_ENGINEERING')) {
      technicalPills.push({
        label: 'Taktik Iming-Iming / Manipulasi Emosi Terdeteksi',
        key: 'SOCIAL_ENGINEERING',
        isBad: true,
      });
    }
  }

  // Deduplicate pills
  const seenLabels = new Set<string>();
  const dedupedPills = technicalPills.filter((p) => {
    if (seenLabels.has(p.label)) return false;
    seenLabels.add(p.label);
    return true;
  });

  // Map actual backend flag strings to EduPills
  // Backend flag format: "FLAG_NAME: detail" or "FLAG_NAME"
  const rawFlags = (result.technicalFlags || []);

  const flagMappings: { keywords: string[]; key: string; label: string }[] = [
    {
      keywords: ['DOMAIN_MUDA'],
      key: 'DOMAIN_TOO_YOUNG',
      label: 'Umur Domain Sangat Baru — Merah Bendera Penipuan',
    },
    {
      keywords: ['SHORTENER', 'DOUBLE_SHORTENER', 'TRIPLE_SHORTENER', 'EXCESSIVE_SHORTENERS'],
      key: 'URL_SHORTENER',
      label: 'Menggunakan Pemendek URL (Bit.ly / s.id / cutt.ly)',
    },
    {
      keywords: ['KARAKTER_MIRIP', 'SCRIPT_MIXING', 'FULLWIDTH', 'ZERO_WIDTH', 'PUNYCODE'],
      key: 'HOMOGRAPH',
      label: 'Karakter Palsu Terdeteksi — Huruf Meniru Huruf Lain',
    },
    {
      keywords: ['CROSS_COUNTRY'],
      key: 'CROSS_COUNTRY',
      label: 'Server Berpindah Antar Negara (Menyembunyikan Jejak)',
    },
    {
      keywords: ['IP_LANGSUNG', 'IP_ADDRESS', '192.168', '10.0.', '172.'],
      key: 'IP_ADDRESS',
      label: 'Menggunakan Alamat IP Langsung, Bukan Nama Website',
    },
    {
      keywords: ['SOCIAL_ENGINEERING', 'REKAYASA_SOSIAL', 'FORM_LOGIN_SENSITIF', 'COUNTDOWN_PALSU', 'PHISHING_KEYWORDS'],
      key: 'SOCIAL_ENGINEERING',
      label: 'Teknik Manipulasi Psikologis Terdeteksi',
    },
    {
      keywords: ['IMPERSONATION', 'TYPOSQUATTING'],
      key: 'HOMOGRAPH',
      label: 'Meniru Nama Website Resmi (Typosquatting)',
    },
    {
      keywords: ['TLD_MENCURIGAKAN'],
      key: 'DOMAIN_TOO_YOUNG',
      label: 'Menggunakan Ekstensi Domain Tidak Lazim (.vip / .top / .xyz)',
    },
    {
      keywords: ['SSL', 'SERTIFIKAT'],
      key: 'PHISHING',
      label: 'Sertifikat Keamanan (SSL) Bermasalah atau Tidak Valid',
    },
    {
      keywords: ['AUTO_DOWNLOAD'],
      key: 'MALWARE',
      label: 'Mengunduh File Otomatis Tanpa Izin',
    },
    {
      keywords: ['OPEN_REDIRECT'],
      key: 'URL_SHORTENER',
      label: 'Pengalihan URL Tersembunyi (Open Redirect)',
    },
  ];

  flagMappings.forEach(({ keywords, key, label }) => {
    // Check if any keyword matches any flag (case-insensitive)
    const matched = rawFlags.some((f: string) =>
      keywords.some((kw) => f.toUpperCase().includes(kw.toUpperCase()))
    );
    if (matched) {
      // Avoid duplicates
      const alreadyAdded = technicalPills.some((p) => p.key === key && p.label === label);
      if (!alreadyAdded) {
        technicalPills.push({ label, key, isBad: true });
      }
    }
  });

  // Social advice — plain language for non-technical users (elderly, kids, laypeople)
  const getSocialAdvice = () => {
    const hasJudol = result.categories.some((c) => c.includes('JUDI') || c.includes('SLOT'));
    const hasPhishing = result.categories.some((c) => c.includes('PHISHING'));

    if (hasJudol) {
      return '🛑 Ini adalah situs judi online. Tolong JANGAN diklik atau dibuka.\n\nBanyak orang sudah kehilangan tabungan hidup mereka karena situs seperti ini. Kamu tidak akan pernah menang — sistemnya memang sudah diatur agar uangmu habis perlahan-lahan. Jika ada teman atau anggota keluarga yang mengirimkan link ini, tolong beritahu mereka bahwa ini berbahaya.';
    }
    if (hasPhishing) {
      return '🚨 Hati-hati! Ini adalah link JEBAKAN yang berpura-pura menjadi website resmi.\n\nJika kamu membuka link ini dan mengisi nama pengguna, kata sandi, atau nomor rekening, data kamu akan langsung dicuri oleh penjahat. JANGAN klik, JANGAN isi form apapun di sana. Hapus pesan yang berisi link ini sekarang juga.';
    }
    if (isMalicious) {
      return '🚨 Link ini BERBAHAYA. Tolong langsung tutup dan jangan dibuka lagi.\n\nJangan ketik nama pengguna, kata sandi, PIN, atau nomor rekening di situs manapun yang dibuka dari link ini. Jika kamu sudah terlanjur mengisi, segera ganti kata sandi kamu dan hubungi bank kamu sekarang.';
    }
    if (!isSafe) {
      return '⚠️ Kami belum yakin 100% apakah link ini aman atau tidak.\n\nSebagai langkah aman: JANGAN isi data pribadi (nama, nomor HP, kata sandi, atau rekening) di situs yang dibuka dari link ini. Kalau ragu, tanya dulu ke orang yang kamu percaya, atau cari nomor resmi perusahaannya langsung dari Google.';
    }
    return result.socialAdvice || null;
  };

  const socialAdvice = getSocialAdvice();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="max-w-3xl mx-auto mt-8 mb-24"
    >
      <Card className="border-border/50 shadow-2xl overflow-hidden">

        {/* ---- Header: Verdict ---- */}
        <div className={`p-6 border-b ${headerClasses} flex flex-col sm:flex-row items-center justify-between gap-4`}>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/60 dark:bg-black/20 rounded-full shadow-sm">
              <VerdictIcon className={`w-10 h-10 ${iconColor}`} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-0.5">Status Keamanan</p>
              <h2 className="text-3xl font-bold font-heading">{verdictLabel}</h2>
              {!isSafe && result.categories.length > 0 && (
                <p className="text-sm font-semibold opacity-70 mt-0.5">
                  Kategori: {result.categories.map(c => c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(', ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-4xl font-bold font-heading">{result.confidenceScore}</span>
            <span className="text-xs font-semibold opacity-70 uppercase tracking-wider">Skor Ancaman</span>
          </div>
        </div>

        <CardContent className="p-6 space-y-6">

          {/* ---- Section 1: Nasihat Sosial (hanya jika tidak aman) ---- */}
          {!isSafe && socialAdvice && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="p-5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
            >
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-900 dark:text-amber-300 mb-2">Nasihat Untukmu</h3>
                  <div className="space-y-2">
                    {socialAdvice.split('\n\n').map((para, i) => (
                      <p key={i} className="text-sm text-amber-800 dark:text-amber-400 leading-relaxed">
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ---- Section 2: Analisa AI ---- */}
          <div>
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Analisa AI</h3>
            <p className="text-sm text-foreground/80 leading-relaxed bg-muted/30 p-4 rounded-xl">
              {result.aiInsights}
            </p>
          </div>

          {/* ---- Section 3: Kapsul Teknis Interaktif ---- */}
          {!isSafe && dedupedPills.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Mengapa Ini Berbahaya? — Klik untuk Belajar
              </h3>
              <div className="space-y-2">
                {dedupedPills.map((pill, i) => (
                  <EduPill key={i} flagKey={pill.key} label={pill.label} isBad={pill.isBad} />
                ))}
              </div>
            </div>
          )}

          {/* ---- Section 4: Safe / Borderline Message ---- */}
          {isSafe && (() => {
            // Gunakan confidenceScore untuk menentukan borderline, bukan sekadar deteksi kata.
            // Skor 0-20 = Sangat Aman (Solid)
            // Skor 21-49 = Borderline (Aman tapi ada sedikit catatan)
            const isBorderline = result.confidenceScore > 20;

            if (isBorderline) {
              return (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-amber-900 dark:text-amber-300 mb-1">
                        Skor Aman, Tapi Tetap Hati-hati
                      </h3>
                      <p className="text-sm text-amber-800 dark:text-amber-400 leading-relaxed">
                        Sistem kami tidak menemukan ancaman aktif pada link ini, namun analisa AI mendeteksi beberapa karakteristik yang perlu kamu waspadai. Jangan memasukkan data pribadi, nomor rekening, atau kata sandi di situs yang dituju.
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-emerald-900 dark:text-emerald-300 mb-1">Link Ini Tampak Aman</h3>
                    <p className="text-sm text-emerald-800 dark:text-emerald-400 leading-relaxed">
                      Tidak ditemukan tanda-tanda phishing, malware, atau konten berbahaya. Tetap waspada — jangan memasukkan data pribadi di situs yang terasa janggal.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ---- Section: Pipeline Trace ---- */}
          {(() => {
            const raw = result.rawData as Record<string, unknown>;
            const steps = raw?.pipeline as PipelineStep[] | undefined;
            if (!steps || steps.length === 0) return null;
            return (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <PipelineTrace steps={steps} />
              </motion.div>
            );
          })()}

          {/* ---- Action Buttons ---- */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {onReset && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 cursor-pointer"
                onClick={onReset}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Selidiki Pesan Lain
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="flex-1 cursor-pointer"
              onClick={() => {
                const text = `Abjad.in mendeteksi: ${verdictLabel} (Skor: ${result.confidenceScore})\nKategori: ${result.categories.join(', ')}\n\nAnalisa: ${result.aiInsights}\n\nPeriksa link kamu di: https://abjad.in`;
                navigator.clipboard.writeText(text).then(() => alert('Teks peringatan berhasil disalin!'));
              }}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Bagikan Peringatan
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
