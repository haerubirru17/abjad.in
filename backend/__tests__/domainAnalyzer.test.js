const {
  extractRootDomain,
  checkTyposquatting,
  checkSuspiciousTLD,
  checkURLStructure,
} = require('../services/domainAnalyzer');

describe('extractRootDomain', () => {
  test('extracts domain from simple hostname', () => {
    const result = extractRootDomain('example.com');
    expect(result.domain).toBe('example.com');
  });

  test('extracts subdomain', () => {
    const result = extractRootDomain('www.example.com');
    expect(result.subdomain).toBe('www');
  });

  test('handles co.id TLD', () => {
    const result = extractRootDomain('mandiri.co.id');
    expect(result.domain).toBe('mandiri.co.id');
  });

  test('extracts public suffix', () => {
    const result = extractRootDomain('test.co.uk');
    expect(result.publicSuffix).toBe('co.uk');
  });
});

describe('checkTyposquatting', () => {
  test('detects typosquatting of tokopedia', () => {
    const result = checkTyposquatting('tokoopedia.com');
    expect(result.isTyposquatting).toBe(true);
    expect(result.similarTo).toBe('tokopedia');
    expect(result.score).toBe(40);
  });

  test('detects typosquatting of shopee', () => {
    const result = checkTyposquatting('shoppee.com');
    expect(result.isTyposquatting).toBe(true);
    expect(result.similarTo).toBe('shopee');
  });

  test('does not flag exact brand match', () => {
    // Exact match has distance 0, which is excluded
    const result = checkTyposquatting('shopee.com');
    expect(result.isTyposquatting).toBe(false);
  });

  test('does not flag unrelated domain', () => {
    const result = checkTyposquatting('randomwebsite.com');
    expect(result.isTyposquatting).toBe(false);
    expect(result.score).toBe(0);
  });

  test('detects typosquatting via soundex fallback', () => {
    // Soundex-based detection for phonetically similar domains
    const result = checkTyposquatting('goojle.com');
    // 'goojle' vs 'google' — distance = 2, so levenshtein should catch it
    expect(result.isTyposquatting).toBe(true);
    expect(result.similarTo).toBe('google');
  });
});

describe('checkSuspiciousTLD', () => {
  test('flags .xyz as suspicious', () => {
    const result = checkSuspiciousTLD('xyz');
    expect(result.isSuspicious).toBe(true);
    expect(result.score).toBe(15);
  });

  test('flags .tk as suspicious', () => {
    expect(checkSuspiciousTLD('tk').isSuspicious).toBe(true);
  });

  test('flags .bet as suspicious', () => {
    expect(checkSuspiciousTLD('bet').isSuspicious).toBe(true);
  });

  test('does not flag .com', () => {
    const result = checkSuspiciousTLD('com');
    expect(result.isSuspicious).toBe(false);
    expect(result.score).toBe(0);
  });

  test('does not flag .co.id', () => {
    expect(checkSuspiciousTLD('co.id').isSuspicious).toBe(false);
  });

  test('does not flag .org', () => {
    expect(checkSuspiciousTLD('org').isSuspicious).toBe(false);
  });
});

describe('checkURLStructure', () => {
  test('detects many subdomains', () => {
    const parsed = new URL('http://a.b.c.d.example.com');
    const result = checkURLStructure(parsed);
    expect(result.anomalies.some(a => a.includes('BANYAK_SUBDOMAIN'))).toBe(true);
  });

  test('detects @ character in URL', () => {
    const parsed = new URL('https://google.com@evil.com/steal');
    const result = checkURLStructure(parsed);
    expect(result.anomalies.some(a => a.includes('AT'))).toBe(true);
  });

  test('detects IPv4 as hostname', () => {
    const parsed = new URL('http://192.168.1.1/login');
    const result = checkURLStructure(parsed);
    expect(result.anomalies.some(a => a.includes('IPV4'))).toBe(true);
  });

  test('detects non-standard port', () => {
    const parsed = new URL('http://example.com:8080/page');
    const result = checkURLStructure(parsed);
    expect(result.anomalies.some(a => a.includes('PORT_TIDAK_STANDAR'))).toBe(true);
  });

  test('flags long URL', () => {
    const longPath = 'a'.repeat(100);
    const parsed = new URL(`https://example.com/${longPath}`);
    const result = checkURLStructure(parsed);
    expect(result.anomalies.some(a => a.includes('URL_PANJANG'))).toBe(true);
  });

  test('detects phishing keyword in subdomain', () => {
    const parsed = new URL('http://login.secure.verify.example.com/page');
    const result = checkURLStructure(parsed);
    expect(result.anomalies.some(a => a.includes('PHISHING_KEYWORD'))).toBe(true);
  });

  test('clean URL has no anomalies', () => {
    const parsed = new URL('https://example.com/page');
    const result = checkURLStructure(parsed);
    expect(result.anomalies).toHaveLength(0);
    expect(result.score).toBe(0);
  });
});
