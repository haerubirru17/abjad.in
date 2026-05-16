/**
 * Route Feedback untuk Abjad.in
 * POST /api/feedback — Menerima feedback pengguna tentang akurasi hasil scan
 */

const express = require('express');
const router = express.Router();
const cacheService = require('../services/cacheService');

// POST /api/feedback
router.post('/', async (req, res) => {
  try {
    const { scanId, isAccurate, userVerdict, comment } = req.body;

    // Validasi
    if (!scanId) {
      return res.status(400).json({ error: 'scanId wajib diisi.' });
    }

    if (typeof isAccurate !== 'boolean') {
      return res.status(400).json({ error: 'isAccurate harus berupa boolean (true/false).' });
    }

    const feedback = {
      scanId,
      isAccurate,
      userVerdict: userVerdict || null,
      comment: comment ? comment.slice(0, 500) : null, // Limit 500 karakter
      submittedAt: new Date().toISOString(),
      ip: req.ip
    };

    // Simpan feedback ke cache/Firestore
    const feedbackKey = `feedback:${scanId}:${Date.now()}`;
    await cacheService.set(feedbackKey, feedback, 604800); // Simpan 7 hari

    res.json({
      success: true,
      message: 'Terima kasih atas feedback Anda! Ini membantu kami meningkatkan akurasi Abjad.in.',
      feedbackId: feedbackKey
    });

  } catch (error) {
    console.error('[Feedback] Error:', error.message);
    res.status(500).json({ error: 'Gagal menyimpan feedback. Silakan coba lagi.' });
  }
});

module.exports = router;
