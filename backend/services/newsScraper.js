/**
 * News Scraper untuk Abjad.in
 * Mengambil berita terbaru tentang keamanan siber Indonesia
 * dari feed RSS sumber terpercaya.
 * 
 * Digunakan untuk:
 * 1. Menampilkan berita di dashboard pengguna
 * 2. Memperkaya database ancaman terbaru
 * 
 * Fungsi utama: scrapeLatestNews()
 */

const Parser = require('rss-parser');
const cacheService = require('./cacheService');

const rssParser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Abjad.in News Scraper/1.0'
  }
});

// Sumber berita keamanan siber Indonesia & global
const NEWS_FEEDS = [
  {
    name: 'Kominfo',
    url: 'https://www.kominfo.go.id/content/all/rss',
    category: 'pemerintah',
    language: 'id'
  },
  {
    name: 'BSSN',
    url: 'https://bssn.go.id/feed/',
    category: 'pemerintah',
    language: 'id'
  },
  {
    name: 'Detik Inet',
    url: 'https://rss.detik.com/index.php/inet',
    category: 'media',
    language: 'id'
  },
  {
    name: 'Kompas Tekno',
    url: 'https://www.kompas.com/tag/keamanan-siber/rss',
    category: 'media',
    language: 'id'
  },
  {
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    category: 'internasional',
    language: 'en'
  },
  {
    name: 'BleepingComputer',
    url: 'https://www.bleepingcomputer.com/feed/',
    category: 'internasional',
    language: 'en'
  }
];

// Kata kunci relevan untuk filter berita
const RELEVANT_KEYWORDS = [
  'phishing', 'penipuan', 'scam', 'malware', 'ransomware',
  'judi online', 'judol', 'slot', 'keamanan siber', 'cyber',
  'hack', 'data bocor', 'breach', 'kominfo', 'blokir',
  'whatsapp', 'telegram', 'link berbahaya', 'modus baru',
  'ojk', 'bpjs', 'bank', 'e-wallet', 'fintech'
];

/**
 * Cek apakah berita relevan berdasarkan kata kunci
 * @param {string} title 
 * @param {string} content 
 * @returns {boolean}
 */
function isRelevant(title, content = '') {
  const combined = (title + ' ' + content).toLowerCase();
  return RELEVANT_KEYWORDS.some(keyword => combined.includes(keyword));
}

/**
 * Fungsi utama: scrapeLatestNews
 * Mengambil berita dari semua feed, filter yang relevan,
 * dan mengurutkan berdasarkan tanggal terbaru.
 * 
 * @param {number} limit - Jumlah berita maksimal yang dikembalikan
 * @returns {Promise<object[]>} Array berita
 */
async function scrapeLatestNews(limit = 20) {
  // Cek cache dulu (cache 30 menit)
  try {
    const cached = await cacheService.get('latest_news');
    if (cached) return cached;
  } catch (e) { /* cache miss */ }

  const allArticles = [];

  // Fetch semua feed secara paralel
  const feedResults = await Promise.allSettled(
    NEWS_FEEDS.map(async (feed) => {
      try {
        const parsed = await rssParser.parseURL(feed.url);
        return parsed.items.map(item => ({
          title: item.title || '',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || '',
          source: feed.name,
          category: feed.category,
          language: feed.language,
          snippet: (item.contentSnippet || item.content || '').substring(0, 200)
        }));
      } catch (error) {
        console.warn(`[NewsScraper] Gagal fetch ${feed.name}: ${error.message}`);
        return [];
      }
    })
  );

  // Kumpulkan semua artikel
  for (const result of feedResults) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  // Filter yang relevan
  const relevant = allArticles.filter(
    article => isRelevant(article.title, article.snippet)
  );

  // Urutkan berdasarkan tanggal terbaru
  relevant.sort((a, b) => {
    const dateA = new Date(a.pubDate || 0);
    const dateB = new Date(b.pubDate || 0);
    return dateB - dateA;
  });

  // Ambil sesuai limit
  const result = relevant.slice(0, limit);

  // Cache 30 menit
  try {
    await cacheService.set('latest_news', result, 1800);
  } catch (e) { /* abaikan error cache */ }

  return result;
}

module.exports = {
  scrapeLatestNews,
  NEWS_FEEDS,
  isRelevant
};
