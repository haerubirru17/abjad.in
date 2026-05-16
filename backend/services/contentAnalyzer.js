/**
 * Content Analyzer untuk Abjad.in
 * Menganalisa konten HTML halaman web untuk mendeteksi form login palsu,
 * countdown palsu, favicon mismatch, auto-download, keyword phishing/judol,
 * dan brand mismatch.
 * 
 * Lebih ringan dari Playwright — tidak butuh browser binary.
 * 
 * Fungsi utama: analyzeContent(url)
 * Hanya dipanggil jika skor preliminary > 25.
 */

const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fungsi utama: analyzeContent
 * @param {string} url - URL halaman yang akan dianalisa
 * @returns {Promise<object>} Hasil analisa konten
 */
async function analyzeContent(url) {
  try {
    // ===== LANGKAH 1: Fetch halaman =====
    const response = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Abjad.in/1.0)'
      },
      validateStatus: () => true // Jangan throw untuk 4xx/5xx
    });

    if (!response.data || typeof response.data !== 'string') {
      return { error: true, contentResult: null };
    }

    // ===== LANGKAH 2: Parse dengan cheerio =====
    const $ = cheerio.load(response.data);
    const flags = [];
    let score = 0;

    // ----- DETEKSI A: Form login / data sensitif -----
    const hasPasswordField = $('input[type="password"]').length > 0;

    const hasOTPField = $(
      'input[name*="otp"], input[placeholder*="otp"], ' +
      'input[placeholder*="kode"], input[maxlength="6"]'
    ).length > 0;

    const hasPINField = $(
      'input[name*="pin"], input[placeholder*="pin"]'
    ).length > 0;

    const hasCardField = $(
      'input[name*="card"], input[name*="kartu"], ' +
      'input[placeholder*="nomor kartu"]'
    ).length > 0;

    const hasSensitiveDataForm = hasOTPField || hasPINField || hasCardField;

    if (hasPasswordField && hasSensitiveDataForm) {
      flags.push('FORM_LOGIN_SENSITIF');
      score += 40;
    }

    if (hasOTPField) {
      flags.push('FORM_OTP_DITEMUKAN');
      score += 35;
    }

    // ----- DETEKSI B: Countdown palsu -----
    const hasCountdownElement = $(
      '[class*="countdown"], [id*="countdown"], ' +
      '[class*="timer"], [id*="timer"]'
    ).length > 0;

    const bodyText = $('body').text().toLowerCase();
    const hasCountdownText =
      bodyText.includes('kedaluwarsa') ||
      bodyText.includes('expired') ||
      bodyText.includes('sisa waktu') ||
      bodyText.includes('berakhir dalam');

    const hasCountdown = hasCountdownElement || hasCountdownText;

    if (hasCountdown) {
      flags.push('COUNTDOWN_PALSU');
      score += 20;
    }

    // ----- DETEKSI C: Favicon mismatch -----
    const faviconHref = $('link[rel*="icon"]').attr('href') || '';
    let hasFaviconMismatch = false;

    if (faviconHref) {
      try {
        const parsedPageDomain = new URL(url).hostname;
        const parsedFaviconDomain = faviconHref.startsWith('http')
          ? new URL(faviconHref).hostname
          : parsedPageDomain;

        hasFaviconMismatch = parsedFaviconDomain !== parsedPageDomain;

        if (hasFaviconMismatch) {
          flags.push(`FAVICON_MISMATCH: ${parsedFaviconDomain}`);
          score += 25;
        }
      } catch (e) {
        // URL favicon tidak valid, abaikan
      }
    }

    // ----- DETEKSI D: Auto-download -----
    const hasMetaRefresh = $('meta[http-equiv="refresh"]').length > 0;
    const hasWindowLocation = response.data.includes('window.location');
    const hasDownloadLink = $('a[download], a[href$=".apk"], a[href$=".exe"]').length > 0;
    const hasAutoDownload = hasMetaRefresh || hasWindowLocation || hasDownloadLink;

    if (hasAutoDownload) {
      flags.push('AUTO_DOWNLOAD');
      score += 30;
    }

    // ----- DETEKSI E: Kata kunci phishing dalam teks -----
    const phishingKeywords = [
      'verifikasi akun', 'akun diblokir', 'konfirmasi identitas',
      'klik di sini segera', 'segera lakukan', 'batas waktu',
      'data akan dihapus', 'login ulang', 'masukkan otp',
      'jangan beritahu siapapun'
    ];

    const judolKeywords = [
      'slot gacor', 'wd lancar', 'maxwin', 'scatter hitam',
      'daftar sekarang', 'bonus new member', 'link alternatif',
      'rtp tertinggi', 'jp hari ini'
    ];

    const detectedPhishingKeywords = phishingKeywords.filter(k => bodyText.includes(k));
    const detectedJudolKeywords = judolKeywords.filter(k => bodyText.includes(k));

    if (detectedPhishingKeywords.length > 0) {
      flags.push(`PHISHING_KEYWORDS: ${detectedPhishingKeywords.join(', ')}`);
      score += detectedPhishingKeywords.length * 10;
    }

    if (detectedJudolKeywords.length > 0) {
      flags.push(`JUDOL_KEYWORDS: ${detectedJudolKeywords.join(', ')}`);
      score += detectedJudolKeywords.length * 8;
    }

    // ----- DETEKSI F: Title & meta brand mismatch -----
    const pageTitle = $('title').text();
    const metaDescription = $('meta[name="description"]').attr('content') || '';

    const indonesianBrands = [
      'bca', 'mandiri', 'tokopedia', 'shopee',
      'gojek', 'dana', 'ovo', 'bpjs', 'ojk', 'bni', 'bri'
    ];

    let pageDomain = '';
    try {
      pageDomain = new URL(url).hostname;
    } catch (e) { /* abaikan */ }

    const brandMismatch = indonesianBrands.filter(brand =>
      (pageTitle.toLowerCase().includes(brand) ||
        metaDescription.toLowerCase().includes(brand)) &&
      !pageDomain.includes(brand)
    );

    if (brandMismatch.length > 0) {
      flags.push(`BRAND_MISMATCH: ${brandMismatch.join(', ')}`);
      score += 30;
    }

    // ===== LANGKAH 3: Cap risk score =====
    score = Math.min(score, 100);

    return {
      error: false,
      hasLoginForm: hasPasswordField,
      hasSensitiveDataForm,
      hasOTPField,
      hasCountdown,
      hasFaviconMismatch,
      hasAutoDownload,
      detectedPhishingKeywords,
      detectedJudolKeywords,
      brandMismatch,
      pageTitle,
      riskScore: score,
      flags
    };

  } catch (error) {
    // Jangan throw error ke caller — fail gracefully
    return { error: true, contentResult: null };
  }
}

module.exports = {
  analyzeContent
};
