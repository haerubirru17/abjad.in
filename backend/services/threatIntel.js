/**
 * Threat Intelligence untuk Abjad.in
 * Mengecek URL terhadap berbagai sumber intelijen ancaman secara paralel:
 * Google Safe Browsing, OpenPhish, Abuse.ch URLhaus, PhishTank, dan Judol Blacklist.
 * 
 * Fungsi utama: checkThreatIntel(finalUrl, chain)
 */

const fetch = require('node-fetch');
const cacheService = require('./cacheService');
const localBlacklist = require('./localBlacklist');
const { extractRootDomain, checkWhitelist } = require('./domainAnalyzer');

// API Keys dari environment variables
const SAFE_BROWSING_KEY = process.env.GOOGLE_SAFE_BROWSING_API_KEY || '';
const PHISHTANK_KEY = process.env.PHISHTANK_API_KEY || '';

/**
 * CHECK 1: Google Safe Browsing API v4
 */
async function checkGoogleSafeBrowsing(urls) {
  if (!SAFE_BROWSING_KEY) {
    return { gsb: false, error: 'API key tidak tersedia' };
  }

  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${SAFE_BROWSING_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
        body: JSON.stringify({
          client: { clientId: 'abjadin', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: urls.map(u => ({ url: u }))
          }
        })
      }
    );

    if (!response.ok) {
      return { gsb: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.matches && data.matches.length > 0) {
      const threatType = data.matches[0].threatType;
      return { gsb: true, threatType, override: 100 };
    }

    return { gsb: false };
  } catch (error) {
    return { gsb: false, error: error.message };
  }
}

/**
 * CHECK 2: OpenPhish (feed-based, cached di Firestore)
 */
async function checkOpenPhish(finalUrl) {
  try {
    // Timeout 3 detik agar tidak blocking jika Firestore tidak tersedia
    const cacheTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
    let openphishUrls = await Promise.race([
      cacheService.get('openphish_feed'),
      cacheTimeout
    ]);

    if (!openphishUrls) {
      // Fetch feed terbaru (timeout 5 detik)
      const response = await fetch('https://openphish.com/feed.txt', {
        timeout: 5000
      });

      if (response.ok) {
        const text = await response.text();
        openphishUrls = text.split('\n').filter(u => u.trim().length > 0);
        // Cache async, tidak perlu await
        cacheService.set('openphish_feed', openphishUrls, 43200).catch(() => {});
      } else {
        return { openphish: false, error: `HTTP ${response.status}` };
      }
    }

    if (!openphishUrls) return { openphish: false };

    const isMatch = openphishUrls.some(
      phishUrl => finalUrl.includes(phishUrl) || phishUrl.includes(finalUrl)
    );

    return { openphish: isMatch, score: isMatch ? 50 : 0 };
  } catch (error) {
    return { openphish: false, error: error.message };
  }
}

/**
 * CHECK 3: Abuse.ch URLhaus
 */
async function checkURLhaus(domain) {
  try {
    const response = await fetch('https://urlhaus-api.abuse.ch/v1/host/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
      body: `host=${encodeURIComponent(domain)}`
    });

    if (!response.ok) {
      return { urlhaus: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.query_status === 'no_results') {
      return { urlhaus: false };
    }

    if (data.urls && data.urls.length > 0) {
      return {
        urlhaus: true,
        score: 40,
        flag: 'MALWARE',
        threatCount: data.urls.length
      };
    }

    return { urlhaus: false };
  } catch (error) {
    return { urlhaus: false, error: error.message };
  }
}

/**
 * CHECK 4: PhishTank
 */
async function checkPhishTank(finalUrl) {
  if (!PHISHTANK_KEY) {
    return { phishtank: false, error: 'API key tidak tersedia' };
  }

  try {
    const response = await fetch('https://checkurl.phishtank.com/checkurl/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
      body: `url=${encodeURIComponent(finalUrl)}&format=json&app_key=${PHISHTANK_KEY}`
    });

    if (!response.ok) {
      return { phishtank: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (data.results && data.results.valid === true) {
      return { phishtank: true, score: 45 };
    }

    return { phishtank: false };
  } catch (error) {
    return { phishtank: false, error: error.message };
  }
}

/**
 * CHECK 5: Judol Blacklist Indonesia (cached di Firestore)
 */
async function checkJudolBlacklist(domain, finalUrl) {
  try {
    // Timeout 3 detik agar tidak blocking jika Firestore tidak tersedia
    const cacheTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
    let judolData = await Promise.race([
      cacheService.get('judol_blacklist'),
      cacheTimeout
    ]);

    if (!judolData) {
      judolData = { domains: [], urls: [], updatedAt: new Date().toISOString() };
      cacheService.set('judol_blacklist', judolData, 43200).catch(() => {});
    }

    const domainMatch = judolData.domains.some(d => domain.includes(d));
    const urlMatch = judolData.urls.some(u => finalUrl.includes(u));

    if (domainMatch || urlMatch) {
      return { judol: true, override: 95, category: 'JUDI_ONLINE' };
    }

    return { judol: false };
  } catch (error) {
    return { judol: false, error: error.message };
  }
}

/**
 * CHECK 6: Local Blacklist (Zero-Latency)
 * Cek dari dataset lokal JPCERT, Anti-Gambling, Piphis-Loker, dll.
 */
async function checkLocalDB(finalUrl) {
  try {
    // Fungsi ini sinkron (in-memory O(1) lookup), dibungkus Promise agar seragam
    const result = localBlacklist.checkLocalBlacklist(finalUrl);
    return result;
  } catch (error) {
    return { localBlacklist: false, error: error.message };
  }
}

/**
 * Fungsi utama: checkThreatIntel
 * Jalankan SEMUA check secara paralel dengan Promise.allSettled()
 * 
 * @param {string} finalUrl - URL tujuan akhir
 * @param {string[]} chain - Array URL dalam redirect chain
 * @returns {Promise<object>} Hasil agregasi semua threat intelligence
 */
async function checkThreatIntel(finalUrl, chain = []) {
  // Kumpulkan semua URL untuk dicek (finalUrl + semua chain)
  const allUrls = [finalUrl, ...chain.map(c => typeof c === 'string' ? c : c.url)];
  const uniqueUrls = [...new Set(allUrls)].filter(Boolean);

  // Ekstrak domain dari finalUrl
  let domain = '';
  let isWhitelistedDomain = false;
  try {
    domain = new URL(finalUrl).hostname;
    // Cek whitelist — domain whitelisted tidak dicek ke local blacklist
    // (JPCERT kadang memiliki FP untuk domain besar)
    const rootDomainInfo = extractRootDomain(domain);
    isWhitelistedDomain = checkWhitelist(rootDomainInfo.domain).isWhitelisted;
  } catch (e) {
    try {
      domain = new URL('https://' + finalUrl).hostname;
    } catch (e2) { /* abaikan */ }
  }

  // Jalankan semua checks secara paralel
  const [gsbResult, openphishResult, urlhausResult, phishtankResult, judolResult, localResult] =
    await Promise.allSettled([
      checkGoogleSafeBrowsing(uniqueUrls),
      checkOpenPhish(finalUrl),
      checkURLhaus(domain),
      checkPhishTank(finalUrl),
      checkJudolBlacklist(domain, finalUrl),
      // Skip local blacklist untuk domain whitelisted (cegah false positive)
      isWhitelistedDomain
        ? Promise.resolve({ localBlacklist: false, skipped: true })
        : checkLocalDB(finalUrl)
    ]);


  // Ekstrak hasil (handle rejected promises)
  const gsb = gsbResult.status === 'fulfilled' ? gsbResult.value : { gsb: false, error: 'Promise rejected' };
  const openphish = openphishResult.status === 'fulfilled' ? openphishResult.value : { openphish: false, error: 'Promise rejected' };
  const urlhaus = urlhausResult.status === 'fulfilled' ? urlhausResult.value : { urlhaus: false, error: 'Promise rejected' };
  const phishtank = phishtankResult.status === 'fulfilled' ? phishtankResult.value : { phishtank: false, error: 'Promise rejected' };
  const judol = judolResult.status === 'fulfilled' ? judolResult.value : { judol: false, error: 'Promise rejected' };
  const localDb = localResult.status === 'fulfilled' ? localResult.value : { localBlacklist: false, error: 'Promise rejected' };

  // Cek overrides
  let hasOverride = false;
  let overrideScore = 0;
  let overrideCategory = null;

  // Prioritas Override: Local DB > GSB > Judol
  if (localDb.localBlacklist && localDb.override) {
    hasOverride = true;
    overrideScore = localDb.override;
    overrideCategory = localDb.category;
  } else if (gsb.gsb && gsb.override) {
    hasOverride = true;
    overrideScore = gsb.override;
    overrideCategory = gsb.threatType;
  } else if (judol.judol && judol.override) {
    hasOverride = true;
    overrideScore = Math.max(overrideScore, judol.override);
    overrideCategory = judol.category;
  }

  // Hitung total score
  let totalScore = 0;
  totalScore += (openphish.score || 0);
  totalScore += (urlhaus.score || 0);
  totalScore += (phishtank.score || 0);

  if (hasOverride) {
    totalScore = overrideScore;
  }

  totalScore = Math.min(totalScore, 100);

  // Kumpulkan flags
  const flags = [];
  if (localDb.localBlacklist) flags.push(`LOCAL_DB_MATCH: ${localDb.matchSource}`);
  if (gsb.gsb) flags.push(`GSB_MATCH: ${gsb.threatType}`);
  if (openphish.openphish) flags.push('OPENPHISH_MATCH');
  if (urlhaus.urlhaus) flags.push('URLHAUS_MATCH: MALWARE');
  if (phishtank.phishtank) flags.push('PHISHTANK_MATCH');
  if (judol.judol) flags.push('JUDOL_BLACKLIST_MATCH');

  return {
    hasOverride,
    overrideScore,
    overrideCategory,
    scores: {
      local: localDb.localBlacklist ? (localDb.override || 0) : 0,
      gsb: gsb.gsb ? (gsb.override || 0) : 0,
      openphish: openphish.score || 0,
      urlhaus: urlhaus.score || 0,
      phishtank: phishtank.score || 0,
      judol: judol.judol ? (judol.override || 0) : 0
    },
    totalScore,
    flags
  };
}

/**
 * Fungsi tambahan: syncBlacklists
 * Dipanggil oleh Cloud Scheduler setiap 12 jam untuk memperbarui database blacklist.
 */
async function syncBlacklists() {
  const results = { openphish: 0, judol: 0, errors: [] };

  // 1. Sync OpenPhish
  try {
    const response = await fetch('https://openphish.com/feed.txt', { timeout: 15000 });
    if (response.ok) {
      const text = await response.text();
      const urls = text.split('\n').filter(u => u.trim().length > 0);
      await cacheService.set('openphish_feed', urls, 43200);
      results.openphish = urls.length;
    }
  } catch (error) {
    results.errors.push(`OpenPhish sync gagal: ${error.message}`);
  }

  // 2. Sync Judol blacklist (placeholder — sumber akan ditambahkan)
  try {
    // TODO: Fetch dari Kominfo blocklist dan blocklist.id
    // Untuk saat ini, pertahankan data yang ada di cache
    const existing = await cacheService.get('judol_blacklist');
    if (existing) {
      results.judol = (existing.domains?.length || 0) + (existing.urls?.length || 0);
    }
  } catch (error) {
    results.errors.push(`Judol sync gagal: ${error.message}`);
  }

  console.log(`[syncBlacklists] OpenPhish: ${results.openphish} URLs, Judol: ${results.judol} entries`);
  if (results.errors.length > 0) {
    console.error(`[syncBlacklists] Errors:`, results.errors);
  }

  return results;
}

module.exports = {
  checkThreatIntel,
  syncBlacklists,
  // Export individual checks for testing
  checkGoogleSafeBrowsing,
  checkOpenPhish,
  checkURLhaus,
  checkPhishTank,
  checkJudolBlacklist,
  checkLocalDB
};
