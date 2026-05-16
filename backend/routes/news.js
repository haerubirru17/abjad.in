/**
 * Route News untuk Abjad.in
 * GET /api/news — Mengambil berita keamanan siber terbaru
 */

const express = require('express');
const router = express.Router();
const { scrapeLatestNews } = require('../services/newsScraper');

// GET /api/news
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const safeLimit = Math.min(Math.max(1, limit), 50); // Clamp 1-50

    const news = await scrapeLatestNews(safeLimit);

    res.json({
      count: news.length,
      articles: news
    });

  } catch (error) {
    console.error('[News] Error:', error.message);
    res.status(500).json({
      error: 'Gagal mengambil berita. Silakan coba lagi nanti.',
      articles: []
    });
  }
});

module.exports = router;
