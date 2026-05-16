/**
 * Local Blacklist Service untuk Abjad.in
 * ========================================
 * Memuat dataset phishing, judol, dan scam lokal ke dalam memori (Set)
 * untuk pengecekan instan (< 5ms) tanpa membutuhkan API eksternal.
 *
 * Sumber data:
 * 1. JPCERT/CC Phish URL List (84 file CSV, 2019-2026)
 * 2. Anti-Gambling Domains Indonesia (domain judol)
 * 3. Piphis-Loker (subdomain phishing loker palsu Indonesia)
 * 4. TrustPositif Kominfo (jika tersedia)
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// IN-MEMORY BLACKLIST STORES
// ============================================================
const blacklistedDomains = new Set();  // Exact domain matches
const blacklistedUrls = new Set();     // Full URL matches
let isLoaded = false;
let stats = { domains: 0, urls: 0, sources: [], loadTimeMs: 0 };

// ============================================================
// DATASET ROOT
// ============================================================
const DATASETS_DIR = path.resolve(__dirname, '../../datasets');

// ============================================================
// LOADER: Anti-Gambling Domains (Judol Indonesia)
// File: domains.txt — satu domain per baris
// ============================================================
function loadAntiGamblingDomains() {
  const filePath = path.join(DATASETS_DIR, 'anti-gambling-domains', 'domains.txt');
  if (!fs.existsSync(filePath)) return 0;

  const content = fs.readFileSync(filePath, 'utf-8');
  let count = 0;
  content.split('\n').forEach(line => {
    const domain = line.trim().toLowerCase();
    if (domain && !domain.startsWith('#')) {
      blacklistedDomains.add(domain);
      count++;
    }
  });
  return count;
}

// ============================================================
// LOADER: Piphis-Loker (Phishing Loker Palsu Indonesia)
// File: */subdo.txt — format: subdomain[.]domain[.]web[.]id
// ============================================================
function loadPiphisLoker() {
  const baseDir = path.join(DATASETS_DIR, 'piphis-loker');
  if (!fs.existsSync(baseDir)) return 0;

  let count = 0;
  const subDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));

  for (const dir of subDirs) {
    const subdoFile = path.join(baseDir, dir.name, 'subdo.txt');
    if (!fs.existsSync(subdoFile)) continue;

    const content = fs.readFileSync(subdoFile, 'utf-8');
    content.split('\n').forEach(line => {
      let domain = line.trim().toLowerCase();
      if (!domain) return;
      // Bersihkan format defang: subdomain[.]domain → subdomain.domain
      domain = domain.replace(/\[\.\]/g, '.');
      blacklistedDomains.add(domain);
      count++;
    });
  }
  return count;
}

// ============================================================
// LOADER: JPCERT/CC Phish URL List
// File: YYYY/YYYYMM.csv — format: date,URL,description
// ============================================================
function loadJpcertPhishUrls() {
  const baseDir = path.join(DATASETS_DIR, 'phishurl-list');
  if (!fs.existsSync(baseDir)) return 0;

  let count = 0;
  // Baca semua folder tahun (2019, 2020, ... 2026)
  const yearDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name));

  for (const yearDir of yearDirs) {
    const yearPath = path.join(baseDir, yearDir.name);
    const csvFiles = fs.readdirSync(yearPath).filter(f => f.endsWith('.csv'));

    for (const csvFile of csvFiles) {
      const content = fs.readFileSync(path.join(yearPath, csvFile), 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || i === 0 && line.startsWith('date')) continue; // skip header

        // Format CSV: date,URL,description
        const parts = line.split(',');
        if (parts.length >= 2) {
          const url = parts[1].trim().toLowerCase();
          if (url.startsWith('http')) {
            blacklistedUrls.add(url);
            // Juga tambahkan domainnya
            try {
              const hostname = new URL(url).hostname;
              blacklistedDomains.add(hostname);
            } catch (e) { /* skip URL rusak */ }
            count++;
          }
        }
      }
    }
  }
  return count;
}

// ============================================================
// LOADER: TrustPositif Kominfo (jika sudah selesai diclone)
// Baca file .txt yang berisi daftar domain
// ============================================================
function loadTrustPositif() {
  const baseDir = path.join(DATASETS_DIR, 'TrustPositif-archive1');
  if (!fs.existsSync(baseDir)) return 0;

  // Hanya muat file spesifik yang relevan dan berukuran kecil
  // File besar (gambling_indonesia.txt ~78MB, tlds-valid-domains ~86MB, dll) DILEWATI
  // karena memuat ratusan juta domain ke Set = RAM tidak cukup untuk Node.js standar
  const ALLOWED_FILES = [
    'fake-onlydomains.txt',           // ~253KB - domain palsu
    'fakenews-gambling-only.txt',     // ~212KB - fake news + judol
    'doh-onlydomains.txt',            // ~62KB
    'anti.piracy-onlydomains.txt',    // ~184KB
    'd3host.txt',                     // ~2KB
    'whitelist.txt',                  // ~12KB (whitelist, tidak dimasukkan ke blacklist)
  ];

  let count = 0;
  for (const file of ALLOWED_FILES) {
    if (file === 'whitelist.txt') continue; // skip whitelist
    const filePath = path.join(baseDir, file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      content.split('\n').forEach(line => {
        const domain = line.trim().toLowerCase();
        if (domain && !domain.startsWith('#') && !domain.startsWith('//') && domain.includes('.')) {
          blacklistedDomains.add(domain);
          count++;
        }
      });
    } catch (e) {
      console.warn(`[LocalBlacklist] Error loading ${file}: ${e.message}`);
    }
  }
  return count;
}

// ============================================================
// MAIN: Muat semua dataset ke memori
// ============================================================
function loadAllDatasets() {
  if (isLoaded) return stats;

  const startTime = Date.now();
  console.log('[LocalBlacklist] Memuat dataset lokal ke memori...');

  const sources = [];

  // 1. Anti-Gambling (Judol)
  const judolCount = loadAntiGamblingDomains();
  if (judolCount > 0) sources.push({ name: 'Anti-Gambling Domains', count: judolCount });
  console.log(`  ✓ Anti-Gambling Domains: ${judolCount} domain judol`);

  // 2. Piphis-Loker
  const lokerCount = loadPiphisLoker();
  if (lokerCount > 0) sources.push({ name: 'Piphis-Loker', count: lokerCount });
  console.log(`  ✓ Piphis-Loker: ${lokerCount} subdomain phishing loker`);

  // 3. JPCERT/CC
  const jpcertCount = loadJpcertPhishUrls();
  if (jpcertCount > 0) sources.push({ name: 'JPCERT/CC', count: jpcertCount });
  console.log(`  ✓ JPCERT/CC: ${jpcertCount} phishing URLs`);

  // 4. TrustPositif
  const trustCount = loadTrustPositif();
  if (trustCount > 0) sources.push({ name: 'TrustPositif Kominfo', count: trustCount });
  console.log(`  ✓ TrustPositif: ${trustCount} domain`);

  const loadTimeMs = Date.now() - startTime;

  stats = {
    domains: blacklistedDomains.size,
    urls: blacklistedUrls.size,
    sources,
    loadTimeMs
  };

  isLoaded = true;
  console.log(`[LocalBlacklist] ✅ Loaded: ${blacklistedDomains.size} domains + ${blacklistedUrls.size} URLs in ${loadTimeMs}ms`);

  return stats;
}

// ============================================================
// CHECK: Cek URL/domain terhadap blacklist lokal
// ============================================================
function checkLocalBlacklist(finalUrl) {
  // Pastikan dataset sudah dimuat
  if (!isLoaded) loadAllDatasets();

  const startTime = Date.now();
  let matchType = null;
  let matchSource = null;

  // 1. Cek exact URL match
  const normalizedUrl = finalUrl.toLowerCase();
  if (blacklistedUrls.has(normalizedUrl)) {
    matchType = 'EXACT_URL';
    matchSource = 'JPCERT/CC Phish URL';
  }

  // 2. Cek domain match
  if (!matchType) {
    let hostname = '';
    try {
      hostname = new URL(finalUrl).hostname.toLowerCase();
    } catch (e) {
      try {
        hostname = new URL('https://' + finalUrl).hostname.toLowerCase();
      } catch (e2) { /* skip */ }
    }

    if (hostname && blacklistedDomains.has(hostname)) {
      matchType = 'DOMAIN_MATCH';
      // Tentukan sumber berdasarkan pola domain
      if (hostname.includes('.web.id')) {
        matchSource = 'Piphis-Loker (Phishing Loker Palsu)';
      } else {
        matchSource = 'Local Blacklist Database';
      }
    }

    // 3. Cek subdomain match — jika hostname adalah subdomain dari domain yang diblokir
    if (!matchType && hostname) {
      for (const blockedDomain of blacklistedDomains) {
        if (hostname !== blockedDomain && hostname.endsWith('.' + blockedDomain)) {
          matchType = 'SUBDOMAIN_MATCH';
          matchSource = 'Local Blacklist Database';
          break;
        }
      }
    }
  }

  const checkTimeMs = Date.now() - startTime;

  if (matchType) {
    return {
      localBlacklist: true,
      matchType,
      matchSource,
      override: 95,
      category: matchSource.includes('Gambling') ? 'JUDI_ONLINE' : 'PHISHING',
      checkTimeMs
    };
  }

  return { localBlacklist: false, checkTimeMs };
}

// ============================================================
// INFO: Dapatkan statistik blacklist
// ============================================================
function getStats() {
  if (!isLoaded) loadAllDatasets();
  return stats;
}

module.exports = {
  loadAllDatasets,
  checkLocalBlacklist,
  getStats
};
