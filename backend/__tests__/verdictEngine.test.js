const {
  checkCriticalOverride,
  aggregateIntelScore,
  aggregateGeminiScore,
  getSenderModifier,
  determineCategory,
  getVerdictDetails,
  calculateVerdict,
} = require('../services/verdictEngine');

describe('checkCriticalOverride', () => {
  test('returns override when threatIntel has override', () => {
    const result = checkCriticalOverride({
      threatIntel: { hasOverride: true, overrideScore: 100, overrideCategory: 'MALWARE' },
    });
    expect(result.hasOverride).toBe(true);
    expect(result.score).toBe(100);
    expect(result.category).toBe('MALWARE');
  });

  test('returns PHISHING for SSL mismatch + sensitive form', () => {
    const result = checkCriticalOverride({
      domain: { ssl: { mismatch: true } },
      gemini: { content: { hasSensitiveDataForm: true } },
    });
    expect(result.hasOverride).toBe(true);
    expect(result.score).toBe(100);
    expect(result.category).toBe('PHISHING');
  });

  test('returns JUDI_ONLINE for judol slang + suspicious TLD', () => {
    const result = checkCriticalOverride({
      gemini: { judolSlang: { isJudol: true } },
      domain: { isSuspiciousTLD: true },
    });
    expect(result.hasOverride).toBe(true);
    expect(result.score).toBe(95);
    expect(result.category).toBe('JUDI_ONLINE');
  });

  test('returns PHISHING for high homograph risk score', () => {
    const result = checkCriticalOverride({
      homograph: { riskScore: 80 },
    });
    expect(result.hasOverride).toBe(true);
    expect(result.score).toBe(70);
    expect(result.category).toBe('PHISHING');
  });

  test('returns null when no override conditions met', () => {
    const result = checkCriticalOverride({
      threatIntel: { hasOverride: false },
      homograph: { riskScore: 10 },
    });
    expect(result).toBeNull();
  });
});

describe('aggregateGeminiScore', () => {
  test('returns 0 for null gemini', () => {
    expect(aggregateGeminiScore(null)).toBe(0);
  });

  test('returns 0 for empty gemini', () => {
    expect(aggregateGeminiScore({})).toBe(0);
  });

  test('scores AMAN verdict as 0', () => {
    const score = aggregateGeminiScore({
      url: { verdict: 'AMAN', confidence: 0.9 },
    });
    expect(score).toBe(0);
  });

  test('scores non-AMAN verdict by confidence', () => {
    const score = aggregateGeminiScore({
      url: { verdict: 'PHISHING', confidence: 0.8 },
    });
    expect(score).toBe(80);
  });

  test('includes social engineering score', () => {
    const score = aggregateGeminiScore({
      socialEng: { isSocialEngineering: true, confidence: 0.7 },
    });
    expect(score).toBe(70);
  });

  test('includes judol slang score', () => {
    const score = aggregateGeminiScore({
      judolSlang: { isJudol: true, confidence: 0.9 },
    });
    expect(score).toBe(90);
  });
});

describe('getSenderModifier', () => {
  test('returns 0 for null context', () => {
    expect(getSenderModifier(null)).toBe(0);
  });

  test('returns +20 for unknown_wa', () => {
    expect(getSenderModifier({ type: 'unknown_wa' })).toBe(20);
  });

  test('returns -20 for subscription', () => {
    expect(getSenderModifier({ type: 'subscription' })).toBe(-20);
  });

  test('adds +20 for new account (< 1 day)', () => {
    expect(getSenderModifier({ type: 'unknown_wa', accountAgeDays: 0 })).toBe(40);
  });

  test('adds +25 for high link rate increase', () => {
    expect(getSenderModifier({ type: 'unknown_wa', linkRateIncrease: 600 })).toBe(45);
  });

  test('stacks all modifiers', () => {
    const modifier = getSenderModifier({
      type: 'unknown_wa',
      accountAgeDays: 0,
      linkRateIncrease: 600,
    });
    expect(modifier).toBe(65); // 20 + 20 + 25
  });

  test('returns 0 for unknown type', () => {
    expect(getSenderModifier({ type: 'some_unknown_type' })).toBe(0);
  });
});

describe('determineCategory', () => {
  test('returns JUDI_ONLINE for judol slang', () => {
    expect(determineCategory({ judolSlang: { isJudol: true } }, null, null, null))
      .toBe('JUDI_ONLINE');
  });

  test('returns PORNOGRAFI for porn verdict', () => {
    expect(determineCategory({ url: { verdict: 'PORNOGRAFI' } }, null, null, null))
      .toBe('PORNOGRAFI');
  });

  test('returns PHISHING for phishing verdict', () => {
    expect(determineCategory({ url: { verdict: 'PHISHING' } }, null, null, null))
      .toBe('PHISHING');
  });

  test('returns PHISHING for social engineering', () => {
    expect(determineCategory({ socialEng: { isSocialEngineering: true } }, null, null, null))
      .toBe('PHISHING');
  });

  test('returns PHISHING for high-confidence ML phishing', () => {
    expect(determineCategory({}, null, { isPhishing: true, confidence: 0.9 }, null))
      .toBe('PHISHING');
  });

  test('returns MALWARE for malware verdict', () => {
    expect(determineCategory({ url: { verdict: 'MALWARE' } }, null, null, null))
      .toBe('MALWARE');
  });

  test('returns MENCURIGAKAN as default', () => {
    expect(determineCategory({}, null, null, null)).toBe('MENCURIGAKAN');
  });
});

describe('getVerdictDetails', () => {
  test('score 0-49 returns AMAN', () => {
    const { verdict, action } = getVerdictDetails(30, 'MENCURIGAKAN');
    expect(verdict).toBe('AMAN');
    expect(action).toBe('ALLOW');
  });

  test('score 50-69 returns MENCURIGAKAN', () => {
    const { verdict, action } = getVerdictDetails(55, 'MENCURIGAKAN');
    expect(verdict).toBe('MENCURIGAKAN');
    expect(action).toBe('WARN');
  });

  test('score 70-84 returns BERBAHAYA', () => {
    const { verdict, action } = getVerdictDetails(75, 'PHISHING');
    expect(verdict).toBe('BERBAHAYA');
    expect(action).toBe('STRONG_WARN');
  });

  test('score 85+ returns BLOKIR', () => {
    const { verdict, action } = getVerdictDetails(90, 'JUDI_ONLINE');
    expect(verdict).toBe('BLOKIR');
    expect(action).toBe('BLOCK');
  });

  test('BLOKIR with JUDI_ONLINE mentions aduankonten', () => {
    const { advice } = getVerdictDetails(90, 'JUDI_ONLINE');
    expect(advice).toContain('aduankonten');
  });

  test('BLOKIR with PHISHING mentions IASC OJK', () => {
    const { advice } = getVerdictDetails(90, 'PHISHING');
    expect(advice).toContain('157');
  });

  test('BLOKIR with PORNOGRAFI mentions aduankonten', () => {
    const { advice } = getVerdictDetails(90, 'PORNOGRAFI');
    expect(advice).toContain('aduankonten');
  });

  test('boundary: score 49 is AMAN', () => {
    expect(getVerdictDetails(49, 'MENCURIGAKAN').verdict).toBe('AMAN');
  });

  test('boundary: score 50 is MENCURIGAKAN', () => {
    expect(getVerdictDetails(50, 'MENCURIGAKAN').verdict).toBe('MENCURIGAKAN');
  });

  test('boundary: score 69 is MENCURIGAKAN', () => {
    expect(getVerdictDetails(69, 'MENCURIGAKAN').verdict).toBe('MENCURIGAKAN');
  });

  test('boundary: score 70 is BERBAHAYA', () => {
    expect(getVerdictDetails(70, 'PHISHING').verdict).toBe('BERBAHAYA');
  });

  test('boundary: score 84 is BERBAHAYA', () => {
    expect(getVerdictDetails(84, 'PHISHING').verdict).toBe('BERBAHAYA');
  });

  test('boundary: score 85 is BLOKIR', () => {
    expect(getVerdictDetails(85, 'PHISHING').verdict).toBe('BLOKIR');
  });
});

describe('calculateVerdict', () => {
  test('returns BLOKIR for threat intel override', () => {
    const result = calculateVerdict({
      threatIntel: { hasOverride: true, overrideScore: 100, overrideCategory: 'MALWARE', totalScore: 100, flags: ['GSB_MATCH'] },
      normalized: { flags: [], score: 0 },
      homograph: { riskScore: 0, flags: [] },
      domain: { totalScore: 0, flags: [] },
      resolver: { riskScore: 0, flags: [] },
      gemini: {},
    });
    expect(result.hasOverride).toBe(true);
    expect(result.verdict).toBe('BLOKIR');
    expect(result.scanId).toBeDefined();
  });

  test('returns AMAN when all scores are 0', () => {
    const result = calculateVerdict({
      normalized: { flags: [], score: 0 },
      homograph: { riskScore: 0, flags: [] },
      domain: { totalScore: 0, flags: [] },
      resolver: { riskScore: 0, flags: [] },
      threatIntel: { hasOverride: false, totalScore: 0, flags: [] },
      gemini: { url: { verdict: 'AMAN', confidence: 0.9 } },
    });
    expect(result.verdict).toBe('AMAN');
  });

  test('includes scanId and analyzedAt', () => {
    const result = calculateVerdict({
      normalized: { flags: [], score: 0 },
      homograph: { riskScore: 0, flags: [] },
      domain: { totalScore: 0, flags: [] },
      resolver: { riskScore: 0, flags: [] },
      threatIntel: { hasOverride: false, totalScore: 0, flags: [] },
      gemini: {},
    });
    expect(result.scanId).toBeDefined();
    expect(result.analyzedAt).toBeDefined();
  });

  test('applies sender context modifier', () => {
    const withoutCtx = calculateVerdict({
      normalized: { flags: [], score: 0 },
      homograph: { riskScore: 0, flags: [] },
      domain: { totalScore: 30, flags: [] },
      resolver: { riskScore: 0, flags: [] },
      threatIntel: { hasOverride: false, totalScore: 30, flags: [] },
      gemini: { url: { verdict: 'MENCURIGAKAN', confidence: 0.5 } },
    });

    const withCtx = calculateVerdict(
      {
        normalized: { flags: [], score: 0 },
        homograph: { riskScore: 0, flags: [] },
        domain: { totalScore: 30, flags: [] },
        resolver: { riskScore: 0, flags: [] },
        threatIntel: { hasOverride: false, totalScore: 30, flags: [] },
        gemini: { url: { verdict: 'MENCURIGAKAN', confidence: 0.5 } },
      },
      { type: 'unknown_wa', accountAgeDays: 0 },
    );

    expect(withCtx.senderContextApplied).toBe(true);
  });
});
