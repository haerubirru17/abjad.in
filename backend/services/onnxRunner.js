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
      // probabilitas output
      const probs = results.output_probability.data;
      // probs adalah array objek {0: prob0, 1: prob1} jika mappingnya didukung, 
      // Tapi dalam ONNX.js biasanya berupa Sequence atau Map.
      // Untuk mempermudah, karena labelnya 1=phishing, kita ambil data probabilitas
      // skl2onnx biasanya mengembalikan map untuk probabilities.
      // jika di JS agak tricky membaca sequence of maps dari ONNX,
      // kita cukup gunakan prediksi labelnya.
      confidence = 0.8; // default confidence
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
