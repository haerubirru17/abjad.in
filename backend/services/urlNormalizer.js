/**
 * URL Normalizer untuk Abjad.in
 * Membersihkan, mendekode, dan mendeteksi eksploitasi URL sebelum analisa lebih lanjut.
 * 
 * Fungsi utama: normalizeUrl(rawUrl)
 * Menjalankan 8 langkah berurutan untuk menghasilkan URL yang aman dan bersih.
 */

// Daftar parameter yang sering digunakan untuk open redirect
const REDIRECT_PARAMS = [
  'redirect', 'url', 'continue', 'next',
  'goto', 'return', 'returnUrl', 'return_url',
  'callback', 'redirect_url', 'redirectUri',
  'forward', 'destination'
];

// Daftar URI scheme berbahaya
const DANGEROUS_SCHEMES = ['data:', 'javascript:', 'vbscript:', 'file://'];

/**
 * Fungsi utama: normalizeUrl
 * @param {string} rawUrl - URL mentah dari pengguna
 * @returns {object} Hasil normalisasi dengan skor risiko dan flag
 */
function normalizeUrl(rawUrl) {
  const result = {
    normalizedUrl: null,
    originalUrl: rawUrl,
    wasRedirect: false,
    extractedUrl: null,
    blocked: false,
    invalid: false,
    paramPollution: false,
    flags: [],
    score: 0
  };

  if (!rawUrl || typeof rawUrl !== 'string') {
    result.invalid = true;
    result.flags.push('INPUT_KOSONG');
    return result;
  }

  let url = rawUrl.trim();

  // ===== LANGKAH 1: Block URI scheme berbahaya =====
  const lowerUrl = url.toLowerCase();
  for (const scheme of DANGEROUS_SCHEMES) {
    if (lowerUrl.startsWith(scheme)) {
      result.blocked = true;
      result.score = 100;
      result.flags.push(`URI_SCHEME_BERBAHAYA: ${scheme}`);
      return result;
    }
  }

  // ===== LANGKAH 2: Decode URL encoding rekursif =====
  let decoded = url;
  let prevDecoded = '';
  let decodeIterations = 0;
  const maxDecodeIterations = 5;

  while (decoded !== prevDecoded && decodeIterations < maxDecodeIterations) {
    prevDecoded = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch (e) {
      // Jika gagal decode (karakter invalid), gunakan versi terakhir yang valid
      break;
    }
    decodeIterations++;
  }

  // Jika butuh lebih dari 1 kali decode, ini mencurigakan
  if (decodeIterations > 1) {
    result.flags.push(`DOUBLE_ENCODING: ${decodeIterations} lapis`);
    result.score += 15;
  }

  url = decoded;

  // ===== LANGKAH 3: Parse URL =====
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    // Jika gagal, coba tambahkan https:// di depan
    try {
      parsedUrl = new URL('https://' + url);
    } catch (e2) {
      result.invalid = true;
      result.flags.push('URL_TIDAK_VALID');
      return result;
    }
  }

  // ===== LANGKAH 4: Strip fragment =====
  if (parsedUrl.hash) {
    result.flags.push('FRAGMENT_DIHAPUS');
    parsedUrl.hash = '';
  }

  // ===== LANGKAH 5: Deteksi open redirect =====
  const searchParams = parsedUrl.searchParams;
  for (const param of REDIRECT_PARAMS) {
    const value = searchParams.get(param);
    if (value) {
      // Cek apakah nilai parameter terlihat seperti URL
      try {
        const redirectTarget = new URL(value);
        // Jika ini URL valid, ini adalah potensi open redirect
        result.wasRedirect = true;
        result.extractedUrl = redirectTarget.href;
        result.flags.push(`OPEN_REDIRECT: param "${param}" → ${value}`);
        result.score += 30;
        break; // Ambil redirect pertama saja
      } catch (e) {
        // Bukan URL valid, coba dengan https://
        try {
          const redirectTarget = new URL('https://' + value);
          result.wasRedirect = true;
          result.extractedUrl = redirectTarget.href;
          result.flags.push(`OPEN_REDIRECT: param "${param}" → ${value}`);
          result.score += 30;
          break;
        } catch (e2) {
          // Bukan URL, abaikan
        }
      }
    }
  }

  // ===== LANGKAH 6: Parameter pollution =====
  const paramCounts = {};
  for (const [key] of searchParams.entries()) {
    paramCounts[key] = (paramCounts[key] || 0) + 1;
  }

  const duplicatedParams = Object.entries(paramCounts)
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  if (duplicatedParams.length > 0) {
    result.paramPollution = true;
    result.flags.push(`PARAM_POLLUTION: ${duplicatedParams.join(', ')}`);
    result.score += 20;
  }

  // ===== LANGKAH 7: Canonical form =====
  // Lowercase hostname
  parsedUrl.hostname = parsedUrl.hostname.toLowerCase();

  // Hapus port default (80 untuk http, 443 untuk https)
  if (
    (parsedUrl.protocol === 'http:' && parsedUrl.port === '80') ||
    (parsedUrl.protocol === 'https:' && parsedUrl.port === '443')
  ) {
    parsedUrl.port = '';
  }

  // Rebuild URL dan hapus trailing slash (kecuali hanya path "/")
  let canonicalUrl = parsedUrl.href;
  if (canonicalUrl.endsWith('/') && parsedUrl.pathname === '/') {
    canonicalUrl = canonicalUrl.slice(0, -1);
  }

  // ===== LANGKAH 8: Return hasil =====
  result.normalizedUrl = canonicalUrl;

  // Cap score pada 100
  result.score = Math.min(result.score, 100);

  return result;
}

module.exports = {
  normalizeUrl
};

// ===== UNIT TESTS (jalankan dengan: node urlNormalizer.js) =====
if (require.main === module) {
  console.log('🧪 Menjalankan Unit Tests untuk urlNormalizer.js...\n');

  const tests = [
    {
      name: '1. URL dengan double encoding',
      input: 'https://evil.com/%2568ack',
      expect: (r) => r.flags.some(f => f.includes('DOUBLE_ENCODING')),
      desc: 'Harus mendeteksi encoding ganda'
    },
    {
      name: '2. Fragment manipulation',
      input: 'https://example.com/page#malicious-fragment',
      expect: (r) => r.flags.includes('FRAGMENT_DIHAPUS') && !r.normalizedUrl.includes('#'),
      desc: 'Fragment harus dihapus'
    },
    {
      name: '3. Open redirect param',
      input: 'https://trusted.com/login?redirect=https://phishing.com/steal',
      expect: (r) => r.wasRedirect && r.extractedUrl === 'https://phishing.com/steal',
      desc: 'Harus mendeteksi open redirect'
    },
    {
      name: '4. data: URI (berbahaya)',
      input: 'data:text/html,<script>alert("xss")</script>',
      expect: (r) => r.blocked === true && r.score === 100,
      desc: 'Harus diblokir dengan skor 100'
    },
    {
      name: '5. javascript: URI (berbahaya)',
      input: 'javascript:alert(document.cookie)',
      expect: (r) => r.blocked === true && r.score === 100,
      desc: 'Harus diblokir dengan skor 100'
    },
    {
      name: '6. Parameter pollution',
      input: 'https://bank.com/transfer?amount=100&amount=999999',
      expect: (r) => r.paramPollution === true,
      desc: 'Harus mendeteksi parameter duplikat'
    },
    {
      name: '7. URL tanpa scheme (tambah https://)',
      input: 'example.com/page',
      expect: (r) => r.normalizedUrl && r.normalizedUrl.startsWith('https://'),
      desc: 'Harus otomatis menambahkan https://'
    },
    {
      name: '8. Canonical form (lowercase + hapus port default)',
      input: 'HTTPS://Example.COM:443/Page',
      expect: (r) => r.normalizedUrl === 'https://example.com/Page',
      desc: 'Hostname harus lowercase dan port 443 dihapus'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = normalizeUrl(test.input);
    const ok = test.expect(result);
    if (ok) {
      console.log(`  ✅ ${test.name}: ${test.desc}`);
      passed++;
    } else {
      console.log(`  ❌ ${test.name}: ${test.desc}`);
      console.log(`     Input:  ${test.input}`);
      console.log(`     Result: ${JSON.stringify(result, null, 2)}`);
      failed++;
    }
  }

  console.log(`\n📊 Hasil: ${passed} lulus, ${failed} gagal dari ${tests.length} test.`);
}
