const { normalizeUrl } = require('../services/urlNormalizer');

describe('normalizeUrl', () => {
  test('returns invalid for null input', () => {
    const result = normalizeUrl(null);
    expect(result.invalid).toBe(true);
  });

  test('returns invalid for empty string', () => {
    const result = normalizeUrl('');
    expect(result.invalid).toBe(true);
    expect(result.flags).toContain('INPUT_KOSONG');
  });

  test('returns invalid for non-string input', () => {
    const result = normalizeUrl(123);
    expect(result.invalid).toBe(true);
  });

  test('blocks data: URI scheme', () => {
    const result = normalizeUrl('data:text/html,<script>alert("xss")</script>');
    expect(result.blocked).toBe(true);
    expect(result.score).toBe(100);
  });

  test('blocks javascript: URI scheme', () => {
    const result = normalizeUrl('javascript:alert(document.cookie)');
    expect(result.blocked).toBe(true);
    expect(result.score).toBe(100);
  });

  test('blocks vbscript: URI scheme', () => {
    const result = normalizeUrl('vbscript:MsgBox("hello")');
    expect(result.blocked).toBe(true);
  });

  test('blocks file:// URI scheme', () => {
    const result = normalizeUrl('file:///etc/passwd');
    expect(result.blocked).toBe(true);
  });

  test('detects double encoding', () => {
    const result = normalizeUrl('https://evil.com/%2568ack');
    expect(result.flags.some(f => f.includes('DOUBLE_ENCODING'))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  test('strips fragment from URL', () => {
    const result = normalizeUrl('https://example.com/page#malicious-fragment');
    expect(result.flags).toContain('FRAGMENT_DIHAPUS');
    expect(result.normalizedUrl).not.toContain('#');
  });

  test('detects open redirect parameter', () => {
    const result = normalizeUrl('https://trusted.com/login?redirect=https://phishing.com/steal');
    expect(result.wasRedirect).toBe(true);
    expect(result.extractedUrl).toBe('https://phishing.com/steal');
  });

  test('detects open redirect with url parameter', () => {
    const result = normalizeUrl('https://trusted.com/go?url=https://evil.com');
    expect(result.wasRedirect).toBe(true);
  });

  test('does not flag non-URL redirect param values', () => {
    const result = normalizeUrl('https://example.com/page?next=some value with spaces');
    expect(result.wasRedirect).toBe(false);
  });

  test('detects parameter pollution', () => {
    const result = normalizeUrl('https://bank.com/transfer?amount=100&amount=999999');
    expect(result.paramPollution).toBe(true);
    expect(result.flags.some(f => f.includes('PARAM_POLLUTION'))).toBe(true);
  });

  test('normalizes hostname to lowercase', () => {
    const result = normalizeUrl('HTTPS://Example.COM/Page');
    expect(result.normalizedUrl).toContain('example.com');
  });

  test('removes default port 443 for https', () => {
    const result = normalizeUrl('https://example.com:443/page');
    expect(result.normalizedUrl).not.toContain(':443');
  });

  test('removes default port 80 for http', () => {
    const result = normalizeUrl('http://example.com:80/page');
    expect(result.normalizedUrl).not.toContain(':80');
  });

  test('adds https:// to bare domain', () => {
    const result = normalizeUrl('example.com/page');
    expect(result.normalizedUrl).toMatch(/^https:\/\//);
  });

  test('caps score at 100', () => {
    // Multiple scoring factors: double encoding + open redirect + param pollution
    const result = normalizeUrl(
      'https://evil.com/%2568ack?redirect=https://phish.com&amount=1&amount=2'
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('preserves original URL in result', () => {
    const input = 'https://example.com/test';
    const result = normalizeUrl(input);
    expect(result.originalUrl).toBe(input);
  });
});
