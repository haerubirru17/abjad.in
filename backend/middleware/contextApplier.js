/**
 * Context Applier Middleware untuk Abjad.in
 * Memvalidasi dan membersihkan senderContext dari request body
 * agar siap digunakan oleh verdictEngine.
 */

// Enum tipe pengirim yang valid
const VALID_SENDER_TYPES = [
  'unknown_wa',
  'unknown_email',
  'saved_contact_personal',
  'saved_contact_mutual',
  'saved_contact_group',
  'subscription',
  'no_number_account'
];

/**
 * Parse dan validasi senderContext
 * @param {object} rawContext - senderContext dari request body
 * @returns {object|null} Cleaned context atau null
 */
function parseContext(rawContext) {
  if (!rawContext || typeof rawContext !== 'object') {
    return null;
  }

  const cleaned = {
    type: VALID_SENDER_TYPES.includes(rawContext.type)
      ? rawContext.type
      : 'unknown_wa', // Default ke unknown_wa jika tipe tidak valid

    accountAgeDays: typeof rawContext.accountAgeDays === 'number'
      ? Math.max(0, rawContext.accountAgeDays)
      : 999, // Default 999 hari (akun lama)

    linkRateIncrease: typeof rawContext.linkRateIncrease === 'number'
      ? Math.max(0, rawContext.linkRateIncrease)
      : 0, // Default 0% kenaikan

    parsedAt: new Date().toISOString()
  };

  return cleaned;
}

/**
 * Middleware: applyContext
 * Menambahkan parsed context ke req.parsedContext
 */
function applyContext(req, res, next) {
  req.parsedContext = parseContext(req.body?.senderContext);
  next();
}

module.exports = applyContext;
module.exports.parseContext = parseContext;
module.exports.VALID_SENDER_TYPES = VALID_SENDER_TYPES;
