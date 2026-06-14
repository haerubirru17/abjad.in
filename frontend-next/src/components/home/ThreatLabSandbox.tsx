'use client';

import { motion } from 'framer-motion';

export interface ScanContext {
  verdict?: string;
  score?: number;
  category?: string;
  explanation?: string;
  flags?: string[];
}

type LabCase =
  | 'homograph'
  | 'judol'
  | 'phishing'
  | 'safe'
  | 'malware'
  | 'shortener'
  | 'social'
  | 'basics'
  | 'apk_virus'
  | 'data_leak'
  | 'dns_spoofing';

interface ThreatLabSandboxProps {
  scanContext: ScanContext | null;
  activeTopicOverride: string | null;
  onAskAbout: (question: string) => void;
}

export default function ThreatLabSandbox({
  scanContext,
  activeTopicOverride,
  onAskAbout,
}: ThreatLabSandboxProps) {
  if (!scanContext) return null;

  const { verdict, score, category, explanation, flags = [] } = scanContext;

  // ── Resolve case: topicOverride dari AI mengoverride logika default ──
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
      APK_VIRUS: 'apk_virus',
      DATA_LEAK: 'data_leak',
      DNS_SPOOFING: 'dns_spoofing',
    };
    activeCase = topicMap[activeTopicOverride] ?? (verdict === 'SAFE' ? 'safe' : 'phishing');
  } else {
    const isHomograph = flags.some(f => f.includes('HOMOGRAPH')) || !!(explanation?.toLowerCase().includes('homograph'));
    const isGambling = category?.toLowerCase().includes('judi') || category?.toLowerCase().includes('gambling') || flags.some(f => f.includes('ANTI_GAMBLING'));
    const isApk = flags.some(f => f.includes('APK')) || !!(explanation?.toLowerCase().includes('.apk'));
    
    if (isHomograph) activeCase = 'homograph';
    else if (isGambling) activeCase = 'judol';
    else if (isApk) activeCase = 'apk_virus';
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
              <div key={i} className={`p-3 rounded-xl bg-purple-500/5 border border-purple-500/10`}>
                <span className="text-[11px] font-bold text-purple-400 block mb-1">{item.step}</span>
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
              'Baterai HP mendadak cepat habis bocor drastis',
              'HP terasa panas/hangat meskipun sedang tidak digunakan',
              'Muncul aplikasi asing yang tidak pernah kamu install sebelumnya',
              'Kuota internet habis jauh lebih cepat dari biasanya',
              'Perangkat melambat secara drastis saat membuka SMS/Chat',
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

  // ── Case 6: Generic Phishing ──
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

  // ── Case 7: APK / Spyware (NEW) ──
  if (activeCase === 'apk_virus') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-red-600/10 text-red-500 border border-red-500/20 animate-pulse">
            Ancaman Kritis: Kurir Palsu & Undangan APK
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">📦 Trojan APK (Aplikasi Penguras Rekening)</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Kunci Cadangan Rumah&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Menginstal file `.apk` tak dikenal dari chat WhatsApp bagaikan memberikan kunci cadangan rumahmu ke orang asing. Begitu terinstal, aplikasi ini bisa membaca seluruh SMS masuk (termasuk kode OTP Bank dan WA) serta merekam layar HP-mu secara rahasia.
          </p>
          <AskAIButton question="Bagaimana cara kerja file APK kurir palsu atau undangan nikah dalam menguras rekening?" />
        </div>

        {/* Simulasi Payload Layanan Aksesibilitas */}
        <div className="p-4 rounded-2xl bg-red-950/10 border border-red-500/20 space-y-3">
          <h3 className="font-bold text-xs text-red-400 flex items-center gap-2">🚨 Hati-Hati Fitur Aksesibilitas (Accessibility Service)</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Modus penipuan APK selalu membujuk pengguna untuk mengaktifkan izin **&quot;Aksesibilitas&quot;**. Izin ini berbahaya karena memberikan kontrol penuh kepada peretas untuk menekan tombol layar, membaca password, dan menyalin data OTP tanpa kamu ketahui.
          </p>
          <div className="p-3 bg-card rounded-xl border border-border/30 text-[10px] font-mono text-muted-foreground space-y-1">
            <div><span className="text-red-400">STATUS:</span> Izin Aksesibilitas Aktif</div>
            <div><span className="text-red-400">BACA_SMS:</span> Sukses (Kode OTP BCA: 981273)</div>
            <div><span className="text-red-400">KIRIM_SERVER:</span> Terkirim ke server peretas (103.x.x.x)</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-emerald-500">🛡️ Langkah Penyelamatan Jika Terlanjur Klik:</h3>
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            <li>Nyalakan **Mode Pesawat (Airplane Mode)** secepatnya untuk memutus koneksi internet peretas.</li>
            <li>Segera uninstall aplikasi tersebut melalui pengaturan ponsel.</li>
            <li>Hubungi call center bank Anda untuk memblokir akun m-banking sementara.</li>
          </ul>
          <AskAIButton question="Bagaimana cara membersihkan HP dari aplikasi spyware yang tersembunyi dan tidak muncul di menu utama?" label="Minta cara pembersihan HP dari AI →" />
        </div>
      </div>
    );
  }

  // ── Case 8: Data Leak (NEW) ──
  if (activeCase === 'data_leak') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Bahaya Privasi: Kebocoran Data Pribadi
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">📂 Kebocoran Identitas (Data Breach)</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Buku Harian di Jalan Umum&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Ketika data pribadimu (Nama, NIK, No HP, Alamat) bocor dari database sebuah instansi atau e-commerce, itu bagaikan buku harian rahasiamu difotokopi dan disebar di jalanan. Siapa pun bisa membaca dan memanfaatkannya untuk melakukan penipuan atas namamu.
          </p>
          <AskAIButton question="Bagaimana para penipu memanfaatkan NIK, nomor HP, dan nama ibu kandung hasil kebocoran data untuk menipu kita?" />
        </div>

        {/* Visualisasi Nilai Jual Data di Dark Web */}
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
          <h3 className="font-bold text-xs text-foreground">💰 Harga Identitasmu di Pasar Gelap (Dark Web):</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between p-2 bg-card rounded-lg border border-border/30">
              <span>Foto KTP + Selfie</span>
              <span className="text-red-400 font-extrabold">Rp 50.000 - Rp 150.000 / data</span>
            </div>
            <div className="flex justify-between p-2 bg-card rounded-lg border border-border/30">
              <span>Database NIK + No HP (Jutaan Pengguna)</span>
              <span className="text-red-400 font-extrabold">Rp 5 Juta - Rp 20 Juta / db</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground italic leading-relaxed">
            *Data ini dibeli oleh sindikat penipuan untuk melakukan penipuan pinjol palsu, pemerasan, atau pembajakan nomor rekening.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-amber-500">🛡️ Cara Melindungi Diri:</h3>
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            <li>Gunakan website seperti **haveibeenpwned.com** atau fitur Google One untuk memeriksa apakah email/sandi Anda pernah bocor.</li>
            <li>Jangan pernah membagikan foto KTP atau selfie KTP di platform media sosial atau aplikasi chat tidak aman.</li>
            <li>Bedakan alamat email untuk keperluan penting (perbankan) dengan email sosial/promosi belanja.</li>
          </ul>
          <AskAIButton question="Bagaimana cara mengamankan data pribadi jika NIK dan nomor HP saya sudah terlanjur bocor di internet?" label="Minta langkah proteksi diri dari AI →" />
        </div>
      </div>
    );
  }

  // ── Case 9: DNS Spoofing (NEW) ──
  if (activeCase === 'dns_spoofing') {
    return (
      <div className="space-y-6 text-foreground">
        <div>
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            Deteksi Jaringan: Pembajakan DNS & WiFi
          </span>
          <h2 className="text-xl font-black mt-2 text-foreground">📡 Pengalihan Jaringan (DNS Spoofing / Man-In-The-Middle)</h2>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
          <h3 className="font-bold text-xs text-primary flex items-center gap-2">💡 Analogi Sederhana: &quot;Plang Penunjuk Jalan Palsu&quot;</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bayangkan kamu berkendara menuju Kantor Pos pusat, namun di tengah jalan seseorang mengubah plang penunjuk jalan ke arah rumah kosong miliknya yang didekorasi mirip kantor pos. Kamu masuk ke sana tanpa curiga dan memberikan surat berhargamu kepadanya.
          </p>
          <AskAIButton question="Apa itu serangan DNS Spoofing dan bagaimana peretas bisa membelokkan alamat website asli ke website palsu?" />
        </div>

        {/* Skema MITM Visual */}
        <div className="p-4 rounded-2xl bg-indigo-950/10 border border-indigo-500/20 space-y-3">
          <h3 className="font-bold text-xs text-indigo-400">🛡️ Bahaya WiFi Publik Gratisan</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Peretas sering membuat WiFi tiruan dengan nama mirip fasilitas publik (misal: *&quot;Airport_Free_WiFi&quot;*). Saat kamu terhubung, seluruh lalu lintas datamu melewati laptop peretas, memungkinkan mereka membaca informasi apa pun yang kamu akses.
          </p>
          <div className="flex justify-between items-center gap-2 p-3.5 bg-card rounded-xl border border-border/30 text-[10px] font-mono justify-center flex-wrap">
            <span className="text-emerald-400">Kamu</span>
            <span className="text-muted-foreground">──────&gt;</span>
            <span className="text-red-400 font-extrabold">WiFi Palsu (Peretas)</span>
            <span className="text-muted-foreground">──────&gt;</span>
            <span className="text-blue-400">Website Bank</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2 shadow-sm">
          <h3 className="font-bold text-xs text-indigo-500">🛡️ Perlindungan Saat Menggunakan WiFi Publik:</h3>
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            <li>Gunakan **VPN (Virtual Private Network)** untuk mengenkripsi seluruh lalu lintas jaringan datamu.</li>
            <li>Jangan pernah melakukan transaksi perbankan atau memasukkan sandi penting saat terhubung ke WiFi umum gratis.</li>
            <li>Matikan fitur &quot;Sambung Otomatis&quot; (Auto-Connect) WiFi di ponsel pintar Anda.</li>
          </ul>
          <AskAIButton question="Bagaimana cara VPN melindungi koneksi kita dari pembajakan data saat terhubung ke WiFi publik?" label="Tanyakan perlindungan VPN ke AI →" />
        </div>
      </div>
    );
  }

  // ── Case 10: Basics (URL / Domain / SSL / TLD / IP) ──
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

  // ── Case 10: SAFE ──
  const isCaution = score !== undefined && score > 0;

  return (
    <div className="space-y-6 text-foreground">
      <div>
        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
          isCaution 
            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse' 
            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
        }`}>
          {isCaution ? 'Diagnosa Selesai: Aman tapi Tetap Waspada' : 'Diagnosa Selesai: Sistem Aman'}
        </span>
        <h2 className="text-xl font-black mt-2 text-foreground">
          {isCaution ? '⚠️ Aman dengan Catatan (Caution)' : '🛡️ Pintu Gerbang Pemeriksaan Berlapis'}
        </h2>
      </div>
      <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3 shadow-sm">
        <h3 className={`font-bold text-xs flex items-center gap-2 ${isCaution ? 'text-amber-500' : 'text-emerald-500'}`}>
          💡 Analogi Sederhana: {isCaution ? '"Pemeriksaan Tambahan Bandara"' : '"Sistem Keamanan Bandara"'}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isCaution 
            ? 'Bagaikan barang bawaan pelancong di bandara yang lolos dari mesin pemindai utama (bebas dari ancaman aktif seperti virus atau phishing terkonfirmasi), namun petugas menemukan beberapa barang janggal (ekstensi tidak umum atau domain tidak dikenal). Pelancong tetap dipersilakan lewat, namun diberikan himbauan untuk waspada.'
            : 'Link ini diibaratkan seperti seorang pelancong di bandara yang telah lolos dari pemeriksaan X-Ray berlapis, verifikasi paspor, dan detektor logam canggih. Tidak ditemukan ancaman apapun.'
          }
        </p>
        {isCaution && explanation && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-muted-foreground leading-relaxed">
            <span className="font-bold text-amber-500 block mb-1">⚠️ Karakteristik yang Dideteksi AI:</span>
            {explanation}
          </div>
        )}
        <AskAIButton 
          question={isCaution 
            ? `Jelaskan mengapa hasil scan saya berstatus Aman tapi Tetap Waspada (skor ${score}/100) dan apa maksud dari: "${explanation}"?` 
            : 'Meskipun link ini aman, apa yang tetap harus aku waspadai saat browsing sehari-hari?'
          }
          label={isCaution ? 'Tanya AI tentang catatan ini →' : undefined}
        />
      </div>
      <div className="p-4 rounded-2xl bg-muted/30 border border-border/30 space-y-3">
        <h3 className="font-bold text-xs text-foreground">
          {isCaution ? '📊 Hasil Protokol Pemeriksaan Abjad.in:' : '✅ Protokol Keamanan Abjad.in yang Telah Dilewati:'}
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Domain lolos dari verifikasi blacklist lokal (TrustPositif Kominfo & Database Keamanan).</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Algoritma Machine Learning (ONNX) mengonfirmasi tidak adanya pola ejaan homograph mencurigakan.</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>Struktur sertifikasi SSL/HTTPS terverifikasi diterbitkan oleh lembaga resmi yang valid.</span>
          </div>
          {isCaution && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border/20 pt-2.5">
              <span className="text-amber-500 font-bold">⚠️</span>
              <span>Analisis Kognitif mendeteksi anomali ringan (skor {score}/100) pada profil domain.</span>
            </div>
          )}
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
