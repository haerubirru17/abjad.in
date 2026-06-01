const { memGet, memSet } = require('../services/cacheService');

describe('cacheService — in-memory layer', () => {
  afterEach(() => {
    // Clear any leftover cache entries by overwriting with expired entries
  });

  test('memSet + memGet stores and retrieves a value', () => {
    memSet('test-key-1', { foo: 'bar' }, 60);
    expect(memGet('test-key-1')).toEqual({ foo: 'bar' });
  });

  test('memGet returns null for unknown key', () => {
    expect(memGet('nonexistent-key')).toBeNull();
  });

  test('memGet returns null for expired entry', () => {
    // Manually inject an already-expired entry via memSet with a tiny TTL,
    // then wait a tick for Date.now() to surpass expiredAt.
    memSet('expired-key', 'value', 0);
    return new Promise((resolve) => {
      setTimeout(() => {
        const result = memGet('expired-key');
        expect(result).toBeNull();
        resolve();
      }, 5);
    });
  });

  test('memSet overwrites previous value', () => {
    memSet('overwrite-key', 'first', 60);
    memSet('overwrite-key', 'second', 60);
    expect(memGet('overwrite-key')).toBe('second');
  });

  test('stores complex objects', () => {
    const complex = { nested: { arr: [1, 2, 3] }, flag: true };
    memSet('complex-key', complex, 60);
    expect(memGet('complex-key')).toEqual(complex);
  });

  test('stores string values', () => {
    memSet('string-key', 'hello', 60);
    expect(memGet('string-key')).toBe('hello');
  });

  test('stores numeric values', () => {
    memSet('num-key', 42, 60);
    expect(memGet('num-key')).toBe(42);
  });
});
