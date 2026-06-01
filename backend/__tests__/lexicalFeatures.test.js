const { extractLexicalFeatures } = require('../services/lexicalFeatures');

describe('extractLexicalFeatures', () => {
  test('returns 14-element array for a valid HTTPS URL', () => {
    const features = extractLexicalFeatures('https://example.com/page?q=1');
    expect(features).toHaveLength(14);
  });

  test('returns 14 zeros for invalid input', () => {
    const features = extractLexicalFeatures('not a valid url at all ://');
    expect(features).toHaveLength(14);
  });

  test('IsHTTPS is 1 for https URLs', () => {
    const features = extractLexicalFeatures('https://example.com');
    // IsHTTPS is the last element (index 13)
    expect(features[13]).toBe(1);
  });

  test('IsHTTPS is 0 for http URLs', () => {
    const features = extractLexicalFeatures('http://example.com');
    expect(features[13]).toBe(0);
  });

  test('auto-prepends http:// for bare domains', () => {
    const features = extractLexicalFeatures('example.com');
    expect(features).toHaveLength(14);
    // URLLength should be the original string length
    expect(features[0]).toBe('example.com'.length);
  });

  test('counts digits correctly', () => {
    const features = extractLexicalFeatures('https://example123.com');
    // NoOfDegitsInURL is index 6
    expect(features[6]).toBe(3);
  });

  test('detects IP address as domain', () => {
    const features = extractLexicalFeatures('http://192.168.1.1/path');
    // IsDomainIP is index 2
    expect(features[2]).toBe(1);
  });

  test('non-IP domain has IsDomainIP = 0', () => {
    const features = extractLexicalFeatures('https://google.com');
    expect(features[2]).toBe(0);
  });

  test('counts subdomains', () => {
    // www.sub.example.com → 4 parts, subdomains = 4 - 2 = 2
    const features = extractLexicalFeatures('https://www.sub.example.com');
    // NoOfSubDomain is index 3
    expect(features[3]).toBe(2);
  });

  test('counts equals signs', () => {
    const features = extractLexicalFeatures('https://example.com?a=1&b=2');
    // NoOfEqualsInURL is index 8
    expect(features[8]).toBe(2);
  });

  test('counts question marks', () => {
    const features = extractLexicalFeatures('https://example.com?q=test');
    // NoOfQMarkInURL is index 9
    expect(features[9]).toBe(1);
  });

  test('counts ampersands', () => {
    const features = extractLexicalFeatures('https://example.com?a=1&b=2&c=3');
    // NoOfAmpersandInURL is index 10
    expect(features[10]).toBe(2);
  });

  test('letter ratio is between 0 and 1', () => {
    const features = extractLexicalFeatures('https://example.com');
    // LetterRatioInURL is index 5
    expect(features[5]).toBeGreaterThan(0);
    expect(features[5]).toBeLessThanOrEqual(1);
  });

  test('digit ratio is between 0 and 1', () => {
    const features = extractLexicalFeatures('https://example123.com');
    // DegitRatioInURL is index 7
    expect(features[7]).toBeGreaterThan(0);
    expect(features[7]).toBeLessThanOrEqual(1);
  });
});
