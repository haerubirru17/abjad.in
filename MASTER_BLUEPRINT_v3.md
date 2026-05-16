# 🛡️ MASTER BLUEPRINT — Abjad.in
> Simpan file ini sebagai **Knowledge Item** di Antigravity.
> Agent akan membaca ini sebagai konteks utama di setiap sesi.

---

## 1. IDENTITAS APLIKASI

**Nama Brand:** Abjad.in
**Tagline:** "Baca Dulu, Baru Klik."
**Makna:** Abjad = alfabet/huruf → pesan untuk membaca, mengenali, dan memahami dulu sebelum klik link apapun.
**Tujuan:** Melindungi masyarakat Indonesia awam dari judol (judi online) dan link phishing — cukup paste link atau upload screenshot, langsung dapat analisa.
**Konteks:** Dibuat untuk lomba #JuaraVibeCoding dari Google. Deploy ke Google Cloud Run, menggunakan Gemini API.
**Google Cloud Project ID:** gcp-abjadin

---

## 2. TARGET PENGGUNA

- Orang awam Indonesia (bukan developer)
- Orang tua / lansia yang sering jadi target
- Siapapun yang menerima link/pesan mencurigakan via WA, SMS, Email

---

## 3. TECH STACK ($5 BUDGET — FULL GOOGLE CLOUD)

```
COMPUTE          → Cloud Run (1 container: API + Playwright digabung)
DATABASE         → Firestore (hasil scan, berita, feedback, cache)
CACHE            → Firestore collection 'cache' dengan TTL field
                   (pengganti Redis Memorystore — hemat biaya)
QUEUE            → Cloud Tasks (re-scan jobs)
SCHEDULER        → Cloud Scheduler (cron: update blacklist, scrape berita)
STORAGE          → Cloud Storage (image hash database)
VECTOR SEARCH    → pHash lokal di memory (pengganti Vertex AI Vector Search)
AI LLM           → Gemini 1.5 Pro API (via AI Studio API Key)
AI VISION        → Gemini Vision API
RATE LIMITING    → express-rate-limit di kode (pengganti Cloud Armor)
SECRETS          → Secret Manager
LOGGING          → Cloud Logging + Cloud Monitoring
ANALYTICS        → BigQuery (free tier)
MESSAGING        → Firebase Cloud Messaging (push notif)
EXTERNAL APIs    → Google Safe Browsing (gratis)
                   Web Risk API (gratis)
                   PhishTank (gratis)
                   OpenPhish feed (gratis)
                   Abuse.ch URLhaus (gratis)
                   RDAP (gratis)
                   Bitly API v4 (gratis tier)
```

**Estimasi biaya bulanan:**
```
Cloud Run (1 container)   → ~$1-3/bulan
Cloud Storage             → ~$0.10/bulan
Cloud Tasks + Scheduler   → ~$0.20/bulan
Firestore                 → Free tier
Secret Manager            → Free tier
Cloud Logging             → Free tier
Gemini API                → API key lomba
─────────────────────────────────────────
Total estimasi            → ~$1.50-3.50/bulan ✅
```

---

## 4. STRUKTUR FOLDER PROYEK

```
abjadin/
├── frontend/
│   ├── index.html              ← Halaman utama (input form)
│   ├── pages/
│   │   ├── result.html         ← Hasil analisa
│   │   ├── dashboard.html      ← Live threat news
│   │   ├── edu.html            ← Edukasi: tips & glossary
│   │   └── about.html
│   ├── js/
│   │   ├── analyzer.js         ← Kirim request ke backend
│   │   ├── result.js           ← Render hasil analisa
│   │   ├── dashboard.js        ← Fetch & render berita
│   │   ├── edu.js              ← Filter glossary & tips interaksi
│   │   └── feedback.js         ← Submit feedback user
│   └── css/
│       ├── main.css
│       └── components.css
│
├── backend/
│   ├── server.js               ← Express entrypoint (port 8080)
│   ├── package.json
│   ├── routes/
│   │   ├── analyze.js          ← POST /api/analyze
│   │   ├── scan.js             ← GET /api/scan/:id
│   │   ├── news.js             ← GET /api/news
│   │   └── feedback.js         ← POST /api/feedback
│   ├── services/
│   │   ├── urlNormalizer.js    ← Step 2.6 (decode, strip, normalize)
│   │   ├── urlResolver.js      ← Step 4 (resolve shortener)
│   │   ├── homographCheck.js   ← Step 3 (Unicode/Punycode)
│   │   ├── domainAnalyzer.js   ← Step 5 (RDAP, structure, SSL)
│   │   ├── threatIntel.js      ← Step 6 (GSB, OpenPhish, dll)
│   │   ├── geminiAnalyzer.js   ← Step 7 (semua modul Gemini)
│   │   ├── verdictEngine.js    ← Step 8 (timbang semua skor)
│   │   ├── newsScraper.js      ← RSS feed scraper
│   │   ├── imageHasher.js      ← Multi-hash strategy (pHash lokal)
│   │   ├── cacheService.js     ← Firestore-based cache (pengganti Redis)
│   │   └── webRiskSubmitter.js ← Submit ke Google Web Risk
│   ├── middleware/
│   │   ├── sanitize.js         ← Recursive sanitasi input
│   │   ├── rateLimiter.js      ← express-rate-limit (pengganti Cloud Armor)
│   │   └── contextApplier.js   ← Konteks pengirim
│   └── data/
│       ├── whitelist.json      ← Domain resmi Indonesia
│       └── shorteners.json     ← Daftar URL shortener
│
├── functions/
│   ├── updateBlacklist.js      ← Cloud Scheduler: update harian
│   └── scrapeNews.js           ← Cloud Scheduler: tiap 6 jam
│
├── bot/
│   ├── index.js                ← WhatsApp Cloud API handler
│   └── messageParser.js        ← Parse & forward ke backend
│
├── .env.example
├── Dockerfile                  ← Single container (API + Playwright)
├── cloudbuild.yaml             ← Deploy ke Cloud Run
└── README.md
```

---

## 5. FLOW ANALISA LENGKAP (v4.0 — $5 Budget)

### STEP 1: INPUT
```
User kirim: teks / URL / gambar / screenshot / WA Bot
+ Konteks pengirim (opsional):
  WA tidak dikenal | Email | Kontak tersimpan |
  Newsletter | Tanpa nomor | Akun baru
```

### STEP 2: PRE-PROCESSING
```
2.1 Deteksi tipe input (teks/URL/gambar/chat)
2.2 Ekstrak URL: regex + OCR (Gemini Vision) + QR reader (jsQR)
2.3 Image hashing [MULTI-HASH — pHash lokal]:
    → MD5 (exact) + pHash (hamming < 10) + dHash (resize tolerant)
    → Simpan hash di Firestore collection 'image_hashes'
    → Cache hit → langsung ke Step 9
2.4 Input hashing (SHA256):
    → Cek Firestore collection 'cache' dengan field expiredAt
    → < 1 jam   → cache penuh
    → 1-7 jam   → cache + warning "konten bisa berubah"
    → > 7 hari  → re-scan penuh
2.5 Sanitasi input [RECURSIVE]:
    → Strip HTML rekursif (maks 5 iterasi)
    → Hapus null byte \x00, karakter kontrol
    → Unicode normalization NFKC
    → Boundary token: [USER_INPUT_START]{content}[USER_INPUT_END]
    → Filter: IGNORE, SYSTEM, INSTRUCTION → [FILTERED]
    → Max 5000 karakter
2.6 URL Normalization [SEBELUM SEMUA LAYER]:
    → Decode URL encoding berlapis (rekursif, maks 5x)
    → Strip fragment (#...)
    → Block URI scheme: data:, javascript:, vbscript:, file:
    → Deteksi open redirect: ?redirect=, ?url=, ?continue=, ?next=
    → Cek parameter pollution
    → Decode Punycode + ekstrak root via Public Suffix List
    → Canonical form: lowercase, hapus trailing slash, hapus port default
```

### STEP 3: HOMOGRAPH CHECK
```
3.1 Decode Punycode
3.2 Deteksi per-karakter:
    → Cyrillic: а е о р с і → flag +60
    → Fullwidth: ａ ｂ ｃ → flag +60
    → Zero-width: U+200B/200C/200D/FEFF → flag +60
3.3 Script mixing:
    → Hitung Unicode script count dalam domain
    → > 1 script → flag CONFUSION +40
3.4 Visual similarity render:
    → Render domain ke image → bandingkan pHash
    → Mirip visual tapi beda string → HOMOGRAPH_ATTACK +60
3.5 Brand impersonation:
    → bca.co.id, mandiri.co.id, tokopedia.com, shopee.co.id,
      gojek.com, dana.id, ovo.id, dll
    → Mirip tapi beda → IMPERSONATION +50
```

### STEP 4: SHORTENER RESOLVE
```
4.1 Identifikasi shortener (database shorteners.json)
4.2 Resolve:
    → Bitly/j.mp → Bitly API v4
    → Lainnya → HTTP HEAD follow
4.3 Client-side redirect (Playwright — di container yang sama):
    → Meta refresh + JavaScript window.location
    → Hanya dijalankan jika skor awal > 40
4.4 Full redirect chain (max 10 hop):
    → Catat negara tiap hop
    → Cross-country → +20
4.5 Progressive shortener scoring:
    → 2 shorteners: +25 | 3: +40 | 4+: +60
    → Shortener age < 24 jam: +30
    → Whitelist: shp.ee, tokopedia.link (tidak di-flag)
4.6 Edge cases:
    → Link expired → warning
    → Butuh login → SUSPICIOUS +25
```

### STEP 5: DOMAIN ANALYSIS
```
5.1 Ekstrak root domain (Public Suffix List via tldts)
5.2 Whitelist check (SAMA PERSIS, bukan substring!):
    → Match → skor -20 SAJA (bukan bypass!)
    → Tetap analisa konten
5.3 Typosquatting (Levenshtein ≤ 2): +40
5.4 TLD mencurigakan (.xyz .top .club .bet dll): +15
5.5 URL structure anomali:
    → Subdomain > 3: +15 | @ dalam URL: +35
    → IP sebagai domain: +40 | Port tidak standar: +20
    → URL > 100 char: +10 | Phishing keyword di subdomain: +20
5.6 RDAP Domain Age:
    → < 30 hari: +30 | < 7 hari: +50
    → DIABAIKAN untuk kategori judol
5.7 SSL Analysis:
    → Tidak ada HTTPS: +20 | HTTPS = NETRAL
    → SSL gratis + < 30 hari: +15 | Expired: +25
    → Mismatch: +30 | Mismatch + form password → OVERRIDE 100
```

### STEP 6: THREAT INTELLIGENCE (SEMUA PARALLEL)
```
6.1 Google Safe Browsing API
    → Match → OVERRIDE PHISHING 100
6.2 OpenPhish (cache Firestore, sync 12 jam)
    → Match → +50
6.3 Abuse.ch URLhaus
    → Match → +40 + MALWARE flag
6.4 PhishTank API
    → Match → +45
6.5 Custom Blacklist Judol Indonesia
    → Kominfo DNS + blocklist.id + PAGI + Trust+
    → Cache di Firestore collection 'blacklists'
    → Match → OVERRIDE JUDOL 95
6.6 Web Risk Submission (setelah analisa):
    → PHISHING > 85% + evidence + reputasi > 50
    → Submit ke Google → blokir global
    → Cooldown: 10/hari per user
```

### STEP 7: GEMINI ANALYSIS (PARALLEL dengan Step 6)
```
SEMUA modul: isolated prompt, boundary token, output JSON only

7.1 URL + Redirect Chain Analysis
7.2 Social Engineering Detection
    → Klaim palsu: BCA, BRI, Mandiri, OJK, Tokopedia,
      Shopee, Gojek, Grab, J&T, SiCepat, BPJS
7.3 Bahasa Gaul Judol Detector
    → Kamus: WD, depo, mabar, slot gacor, bonus new member,
      maxwin, scatter, RTP, provider, spin, new member
    → Analisa konteks: "mabar" ≠ judol, "mabar slot" = judol
7.4 Vision Analysis (jika ada gambar)
7.5 Content Analysis — DUA LAYER (hanya jika skor > 25):

    LAYER A — axios + cheerio (PRIMER, selalu jalan):
    → Fetch HTML dengan axios (timeout 8000ms)
    → Follow redirect otomatis (max 10 hop)
    → Parse HTML dengan cheerio
    → Deteksi: form login, form OTP, kata kunci judol/phishing,
      countdown element, favicon src vs domain mismatch,
      meta refresh redirect, hidden iframe, auto-download link
    → Ringan, tidak ada dependency binary, tidak ada risiko crash
    → Fallback jika gagal: skip content analysis, lanjut tanpa skor ini

    LAYER B — Playwright (OPSIONAL, enhancement):
    → Hanya dijalankan jika PLAYWRIGHT_ENABLED=true DI ENV
    → Hanya jika skor preliminary > 40 (threshold lebih tinggi dari Layer A)
    → Max 3 concurrent session (queue sisanya, timeout 60s)
    → Timeout: nav 10s, wait 5s, total 30s
    → Block: gambar, video, font, WebSocket, iframe asing
    → Memory limit: 512MB per session
    → Flag --no-sandbox --disable-dev-shm-usage (wajib di Cloud Run)
    → Jika crash atau timeout → fallback ke hasil Layer A saja
    → PLAYWRIGHT_ENABLED default: false (aktifkan hanya setelah Layer A stabil)
```

### STEP 8: VERDICT ENGINE
```
8.1 Kumpulkan semua skor
8.2 CRITICAL OVERRIDE:
    → GSB match → PHISHING 100
    → Judol blacklist → JUDOL 95
    → SSL mismatch + form password → PHISHING 100
    → Homograph detected → minimum 70
    → Whitelist domain + konten judol → JUDOL
8.3 Gap logic:
    → Gap > 40 → MAX(intel, gemini) + warning
    → Gap ≤ 40 → (intel × 0.4) + (gemini × 0.6)
8.4 Kategori: JUDI_ONLINE | PHISHING | MALWARE | MENCURIGAKAN
8.5 Verdict:
    → 0-49 ✅ AMAN | 50-69 ⚠️ MENCURIGAKAN
    → 70-84 🟠 BERBAHAYA | 85-100 🔴 BLOKIR
8.6 Konteks pengirim:
    → unknown_wa: +20 | unknown_email: +15
    → no_number: +25 | akun_baru: +20
    → saved_contact: -5/-10/0 | subscription: -20
    → high_link_rate: +25 | scam_history: +15
8.7 Jitter ±2 poin (obfuscation)
8.8 Timestamp: analyzedAt + expiredAt (1 jam)
```

### STEP 9: POST-PROCESSING & OUTPUT
```
9.1 Simpan ke Firestore collection 'scans'
9.2 Web Risk submission jika memenuhi syarat
9.3 Output JSON ke user
9.4 Transparansi link (shortener → domain asli)
9.5 Feedback system (anti-bombing):
    → Max 10 feedback/URL/hari
    → Auto-verify: 5 user berbeda → auto flag
    → 2 moderator untuk verifikasi final
9.6 Tombol aksi kontekstual per verdict
9.7 Auto re-scan via Cloud Tasks:
    → MENCURIGAKAN: 6 jam | AMAN: 24 jam | BLOKIR: 12 jam
    → HTTP HEAD dulu, full scan hanya jika 200
    → Exponential backoff: 3x sama → 6j → 12j → 24j → 3 hari
    → Verdict berubah → notifikasi via FCM
```

### STEP 10: RATE LIMITING
```
10.1 express-rate-limit (pengganti Cloud Armor):
     → Global: 1000 req/menit
     → /api/analyze: 10 req/menit per IP
     → /api/feedback: 5/jam per IP
10.2 Per unique domain: 20 req/jam (counter di Firestore)
10.3 Honey token: URL berisi token rahasia → block IP
10.4 Adversarial: variasi URL sama > 10x/5menit → block
10.5 HTTP 429 + Retry-After header
```

---

## 6. ENVIRONMENT VARIABLES

```env
# Google Cloud
GOOGLE_CLOUD_PROJECT=gcp-abjadin
GOOGLE_CLOUD_REGION=asia-southeast2

# AI
GEMINI_API_KEY=

# Security APIs (semua gratis)
GOOGLE_SAFE_BROWSING_API_KEY=
BITLY_API_KEY=
RDAP_API_URL=https://rdap.org

# Telegram Bot (opsional — Tier 2)
TELEGRAM_BOT_TOKEN=

# Honey Token
HONEY_TOKEN_SECRET=

# App
PORT=8080
NODE_ENV=production
PLAYWRIGHT_ENABLED=false
# ↑ Default FALSE. Aktifkan hanya setelah axios+cheerio layer stabil.
# Playwright butuh Chromium di container — ada risiko di Cloud Run.
# Ubah ke true hanya jika deployment sudah berjalan sempurna.

WEB_RISK_LOOKUP_ONLY=true
# ↑ Gunakan Lookup API saja (gratis s.d 100.000 call/bulan).
# JANGAN aktifkan Update API — biayanya $50/1000 call.
```

---

## 7. DESAIN UI — Abjad.in

**Konsep visual:** Tegas, trustworthy, mudah dibaca — seperti papan peringatan yang tidak bisa diabaikan.
**Style:** Dark theme dengan aksen merah
**Font:** Syne (heading, weight 800) + Space Mono (data/code)

**Warna:**
```css
--bg: #0a0a0f;
--surface: #13131a;
--surface2: #1a1a24;
--border: #2a2a3a;
--red: #ff3b3b;        /* accent utama */
--green: #06d6a0;      /* AMAN */
--yellow: #ffd166;     /* MENCURIGAKAN */
--orange: #ff8c42;     /* BERBAHAYA */
--blue: #4cc9f0;       /* info */
--text: #e8e8f0;
--muted: #6b6b80;
```

**Halaman:**
1. `index.html` — Form input (3 tab: Link | Screenshot | Chat)
2. `result.html` — Hasil analisa (skor animasi, breakdown, saran)
3. `dashboard.html` — Live threat news Indonesia
4. `edu.html` — Edukasi: Tips keamanan + Glossary istilah judol & phishing
5. `about.html` — Tentang Abjad.in

**Sistem Edukasi Kontekstual di result.html:**
- Setiap poin bahaya **bisa diklik** → muncul penjelasan dua lapis
- Lapis 1: Kesimpulan singkat (semua orang paham)
- Lapis 2: Analogi sehari-hari (tombol "Apa maksudnya?")
- Verdict JUDOL → tampil blok **Konteks Sosial**: dampak nyata judol + hotline bantuan
- Verdict PHISHING homograph → tampil blok **Peringatan Khusus**: penjelasan kenapa mata manusia tidak bisa mendeteksi
- Verdict PHISHING open redirect → tampil blok **Peringatan Khusus**: domain asli bukan jaminan tujuan aman

**Elemen khas:**
- Logo: huruf "A" stylized dengan shield → **Abjad.in**
- Tagline selalu tampil: *"Baca Dulu, Baru Klik."*
- Skor ditampilkan sebagai angka besar dengan counter animasi
- Semua teks UI dalam **Bahasa Indonesia**

---

## 8. FIRESTORE COLLECTIONS

```
scans/          → hasil analisa (scan_id, verdict, score, dll)
cache/          → cache hasil scan (dengan field expiredAt)
news/           → berita ancaman terkini
blacklists/     → cache blacklist judol + phishing
image_hashes/   → database hash gambar yang pernah dianalisa
feedback/       → feedback user
rate_limits/    → counter rate limit per domain
```

---

## 9. MVP LOCK — PRIORITAS EKSEKUSI

> Baca ini sebelum mulai coding apapun.
> Kalau waktu mepet, potong dari bawah ke atas.

### 🔴 TIER 1 — HARUS JALAN SAAT DEMO (tidak bisa dikompromikan)
```
✅ Input form: paste URL/teks di index.html
✅ Scan berjalan dan dapat hasil (meski sebagian layer skip)
✅ result.html menampilkan: skor, verdict, min. 3 flag bahaya
✅ Sistem dua lapis: setiap flag bisa diklik → muncul analogi
✅ Blok Konteks Sosial muncul untuk verdict JUDOL
✅ Transparansi shortener: bit.ly → domain asli
✅ Gemini API berfungsi (analyzeURL + analyzeSocialEngineering)
✅ Google Safe Browsing API berfungsi
✅ Judol blacklist berfungsi (minimal dari file lokal)
✅ Mobile-friendly di layar 375px (iPhone SE)
```

### 🟡 TIER 2 — PENTING TAPI BISA MENYUSUL
```
⚠️ Vision API / analisa screenshot
⚠️ Dashboard berita (dashboard.html)
⚠️ edu.html (halaman edukasi mandiri)
⚠️ about.html
⚠️ Feedback system
⚠️ RDAP domain age check
⚠️ PhishTank + URLhaus (sudah ada GSB sebagai backbone)
⚠️ Homograph visual render (pHash)
⚠️ Cache Firestore (bisa pakai in-memory dulu)
⚠️ Playwright (aktifkan SETELAH axios+cheerio layer stabil)
⚠️ Telegram Bot (mudah diimplementasi, tapi tidak kelihatan saat demo web)
```

### ⚫ TIER 3 — POTONG UNTUK LOMBA INI
```
❌ WhatsApp Bot — proses verifikasi Meta bisa berhari-hari
❌ Cloud Tasks re-scan otomatis — tidak terlihat saat demo
❌ FCM push notification — tidak terlihat saat demo
❌ BigQuery analytics — tidak terlihat saat demo
❌ Web Risk submission — background process, tidak terlihat
❌ Exponential backoff — tidak terlihat saat demo
❌ Honey token — security measure, tidak terlihat saat demo
```

### ⚡ STRATEGI DEMO
```
1. Siapkan 3 skenario demo yang sudah di-cache hasilnya:
   → Link judol (s.id/mainaja88) → BLOKIR JUDOL
   → Link phishing BCA → BLOKIR PHISHING
   → tokopedia.com → AMAN

2. Kalau scan live lambat → tampilkan cached result
   dengan label "Hasil analisa (dari cache)"

3. Urutan demo yang direkomendasikan:
   → Judol dulu (paling relatable untuk juri Indonesia)
   → Phishing BCA (semua orang punya rekening)
   → False positive test: Tokopedia → AMAN
   → Klik "Apa maksudnya?" untuk tunjukkan sistem edukasi
```

---

## 10. JSON RESPONSE CONTRACT

> Single source of truth antara backend dan frontend.
> verdictEngine.js HARUS return persis format ini.
> result.js HARUS consume persis format ini.

```json
{
  "scanId": "uuid-v4",
  "fromCache": false,
  "analyzedAt": "ISO-8601",
  "expiredAt": "ISO-8601",

  "score": 95,
  "rawScore": 94,
  "verdict": "BLOKIR",
  "category": "JUDI_ONLINE",
  "action": "BLOCK",
  "emoji": "🔴",

  "explanation": "Satu kalimat ringkasan dalam Bahasa Indonesia.",
  "advice": "Saran tindakan dalam Bahasa Indonesia.",

  "flags": [
    {
      "key": "JUDOL_SLANG",
      "label": "Mengandung kata-kata khas judi online",
      "summary": "Kalimat kesimpulan lapis 1 dalam Bahasa Indonesia.",
      "analogi": "Penjelasan analogi lapis 2 dalam Bahasa Indonesia.",
      "severity": "HIGH",
      "data": {
        "detectedWords": ["slot gacor", "WD", "maxwin"]
      }
    }
  ],

  "flagKeys": ["JUDOL_SLANG", "SHORTENER", "NEW_DOMAIN"],

  "specialBlocks": {
    "showSocialContext": true,
    "showHomographWarning": false,
    "showOpenRedirectWarning": false
  },

  "factorsPositive": [],
  "factorsNegative": [
    "Mengandung istilah judi online",
    "Link dipendekkan untuk sembunyikan tujuan",
    "Domain baru dibuat 3 hari lalu"
  ],

  "transparency": {
    "originalUrl": "s.id/mainaja88",
    "finalUrl": "mainaja88-gacor.xyz/daftar",
    "chain": [
      { "url": "s.id/mainaja88", "type": "shortener" },
      { "url": "mainaja88-gacor.xyz/daftar", "type": "final" }
    ]
  },

  "senderContextApplied": true,
  "gapWarning": null,
  "hasOverride": true,
  "overrideReason": "JUDOL_BLACKLIST_MATCH"
}
```

**Enum nilai `flags[].key` yang valid:**
```
DOMAIN & URL:
  NEW_DOMAIN | SUSPICIOUS_TLD | PHISHING_KEYWORD_DOMAIN
  TYPOSQUATTING | OPEN_REDIRECT | PARAMETER_POLLUTION
  BLOCKED_URI_SCHEME | IP_AS_DOMAIN | EXCESSIVE_SUBDOMAINS

SHORTENER & REDIRECT:
  SHORTENER | DOUBLE_SHORTENER | TRIPLE_SHORTENER
  CROSS_COUNTRY_REDIRECT | SHORTENER_NEW | EXPIRED_LINK
  REQUIRES_LOGIN

SERANGAN IDENTITAS:
  HOMOGRAPH | BRAND_IMPERSONATION | SCRIPT_MIXING
  ZERO_WIDTH_CHAR | FULLWIDTH_CHAR

KONTEN & PERILAKU:
  SOCIAL_ENGINEERING | FAKE_COUNTDOWN | FAKE_LOGIN_FORM
  JUDOL_SLANG | AUTO_DOWNLOAD | FAVICON_MISMATCH
  CRYPTOJACKING | SENSITIVE_DATA_FORM

THREAT INTEL:
  GSB_MATCH | OPENPHISH_MATCH | URLHAUS_MATCH
  PHISHTANK_MATCH | JUDOL_BLACKLIST_MATCH

PENGIRIM:
  UNKNOWN_SENDER | NEW_ACCOUNT | HIGH_LINK_RATE
  NO_NUMBER_ACCOUNT

SSL & INFRASTRUKTUR:
  NO_HTTPS | SSL_EXPIRED | SSL_MISMATCH | FRESH_SSL
```

**Enum nilai `flags[].severity`:**
```
CRITICAL | HIGH | MEDIUM | LOW
```

---

## 11. ERROR STATES — BAHASA MANUSIA

> Semua pesan error untuk pengguna HARUS dalam format ini.
> Tidak boleh ada pesan teknis yang muncul ke layar pengguna.

```
KONDISI                    PESAN KE PENGGUNA
─────────────────────────────────────────────────────────────
Input kosong             → "Masukkan link atau teks dulu ya."

Bukan URL valid          → "Hmm, kami tidak menemukan link
                            di teks ini. Coba paste link-nya
                            langsung."

File terlalu besar       → "Ukuran gambar terlalu besar.
                            Coba kirim gambar di bawah 5MB."

Format gambar salah      → "Format gambar tidak didukung.
                            Gunakan JPG, PNG, atau WebP."

Rate limit kena          → "Kamu terlalu sering memeriksa.
                            Tunggu sebentar ya, lalu coba lagi."

Scan timeout             → "Analisa memakan waktu lebih lama
                            dari biasanya. Coba lagi dalam
                            beberapa detik."

Semua API gagal          → "Kami sedang ada gangguan teknis.
                            Hasil analisa mungkin tidak lengkap.
                            Tetap waspada dan jangan klik link
                            yang tidak kamu kenal."

Gemini API error         → [Fallback: tampilkan hasil dari
                            layer non-AI saja, tanpa pesan error.
                            Tambahkan label kecil: "Analisa AI
                            tidak tersedia saat ini."]

Firestore error          → [Fallback: jalankan scan tanpa cache,
                            jangan tampilkan error ke user]

Link sudah expired       → "Link ini sudah tidak aktif —
                            kemungkinan sudah dihapus atau
                            kedaluwarsa."

Link butuh login         → "Link ini meminta login sebelum
                            bisa dibuka — kami tidak bisa
                            menganalisa isinya sepenuhnya.
                            Tetap waspada."
```

---

## 12. API FALLBACK STRATEGY

> Kalau satu API mati, sistem HARUS tetap jalan.
> Tidak boleh satu API failure bikin seluruh scan crash.

```
API                   TIMEOUT    KALAU GAGAL
──────────────────────────────────────────────────────────
Google Safe Browsing   3000ms  → skip, skor dari layer lain
OpenPhish (cache)      1000ms  → skip, gunakan cache lama
URLhaus                3000ms  → skip, skor dari layer lain
Judol Blacklist         500ms  → fallback ke file lokal
  (Firestore)                    backend/data/judol_local.json
RDAP                   5000ms  → skip domain age check,
                                  set isDomainAgeApplicable: false
Bitly API              3000ms  → fallback ke HTTP HEAD follow
Gemini API             8000ms  → skip AI layer, gunakan
                                  intel score saja, tambah label
                                  "Analisa AI tidak tersedia"
axios+cheerio          8000ms  → skip content analysis,
  (content layer A)               set contentResult: null
Playwright             30000ms → skip, gunakan hasil Layer A saja
  (content layer B)               Jika Layer A juga null →
  PLAYWRIGHT_ENABLED              set contentResult: null
  default: false                  Tidak ada pesan error ke user

ATURAN GLOBAL:
→ Semua API call dalam try-catch WAJIB
→ Gunakan Promise.allSettled() bukan Promise.all()
→ Minimum viable scan: GSB + Judol Blacklist + Gemini URL
  Kalau ketiganya gagal → return skor 50 MENCURIGAKAN
  dengan pesan "Analisa tidak lengkap, tetap waspada"
→ Selalu log API failure ke Cloud Logging untuk monitoring
→ Web Risk: gunakan Lookup API SAJA (gratis s.d 100k/bulan)
  JANGAN aktifkan Update API ($50/1000 call)
```

---

## 14. STRATEGI EKSEKUSI — URUTAN SESI ANTIGRAVITY

> Ini bagian paling penting untuk keberhasilan build.
> Jangan skip urutan ini. Jangan gabung dua sesi jadi satu.
> Selesaikan dan TEST setiap sesi sebelum lanjut.

### PRINSIP DASAR
```
1. SATU SESI = SATU TUJUAN YANG BISA DITEST
   Jangan kasih banyak prompt sekaligus ke agent.
   Kasih satu prompt, tunggu selesai, test, baru lanjut.

2. SELALU GUNAKAN PLANNING MODE
   Sebelum agent eksekusi, baca rencananya dulu.
   Kalau rencana agent terlihat salah arah → reject,
   perbaiki prompt, minta plan ulang.

3. KALAU ERROR → COPY PASTE PERSIS KE PROMPT BARU
   "Fix error ini: [paste error message]"
   Jangan deskripsikan error dengan kata-kata sendiri.
   Agent butuh teks error yang exact, bukan deskripsi.

4. JANGAN LANJUT KALAU SESI SEBELUMNYA BELUM HIJAU
   Setiap sesi punya kriteria DONE — test sampai terpenuhi.
   Error yang dibawa ke sesi berikutnya → debugging jadi 3x lebih sulit.

5. STUCK LEBIH DARI 3 ITERASI DI ERROR YANG SAMA?
   → Stop. Mulai sesi baru.
   → Paste error + tulis: "Fix error ini tanpa mengubah
     hal lain yang sudah berjalan."
```

---

### SESI 1 — Backend Minimal
```
TARGET: Scan pertama berhasil return JSON

PROMPT YANG DIJALANKAN:
→ PROMPT 1A (server.js + struktur folder)
→ PROMPT 1B (cacheService.js)
→ PROMPT 1C (data files: whitelist.json, shorteners.json,
              judol_local.json, flagDefinitions.json)
→ PROMPT 4A (geminiAnalyzer.js — hanya analyzeURL dulu)
→ PROMPT 5A (route /api/analyze — versi minimal)

SETUP MANUAL SEBELUM MULAI (sekali saja):
Buka terminal di Antigravity, jalankan:
  gcloud auth login
  gcloud auth application-default login
  gcloud config set project gcp-abjadin

KRITERIA DONE:
□ npm install berhasil tanpa error
□ node server.js jalan di port 8080
□ POST /api/analyze {"input":"tokopedia.com","type":"url"}
  → return JSON dengan field verdict dan score
□ GET /health → return {status:"ok"}

WAKTU ESTIMASI: 2-3 jam
```

---

### SESI 2 — Frontend Minimal
```
TARGET: End-to-end pertama — dari form ke hasil

PROMPT YANG DIJALANKAN:
→ PROMPT 7A (index.html — termasuk onboarding first-time user)
→ PROMPT 7B (result.html — hanya skor + verdict + flag list dulu)

BELUM PERLU DIIMPLEMENTASI DI SESI INI:
Sistem dua lapis, share PNG, animasi penuh, edu.html.
Fokus: flow dasar jalan dulu.

KRITERIA DONE:
□ Buka index.html → form terlihat jelas
□ Kalimat onboarding muncul di hero:
  "Dapat link mencurigakan dari WA? Paste di sini."
□ Paste link → klik periksa → result.html tampil
□ Skor, verdict, dan min 3 flag terlihat
□ Berfungsi di mobile 375px (test di DevTools)

TEST WAJIB:
1. tokopedia.com → AMAN
2. bit.ly/apapun → ada transparansi shortener
3. Teks WA judol → BLOKIR atau BERBAHAYA

WAKTU ESTIMASI: 2-3 jam
```

---

### SESI 3 — Threat Intel & Security Layers
```
TARGET: Akurasi naik, false positive turun

PROMPT YANG DIJALANKAN:
→ PROMPT 2A (urlNormalizer.js)
→ PROMPT 2B (homographCheck.js)
→ PROMPT 2C (urlResolver.js)
→ PROMPT 3A (domainAnalyzer.js)
→ PROMPT 3B (threatIntel.js — GSB + judol blacklist dulu)
→ PROMPT 4B (verdictEngine.js)

KRITERIA DONE:
□ Link judol → BLOKIR dengan flag JUDOL_BLACKLIST_MATCH
□ Link phishing BCA homograph → BLOKIR + flag HOMOGRAPH
□ Tokopedia via shortener → AMAN (tidak false positive)
□ JSON response sesuai contract di section 10
□ specialBlocks.showHomographWarning = true untuk homograph

WAKTU ESTIMASI: 3-4 jam
```

---

### SESI 4 — Content Analysis
```
TARGET: False positive minimal, deteksi konten akurat

PROMPT YANG DIJALANKAN:
→ PROMPT 3C (contentAnalyzer.js — axios + cheerio)
→ Update verdictEngine untuk include content layer

PLAYWRIGHT: Jangan aktifkan.
PLAYWRIGHT_ENABLED tetap false di .env

KRITERIA DONE:
□ Berita Kompas via shortener → tetap AMAN
□ Halaman dengan form login palsu → skor naik ≥20 poin
□ Tidak ada crash saat content fetch timeout
□ Timeout graceful: jika axios timeout → skip, lanjut scan

WAKTU ESTIMASI: 2-3 jam
```

---

### SESI 5 — UI Polish & Edukasi
```
TARGET: Aplikasi siap demo, sistem edukasi berfungsi

PROMPT YANG DIJALANKAN:
→ PROMPT 7B update: sistem dua lapis (7B-C)
→ PROMPT 7B-F: share as PNG (html2canvas)
→ PROMPT 7B-A: edu.html
→ PROMPT 7B-D: about.html
→ PROMPT 7B-B: integrasi nav semua halaman
→ PROMPT 7C: dashboard.html

KRITERIA DONE:
□ Klik flag bahaya → analogi muncul smooth
□ Blok Konteks Sosial muncul untuk verdict JUDOL
□ Tombol share PNG → generate gambar bersih
□ Share gambar ke WA berhasil (test di HP sungguhan)
□ Semua halaman terhubung via nav
□ Mobile berfungsi di HP sungguhan (bukan hanya DevTools)
□ Semua tap target bisa diklik dengan jempol

WAKTU ESTIMASI: 3-4 jam
```

---

### SESI 6 — Deploy ke Cloud Run
```
TARGET: Aplikasi live di internet, bisa diakses dari HP

PROMPT YANG DIJALANKAN:
→ PROMPT 8A (Dockerfile + Cloud Run deploy)
→ PROMPT 8B (Secret Manager setup)

API KEYS YANG PERLU DIISI MANUAL
(Buka console.cloud.google.com → Secret Manager):
□ GEMINI_API_KEY
   → aistudio.google.com → Get API Key
□ GOOGLE_SAFE_BROWSING_API_KEY
   → console.cloud.google.com → APIs → Safe Browsing → Enable → Create Key
□ BITLY_API_KEY (opsional)
   → dev.bitly.com → daftar → create app → get token

KRITERIA DONE:
□ Dapat URL Cloud Run:
  https://abjadin-xxxxx-as.a.run.app
□ Buka URL dari HP → aplikasi tampil
□ Scan link judol dari HP → BLOKIR
□ Scan tokopedia.com dari HP → AMAN
□ Tidak ada error 500 di Cloud Logging

PLAYWRIGHT_ENABLED: tetap false saat deploy pertama.

WAKTU ESTIMASI: 1-2 jam
```

---

### SESI 7 — Cache Demo & Final Test
```
TARGET: 3 skenario demo siap, tidak ada surprises saat hari H

YANG DILAKUKAN:
Scan 3 skenario ini di aplikasi live dan catat scan_id-nya:

DEMO 1 — Judol:
Input: "Wkwk gw baru WD 2jt bro: s.id/mainaja88"
Expected: BLOKIR JUDOL, skor 90+
Catat scan_id: _______________

DEMO 2 — Phishing:
Input: "Verifikasi BCA sebelum diblokir: bit.ly/bca-verif-now"
Expected: BLOKIR PHISHING, skor 95+
Catat scan_id: _______________

DEMO 3 — False positive test:
Input: "tokopedia.com/promo-harbolnas"
Expected: AMAN, skor < 30
Catat scan_id: _______________

Saat demo → akses langsung:
https://abjadin-xxxxx-as.a.run.app/pages/result.html?id={scan_id}
→ hasil instan, tidak ada loading, tidak ada risiko timeout

CHECKLIST FINAL DEMO:
□ Test dari HP sendiri, bukan laptop
□ Semua tombol bisa diklik dengan jempol
□ Share PNG berfungsi dan hasilnya bersih
□ Klik "Apa maksudnya?" → analogi muncul
□ Blok Konteks Sosial muncul di DEMO 1
□ Screenshot/rekam demo flow sebagai backup

WAKTU ESTIMASI: 1 jam
```

---

### SESI OPSIONAL — Tier 2 (kalau ada waktu)
```
Urutan yang disarankan:
1. Telegram Bot        → 1 jam (mudah, @BotFather → token → deploy)
2. RDAP domain age     → 1 jam (tidak ada API key, HTTP GET biasa)
3. Playwright          → 1-2 jam (aktifkan PLAYWRIGHT_ENABLED=true,
                          siapkan waktu debug kalau ada sandbox issue)
4. URLhaus + OpenPhish → 30 menit (feed gratis, tidak perlu key)
```

---

### RINGKASAN WAKTU REALISTIS
```
Sesi 1 — Backend minimal:     2-3 jam
Sesi 2 — Frontend minimal:    2-3 jam
Sesi 3 — Threat intel:        3-4 jam
Sesi 4 — Content analysis:    2-3 jam
Sesi 5 — UI polish:           3-4 jam
Sesi 6 — Deploy Cloud Run:    1-2 jam
Sesi 7 — Cache demo:          1 jam
──────────────────────────────────────
TOTAL MVP TIER 1:              14-20 jam aktif

Tier 2 (opsional):            +3-5 jam

Spread over 2-3 hari lebih ideal daripada
marathon 1 hari — agent lebih konsisten
dan debugging lebih mudah dengan kepala segar.
```

---

## 15. PENTING UNTUK AGENT

1. **Nama brand selalu "Abjad.in"** — bukan Waspada.AI
2. **Tagline: "Baca Dulu, Baru Klik."**
3. **Project ID: gcp-abjadin**
4. **Budget $5** — gunakan Firestore sebagai cache, bukan Redis
5. **Content analysis: axios+cheerio DULU** — Playwright adalah enhancement opsional, default PLAYWRIGHT_ENABLED=false
6. **Playwright hanya aktif setelah axios+cheerio stabil** — jangan aktifkan sebelum deployment berjalan sempurna
7. **Playwright threshold: skor > 40** (lebih tinggi dari axios+cheerio yang > 25)
8. **Playwright max 3 concurrent session** — sisanya antri, timeout 60s
9. **Bahasa Indonesia** untuk semua teks UI dan output user
10. **Gemini prompt selalu terisolasi** — konten web JANGAN langsung masuk system prompt
11. **Whitelist bukan STOP** — domain resmi tetap dianalisa kontennya
12. **HTTPS bukan jaminan aman** — jangan beri skor positif hanya karena HTTPS
13. **Domain age diabaikan untuk judol** — judol sering pakai expired domain tua
14. **Semua Gemini call harus return JSON** — tidak ada teks bebas
15. **Deploy ke Cloud Run region asia-southeast2** (Jakarta) — tanpa custom domain, pakai URL Cloud Run default
16. **Gunakan Planning Mode** di Antigravity sebelum eksekusi setiap task
17. **edu.html adalah halaman statis** — tidak butuh API call
18. **Sistem dua lapis di result.html** — (1) kesimpulan singkat, (2) analogi via "Apa maksudnya?" — tidak ada lapis teknis
19. **Blok Konteks Sosial** wajib muncul untuk verdict JUDOL
20. **Blok Peringatan Khusus** muncul untuk flag HOMOGRAPH dan OPEN_REDIRECT
21. **Analogi per flag harus konsisten** — lihat referensi lengkap di PROMPT 7B-C
22. **Web Risk: Lookup API SAJA** — WEB_RISK_LOOKUP_ONLY=true, jangan aktifkan Update API
23. **First-time user onboarding** — hero index.html HARUS punya kalimat eksplisit: "Dapat link mencurigakan dari WA? Paste di sini." Jangan asumsikan user tahu cara pakai
24. **Share as PNG** — result.html punya tombol "Bagikan sebagai Gambar" yang generate PNG dari HTML template menggunakan html2canvas. Format share: skor besar + verdict + 3 flag utama + URL abjad.in. Bukan share link — share gambar yang bisa langsung dikirim ke grup WA
25. **Telegram Bot** — gunakan Telegram Bot API (bukan WhatsApp). Setup: chat ke @BotFather → dapat token → tidak perlu approval apapun. Implementasi di Tier 2, setelah web stabil
26. **False positive mitigation** — axios+cheerio layer wajib bisa membedakan "shortener ke berita Kompas" vs "shortener ke judol" berdasarkan konten halaman, bukan hanya metadata URL
