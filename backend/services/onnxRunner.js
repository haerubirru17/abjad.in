const ort = require('onnxruntime-node');
const path = require('path');
const { extractLexicalFeatures } = require('./lexicalFeatures');

let session = null;

async function initModel() {
  if (session) return;
  try {
    const modelPath = path.join(__dirname, '../scripts/phishing_lexical_rf.onnx');
    session = await ort.InferenceSession.create(modelPath);
    console.log('✅ ONNX Model loaded successfully');
  } catch (err) {
    console.error('❌ Error loading ONNX model:', err);
  }
}

/**
 * Memprediksi apakah URL phishing (1) atau legitimate (0)
 * berdasarkan fitur leksikal.
 * @param {string} urlString
 * @returns {Promise<{isPhishing: boolean, confidence: number, features: number[]}>}
 */
async function predictLexical(urlString) {
  if (!session) {
    await initModel();
  }
  
  if (!session) {
    // Fallback jika model gagal diload
    return null;
  }

  try {
    const featuresArray = extractLexicalFeatures(urlString);
    
    // Fitur dari Python:
    // ['URLLength', 'DomainLength', 'IsDomainIP', 'NoOfSubDomain', 'NoOfLettersInURL', 
    //  'LetterRatioInURL', 'NoOfDegitsInURL', 'DegitRatioInURL', 'NoOfEqualsInURL', 
    //  'NoOfQMarkInURL', 'NoOfAmpersandInURL', 'NoOfOtherSpecialCharsInURL', 
    //  'SpacialCharRatioInURL', 'IsHTTPS']
    // Total 14 fitur
    
    // Convert ke Float32Array sesuai requirement model scikit-learn ONNX
    const float32Data = new Float32Array(featuresArray);
    
    // Create tensor: dimensi [1, 14] karena batch_size = 1
    const inputTensor = new ort.Tensor('float32', float32Data, [1, float32Data.length]);
    
    // Nama input biasanya sesuai initial_type di convert_sklearn.
    // Di train_ml_model.py: initial_type = [('float_input', FloatTensorType([None, len(features)]))]
    const feeds = { float_input: inputTensor };
    
    const results = await session.run(feeds);
    
    // scikit-learn di ONNX biasanya mengembalikan dua output:
    // 1. label / output_label (array of int64)
    // 2. probabilities (array of dict / map class -> prob)
    
    let isPhishing = false;
    let confidence = 0;
    
    if (results.output_label) {
      const label = Number(results.output_label.data[0]);
      isPhishing = label === 1;
    } else if (results.label) {
      const label = Number(results.label.data[0]);
      isPhishing = label === 1;
    }
    
    if (results.output_probability) {
      // Coba baca probability untuk class 1 (phishing) dari ONNX output
      // skl2onnx menghasilkan Sequence of Map: [{0: prob_benign, 1: prob_phishing}, ...]
      try {
        const probData = results.output_probability.data;
        if (probData && typeof probData[1] === 'number') {
          // Map format: data[0] = prob class 0, data[1] = prob class 1
          confidence = probData[1];
        } else if (probData && probData[0] && typeof probData[0][1] === 'number') {
          // Sequence of map format
          confidence = probData[0][1];
        } else {
          // Fallback konservatif — lebih rendah dari 0.8 agar tidak trigger override paksa
          confidence = isPhishing ? 0.60 : 0.35;
        }
      } catch {
        // Jika gagal parse probability, gunakan nilai konservatif
        // 0.60 sengaja di bawah threshold 0.90 agar tidak memicu early-exit BERBAHAYA
        confidence = isPhishing ? 0.60 : 0.35;
      }
    } else {
      // Tidak ada probability output — hanya ada label
      // Gunakan nilai konservatif, bukan 0.8 yang menyesatkan
      confidence = isPhishing ? 0.60 : 0.35;
    }
    
    return {
      isPhishing,
      confidence: confidence || 0.8,
      features: featuresArray
    };
  } catch (err) {
    console.error('❌ ONNX prediction error:', err);
    return null;
  }
}

module.exports = {
  initModel,
  predictLexical
};
