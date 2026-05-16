/**
 * Sanitize Middleware untuk Abjad.in
 * Membersihkan semua input dari pengguna sebelum diproses oleh route handlers.
 * Mencegah XSS, prompt injection, dan karakter berbahaya.
 */

/**
 * Middleware: sanitizeInput
 * Membersihkan req.body.text dan req.body.url
 */
function sanitizeInput(req, res, next) {
  const sanitized = {};

  // Sanitasi text
  if (req.body.text && typeof req.body.text === 'string') {
    sanitized.text = sanitizeString(req.body.text);
  }

  // Sanitasi url
  if (req.body.url && typeof req.body.url === 'string') {
    sanitized.url = sanitizeString(req.body.url);
  }

  // Attach ke request
  req.sanitized = sanitized;
  next();
}

/**
 * Sanitasi string generik
 * @param {string} input
 * @returns {string}
 */
function sanitizeString(input) {
  let result = input;

  // 1. Strip HTML tag rekursif (maks 5 iterasi)
  for (let i = 0; i < 5; i++) {
    const prev = result;
    // Hapus script, iframe, object terlebih dahulu
    result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    result = result.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    result = result.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '');
    // Hapus semua tag HTML lainnya
    result = result.replace(/<[^>]*>/g, '');
    if (result === prev) break;
  }

  // 2. Hapus null bytes
  result = result.replace(/\x00/g, '');

  // 3. Hapus karakter kontrol (kecuali newline dan tab)
  result = result.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 4. Unicode NFKC normalization
  result = result.normalize('NFKC');

  // 5. Filter kata berbahaya (anti prompt injection)
  result = result.replace(/IGNORE|SYSTEM|INSTRUCTION/gi, '[FILTERED]');

  // 6. Limit panjang
  result = result.slice(0, 10000);

  return result.trim();
}

module.exports = sanitizeInput;
