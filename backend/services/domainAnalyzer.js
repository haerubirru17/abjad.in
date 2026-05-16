/**
 * Domain Analyzer untuk Abjad.in
 * Menganalisa domain secara menyeluruh: TLD, whitelist, typosquatting,
 * struktur URL, umur domain (RDAP), dan sertifikat SSL.
 * 
 * Fungsi utama: analyzeDomain(url)
 */

const { parse } = require('tldts');
const fetch = require('node-fetch');
const https = require('https');
const whitelist = require('../data/whitelist.json');

// TLD yang sering digunakan untuk phishing/scam
const SUSPICIOUS_TLDS = [
  '.xyz', '.top', '.club', '.bet', '.casino',
  '.win', '.loan', '.click', '.gq', '.tk',
  '.ml', '.work', '.download', '.zip', '.review',
  '.cx', '.vip', '.pw', '.su', '.cc', '.cf', '.ga',
  '.monster', '.rest', '.cam', '.cfd', '.hair',
  '.cyou', '.beauty', '.quest', '.stream', '.online',
  '.icu', '.live', '.site', '.fun', '.space'
];

// Kata kunci phishing yang sering muncul di subdomain
const PHISHING_KEYWORDS = [
  'login', 'verify', 'secure', 'update', 'confirm',
  'account', 'banking', 'signin', 'wallet', 'pay'
];

// Top domain Indonesia untuk perbandingan typosquatting
const TOP_DOMAINS = [
  'bca', 'mandiri', 'bni', 'bri', 'btn', 'cimb', 'danamon', 'ocbc',
  'permatabank', 'maybank', 'tokopedia', 'shopee', 'lazada',
  'bukalapak', 'blibli', 'zalora', 'dana', 'ovo', 'gopay',
  'linkaja', 'jenius', 'flip', 'gojek', 'grab', 'bluebird',
  'kompas', 'detik', 'tempo', 'tribunnews', 'liputan6',
  'traveloka', 'tiket', 'pegipegi', 'sicepat', 'jne', 'jnt',
  'anteraja', 'paxel', 'tiki', 'pos', 'ojk', 'kominfo',
  'kemenkeu', 'kemenkes', 'bpjs', 'facebook', 'instagram',
  'whatsapp', 'tiktok', 'youtube', 'google', 'gmail'
];

// ============================================================
// SUB-FUNGSI 1: extractRootDomain
// ============================================================
function extractRootDomain(hostname) {
  const parsed = parse(hostname);
  return {
    domain: parsed.domain || hostname,
    subdomain: parsed.subdomain || '',
    publicSuffix: parsed.publicSuffix || '',
    isKnownTLD: parsed.isIcann || false
  };
}

// ============================================================
// SUB-FUNGSI 2: checkWhitelist
// ============================================================
function checkWhitelist(rootDomain) {
  // Cek SAMA PERSIS — bukan url.includes()
  const isWhitelisted = whitelist.includes(rootDomain);
  return {
    isWhitelisted,
    scoreModifier: isWhitelisted ? -20 : 0
  };
}

// ============================================================
// SUB-FUNGSI 3: checkTyposquatting (Levenshtein distance)
// ============================================================
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Soundex sederhana untuk perbandingan fonetik
 */
function soundex(str) {
  const s = str.toUpperCase().split('');
  const map = {
    B: 1, F: 1, P: 1, V: 1,
    C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2,
    D: 3, T: 3,
    L: 4,
    M: 5, N: 5,
    R: 6
  };

  const first = s[0];
  const coded = s.map(c => map[c] || 0)
    .filter((val, i, arr) => i === 0 || val !== arr[i - 1])
    .filter(val => val !== 0);

  return (first + coded.join('')).padEnd(4, '0').slice(0, 4);
}

function checkTyposquatting(domainName) {
  // Ambil bagian nama domain saja (tanpa TLD)
  const domainCore = domainName.split('.')[0].toLowerCase();

  let closestMatch = null;
  let closestDistance = Infinity;

  for (const brand of TOP_DOMAINS) {
    const distance = levenshtein(domainCore, brand);
    if (distance <= 2 && distance > 0 && distance < closestDistance) {
      closestDistance = distance;
      closestMatch = brand;
    }
  }

  // Soundex sebagai secondary check
  if (!closestMatch) {
    const domainSoundex = soundex(domainCore);
    for (const brand of TOP_DOMAINS) {
      if (soundex(brand) === domainSoundex && domainCore !== brand) {
        closestMatch = brand;
        closestDistance = levenshtein(domainCore, brand);
        break;
      }
    }
  }

  return {
    isTyposquatting: closestMatch !== null,
    similarTo: closestMatch,
    score: closestMatch ? 40 : 0
  };
}

// ============================================================
// SUB-FUNGSI 4: checkSuspiciousTLD
// ============================================================
function checkSuspiciousTLD(publicSuffix) {
  const tld = '.' + publicSuffix;
  const isSuspicious = SUSPICIOUS_TLDS.includes(tld);
  return {
    isSuspicious,
    score: isSuspicious ? 15 : 0
  };
}

// ============================================================
// SUB-FUNGSI 5: checkURLStructure
// ============================================================
function checkURLStructure(parsedUrl) {
  const anomalies = [];
  let score = 0;

  const hostname = parsedUrl.hostname;
  const href = parsedUrl.href;

  // Subdomain count > 3
  const subdomainParts = hostname.split('.');
  if (subdomainParts.length > 3) {
    anomalies.push(`BANYAK_SUBDOMAIN: ${subdomainParts.length} level`);
    score += 15;
  }

  // Karakter @ dalam URL
  if (href.includes('@')) {
    anomalies.push('KARAKTER_AT_DITEMUKAN');
    score += 35;
  }

  // IPv4 sebagai hostname
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(hostname)) {
    anomalies.push('IPV4_SEBAGAI_HOSTNAME');
    score += 40;
  }

  // Port tidak standar
  const port = parsedUrl.port;
  if (port && port !== '80' && port !== '443') {
    anomalies.push(`PORT_TIDAK_STANDAR: ${port}`);
    score += 20;
  }

  // URL terlalu panjang
  if (href.length > 100) {
    anomalies.push(`URL_PANJANG: ${href.length} karakter`);
    score += 10;
  }

  // Phishing keywords di subdomain
  const subdomainStr = subdomainParts.slice(0, -2).join('.').toLowerCase();
  for (const keyword of PHISHING_KEYWORDS) {
    if (subdomainStr.includes(keyword)) {
      anomalies.push(`PHISHING_KEYWORD: "${keyword}" di subdomain`);
      score += 20;
      break; // Hitung sekali saja
    }
  }

  return { anomalies, score };
}

// ============================================================
// SUB-FUNGSI 6: checkRDAP (Domain age via RDAP)
// ============================================================
async function checkRDAP(domain) {
  const result = {
    ageInDays: null,
    registrant: null,
    country: null,
    score: 0,
    isDomainAgeApplicable: true
  };

  try {
    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      timeout: 3000,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) return result;

    const data = await response.json();

    // Parse events array untuk registration date
    if (data.events && Array.isArray(data.events)) {
      const registrationEvent = data.events.find(
        e => e.eventAction === 'registration'
      );

      if (registrationEvent && registrationEvent.eventDate) {
        const registrationDate = new Date(registrationEvent.eventDate);
        const now = new Date();
        const diffMs = now - registrationDate;
        const ageInDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        result.ageInDays = ageInDays;

        if (ageInDays < 7) {
          result.score = 50;
        } else if (ageInDays < 30) {
          result.score = 30;
        }
      }
    }

    // Coba ambil info registrant
    if (data.entities && Array.isArray(data.entities)) {
      for (const entity of data.entities) {
        if (entity.roles && entity.roles.includes('registrant')) {
          if (entity.vcardArray && entity.vcardArray[1]) {
            const vcard = entity.vcardArray[1];
            for (const field of vcard) {
              if (field[0] === 'fn') result.registrant = field[3];
              if (field[0] === 'adr') {
                const adrParts = field[3];
                if (Array.isArray(adrParts) && adrParts.length > 5) {
                  result.country = adrParts[6] || null;
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    // RDAP gagal — jangan crash, kembalikan default
  }

  return result;
}

// ============================================================
// SUB-FUNGSI 7: checkSSL
// ============================================================
async function checkSSL(hostname) {
  const result = {
    hasHttps: false,
    issuer: null,
    certAgeInDays: null,
    expired: false,
    mismatch: false,
    score: 0
  };

  return new Promise((resolve) => {
    try {
      const options = {
        hostname,
        port: 443,
        method: 'HEAD',
        rejectUnauthorized: false, // Terima sertifikat apapun untuk inspeksi
        timeout: 3000
      };

      const req = https.request(options, (res) => {
        const cert = res.socket.getPeerCertificate();

        if (cert && Object.keys(cert).length > 0) {
          result.hasHttps = true;

          // Issuer
          if (cert.issuer && cert.issuer.O) {
            result.issuer = cert.issuer.O;
          }

          // Valid dates
          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();

          // Hitung umur sertifikat
          result.certAgeInDays = Math.floor((now - validFrom) / (1000 * 60 * 60 * 24));

          // Cek expired
          if (validTo < now) {
            result.expired = true;
            result.score += 25;
          }

          // Cek Let's Encrypt + umur < 30 hari
          if (result.issuer && result.issuer.includes("Let's Encrypt") && result.certAgeInDays < 30) {
            result.score += 15;
          }

          // Cek hostname mismatch
          if (cert.subject && cert.subject.CN) {
            const cn = cert.subject.CN.toLowerCase();
            const host = hostname.toLowerCase();
            // Cek exact match atau wildcard match
            if (cn !== host && !cn.startsWith('*.') && !(cn.startsWith('*.') && host.endsWith(cn.slice(1)))) {
              // Cek juga subjectAltNames
              const altNames = (cert.subjectaltname || '').split(', ').map(n => n.replace('DNS:', '').toLowerCase());
              if (!altNames.includes(host) && !altNames.some(an => an.startsWith('*.') && host.endsWith(an.slice(1)))) {
                result.mismatch = true;
                result.score += 30;
              }
            }
          }
        } else {
          // Tidak ada HTTPS
          result.score += 20;
        }

        resolve(result);
      });

      req.on('error', () => {
        result.score += 20; // Tidak ada HTTPS
        resolve(result);
      });

      req.on('timeout', () => {
        req.destroy();
        result.score += 20;
        resolve(result);
      });

      req.end();
    } catch (e) {
      result.score += 20;
      resolve(result);
    }
  });
}

// ============================================================
// FUNGSI UTAMA: analyzeDomain
// ============================================================
async function analyzeDomain(url) {
  const flags = [];
  let totalScore = 0;

  // Parse URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (e) {
    try {
      parsedUrl = new URL('https://' + url);
    } catch (e2) {
      return { error: true, message: 'URL tidak valid' };
    }
  }

  const hostname = parsedUrl.hostname;

  // SUB 1: Extract root domain
  const domainInfo = extractRootDomain(hostname);

  // SUB 2: Check whitelist
  const whitelistResult = checkWhitelist(domainInfo.domain);
  if (whitelistResult.isWhitelisted) {
    flags.push('WHITELISTED');
  }

  // SUB 3: Check typosquatting
  const typoResult = checkTyposquatting(domainInfo.domain);
  if (typoResult.isTyposquatting) {
    flags.push(`TYPOSQUATTING: mirip "${typoResult.similarTo}"`);
    totalScore += typoResult.score;
  }

  // SUB 4: Check suspicious TLD
  const tldResult = checkSuspiciousTLD(domainInfo.publicSuffix);
  if (tldResult.isSuspicious) {
    flags.push(`TLD_MENCURIGAKAN: .${domainInfo.publicSuffix}`);
    totalScore += tldResult.score;
  }

  // SUB 5: Check URL structure
  const structureResult = checkURLStructure(parsedUrl);
  if (structureResult.anomalies.length > 0) {
    flags.push(...structureResult.anomalies);
    totalScore += structureResult.score;
  }

  // SUB 6: Check RDAP (domain age)
  const rdapResult = await checkRDAP(domainInfo.domain);
  if (rdapResult.score > 0) {
    flags.push(`DOMAIN_MUDA: ${rdapResult.ageInDays} hari`);
    totalScore += rdapResult.score;
  }

  // SUB 7: Check SSL
  const sslResult = await checkSSL(hostname);
  if (sslResult.score > 0) {
    const sslFlags = [];
    if (!sslResult.hasHttps) sslFlags.push('TIDAK_ADA_HTTPS');
    if (sslResult.expired) sslFlags.push('SERTIFIKAT_EXPIRED');
    if (sslResult.mismatch) sslFlags.push('HOSTNAME_MISMATCH');
    flags.push(...sslFlags);
    totalScore += sslResult.score;
  }

  // Terapkan whitelist modifier
  totalScore += whitelistResult.scoreModifier;

  // Cap pada 0-100
  totalScore = Math.max(0, Math.min(totalScore, 100));

  return {
    rootDomain: domainInfo.domain,
    subdomain: domainInfo.subdomain,
    isWhitelisted: whitelistResult.isWhitelisted,
    whitelistModifier: whitelistResult.scoreModifier,
    isTyposquatting: typoResult.isTyposquatting,
    similarTo: typoResult.similarTo,
    isSuspiciousTLD: tldResult.isSuspicious,
    urlAnomalies: structureResult.anomalies,
    rdap: {
      ageInDays: rdapResult.ageInDays,
      country: rdapResult.country,
      score: rdapResult.score,
      isDomainAgeApplicable: rdapResult.isDomainAgeApplicable
    },
    ssl: {
      hasHttps: sslResult.hasHttps,
      issuer: sslResult.issuer,
      certAgeInDays: sslResult.certAgeInDays,
      expired: sslResult.expired,
      mismatch: sslResult.mismatch,
      score: sslResult.score
    },
    totalScore,
    flags
  };
}

module.exports = {
  analyzeDomain,
  extractRootDomain,
  checkWhitelist,
  checkTyposquatting,
  checkSuspiciousTLD,
  checkURLStructure,
  checkRDAP,
  checkSSL
};

// ===== UNIT TESTS (jalankan dengan: node domainAnalyzer.js) =====
if (require.main === module) {
  console.log('🧪 Menjalankan Unit Tests untuk domainAnalyzer.js...\n');

  // Test synchronous functions
  const tests = [
    {
      name: '1. Extract root domain (.co.id)',
      fn: () => {
        const r = extractRootDomain('www.bca.co.id');
        return r.domain === 'bca.co.id' && r.subdomain === 'www';
      },
      desc: 'Harus handle ccTLD .co.id'
    },
    {
      name: '2. Whitelist check (domain resmi)',
      fn: () => checkWhitelist('tokopedia.com').isWhitelisted === true,
      desc: 'tokopedia.com harus ada di whitelist'
    },
    {
      name: '3. Whitelist check (domain palsu)',
      fn: () => checkWhitelist('tokopediia.com').isWhitelisted === false,
      desc: 'tokopediia.com TIDAK boleh lolos whitelist'
    },
    {
      name: '4. Typosquatting detection',
      fn: () => {
        const r = checkTyposquatting('tokoopedia.com');
        return r.isTyposquatting === true && r.similarTo === 'tokopedia';
      },
      desc: 'Harus mendeteksi kemiripan dengan tokopedia'
    },
    {
      name: '5. Suspicious TLD',
      fn: () => checkSuspiciousTLD('xyz').isSuspicious === true,
      desc: '.xyz harus terdeteksi mencurigakan'
    },
    {
      name: '6. Safe TLD',
      fn: () => checkSuspiciousTLD('com').isSuspicious === false,
      desc: '.com tidak boleh terdeteksi mencurigakan'
    },
    {
      name: '7. URL structure — IPv4 hostname',
      fn: () => {
        const parsed = new URL('http://192.168.1.1/login');
        const r = checkURLStructure(parsed);
        return r.anomalies.some(a => a.includes('IPV4'));
      },
      desc: 'Harus mendeteksi IP sebagai hostname'
    },
    {
      name: '8. URL structure — @ character',
      fn: () => {
        const parsed = new URL('https://google.com@evil.com/steal');
        const r = checkURLStructure(parsed);
        return r.anomalies.some(a => a.includes('AT'));
      },
      desc: 'Harus mendeteksi karakter @'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const ok = test.fn();
    if (ok) {
      console.log(`  ✅ ${test.name}: ${test.desc}`);
      passed++;
    } else {
      console.log(`  ❌ ${test.name}: ${test.desc}`);
      failed++;
    }
  }

  console.log(`\n📊 Hasil: ${passed} lulus, ${failed} gagal dari ${tests.length} test.`);
}
