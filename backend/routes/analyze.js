/**
 * Route Analyze untuk Abjad.in
 * Orkestrator utama — menyatukan semua services menjadi satu pipeline analisis.
 * 
 * ARSITEKTUR PIPELINE v2 (Optimized):
 * ─────────────────────────────────────
 * FASE 0 [< 5ms]   : Local Blacklist + ML Lexical (Early Exit)
 * FASE 1 [Paralel] : URL Resolver + Homograph + Domain + Threat Intel (bersamaan)
 * FASE 2 [Paralel] : Gemini Unified Analysis (1 prompt, bukan 3)
 * 
 * POST /api/analyze
 * Body: { text, url, image, imageMimeType, senderContext }
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Import semua services
const cacheService = require('../services/cacheService');
const urlNormalizer = require('../services/urlNormalizer');
const urlResolver = require('../services/urlResolver');
const homographCheck = require('../services/homographCheck');
const domainAnalyzer = require('../services/domainAnalyzer');
const threatIntel = require('../services/threatIntel');
const geminiAnalyzer = require('../services/geminiAnalyzer');
const imageHasher = require('../services/imageHasher');
const verdictEngine = require('../services/verdictEngine');
const webRiskSubmitter = require('../services/webRiskSubmitter');
const onnxRunner = require('../services/onnxRunner');
const localBlacklist = require('../services/localBlacklist');

// Regex untuk mengekstrak URL dari teks
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+|(?:www\.)[^\s<>"{}|\\^`\[\]]+/gi;

/**
 * Ekstrak semua URL dari string teks
 */
function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  return [...new Set(matches)];
}

/**
 * Hitung skor preliminary untuk menentukan apakah perlu content analysis
 */
function calculatePrelimScore(homographResult, domainResult, intelResult) {
  let score = 0;
  if (homographResult?.riskScore) score += homographResult.riskScore;
  if (domainResult?.totalScore) score += domainResult.totalScore;
  if (intelResult?.totalScore) score += intelResult.totalScore;
  return Math.min(score, 100);
}

/**
 * Cache TTL berdasarkan verdict
 */
function getCacheTTL(verdict) {
  switch (verdict) {
    case 'AMAN': return 86400;         // 24 jam
    case 'MENCURIGAKAN': return 21600; // 6 jam
    case 'BERBAHAYA': return 10800;    // 3 jam
    case 'BLOKIR': return 43200;       // 12 jam
    default: return 3600;              // 1 jam
  }
}

/**
 * Helper: Build fast verdict response untuk early exit
 */
function buildFastVerdict(scanId, targetUrl, score, category, reason, source) {
  const verdictLabel = score >= 85 ? 'BLOKIR' : 'BERBAHAYA';
  const action = score >= 85 ? 'BLOCK' : 'STRONG_WARN';
  const emoji = score >= 85 ? '🔴' : '🟠';
  
  let advice = 'Link ini sangat berbahaya. Jangan klik atau buka di perangkat apapun.';
  if (category === 'JUDI_ONLINE') {
    advice = 'Ini situs judi online ilegal. Jangan klik! Laporkan ke Kominfo: aduankonten.id';
  } else if (category === 'PHISHING') {
    advice = 'Ini link penipuan! Jangan klik! Laporkan ke IASC OJK: 157';
  }

  return {
    scanId,
    verdict: verdictLabel,
    score,
    rawScore: score,
    category,
    action,
    emoji,
    advice,
    explanation: reason,
    factorsPositive: [],
    factorsNegative: [source],
    flagKeys: [source],
    flags: [{ key: source, severity: 'CRITICAL' }],
    resolvedUrl: targetUrl,
    originalUrl: targetUrl,
    redirectChain: [],
    gapWarning: null,
    analyzedAt: new Date().toISOString(),
    expiredAt: new Date(Date.now() + 43200000).toISOString(),
    fromCache: false,
    fastPath: true,
  };
}

// POST /api/analyze
router.post('/', async (req, res) => {
  const startTime = Date.now();
  // Pipeline tracking — ditampilkan di frontend sebagai laporan pemindaian
  const pipeline = [];
  const tp = (step, status, detail) => pipeline.push({ step, status, detail: detail || null });

  // Timeout 25 detik (dipercepat dari 45)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({
        error: 'Analisis memakan waktu terlalu lama. Silakan coba lagi.',
        timeout: true
      });
    }
  }, 25000);

  try {
    const { text, url, image, imageMimeType, senderContext } = req.body;

    // ===== VALIDASI INPUT =====
    if (!text && !url && !image) {
      clearTimeout(timeout);
      return res.status(400).json({
        error: 'Minimal satu dari text, url, atau image harus diisi.'
      });
    }

    if (image) {
      const estimatedSize = (image.length * 3) / 4;
      if (estimatedSize > 5 * 1024 * 1024) {
        clearTimeout(timeout);
        return res.status(400).json({
          error: 'Ukuran gambar terlalu besar. Maksimal 5MB.'
        });
      }
    }

    if (text && text.length > 10000) {
      clearTimeout(timeout);
      return res.status(400).json({
        error: 'Teks terlalu panjang. Maksimal 10.000 karakter.'
      });
    }

    // ===== STEP 1: Generate scan ID & input hash =====
    const scanId = uuidv4();
    const inputHash = crypto.createHash('sha256')
      .update(JSON.stringify({ text, url, image: image?.substring(0, 100) }))
      .digest('hex');

    // ===== STEP 2: Cek cache =====
    try {
      const cached = await cacheService.get('scan:' + inputHash);
      if (cached) {
        clearTimeout(timeout);
        return res.json({
          ...cached,
          fromCache: true,
          cachedAt: cached.analyzedAt
        });
      }
    } catch (e) { /* cache miss, lanjut */ }
    tp('Cache', 'miss', null);

    // ===== STEP 3: Pre-processing URL =====
    let targetUrl = url || null;
    let normalizedResult = null;
    let visionResult = null;

    if (!targetUrl && text) {
      const extractedUrls = extractUrls(text);
      if (extractedUrls.length > 0) {
        targetUrl = extractedUrls[0];
      }
    }

    if (targetUrl) {
      normalizedResult = urlNormalizer.normalizeUrl(targetUrl);

      if (normalizedResult.blocked) {
        clearTimeout(timeout);
        return res.json({
          scanId,
          verdict: 'BLOKIR',
          score: 100,
          category: 'PHISHING',
          action: 'BLOCK',
          emoji: '🔴',
          advice: 'URL menggunakan URI scheme berbahaya. Jangan klik!',
          explanation: `URL diblokir: ${normalizedResult.flags.join(', ')}`,
          factorsPositive: [],
          factorsNegative: normalizedResult.flags,
          flagKeys: normalizedResult.flags,
          flags: normalizedResult.flags.map(f => ({ key: f, severity: 'CRITICAL' })),
          originalUrl: targetUrl,
          resolvedUrl: null,
          redirectChain: [],
          analyzedAt: new Date().toISOString(),
          fromCache: false
        });
      }

      if (normalizedResult.wasRedirect && normalizedResult.extractedUrl) {
        targetUrl = normalizedResult.extractedUrl;
      } else {
        targetUrl = normalizedResult.normalizedUrl || targetUrl;
      }
    }

    // ===================================================
    // ⚡ FASE 0 — EARLY EXIT (< 10ms, tanpa network)
    // ===================================================
    // Cek Local Blacklist (in-memory Set, instan)
    if (targetUrl) {
      // Cek apakah domain ini whitelisted — jika iya, skip blacklist check
      let isWhitelisted = false;
      try {
        const { extractRootDomain, checkWhitelist } = require('../services/domainAnalyzer');
        const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl);
        const rootDomain = extractRootDomain(parsed.hostname);
        isWhitelisted = checkWhitelist(rootDomain.domain).isWhitelisted;
      } catch (e) { /* skip whitelist check jika gagal parse */ }

      if (!isWhitelisted) {
        const blResult = localBlacklist.checkLocalBlacklist(targetUrl);
        if (blResult.localBlacklist) {
          const fastVerdict = buildFastVerdict(
            scanId,
            targetUrl,
            95,
            blResult.category,
            `Terdeteksi di database ancaman lokal: ${blResult.matchSource}`,
            `BLACKLIST_HIT: ${blResult.matchType}`
          );
          fastVerdict.duration = `${Date.now() - startTime}ms`;
          clearTimeout(timeout);
          cacheService.set('scan:' + inputHash, fastVerdict, 43200).catch(() => {});
          return res.json(fastVerdict);
        }
      }
    }

    // Cek ML Lexical (ONNX in-memory, < 5ms)
    let earlyMlResult = null;
    if (targetUrl) {
      try {
        earlyMlResult = await onnxRunner.predictLexical(targetUrl);
        // Jika ML mendeteksi phishing dengan sangat yakin (skor 85+),
        // langsung return tanpa perlu network calls
        if (earlyMlResult?.isPhishing && earlyMlResult.confidence >= 0.90) {
          const fastVerdict = buildFastVerdict(
            scanId,
            targetUrl,
            85,
            'PHISHING',
            'Pola leksikal URL terdeteksi sebagai phishing oleh model AI offline.',
            'ML_LEXICAL: HIGH_CONFIDENCE_PHISHING'
          );
          fastVerdict.duration = `${Date.now() - startTime}ms`;
          clearTimeout(timeout);
          cacheService.set('scan:' + inputHash, fastVerdict, 43200).catch(() => {});
          return res.json(fastVerdict);
        }
      } catch (e) { /* ML gagal, lanjut ke full analysis */ }
    }

    // ===================================================
    // ⚡ STEP 4: Image processing (jika ada)
    // ===================================================
    if (image) {
      const imageHashResult = await imageHasher.checkImageHash(image);
      if (imageHashResult.cacheHit) {
        clearTimeout(timeout);
        return res.json({
          ...imageHashResult.cachedResult,
          fromCache: true,
          cachedAt: imageHashResult.cachedResult?.analyzedAt
        });
      }

      visionResult = await geminiAnalyzer.analyzeVision(image, imageMimeType || 'image/jpeg');

      if (visionResult?.visibleText && !targetUrl) {
        const imgUrls = extractUrls(visionResult.visibleText);
        if (imgUrls.length > 0) {
          targetUrl = imgUrls[0];
          normalizedResult = urlNormalizer.normalizeUrl(targetUrl);
          targetUrl = normalizedResult.normalizedUrl || targetUrl;
        }
      }
    }

    // ===================================================
    // ⚡ FASE 1 — PARALEL NETWORK ANALYSIS
    //    URL Resolver + Homograph + Domain + ThreatIntel
    //    dijalankan BERSAMAAN, bukan sequential
    // ===================================================
    let resolverResult = { finalUrl: targetUrl, chain: [], riskScore: 0, flags: [] };
    let homographResult = { riskScore: 0, hasHomograph: false, flags: [] };
    let domainResult = { totalScore: 0, flags: [] };
    let intelResult = { hasOverride: false, totalScore: 0, flags: [] };

    if (targetUrl) {
      // Jalankan homograph check sekarang (sync, tidak butuh network)
      try {
        const parsedForHomograph = new URL(
          targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl
        );
        homographResult = homographCheck.checkHomograph(parsedForHomograph.hostname);
      } catch (e) { /* URL parsing gagal */ }

      // Resolve URL dulu (blocking, karena finalUrl diperlukan untuk intel + domain)
      try {
        resolverResult = await urlResolver.resolveUrl(targetUrl);
        tp('URL Resolver', resolverResult.chain?.length > 0 ? 'hit' : 'ok',
          resolverResult.chain?.length > 0 ? `${resolverResult.chain.length} redirect ditemukan` : 'Tidak ada redirect');
      } catch (e) {
        resolverResult.flags.push(`RESOLVE_ERROR: ${e.message}`);
        tp('URL Resolver', 'failed', e.message);
      }

      const finalUrlResolved = resolverResult.finalUrl || targetUrl;

      // Domain analysis + Threat Intel PARALEL
      const [domainRes, intelRes] = await Promise.allSettled([
        domainAnalyzer.analyzeDomain(finalUrlResolved),
        threatIntel.checkThreatIntel(finalUrlResolved, resolverResult.chain)
      ]);

      if (domainRes.status === 'fulfilled') {
        domainResult = domainRes.value;
        tp('Analisis Domain', 'ok', domainResult.isWhitelisted ? 'Domain whitelisted' : `Skor domain: ${domainResult.totalScore}`);
      } else {
        domainResult.flags.push(`DOMAIN_ERROR: ${domainRes.reason?.message}`);
        tp('Analisis Domain', 'failed', domainRes.reason?.message);
      }

      if (intelRes.status === 'fulfilled') {
        intelResult = intelRes.value;
        tp('Threat Intelligence', intelResult.hasOverride ? 'hit' : 'ok',
          intelResult.hasOverride ? `Ancaman terdeteksi: ${intelResult.overrideCategory}` : 'Tidak ada ancaman di database global');
      } else {
        tp('Threat Intelligence', 'failed', 'Gagal menghubungi database ancaman');
      }
    }

    const finalUrl = resolverResult.finalUrl || targetUrl;

    // Cek blacklist lagi pada finalUrl jika berbeda dari targetUrl
    if (finalUrl && finalUrl !== targetUrl) {
      const blFinal = localBlacklist.checkLocalBlacklist(finalUrl);
      if (blFinal.localBlacklist) {
        const fastVerdict = buildFastVerdict(
          scanId,
          finalUrl,
          95,
          blFinal.category,
          `URL pendek mengarah ke domain berbahaya: ${blFinal.matchSource}`,
          `BLACKLIST_HIT_REDIRECT: ${blFinal.matchType}`
        );
        fastVerdict.originalUrl = url || targetUrl;
        fastVerdict.resolvedUrl = finalUrl;
        fastVerdict.redirectChain = resolverResult.chain;
        fastVerdict.duration = `${Date.now() - startTime}ms`;
        clearTimeout(timeout);
        cacheService.set('scan:' + inputHash, fastVerdict, 43200).catch(() => {});
        return res.json(fastVerdict);
      }
    }

    // ===================================================
    // ⚡ FASE 2 — GEMINI UNIFIED + ML (Paralel)
    //    1 prompt fusion = 1 API call, bukan 3
    // ===================================================
    const geminiTasks = [];

    // Prompt fusion: URL + Social Eng + Judol dalam 1 call
    if (finalUrl || text) {
      geminiTasks.push(geminiAnalyzer.analyzeUnified({ url: finalUrl, text, chain: resolverResult.chain }));
    } else {
      geminiTasks.push(Promise.resolve(null));
    }

    // ML Lexical (gunakan hasil awal jika sudah ada, jika tidak jalankan lagi untuk finalUrl)
    if (finalUrl && finalUrl !== targetUrl) {
      geminiTasks.push(onnxRunner.predictLexical(finalUrl));
    } else {
      geminiTasks.push(Promise.resolve(earlyMlResult));
    }

    // Vision sudah dilakukan sebelumnya jika ada image
    // Threat intel sudah dilakukan di FASE 1

    const [unifiedGeminiResult, mlLexicalResult] = await Promise.allSettled(geminiTasks);

    // Unpack unified Gemini result
    const unifiedGemini = unifiedGeminiResult.status === 'fulfilled' ? unifiedGeminiResult.value : null;
    const mlLexical = mlLexicalResult.status === 'fulfilled' ? mlLexicalResult.value : earlyMlResult;
    tp('Gemini AI', unifiedGemini ? 'ok' : 'failed',
      unifiedGemini ? `Model: ${unifiedGemini?.url?._model || unifiedGemini?._model || 'gemini'}` : 'API tidak tersedia atau kuota habis');
    tp('ML Leksikal (ONNX)', mlLexical ? (mlLexical.isPhishing ? 'hit' : 'ok') : 'skipped',
      mlLexical ? `Phishing: ${mlLexical.isPhishing}, confidence: ${(mlLexical.confidence * 100).toFixed(0)}%` : 'Model tidak berjalan');

    // ===== STEP 9: Content analysis (opsional, hanya jika skor tinggi) =====
    let geminiContent = null;
    const prelimScore = calculatePrelimScore(homographResult, domainResult, intelResult);

    if (prelimScore > 60 && finalUrl) {
      try {
        const { analyzeContent: analyzePageContent } = require('../services/contentAnalyzer');
        const contentResult = await analyzePageContent(finalUrl);
        if (!contentResult.error) {
          geminiContent = contentResult;
          tp('Analisis Konten Halaman', 'ok', `Skor risiko konten: ${contentResult.riskScore || 0}`);
        } else {
          tp('Analisis Konten Halaman', 'failed', contentResult.error);
        }
      } catch (e) {
        tp('Analisis Konten Halaman', 'failed', e.message);
      }
    } else {
      tp('Analisis Konten Halaman', 'skipped', prelimScore <= 60 ? `Skor awal rendah (${Math.round(prelimScore)}) — tidak perlu analisis konten` : 'Tidak ada URL untuk dianalisis');
    }

    // ===== STEP 10: Verdict =====
    const verdict = verdictEngine.calculateVerdict({
      normalized: normalizedResult || { flags: [], score: 0 },
      homograph: homographResult,
      domain: domainResult,
      resolver: resolverResult,
      threatIntel: intelResult,
      mlLexical,
      gemini: {
        url: unifiedGemini?.url || null,
        socialEng: unifiedGemini?.socialEng || null,
        judolSlang: unifiedGemini?.judolSlang || null,
        vision: visionResult || null,
        content: geminiContent || null
      }
    }, senderContext || null);

    // ===== STEP 11: Simpan ke cache =====
    const cacheTTL = getCacheTTL(verdict.verdict);
    cacheService.set('scan:' + inputHash, verdict, cacheTTL).catch(() => {});

    // ===== STEP 13: Web Risk submission (background, fire-and-forget) =====
    if (verdict.verdict === 'BLOKIR' && finalUrl) {
      webRiskSubmitter.submitThreat(finalUrl, verdict.category, verdict)
        .catch(e => console.error('[Analyze] WebRisk submit error:', e.message));
    }

    // ===== STEP 14: Return response =====
    const duration = Date.now() - startTime;

    clearTimeout(timeout);
    if (!res.headersSent) {
      return res.json({
        scanId: verdict.scanId,
        verdict: verdict.verdict,
        score: verdict.score,
        category: verdict.category,
        action: verdict.action,
        emoji: verdict.emoji,
        advice: verdict.advice,
        explanation: verdict.explanation,
        factorsPositive: verdict.factorsPositive,
        factorsNegative: verdict.factorsNegative,
        flagKeys: verdict.flagKeys || [],
        flags: verdict.flags || [],
        resolvedUrl: resolverResult.finalUrl,
        originalUrl: url || targetUrl,
        redirectChain: resolverResult.chain,
        gapWarning: verdict.gapWarning,
        analyzedAt: verdict.analyzedAt,
        expiredAt: verdict.expiredAt,
        fromCache: false,
        duration: `${duration}ms`,
        pipeline
      });
    }

  } catch (error) {
    clearTimeout(timeout);
    console.error('[Analyze] Fatal error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'Terjadi kesalahan saat menganalisa. Silakan coba lagi.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

module.exports = router;
