const sanitizeInput = require('../middleware/sanitize');

// sanitizeString is not exported directly, but we can test it through the middleware
// and by calling the middleware with crafted req objects

function callSanitize(body) {
  const req = { body };
  const res = {};
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  sanitizeInput(req, res, next);
  return { sanitized: req.sanitized, nextCalled };
}

describe('sanitizeInput middleware', () => {
  test('calls next()', () => {
    const { nextCalled } = callSanitize({});
    expect(nextCalled).toBe(true);
  });

  test('sanitizes text field', () => {
    const { sanitized } = callSanitize({ text: '  hello world  ' });
    expect(sanitized.text).toBe('hello world');
  });

  test('sanitizes url field', () => {
    const { sanitized } = callSanitize({ url: '  https://example.com  ' });
    expect(sanitized.url).toBe('https://example.com');
  });

  test('skips non-string text', () => {
    const { sanitized } = callSanitize({ text: 123 });
    expect(sanitized.text).toBeUndefined();
  });

  test('skips non-string url', () => {
    const { sanitized } = callSanitize({ url: null });
    expect(sanitized.url).toBeUndefined();
  });

  test('strips script tags', () => {
    const { sanitized } = callSanitize({ text: 'hello<script>alert("xss")</script>world' });
    expect(sanitized.text).toBe('helloworld');
    expect(sanitized.text).not.toContain('script');
  });

  test('strips iframe tags', () => {
    const { sanitized } = callSanitize({ text: 'hello<iframe src="evil.com"></iframe>world' });
    expect(sanitized.text).toBe('helloworld');
  });

  test('strips object tags', () => {
    const { sanitized } = callSanitize({ text: 'test<object data="flash.swf"></object>end' });
    expect(sanitized.text).toBe('testend');
  });

  test('strips generic HTML tags', () => {
    const { sanitized } = callSanitize({ text: '<b>bold</b> <i>italic</i>' });
    expect(sanitized.text).toBe('bold italic');
  });

  test('removes null bytes', () => {
    const { sanitized } = callSanitize({ text: 'hello\x00world' });
    expect(sanitized.text).toBe('helloworld');
  });

  test('removes control characters', () => {
    const { sanitized } = callSanitize({ text: 'hello\x01\x02\x03world' });
    expect(sanitized.text).toBe('helloworld');
  });

  test('preserves newlines and tabs', () => {
    const { sanitized } = callSanitize({ text: 'hello\nworld\ttab' });
    expect(sanitized.text).toContain('\n');
    expect(sanitized.text).toContain('\t');
  });

  test('filters prompt injection keywords', () => {
    const { sanitized } = callSanitize({ text: 'IGNORE this SYSTEM INSTRUCTION' });
    expect(sanitized.text).toBe('[FILTERED] this [FILTERED] [FILTERED]');
  });

  test('filters keywords case-insensitively', () => {
    const { sanitized } = callSanitize({ text: 'ignore system instruction' });
    expect(sanitized.text).toBe('[FILTERED] [FILTERED] [FILTERED]');
  });

  test('truncates input to 10000 characters', () => {
    const longText = 'a'.repeat(20000);
    const { sanitized } = callSanitize({ text: longText });
    expect(sanitized.text.length).toBeLessThanOrEqual(10000);
  });

  test('applies NFKC normalization', () => {
    // Fullwidth 'A' (U+FF21) normalizes to 'A'
    const { sanitized } = callSanitize({ text: '\uFF21\uFF22\uFF23' });
    expect(sanitized.text).toBe('ABC');
  });

  test('handles nested HTML recursively', () => {
    const { sanitized } = callSanitize({ text: '<<script>script>alert(1)<</script>/script>' });
    expect(sanitized.text).not.toContain('<');
  });
});
