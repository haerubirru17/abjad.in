/**
 * Route: /api/chat
 * Fitur: Voice Chat AbjadIn — Tanya jawab kontekstual seputar hasil scan
 *
 * POST /api/chat
 * Body: {
 *   message: string,           // Pertanyaan user
 *   history: [{role, text}],   // Riwayat percakapan sebelumnya
 *   scanContext: {             // Konteks dari hasil scan (dikirim dari frontend)
 *     verdict, score, category, explanation, flags
 *   }
 * }
 *
 * Response: {
 *   reply: string,             // Jawaban AI (teks)
 *   audioBase64: string|null,  // Audio TTS dalam base64
 * }
 */

const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');

// ── Gemini Setup (reuse key yang sudah ada) ────────────────────────────────
const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
const genAI = new GoogleGenerativeAI(apiKeys[0] || 'dummy');

// ── Google Cloud TTS ───────────────────────────────────────────────────────
const TTS_API_KEY = process.env.GOOGLE_VOICE_API_KEY || '';
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/**
 * Konversi teks ke audio MP3 via Google Cloud TTS
 * @returns {Promise<string|null>} base64 audio atau null jika gagal
 */
async function textToSpeech(text) {
  if (!TTS_API_KEY) return null;

  // Potong teks agar tidak terlalu panjang (TTS limit 5000 chars)
  const clampedText = text.slice(0, 1500);

  const body = JSON.stringify({
    input: { text: clampedText },
    voice: {
      languageCode: 'id-ID',
      name: 'id-ID-Wavenet-D', // Suara perempuan Indonesia paling natural
      ssmlGender: 'FEMALE'
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0.0,
    }
  });

  return new Promise((resolve) => {
    const url = new URL(`${TTS_ENDPOINT}?key=${TTS_API_KEY}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.audioContent || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── System Prompt untuk Chat ───────────────────────────────────────────────
function buildSystemPrompt(scanContext) {
  const ctx = scanContext || {};
  const hasContext = ctx.verdict || ctx.explanation;

  const contextSection = hasContext ? `
KONTEKS HASIL SCAN TERAKHIR USER:
- Verdict: ${ctx.verdict || 'tidak diketahui'}
- Skor ancaman: ${ctx.score ?? 'tidak diketahui'}
- Kategori: ${ctx.category || 'tidak diketahui'}
- Penjelasan AI: ${ctx.explanation || 'tidak ada'}
- Flag teknis: ${(ctx.flags || []).join(', ') || 'tidak ada'}
` : `
KONTEKS: User belum melakukan scan apapun.
`;

  return `Kamu adalah AbjadIn, asisten keamanan digital yang ramah dan mudah dipahami untuk masyarakat Indonesia.

${contextSection}

ATURAN MUTLAK:
1. HANYA jawab pertanyaan seputar keamanan siber, penipuan digital, phishing, judi online, atau hasil scan ini.
2. Jika pertanyaan di luar topik (politik, hiburan, dll), tolak dengan sopan: "Maaf, aku hanya bisa membantu seputar keamanan digital ya."
3. JANGAN mengarang data teknis yang tidak ada dalam konteks scan di atas.
4. Jika data tidak tersedia, katakan terus terang: "Data tersebut tidak berhasil kami periksa tadi."
5. Gunakan Bahasa Indonesia yang santai, ramah, dan mudah dipahami semua kalangan — termasuk lansia.
6. Jawaban HARUS ringkas (maksimal 3 paragraf pendek) agar enak didengar sebagai audio.
7. JANGAN gunakan markdown, bullet point, atau simbol dalam jawaban — karena akan dibacakan sebagai suara.
8. Tutup jawaban dengan kata-kata yang mengundang pertanyaan lanjutan jika relevan.`;
}

// ── Route Handler ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { message, history = [], scanContext } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
  }

  if (message.length > 500) {
    return res.status(400).json({ error: 'Pesan terlalu panjang (maksimal 500 karakter).' });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(scanContext),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512,
      }
    });

    // Bangun history percakapan untuk multi-turn
    const chat = model.startChat({
      history: (history || []).slice(-10).map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text || '' }]
      }))
    });

    // Timeout 10 detik untuk Gemini chat
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI Timeout')), 10000)
    );

    const result = await Promise.race([
      chat.sendMessage(message.trim()),
      timeoutPromise
    ]);

    const reply = result.response.text().trim();

    // Generate audio TTS (non-blocking jika gagal)
    const audioBase64 = await textToSpeech(reply);

    return res.json({
      reply,
      audioBase64: audioBase64 ? `data:audio/mp3;base64,${audioBase64}` : null,
    });

  } catch (error) {
    console.error('[ChatRoute] Error:', error.message);

    if (error.message === 'AI Timeout') {
      return res.status(504).json({ error: 'AI sedang sibuk. Coba lagi sebentar.' });
    }

    return res.status(500).json({
      error: 'Gagal mendapatkan jawaban. Silakan coba lagi.',
    });
  }
});

module.exports = router;
