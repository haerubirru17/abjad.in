/**
 * Image Hasher untuk Abjad.in
 * Menghasilkan perceptual hash dari gambar untuk mencocokkan
 * dengan database gambar phishing/judol yang sudah diketahui.
 * 
 * Perceptual hash berbeda dari SHA256 — gambar yang sedikit
 * dimodifikasi (resize, crop, kompresi) tetap menghasilkan
 * hash yang mirip sehingga bisa dicocokkan.
 * 
 * Fungsi utama: checkImageHash(imageBase64)
 */

const crypto = require('crypto');
const cacheService = require('./cacheService');

/**
 * Generate SHA256 hash dari image base64
 * Digunakan sebagai cache key (exact match)
 * @param {string} base64Data 
 * @returns {string}
 */
function generateSHA256(base64Data) {
  return crypto.createHash('sha256').update(base64Data).digest('hex');
}

/**
 * Generate perceptual hash sederhana dari image base64
 * Menggunakan pendekatan average hash (aHash):
 * 1. Decode base64 ke buffer
 * 2. Ambil sampel byte secara merata
 * 3. Hitung rata-rata nilai byte
 * 4. Bandingkan setiap byte dengan rata-rata → 0 atau 1
 * 5. Gabungkan menjadi hex string
 * 
 * @param {string} base64Data 
 * @returns {string} Perceptual hash (hex)
 */
function generatePerceptualHash(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');

    // Ambil 64 sampel byte yang merata dari buffer
    const sampleSize = 64;
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));
    const samples = [];

    for (let i = 0; i < sampleSize && i * step < buffer.length; i++) {
      samples.push(buffer[i * step]);
    }

    // Hitung rata-rata
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    // Generate hash: setiap bit = 1 jika >= rata-rata, 0 jika tidak
    let hashBits = '';
    for (const sample of samples) {
      hashBits += sample >= avg ? '1' : '0';
    }

    // Konversi bits ke hex
    let hexHash = '';
    for (let i = 0; i < hashBits.length; i += 4) {
      const chunk = hashBits.slice(i, i + 4).padEnd(4, '0');
      hexHash += parseInt(chunk, 2).toString(16);
    }

    return hexHash;
  } catch (error) {
    console.error('[ImageHasher] Error generating perceptual hash:', error.message);
    return null;
  }
}

/**
 * Hitung Hamming distance antara dua hex hash
 * Semakin kecil = semakin mirip
 * @param {string} hash1 
 * @param {string} hash2 
 * @returns {number}
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const bits1 = parseInt(hash1[i], 16).toString(2).padStart(4, '0');
    const bits2 = parseInt(hash2[i], 16).toString(2).padStart(4, '0');
    for (let j = 0; j < 4; j++) {
      if (bits1[j] !== bits2[j]) distance++;
    }
  }

  return distance;
}

/**
 * Fungsi utama: checkImageHash
 * Cek apakah gambar sudah pernah dianalisa (cache hit)
 * atau mirip dengan gambar phishing/judol yang diketahui.
 * 
 * @param {string} imageBase64 - Gambar dalam format base64
 * @returns {Promise<object>}
 */
async function checkImageHash(imageBase64) {
  const result = {
    sha256: null,
    perceptualHash: null,
    cacheHit: false,
    cachedResult: null,
    similarityMatch: false,
    matchedHash: null,
    hammingDistance: null
  };

  if (!imageBase64) return result;

  // Generate hashes
  result.sha256 = generateSHA256(imageBase64);
  result.perceptualHash = generatePerceptualHash(imageBase64);

  // Cek exact match di cache (SHA256)
  try {
    const cached = await cacheService.get(`img:${result.sha256}`);
    if (cached) {
      result.cacheHit = true;
      result.cachedResult = cached;
      return result;
    }
  } catch (error) {
    // Cache miss, lanjut analisa
  }

  // Cek similarity match terhadap known threats
  try {
    const knownHashes = await cacheService.get('known_threat_hashes');
    if (knownHashes && Array.isArray(knownHashes)) {
      for (const known of knownHashes) {
        const dist = hammingDistance(result.perceptualHash, known.hash);
        // Threshold: Hamming distance <= 5 dianggap mirip
        if (dist <= 5) {
          result.similarityMatch = true;
          result.matchedHash = known.hash;
          result.hammingDistance = dist;
          break;
        }
      }
    }
  } catch (error) {
    // Tidak ada known hashes, lanjut
  }

  return result;
}

/**
 * Simpan hasil analisa gambar ke cache
 * @param {string} sha256 
 * @param {object} analysisResult 
 */
async function cacheImageResult(sha256, analysisResult) {
  try {
    await cacheService.set(`img:${sha256}`, analysisResult, 86400); // Cache 24 jam
  } catch (error) {
    console.error('[ImageHasher] Error caching result:', error.message);
  }
}

module.exports = {
  checkImageHash,
  cacheImageResult,
  generateSHA256,
  generatePerceptualHash,
  hammingDistance
};
