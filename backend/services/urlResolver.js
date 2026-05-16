/**
 * URL Resolver untuk Abjad.in
 * Membongkar URL pendek berlapis, mendeteksi client-side redirect,
 * melacak geolokasi setiap hop, dan menghitung skor risiko progresif.
 * 
 * Fungsi utama: resolveUrl(url)
 */

const fetch = require('node-fetch');
const dns = require('dns');
const { promisify } = require('util');

const dnsLookup = promisify(dns.lookup);

// Import database shortener
const shorteners = require('../data/shorteners.json');

// Timeout per hop (ms) — dikurangi 5s→2s agar dead links tidak memperlambat pipeline
const HOP_TIMEOUT = 2000;
// Maksimal hop
const MAX_HOPS = 10;

/**
 * Cek apakah hostname adalah layanan shortener
 * @param {string} hostname 
 * @returns {{isShortener: boolean, isWhitelisted: boolean}}
 */
function checkShortener(hostname) {
  const host = hostname.toLowerCase();
  const isStandard = shorteners.standard.includes(host);
  const isWhitelisted = shorteners.whitelisted.includes(host);
  return {
    isShortener: isStandard || isWhitelisted,
    isWhitelisted
  };
}

/**
 * Resolve IP dan dapatkan geolokasi menggunakan ip-api.com
 * @param {string} hostname 
 * @returns {Promise<{country: string, countryCode: string}|null>}
 */
async function getGeoLocation(hostname) {
  try {
    const { address } = await dnsLookup(hostname);
    const geoResponse = await fetch(
      `http://ip-api.com/json/${address}?fields=country,countryCode`,
      { timeout: 3000 }
    );
    if (geoResponse.ok) {
      return await geoResponse.json();
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Deteksi client-side redirect dari konten HTML
 * @param {string} url 
 * @returns {Promise<string|null>} URL redirect atau null
 */
async function detectClientRedirect(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      timeout: HOP_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Abjad.in/1.0)'
      },
      redirect: 'follow'
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Cek meta refresh
    const metaRefreshMatch = html.match(
      /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)/i
    );
    if (metaRefreshMatch && metaRefreshMatch[1]) {
      return metaRefreshMatch[1].trim();
    }

    // Cek window.location = "..."
    const windowLocationMatch = html.match(
      /window\.location\s*=\s*["']([^"']+)/i
    );
    if (windowLocationMatch && windowLocationMatch[1]) {
      return windowLocationMatch[1].trim();
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Fungsi utama: resolveUrl
 * Membongkar URL pendek, melacak setiap hop, dan menghitung skor risiko.
 * 
 * @param {string} url - URL yang akan di-resolve
 * @returns {Promise<object>} Hasil resolusi lengkap
 */
async function resolveUrl(url) {
  const result = {
    originalUrl: url,
    finalUrl: url,
    chain: [],
    hopCount: 0,
    isShortener: false,
    isWhitelisted: false,
    crossCountry: false,
    countries: [],
    expired: false,
    requiresLogin: false,
    timeout: false,
    riskScore: 0,
    flags: []
  };

  if (!url || typeof url !== 'string') {
    result.flags.push('INPUT_KOSONG');
    return result;
  }

  // Pastikan URL memiliki scheme
  let currentUrl = url;
  try {
    new URL(currentUrl);
  } catch (e) {
    currentUrl = 'https://' + currentUrl;
  }

  // Cek apakah URL awal adalah shortener
  try {
    const parsed = new URL(currentUrl);
    const shortenerCheck = checkShortener(parsed.hostname);
    result.isShortener = shortenerCheck.isShortener;
    result.isWhitelisted = shortenerCheck.isWhitelisted;
  } catch (e) {
    // URL tidak valid
  }

  // ===== LANGKAH 2: Resolve redirect chain =====
  let redirectCount = 0;
  let shortenerCountInChain = 0;

  while (redirectCount < MAX_HOPS) {
    try {
      const response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        timeout: HOP_TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Abjad.in/1.0)'
        }
      });

      const statusCode = response.status;

      // Catat hop ini
      const hopEntry = {
        url: currentUrl,
        statusCode,
        country: null
      };

      // Cek apakah hop ini adalah shortener
      try {
        const hopParsed = new URL(currentUrl);
        if (checkShortener(hopParsed.hostname).isShortener) {
          shortenerCountInChain++;
        }
      } catch (e) { /* abaikan */ }

      result.chain.push(hopEntry);

      // ===== LANGKAH 6: Edge cases =====
      if (statusCode === 404 || statusCode === 410) {
        result.expired = true;
        result.flags.push('LINK_EXPIRED: Link tidak aktif');
        break;
      }

      if (statusCode === 401 || statusCode === 403) {
        result.requiresLogin = true;
        result.flags.push('REQUIRES_LOGIN');
        result.riskScore += 25;
        break;
      }

      // Jika redirect (3xx), ikuti Location header
      if (statusCode >= 300 && statusCode < 400) {
        const nextUrl = response.headers.get('location');
        if (nextUrl) {
          currentUrl = new URL(nextUrl, currentUrl).toString();
          redirectCount++;
        } else {
          break;
        }
      } else {
        // Bukan redirect, sudah sampai di tujuan akhir
        break;
      }
    } catch (error) {
      if (error.type === 'request-timeout' || error.code === 'ETIMEDOUT') {
        result.timeout = true;
        result.flags.push('TIMEOUT');
      } else {
        result.flags.push(`RESOLVE_ERROR: ${error.message}`);
      }
      break;
    }
  }

  result.finalUrl = currentUrl;
  result.hopCount = result.chain.length;

  // ===== LANGKAH 3: Deteksi client-side redirect =====
  if (result.chain.length > 0) {
    const clientRedirect = await detectClientRedirect(currentUrl);
    if (clientRedirect) {
      try {
        const absoluteRedirect = new URL(clientRedirect, currentUrl).toString();
        result.chain.push({
          url: absoluteRedirect,
          statusCode: 'CLIENT_REDIRECT',
          country: null
        });
        result.finalUrl = absoluteRedirect;
        result.hopCount = result.chain.length;
        result.flags.push(`CLIENT_REDIRECT: ${absoluteRedirect}`);
      } catch (e) { /* URL redirect tidak valid, abaikan */ }
    }
  }

  // Cek redirect ke Play Store
  try {
    const finalParsed = new URL(result.finalUrl);
    if (finalParsed.hostname === 'play.google.com') {
      const packageName = finalParsed.searchParams.get('id');
      if (packageName) {
        // Validasi format package name (com.example.app)
        const validPackage = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageName);
        if (!validPackage) {
          result.flags.push(`INVALID_PACKAGE_NAME: ${packageName}`);
          result.riskScore += 20;
        }
      }
    }
  } catch (e) { /* abaikan */ }

  // ===== LANGKAH 4: Geolocation per hop (PARALEL) =====
  const countrySet = new Set();
  await Promise.all(
    result.chain.map(async (hop) => {
      try {
        const parsed = new URL(hop.url);
        const geo = await getGeoLocation(parsed.hostname);
        if (geo) {
          hop.country = geo.countryCode;
          countrySet.add(geo.countryCode);
        }
      } catch (e) { /* abaikan */ }
    })
  );

  result.countries = [...countrySet];
  if (result.countries.length > 1) {
    result.crossCountry = true;
    result.flags.push(`CROSS_COUNTRY: ${result.countries.join(' → ')}`);
  }

  // ===== LANGKAH 5: Progressive shortener scoring =====
  if (!result.isWhitelisted) {
    switch (shortenerCountInChain) {
      case 0:
      case 1:
        // Skor 0 untuk 1 shortener
        break;
      case 2:
        result.riskScore += 25;
        result.flags.push('DOUBLE_SHORTENER');
        break;
      case 3:
        result.riskScore += 40;
        result.flags.push('TRIPLE_SHORTENER');
        break;
      default:
        result.riskScore += 60;
        result.flags.push(`EXCESSIVE_SHORTENERS: ${shortenerCountInChain}`);
        break;
    }
  }

  // Cap skor maksimal 100
  result.riskScore = Math.min(result.riskScore, 100);

  return result;
}

module.exports = {
  resolveUrl,
  checkShortener
};
