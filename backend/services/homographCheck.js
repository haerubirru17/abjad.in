/**
 * Homograph Checker untuk Abjad.in
 * Mendeteksi serangan homograph (penggunaan karakter Unicode yang mirip huruf Latin)
 * untuk menipu pengguna agar mengira domain palsu adalah domain asli.
 * 
 * Contoh: "bаnkmаndiri.com" (huruf 'а' Cyrillic, bukan 'a' Latin)
 */

const punycode = require('punycode');

// ===== BAGIAN 1: Peta karakter Cyrillic → Latin =====
const CONFUSABLE_MAP = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p',
  'с': 'c', 'і': 'i', 'ѕ': 's', 'ԁ': 'd',
  'ɡ': 'g', 'ʜ': 'h', 'ĸ': 'k', 'ʟ': 'l',
  'ո': 'n', 'υ': 'u', 'ν': 'v', 'х': 'x',
  'ʏ': 'y', 'ᴢ': 'z'
};

// Zero-width characters (tidak terlihat tapi ada di URL)
const ZERO_WIDTH_CHARS = ['\u200B', '\u200C', '\u200D', '\uFEFF'];

// Brand Indonesia yang sering dipalsukan
const INDONESIAN_BRANDS = [
  'bca', 'mandiri', 'bni', 'bri', 'tokopedia',
  'shopee', 'gojek', 'dana', 'ovo', 'gopay',
  'bukalapak', 'lazada', 'traveloka', 'tiket',
  'blibli', 'flip', 'jenius', 'livin', 'ocbc', 'google'
];

// Domain resmi brand (untuk memastikan bukan false positive)
const OFFICIAL_DOMAINS = [
  'bca.co.id', 'mandiri.co.id', 'bni.co.id', 'bri.co.id',
  'tokopedia.com', 'shopee.co.id', 'gojek.com', 'dana.id',
  'ovo.id', 'gopay.com', 'bukalapak.com', 'lazada.co.id',
  'traveloka.com', 'tiket.com', 'blibli.com', 'flip.id',
  'jenius.com', 'ocbc.co.id', 'google.com', 'google.co.id'
];

/**
 * Hitung Levenshtein Distance antara dua string
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitusi
          matrix[i][j - 1] + 1,     // insert
          matrix[i - 1][j] + 1      // delete
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Fungsi utama: checkHomograph
 * @param {string} hostname - Hostname yang akan diperiksa
 * @returns {object} Hasil pemeriksaan homograph
 */
function checkHomograph(hostname) {
  const result = {
    hasHomograph: false,
    suspiciousChars: [],
    scriptMixing: false,
    impersonationOf: null,
    originalHostname: hostname,
    decodedHostname: hostname,
    riskScore: 0,
    flags: []
  };

  if (!hostname || typeof hostname !== 'string') {
    return result;
  }

  // ===== BAGIAN 1: Decode Punycode =====
  let decodedHostname = hostname;
  try {
    if (hostname.includes('xn--')) {
      decodedHostname = punycode.toUnicode(hostname);
      result.decodedHostname = decodedHostname;

      if (decodedHostname !== hostname) {
        result.flags.push('PUNYCODE_DECODED');
        result.riskScore += 30;
      }
    }
  } catch (e) {
    result.flags.push('PUNYCODE_DECODE_ERROR');
  }

  // ===== BAGIAN 2: Per-karakter scan =====

  // 2a. Cek karakter Cyrillic / confusable
  const chars = [...decodedHostname]; // Spread agar Unicode multi-byte tetap utuh
  for (const char of chars) {
    if (CONFUSABLE_MAP[char]) {
      result.suspiciousChars.push({
        char,
        looksLike: CONFUSABLE_MAP[char],
        type: 'CONFUSABLE'
      });
    }
  }

  if (result.suspiciousChars.length > 0) {
    result.hasHomograph = true;
    result.flags.push(`KARAKTER_MIRIP: ${result.suspiciousChars.length} ditemukan`);
    result.riskScore += 60;
  }

  // 2b. Cek zero-width characters
  const foundZeroWidth = [];
  for (const zwc of ZERO_WIDTH_CHARS) {
    if (decodedHostname.includes(zwc)) {
      foundZeroWidth.push(`U+${zwc.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }

  if (foundZeroWidth.length > 0) {
    result.hasHomograph = true;
    result.flags.push(`ZERO_WIDTH: ${foundZeroWidth.join(', ')}`);
    result.riskScore += 60;
  }

  // 2c. Cek fullwidth characters (U+FF01 sampai U+FF5E)
  let fullwidthCount = 0;
  for (const char of chars) {
    const code = char.charCodeAt(0);
    if (code >= 0xFF01 && code <= 0xFF5E) {
      fullwidthCount++;
    }
  }

  if (fullwidthCount > 0) {
    result.hasHomograph = true;
    result.flags.push(`FULLWIDTH_CHARS: ${fullwidthCount} ditemukan`);
    result.riskScore += 40;
  }

  // ===== BAGIAN 3: Script mixing =====
  const scripts = new Set();

  for (const char of chars) {
    if (char === '.' || char === '-') continue; // Abaikan pemisah domain

    // Deteksi script menggunakan regex Unicode property escapes
    if (/\p{Script=Latin}/u.test(char)) scripts.add('Latin');
    else if (/\p{Script=Cyrillic}/u.test(char)) scripts.add('Cyrillic');
    else if (/\p{Script=Greek}/u.test(char)) scripts.add('Greek');
    else if (/\p{Script=Arabic}/u.test(char)) scripts.add('Arabic');
    else if (/\p{Script=Han}/u.test(char)) scripts.add('Han');
    else if (/\p{Script=Hiragana}/u.test(char)) scripts.add('Hiragana');
    else if (/\p{Script=Katakana}/u.test(char)) scripts.add('Katakana');
    else if (/\p{Script=Hangul}/u.test(char)) scripts.add('Hangul');
    else if (/\p{Script=Thai}/u.test(char)) scripts.add('Thai');
    // Common/Inherited (angka, simbol) tidak dihitung
  }

  if (scripts.size > 1) {
    result.scriptMixing = true;
    result.hasHomograph = true;
    result.flags.push(`SCRIPT_MIXING: ${[...scripts].join(' + ')}`);
    result.riskScore += 40;
  }

  // ===== BAGIAN 4: Brand similarity (impersonation) =====
  // Ambil bagian domain utama saja (sebelum TLD)
  const domainParts = decodedHostname.split('.');
  // Gabungkan semua bagian sebelum TLD untuk perbandingan
  const domainCore = domainParts.slice(0, -1).join('').toLowerCase();

  // Konversi confusable chars ke Latin untuk perbandingan brand
  let normalizedCore = domainCore;
  for (const [confusable, latin] of Object.entries(CONFUSABLE_MAP)) {
    normalizedCore = normalizedCore.split(confusable).join(latin);
  }

  for (const brand of INDONESIAN_BRANDS) {
    const distance = levenshtein(normalizedCore, brand);

    if (distance <= 2 && distance > 0) {
      // Pastikan ini bukan domain resmi
      const isOfficial = OFFICIAL_DOMAINS.some(od => decodedHostname.endsWith(od));

      if (!isOfficial) {
        result.impersonationOf = brand;
        result.hasHomograph = true;
        result.flags.push(`IMPERSONATION: mirip "${brand}" (jarak: ${distance})`);
        result.riskScore += 50;
        break; // Cukup satu match
      }
    }
  }

  // ===== BAGIAN 5: Cap skor maksimal 100 =====
  result.riskScore = Math.min(result.riskScore, 100);

  return result;
}

module.exports = {
  checkHomograph,
  levenshtein
};

// ===== UNIT TESTS (jalankan dengan: node homographCheck.js) =====
if (require.main === module) {
  console.log('🧪 Menjalankan Unit Tests untuk homographCheck.js...\n');

  const tests = [
    {
      name: '1. Karakter Cyrillic mirip Latin',
      input: 'bаnkmаndiri.com', // 'а' = Cyrillic
      expect: (r) => r.hasHomograph === true && r.suspiciousChars.length > 0,
      desc: 'Harus mendeteksi karakter Cyrillic "а"'
    },
    {
      name: '2. Domain resmi (tidak ada homograph)',
      input: 'mandiri.co.id',
      expect: (r) => r.hasHomograph === false && r.riskScore === 0,
      desc: 'Domain asli tidak boleh false positive'
    },
    {
      name: '3. Brand impersonation',
      input: 'tokoopedia.com', // typo: double 'o'
      expect: (r) => r.impersonationOf === 'tokopedia',
      desc: 'Harus mendeteksi kemiripan dengan "tokopedia"'
    },
    {
      name: '4. Script mixing (Latin + Cyrillic)',
      input: 'gооgle.com', // 'о' = Cyrillic
      expect: (r) => r.scriptMixing === true,
      desc: 'Harus mendeteksi pencampuran Latin dan Cyrillic'
    },
    {
      name: '5. Levenshtein distance',
      input: null,
      expect: () => levenshtein('kitten', 'sitting') === 3,
      desc: 'Levenshtein("kitten", "sitting") harus = 3'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    let ok;
    if (test.input === null) {
      ok = test.expect(null);
    } else {
      const result = checkHomograph(test.input);
      ok = test.expect(result);
    }

    if (ok) {
      console.log(`  ✅ ${test.name}: ${test.desc}`);
      passed++;
    } else {
      console.log(`  ❌ ${test.name}: ${test.desc}`);
      if (test.input) {
        const r = checkHomograph(test.input);
        console.log(`     Input:  ${test.input}`);
        console.log(`     Result: ${JSON.stringify(r, null, 2)}`);
      }
      failed++;
    }
  }

  console.log(`\n📊 Hasil: ${passed} lulus, ${failed} gagal dari ${tests.length} test.`);
}
