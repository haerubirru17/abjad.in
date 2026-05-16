# Model AI yang Tersedia dari Gemini API Key
> Dicek pada: 2026-05-11
> Endpoint: `https://generativelanguage.googleapis.com/v1beta/models`

---

## 🎯 Model Relevan untuk Abjad.in

### Rekomendasi Utama (Text + Vision)

| Model | Input Token | Output Token | Thinking | Cocok Untuk |
|-------|------------|-------------|----------|-------------|
| `gemini-2.5-flash` | 1M | 65K | ✅ | **Primary** — Cepat, murah, multimodal |
| `gemini-2.5-pro` | 1M | 65K | ✅ | Analisa kompleks (fallback) |
| `gemini-2.0-flash` | 1M | 8K | ❌ | Lightweight, output pendek |
| `gemini-2.0-flash-lite` | 1M | 8K | ❌ | Paling ringan & cepat |
| `gemini-2.5-flash-lite` | 1M | 65K | ✅ | Balance speed + thinking |
| `gemini-3.1-flash-lite` | 1M | 65K | ✅ | Terbaru, paling efisien |

### Model Terbaru (Preview)

| Model | Input Token | Output Token | Thinking |
|-------|------------|-------------|----------|
| `gemini-3.1-pro-preview` | 1M | 65K | ✅ |
| `gemini-3-pro-preview` | 1M | 65K | ✅ |
| `gemini-3-flash-preview` | 1M | 65K | ✅ |
| `gemini-3.1-flash-lite-preview` | 1M | 65K | ✅ |

### Model Gambar (Image Generation)

| Model | Deskripsi |
|-------|-----------|
| `gemini-2.5-flash-image` | Generate gambar (Nano Banana) |
| `gemini-3-pro-image-preview` | Generate gambar Pro (Nano Banana Pro) |
| `gemini-3.1-flash-image-preview` | Generate gambar terbaru (Nano Banana 2) |

### Embedding

| Model | Input Token |
|-------|------------|
| `gemini-embedding-001` | 2K |
| `gemini-embedding-2` | 8K |

---

## 💡 Strategi untuk Abjad.in

Untuk **PROMPT 4A (Gemini Analyzer)**, kita akan menggunakan:

1. **`gemini-2.5-flash`** sebagai model utama
   - Cepat, hemat kuota, support thinking
   - Cocok untuk: `analyzeURL()`, `analyzeSocialEngineering()`, `analyzeJudolSlang()`, `analyzeContent()`

2. **`gemini-2.5-flash`** juga untuk Vision (multimodal)
   - Sudah support gambar/video
   - Cocok untuk: `analyzeVision()` (deteksi form login palsu, slot online, dll)

3. **`gemini-2.5-pro`** sebagai fallback
   - Digunakan jika hasil dari flash kurang meyakinkan (confidence < 0.5)

> **Catatan:** Roadmap asli menggunakan `gemini-1.5-pro` yang sudah tidak tersedia.
> Kita akan upgrade ke `gemini-2.5-flash` yang jauh lebih capable.

---

## 📋 Daftar Lengkap Semua Model

### Text Generation Models
- `models/gemini-2.5-flash` (v001) — 1M/65K, thinking
- `models/gemini-2.5-pro` (v2.5) — 1M/65K, thinking
- `models/gemini-2.0-flash` (v2.0) — 1M/8K
- `models/gemini-2.0-flash-001` (v2.0) — 1M/8K
- `models/gemini-2.0-flash-lite-001` (v2.0) — 1M/8K
- `models/gemini-2.0-flash-lite` (v2.0) — 1M/8K
- `models/gemini-2.5-flash-lite` (v001) — 1M/65K, thinking
- `models/gemini-3-pro-preview` — 1M/65K, thinking
- `models/gemini-3-flash-preview` — 1M/65K, thinking
- `models/gemini-3.1-pro-preview` — 1M/65K, thinking
- `models/gemini-3.1-pro-preview-customtools` — 1M/65K, thinking
- `models/gemini-3.1-flash-lite-preview` — 1M/65K, thinking
- `models/gemini-3.1-flash-lite` — 1M/65K, thinking
- `models/gemma-4-26b-a4b-it` (v001) — 262K/32K, thinking
- `models/gemma-4-31b-it` (v001) — 262K/32K, thinking

### Alias Models
- `models/gemini-flash-latest` → Latest Flash
- `models/gemini-flash-lite-latest` → Latest Flash-Lite
- `models/gemini-pro-latest` → Latest Pro

### Image Generation Models
- `models/gemini-2.5-flash-image` (Nano Banana) — 32K/32K
- `models/gemini-3-pro-image-preview` (Nano Banana Pro) — 131K/32K
- `models/gemini-3.1-flash-image-preview` (Nano Banana 2) — 65K/65K
- `models/imagen-4.0-generate-001` (Imagen 4)
- `models/imagen-4.0-ultra-generate-001` (Imagen 4 Ultra)
- `models/imagen-4.0-fast-generate-001` (Imagen 4 Fast)

### Video Generation Models
- `models/veo-2.0-generate-001` (Veo 2)
- `models/veo-3.0-generate-001` (Veo 3)
- `models/veo-3.0-fast-generate-001` (Veo 3 fast)
- `models/veo-3.1-generate-preview` (Veo 3.1)
- `models/veo-3.1-fast-generate-preview` (Veo 3.1 fast)
- `models/veo-3.1-lite-generate-preview` (Veo 3.1 lite)

### TTS Models
- `models/gemini-2.5-flash-preview-tts` — 8K/16K
- `models/gemini-2.5-pro-preview-tts` — 8K/16K
- `models/gemini-3.1-flash-tts-preview` — 8K/16K

### Audio/Live Models
- `models/gemini-2.5-flash-native-audio-latest`
- `models/gemini-2.5-flash-native-audio-preview-09-2025`
- `models/gemini-2.5-flash-native-audio-preview-12-2025`
- `models/gemini-3.1-flash-live-preview`

### Embedding Models
- `models/gemini-embedding-001` — 2K
- `models/gemini-embedding-2-preview` — 8K
- `models/gemini-embedding-2` — 8K

### Research Models
- `models/deep-research-max-preview-04-2026`
- `models/deep-research-preview-04-2026`
- `models/deep-research-pro-preview-12-2025`

### Robotics Models
- `models/gemini-robotics-er-1.5-preview`
- `models/gemini-robotics-er-1.6-preview`

### Other
- `models/aqa` — Attributed Question Answering
- `models/gemini-2.5-computer-use-preview-10-2025`
