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
  const clampedText = text.slice(0, 1000); // Dikurangi ke 1000 chars agar TTS lebih cepat

  const body = JSON.stringify({
    input: { text: clampedText },
    voice: {
      languageCode: 'id-ID',
      name: 'id-ID-Wavenet-B', // Suara laki-laki Indonesia yang lebih natural dan kasual
      ssmlGender: 'MALE'
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
    req.setTimeout(10000, () => { req.destroy(); resolve(null); }); // Timeout 10s agar TTS sempat selesai
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
6. Jawaban HARUS ringkas (maksimal 4 paragraf pendek) agar enak didengar sebagai audio.
7. JANGAN gunakan markdown, bullet point, atau simbol dalam jawaban — karena akan dibacakan sebagai suara.
8. JANGAN potong jawaban di tengah kalimat. Selalu akhiri dengan kalimat yang utuh dan sempurna.
9. Tutup jawaban dengan kata-kata yang mengundang pertanyaan lanjutan jika relevan.`;
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
        maxOutputTokens: 1024,  // Ditingkatkan agar respons tidak terpotong di tengah kalimat
      }
    });

    // ── Sanitasi History ─────────────────────────────────────────────────
    // Gemini startChat butuh: alternating user→model, DIMULAI dengan 'user'
    // Filter: buang greeting-only (assistant/model di awal), pastikan valid pairs
    const rawHistory = (history || []).slice(-6); // Batasi ke 6 entry (dikurangi dari 10) agar Gemini lebih cepat
    
    // Map role dulu
    const mappedHistory = rawHistory.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: (h.text || '').trim() }]
    })).filter(h => h.parts[0].text.length > 0); // buang entri kosong

    // Gemini requires history to start with 'user' role
    // Trim semua 'model' di awal sampai ketemu 'user'
    while (mappedHistory.length > 0 && mappedHistory[0].role === 'model') {
      mappedHistory.shift();
    }

    // Pastikan tidak ada dua role yang sama berurutan (bisa crash Gemini)
    const validHistory = [];
    for (const entry of mappedHistory) {
      const last = validHistory[validHistory.length - 1];
      if (!last || last.role !== entry.role) {
        validHistory.push(entry);
      }
    }

    // Pastikan history berakhir dengan 'model' (pasangan lengkap)
    // TAPI hanya buang jika tidak ada pasangan model sama sekali di seluruh history,
    // karena membuang user entry valid menyebabkan konteks Q2+ hilang.
    // Correct: history boleh diakhiri user jika itu memang satu-satunya entry.
    // Gemini menerima history [user, model, user, model] — selalu harus berpasangan.
    while (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
      // Cek apakah ada model sebelumnya; jika tidak, history ini tidak valid — hapus
      const hasModelPair = validHistory.some(h => h.role === 'model');
      if (!hasModelPair) { validHistory.length = 0; break; }
      validHistory.pop(); // buang trailing user agar pasangan lengkap
    }

    console.log(`[ChatRoute] Valid history entries: ${validHistory.length}, message: "${message.trim().slice(0, 50)}"`);

    const chat = model.startChat({ history: validHistory });

    // Timeout 10 detik untuk Gemini chat (dikurangi dari 15s)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI Timeout')), 10000)
    );

    const result = await Promise.race([
      chat.sendMessage(message.trim()),
      timeoutPromise
    ]);

    const reply = result.response.text().trim();
    console.log(`[ChatRoute] Reply generated (${reply.length} chars)`);

    // Generate audio TTS PARALEL — dibatasi 5 detik agar tidak delay respons teks
    // Jika TTS lambat/gagal, tetap kirim teks tanpa audio (non-blocking)
    const TTS_TIMEOUT = 5000;
    const audioBase64 = await Promise.race([
      textToSpeech(reply),
      new Promise(resolve => setTimeout(() => resolve(null), TTS_TIMEOUT))
    ]);

    return res.json({
      reply,
      audioBase64: audioBase64 ? `data:audio/mp3;base64,${audioBase64}` : null,
    });

  } catch (error) {
    console.error('[ChatRoute] Error detail:', error.message, error.status, error.stack?.slice(0, 300));

    if (error.message === 'AI Timeout') {
      return res.status(504).json({ error: 'AI sedang sibuk. Coba lagi sebentar.' });
    }

    if (error.status === 429 || error.message?.includes('429')) {
      return res.status(429).json({ error: 'Kuota AI sedang penuh. Coba lagi dalam 1 menit.' });
    }

    return res.status(500).json({
      error: 'Gagal mendapatkan jawaban. Silakan coba lagi.',
    });
  }
});

module.exports = router;
