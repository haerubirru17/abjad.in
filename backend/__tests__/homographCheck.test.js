const { checkHomograph, levenshtein } = require('../services/homographCheck');

describe('levenshtein', () => {
  test('identical strings return 0', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  test('empty vs non-empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  test('both empty', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  test('kitten → sitting = 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  test('single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  test('single insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  test('single deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });
});

describe('checkHomograph', () => {
  test('returns default result for null input', () => {
    const result = checkHomograph(null);
    expect(result.hasHomograph).toBe(false);
    expect(result.riskScore).toBe(0);
  });

  test('returns default result for empty string', () => {
    const result = checkHomograph('');
    expect(result.hasHomograph).toBe(false);
  });

  test('returns default result for non-string input', () => {
    const result = checkHomograph(123);
    expect(result.hasHomograph).toBe(false);
  });

  test('detects Cyrillic confusable characters', () => {
    // 'а' (U+0430 Cyrillic) looks like Latin 'a'
    const result = checkHomograph('b\u0430nkm\u0430ndiri.com');
    expect(result.hasHomograph).toBe(true);
    expect(result.suspiciousChars.length).toBeGreaterThan(0);
    expect(result.suspiciousChars[0].type).toBe('CONFUSABLE');
    expect(result.riskScore).toBeGreaterThanOrEqual(60);
  });

  test('clean Latin domain has no homograph', () => {
    const result = checkHomograph('mandiri.co.id');
    expect(result.hasHomograph).toBe(false);
    expect(result.riskScore).toBe(0);
  });

  test('detects zero-width characters', () => {
    const result = checkHomograph('exam\u200Bple.com');
    expect(result.hasHomograph).toBe(true);
    expect(result.flags.some(f => f.includes('ZERO_WIDTH'))).toBe(true);
  });

  test('detects fullwidth characters', () => {
    // U+FF45 = fullwidth 'e'
    const result = checkHomograph('\uFF45xample.com');
    expect(result.hasHomograph).toBe(true);
    expect(result.flags.some(f => f.includes('FULLWIDTH'))).toBe(true);
  });

  test('detects script mixing (Latin + Cyrillic)', () => {
    // 'о' (U+043E Cyrillic) mixed with Latin
    const result = checkHomograph('g\u043E\u043Egle.com');
    expect(result.scriptMixing).toBe(true);
    expect(result.hasHomograph).toBe(true);
  });

  test('detects brand impersonation via typo', () => {
    const result = checkHomograph('tokoopedia.com');
    expect(result.impersonationOf).toBe('tokopedia');
  });

  test('does not flag official domains as impersonation', () => {
    const result = checkHomograph('tokopedia.com');
    expect(result.impersonationOf).toBeNull();
  });

  test('decodes punycode hostname', () => {
    const result = checkHomograph('xn--80ak6aa92e.com');
    expect(result.decodedHostname).not.toBe('xn--80ak6aa92e.com');
    expect(result.flags.some(f => f.includes('PUNYCODE_DECODED'))).toBe(true);
  });

  test('caps risk score at 100', () => {
    // Craft input that would exceed 100: confusable + zero-width + script mixing + impersonation
    const result = checkHomograph('b\u0430nk\u200Bm\u0430ndiri.com');
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });
});
