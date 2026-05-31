/**
 * Verdict Engine untuk Abjad.in
 * Otak utama yang menggabungkan semua hasil analisis
 * (URL, domain, threat intel, AI Gemini) menjadi satu skor final,
 * verdict, dan rekomendasi aksi dalam Bahasa Indonesia.
 * 
 * Fungsi utama: calculateVerdict(allResults, senderContext)
 */

const { v4: uuidv4 } = require('uuid');

// ============================================================
// LANGKAH 1: Critical Override
// ============================================================
function checkCriticalOverride(results) {
  const { threatIntel, domain, gemini, homograph } = results;

  // Threat Intel override (GSB / Judol blacklist)
  if (threatIntel?.hasOverride) {
    return {
      hasOverride: true,
      score: threatIntel.overrideScore,
      category: threatIntel.overrideCategory,
      reason: `Terdeteksi oleh threat intelligence: ${threatIntel.overrideCategory}`
    };
  }

  // SSL mismatch + form data sensitif = PHISHING pasti
  if (domain?.ssl?.mismatch && gemini?.content?.hasSensitiveDataForm) {
    return {
      hasOverride: true,
      score: 100,
      category: 'PHISHING',
      reason: 'Sertifikat SSL tidak cocok dengan domain + form data sensitif ditemukan'
    };
  }

  // Judol slang + TLD mencurigakan = JUDOL pasti
  if (gemini?.judolSlang?.isJudol && domain?.isSuspiciousTLD) {
    return {
      hasOverride: true,
      score: 95,
      category: 'JUDI_ONLINE',
      reason: 'Konten judi online terdeteksi + TLD mencurigakan'
    };
  }

  // Homograph tinggi = minimal skor 70
  if (homograph?.riskScore >= 60) {
    return {
      hasOverride: true,
      score: 70,
      category: 'PHISHING',
      reason: `Serangan homograph terdeteksi (skor: ${homograph.riskScore})`
    };
  }



  return null;
}

// ============================================================
// LANGKAH 2: Agregasi skor
// ============================================================
function aggregateIntelScore(results) {
  const scores = [];

  if (results.threatIntel?.totalScore != null) scores.push(results.threatIntel.totalScore);
  if (results.domain?.totalScore != null) {
    let domainScore = results.domain.totalScore;
    if (results.domain?.rdap?.isDomainAgeApplicable === false) {
      domainScore = Math.max(0, domainScore - (results.domain.rdap.score || 0));
    }
    scores.push(domainScore);
  }
  if (results.homograph?.riskScore != null) scores.push(results.homograph.riskScore);
  if (results.resolver?.riskScore != null) scores.push(results.resolver.riskScore);
  if (results.normalized?.score != null) scores.push(results.normalized.score);

  let baseScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  // ── AI-FIRST: Periksa apakah Gemini confident domain ini AMAN / brand resmi ──
  // Ini adalah inti dari paradigma baru: Gemini punya world knowledge, ML tidak.
  const geminiVerdict = results.gemini?.url?.verdict;
  const geminiConfidence = results.gemini?.url?.confidence || 0;
  const brandRecognition = results.gemini?.url?.brandRecognition;

  const geminiConfidentSafe =
    geminiVerdict === 'AMAN' && geminiConfidence >= 0.75;

  const geminiKnownBrand =
    brandRecognition?.isKnownBrand === true &&
    brandRecognition?.isOfficialDomain === true;

  // ML Lexical Score — HANYA berkontribusi jika Gemini tidak yakin domain aman
  if (results.mlLexical && results.mlLexical.isPhishing) {
    if (geminiConfidentSafe || geminiKnownBrand) {
      // Gemini lebih tahu dari ML: domain resmi yang dikenal AI global
      // ML bisa saja salah karena hanya lihat pola karakter URL, bukan konteks
      // Berikan kenaikan skor sangat kecil sebagai "token of suspicion"
      baseScore += 5;
      console.log('[VerdictEngine] ML phishing signal diabaikan: Gemini confident domain aman/brand resmi');
    } else if (geminiConfidence < 0.5) {
      // Gemini tidak yakin, ML mendeteksi phishing → naikkan moderat
      // Tapi tetap batasi agar tidak langsung melompat ke 85
      baseScore = Math.max(baseScore, Math.min(65, baseScore + 25));
      if (!results.normalized) results.normalized = { flags: [] };
      if (!results.normalized.flags) results.normalized.flags = [];
      results.normalized.flags.push('ML_LEXICAL: SUSPICIOUS_URL_PATTERN');
    } else {
      // Gemini punya pandangan tapi tidak yakin aman, ML mendeteksi phishing
      // Naikkan skor tapi tidak separah sebelumnya
      baseScore = Math.max(baseScore, Math.min(70, baseScore + 20));
      if (!results.normalized) results.normalized = { flags: [] };
      if (!results.normalized.flags) results.normalized.flags = [];
      results.normalized.flags.push('ML_LEXICAL: SUSPICIOUS_URL_PATTERN');
    }
  } else if (results.mlLexical && !results.mlLexical.isPhishing) {
    // ML bilang aman — turunkan skor sedikit sebagai sinyal positif
    baseScore = Math.max(0, baseScore - 8);
  }

  return baseScore;
}


function aggregateGeminiScore(gemini) {
  if (!gemini) return 0;

  const scores = [];

  if (gemini.url?.confidence != null) {
    const urlScore = gemini.url.verdict === 'AMAN' ? 0 : gemini.url.confidence * 100;
    scores.push(urlScore);
  }

  if (gemini.socialEng?.confidence != null) {
    const socialScore = gemini.socialEng.isSocialEngineering
      ? gemini.socialEng.confidence * 100 : 0;
    scores.push(socialScore);
  }

  if (gemini.judolSlang?.isJudol) {
    scores.push(gemini.judolSlang.confidence * 100);
  }

  if (gemini.vision?.confidence != null && gemini.vision.threatType !== 'AMAN') {
    scores.push(gemini.vision.confidence * 100);
  }

  if (gemini.content?.riskScore != null) {
    scores.push(gemini.content.riskScore);
  }

  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ============================================================
// LANGKAH 5: Sender context modifier
// ============================================================
function getSenderModifier(senderContext) {
  if (!senderContext) return 0;

  const typeModifiers = {
    unknown_wa: 20,
    unknown_email: 15,
    no_number_account: 25,
    saved_contact_personal: -5,
    saved_contact_mutual: -10,
    saved_contact_group: 0,
    subscription: -20
  };

  let modifier = typeModifiers[senderContext.type] || 0;

  if (senderContext.accountAgeDays != null && senderContext.accountAgeDays < 1) {
    modifier += 20;
  }

  if (senderContext.linkRateIncrease != null && senderContext.linkRateIncrease > 500) {
    modifier += 25;
  }

  return modifier;
}

// ============================================================
// LANGKAH 7: Determine category
// ============================================================
function determineCategory(gemini, threatIntel, mlLexical, domain) {
  // Prioritas: JUDI_ONLINE > PHISHING > MALWARE > MENCURIGAKAN
  if (gemini?.judolSlang?.isJudol) return 'JUDI_ONLINE';
  if (gemini?.url?.verdict === 'PHISHING' || gemini?.socialEng?.isSocialEngineering) return 'PHISHING';
  if (mlLexical?.isPhishing && (mlLexical.confidence || 0) >= 0.85) return 'PHISHING';
  if (gemini?.url?.verdict === 'JUDOL') return 'JUDI_ONLINE';
  if (gemini?.url?.verdict === 'MALWARE') return 'MALWARE';
  
  // Check VirusTotal flags for specific threat categories
  const flagsStr = (threatIntel?.flags || []).join(' ').toLowerCase();
  if (flagsStr.includes('virustotal')) {
    if (flagsStr.includes('malware')) return 'MALWARE';
    return 'PHISHING';
  }

  return 'MENCURIGAKAN';
}

// ============================================================
// LANGKAH 8 & 9: Verdict, action, emoji, advice
// ============================================================
function getVerdictDetails(score, category) {
  let verdict, action, emoji, advice;

  if (score <= 49) {
    verdict = 'AMAN';
    action = 'ALLOW';
    emoji = '✅';
    advice = 'Link ini tampak aman untuk diakses.';
  } else if (score <= 69) {
    verdict = 'MENCURIGAKAN';
    action = 'WARN';
    emoji = '⚠️';
    advice = 'Sebaiknya verifikasi langsung ke website resminya sebelum klik.';
  } else if (score <= 84) {
    verdict = 'BERBAHAYA';
    action = 'STRONG_WARN';
    emoji = '🟠';
    advice = 'Jangan masukkan data apapun di situs ini. Tutup segera.';
  } else {
    verdict = 'BLOKIR';
    action = 'BLOCK';
    emoji = '🔴';

    if (category === 'JUDI_ONLINE') {
      advice = 'Ini situs judi online ilegal. Jangan klik! Laporkan ke Kominfo: aduankonten.id';
    } else if (category === 'PHISHING') {
      advice = 'Ini link penipuan! Jangan klik! Laporkan ke IASC OJK: 157';
    } else {
      advice = 'Link ini sangat berbahaya. Jangan klik atau buka di perangkat apapun.';
    }
  }

  return { verdict, action, emoji, advice };
}

// ============================================================
// Helper: Clamp value
// ============================================================
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// ============================================================
// Helper: Collect factors
// ============================================================
function collectFactors(allResults) {
  const positive = [];
  const negative = [];

  // Domain
  if (allResults.domain?.ssl?.hasHttps) positive.push('Website menggunakan HTTPS');
  if (allResults.domain?.rdap?.ageInDays > 365) positive.push(`Domain berumur ${allResults.domain.rdap.ageInDays} hari`);

  // AI Brand Recognition — sinyal positif kuat dari Gemini
  const brand = allResults.gemini?.url?.brandRecognition;
  if (brand?.isKnownBrand && brand?.isOfficialDomain) {
    positive.push(`Domain resmi ${brand.brandName || 'brand terkenal'} dikenali oleh AI`);
  }
  if (allResults.gemini?.url?.verdict === 'AMAN' && (allResults.gemini?.url?.confidence || 0) >= 0.75) {
    positive.push('AI menyatakan domain ini aman dengan keyakinan tinggi');
  }

  // Negative factors from flags
  const allFlags = [
    ...(allResults.normalized?.flags || []),
    ...(allResults.homograph?.flags || []),
    ...(allResults.domain?.flags || []),
    ...(allResults.resolver?.flags || []),
    ...(allResults.threatIntel?.flags || [])
  ];

  for (const flag of allFlags) {
    negative.push(flag);
  }

  return { positive, negative };
}

// ============================================================
// FUNGSI UTAMA: calculateVerdict
// ============================================================
function calculateVerdict(allResults, senderContext = null) {
  const scanId = uuidv4();

  // LANGKAH 0: Whitelist check (Early exit)
  const isWhitelisted = allResults.domain?.isWhitelisted === true;
  const hasIntelOverride = allResults.threatIntel?.hasOverride === true;

  if (isWhitelisted && !hasIntelOverride) {
    const { verdict, action, emoji, advice } = getVerdictDetails(0, 'AMAN');
    const explanation = `Domain ${allResults.domain?.rootDomain || ''} merupakan domain resmi terpercaya yang terdaftar dalam sistem.`;

    return {
      scanId,
      fromCache: false,
      analyzedAt: new Date().toISOString(),
      expiredAt: new Date(Date.now() + 3600000).toISOString(),
      score: 0,
      rawScore: 0,
      verdict,
      category: 'AMAN',
      action,
      emoji,
      explanation,
      advice,
      flags: [],
      flagKeys: [],
      specialBlocks: {
        showSocialContext: false,
        showHomographWarning: false,
        showOpenRedirectWarning: false
      },
      factorsPositive: ['Domain resmi terdaftar di whitelist', 'Website menggunakan HTTPS'],
      factorsNegative: [],
      transparency: {
        originalUrl: allResults.normalized?.originalUrl || null,
        finalUrl: allResults.resolver?.finalUrl || null,
        chain: allResults.resolver?.chain || []
      },
      senderContextApplied: !!senderContext,
      gapWarning: null,
      hasOverride: false,
      overrideReason: null
    };
  }

  // LANGKAH 1: Critical Override
  const override = checkCriticalOverride(allResults);

  let finalScore;
  let category;
  let gapWarning = null;
  let hasOverride = false;
  let overrideReason = null;

  if (override) {
    hasOverride = true;
    finalScore = override.score;
    category = override.category;
    overrideReason = override.reason;
  } else {
    // LANGKAH 2: Agregasi skor
    const intelScore = aggregateIntelScore(allResults);
    const geminiScore = aggregateGeminiScore(allResults.gemini);

    // LANGKAH 3: Gap logic — AI-First Edition
    // Gap besar berarti dua sistem tidak sepakat — tapi sekarang kita
    // percayai Gemini lebih banyak karena dia punya world knowledge
    const gap = Math.abs(intelScore - geminiScore);
    const geminiConfidence = allResults.gemini?.url?.confidence || 0;
    const geminiIsConfidentSafe = allResults.gemini?.url?.verdict === 'AMAN' && geminiConfidence >= 0.75;
    const geminiIsConfidentDangerous = geminiScore > 70 && geminiConfidence >= 0.70;
    const geminiKnownBrand = allResults.gemini?.url?.brandRecognition?.isOfficialDomain === true;

    if (gap > 40) {
      if (geminiIsConfidentSafe || geminiKnownBrand) {
        // Gemini sangat yakin domain ini aman / brand resmi
        // Percayai Gemini 75%, intel signals 25%
        finalScore = (intelScore * 0.25) + (geminiScore * 0.75);
        gapWarning = null; // Tidak perlu warning — kita sudah yakin
      } else if (geminiIsConfidentDangerous) {
        // Gemini sangat yakin domain ini berbahaya
        // Percayai Gemini 70%, intel signals 30%
        finalScore = (intelScore * 0.30) + (geminiScore * 0.70);
        gapWarning = 'Terdeteksi ancaman oleh analisa AI. Berhati-hatilah.';
      } else {
        // Tidak ada yang sangat yakin — ambil rata-rata dengan warning
        finalScore = (intelScore * 0.45) + (geminiScore * 0.55);
        gapWarning = 'Dua sistem analisa memberi hasil berbeda. Tetap waspada.';
      }
    } else {
      finalScore = (intelScore * 0.4) + (geminiScore * 0.6);
    }

    // LANGKAH 7: Determine category
    category = determineCategory(allResults.gemini, allResults.threatIntel, allResults.mlLexical, allResults.domain);

    // Enforce minimum score for critical categories
    if (category === 'PHISHING' || category === 'JUDI_ONLINE' || category === 'MALWARE') {
      finalScore = Math.max(finalScore, 50);
    }


  }

  // LANGKAH 5: Apply sender context modifier
  const senderModifier = getSenderModifier(senderContext);
  finalScore = clamp(finalScore + senderModifier, 0, 100);

  const rawScore = Math.round(finalScore);

  // LANGKAH 6: Jitter obfuscation
  const jitter = (Math.random() * 4) - 2;
  let outputScore = Math.round(clamp(finalScore + jitter, 0, 100));

  // Pastikan jitter tidak mengubah verdict threshold
  const rawVerdict = getVerdictDetails(rawScore, category);
  const jitteredVerdict = getVerdictDetails(outputScore, category);
  if (rawVerdict.verdict !== jitteredVerdict.verdict) {
    outputScore = rawScore; // Batalkan jitter jika mengubah verdict
  }

  // LANGKAH 8 & 9: Verdict details
  const { verdict, action, emoji, advice } = getVerdictDetails(outputScore, category);

  // Generate explanation
  let explanation = '';
  if (allResults.gemini?.url?.explanation) {
    explanation = allResults.gemini.url.explanation;
  } else if (allResults.gemini?.socialEng?.explanation) {
    explanation = allResults.gemini.socialEng.explanation;
  } else {
    explanation = advice;
  }

  // LANGKAH 10: Build flags
  const allFlags = [
    ...(allResults.normalized?.flags || []),
    ...(allResults.homograph?.flags || []),
    ...(allResults.domain?.flags || []),
    ...(allResults.resolver?.flags || []),
    ...(allResults.threatIntel?.flags || [])
  ];

  const flagKeys = [...new Set(allFlags)];

  // LANGKAH 11: Special blocks
  const specialBlocks = {
    showSocialContext: category === 'JUDI_ONLINE',
    showHomographWarning: allResults.homograph?.hasHomograph || false,
    showOpenRedirectWarning: allResults.normalized?.wasRedirect || false
  };

  // Collect factors
  const { positive: factorsPositive, negative: factorsNegative } = collectFactors(allResults);

  // Build final response (sesuai JSON Contract)
  return {
    scanId,
    fromCache: false,
    analyzedAt: new Date().toISOString(),
    expiredAt: new Date(Date.now() + 3600000).toISOString(),
    score: outputScore,
    rawScore,
    verdict,
    category,
    action,
    emoji,
    explanation,
    advice,
    flags: flagKeys.map(key => ({
      key,
      severity: outputScore >= 85 ? 'CRITICAL' : outputScore >= 70 ? 'HIGH' : outputScore >= 50 ? 'MEDIUM' : 'LOW'
    })),
    flagKeys,
    specialBlocks,
    factorsPositive,
    factorsNegative,
    transparency: {
      originalUrl: allResults.normalized?.originalUrl || null,
      finalUrl: allResults.resolver?.finalUrl || null,
      chain: allResults.resolver?.chain || []
    },
    senderContextApplied: !!senderContext,
    gapWarning,
    hasOverride,
    overrideReason
  };
}

module.exports = {
  calculateVerdict,
  // Exposed for unit testing
  checkCriticalOverride,
  aggregateIntelScore,
  aggregateGeminiScore,
  getSenderModifier,
  determineCategory,
  getVerdictDetails
};

// ===== UNIT TESTS =====
if (require.main === module) {
  console.log('🧪 Menjalankan Unit Tests untuk verdictEngine.js...\n');

  const tests = [
    {
      name: '1. Critical override — Threat Intel match',
      fn: () => {
        const r = calculateVerdict({
          threatIntel: { hasOverride: true, overrideScore: 100, overrideCategory: 'MALWARE', totalScore: 100, flags: ['GSB_MATCH: MALWARE'] },
          normalized: { flags: [], score: 0 },
          homograph: { riskScore: 0, flags: [] },
          domain: { totalScore: 0, flags: [] },
          resolver: { riskScore: 0, flags: [] },
          gemini: {}
        });
        return r.hasOverride === true && r.verdict === 'BLOKIR';
      },
      desc: 'Harus langsung BLOKIR jika threat intel match'
    },
    {
      name: '2. Safe URL — skor rendah',
      fn: () => {
        const r = calculateVerdict({
          normalized: { flags: [], score: 0 },
          homograph: { riskScore: 0, flags: [] },
          domain: { totalScore: 0, flags: [] },
          resolver: { riskScore: 0, flags: [] },
          threatIntel: { hasOverride: false, totalScore: 0, flags: [] },
          gemini: { url: { verdict: 'AMAN', confidence: 0.1 } }
        });
        return r.verdict === 'AMAN';
      },
      desc: 'Semua skor 0 = AMAN'
    },
    {
      name: '3. Judol — tetap BLOKIR',
      fn: () => {
        const r = calculateVerdict({
          normalized: { flags: [], score: 0 },
          homograph: { riskScore: 0, flags: [] },
          domain: { totalScore: 0, flags: [] },
          resolver: { riskScore: 0, flags: [] },
          threatIntel: { hasOverride: true, overrideScore: 95, overrideCategory: 'JUDI_ONLINE', totalScore: 95, flags: ['JUDOL_BLACKLIST'] },
          gemini: { judolSlang: { isJudol: true, confidence: 0.95 } }
        });
        return r.category === 'JUDI_ONLINE' && r.verdict === 'BLOKIR';
      },
      desc: 'Konten judol harus diblokir jika dideteksi di database/override'
    },
    {
      name: '4. Sender context — unknown WA',
      fn: () => {
        const modifier = getSenderModifier({ type: 'unknown_wa', accountAgeDays: 0, linkRateIncrease: 600 });
        return modifier === 65; // 20 + 20 + 25
      },
      desc: 'Unknown WA + akun baru + rate tinggi = +65'
    },
    {
      name: '5. Verdict thresholds',
      fn: () => {
        const aman = getVerdictDetails(30, 'MENCURIGAKAN');
        const warn = getVerdictDetails(55, 'MENCURIGAKAN');
        const bahaya = getVerdictDetails(75, 'PHISHING');
        const blokir = getVerdictDetails(90, 'JUDI_ONLINE');
        return aman.verdict === 'AMAN' && warn.verdict === 'MENCURIGAKAN' &&
               bahaya.verdict === 'BERBAHAYA' && blokir.verdict === 'BLOKIR';
      },
      desc: 'Semua threshold verdict harus benar'
    }
  ];

  let passed = 0, failed = 0;
  for (const test of tests) {
    if (test.fn()) {
      console.log(`  ✅ ${test.name}: ${test.desc}`);
      passed++;
    } else {
      console.log(`  ❌ ${test.name}: ${test.desc}`);
      failed++;
    }
  }
  console.log(`\n📊 Hasil: ${passed} lulus, ${failed} gagal dari ${tests.length} test.`);
}
