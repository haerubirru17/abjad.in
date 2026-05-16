/**
 * Route Scan untuk Abjad.in
 * GET /api/scan/:id — Mengambil hasil scan berdasarkan scan ID
 */

const express = require('express');
const router = express.Router();
const cacheService = require('../services/cacheService');

// GET /api/scan/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Scan ID tidak valid.' });
    }

    // Coba cari di cache
    const cached = await cacheService.get('scan_result:' + id);
    if (cached) {
      return res.json({
        ...cached,
        fromCache: true
      });
    }

    // Tidak ditemukan
    return res.status(404).json({
      error: 'Hasil scan tidak ditemukan atau sudah expired.',
      scanId: id
    });

  } catch (error) {
    console.error('[Scan] Error:', error.message);
    res.status(500).json({ error: 'Terjadi kesalahan saat mengambil hasil scan.' });
  }
});

module.exports = router;
