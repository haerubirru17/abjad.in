/**
 * Web Risk Submitter untuk Abjad.in
 * Mengirim URL berbahaya yang terdeteksi ke Google Web Risk API
 * sebagai kontribusi balik ke ekosistem keamanan internet.
 * 
 * Juga bisa digunakan untuk melaporkan URL ke platform lain.
 * 
 * Fungsi utama: submitThreat(url, threatType, verdict)
 */

const fetch = require('node-fetch');

const WEB_RISK_KEY = process.env.WEB_RISK_API_KEY || '';

// Peta kategori Abjad.in → Google Web Risk threat type
const THREAT_TYPE_MAP = {
  'PHISHING': 'SOCIAL_ENGINEERING',
  'JUDI_ONLINE': 'SOCIAL_ENGINEERING',
  'MALWARE': 'MALWARE',
  'SCAM': 'SOCIAL_ENGINEERING',
  'MENCURIGAKAN': 'POTENTIALLY_HARMFUL_APPLICATION'
};

/**
 * Submit URL berbahaya ke Google Web Risk API
 * Hanya submit jika skor >= 85 (verdict: BLOKIR)
 * 
 * @param {string} url - URL yang akan dilaporkan
 * @param {string} category - Kategori ancaman dari verdictEngine
 * @param {object} verdictResult - Hasil lengkap dari verdictEngine
 * @returns {Promise<object>}
 */
async function submitThreat(url, category, verdictResult) {
  const result = {
    submitted: false,
    submittedTo: [],
    errors: []
  };

  // Hanya submit jika skor cukup tinggi
  if (!verdictResult || verdictResult.score < 85) {
    result.errors.push('Skor terlalu rendah untuk di-submit (minimal 85)');
    return result;
  }

  // Submit ke Google Web Risk
  if (WEB_RISK_KEY) {
    try {
      const threatType = THREAT_TYPE_MAP[category] || 'SOCIAL_ENGINEERING';

      const response = await fetch(
        `https://webrisk.googleapis.com/v1/uris:submit?key=${WEB_RISK_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
          body: JSON.stringify({
            submission: {
              uri: url,
              threatTypes: [threatType]
            }
          })
        }
      );

      if (response.ok) {
        result.submitted = true;
        result.submittedTo.push('Google Web Risk');
        console.log(`[WebRiskSubmitter] URL berhasil di-submit: ${url}`);
      } else {
        const errorData = await response.text();
        result.errors.push(`Google Web Risk: HTTP ${response.status} - ${errorData}`);
      }
    } catch (error) {
      result.errors.push(`Google Web Risk: ${error.message}`);
    }
  } else {
    result.errors.push('WEB_RISK_API_KEY tidak tersedia');
  }

  return result;
}

/**
 * Submit URL ke Kominfo (aduankonten.id) — format log saja
 * Kominfo tidak punya API publik, jadi kita catat untuk pelaporan manual
 * 
 * @param {string} url 
 * @param {string} category 
 * @returns {object}
 */
function logForKominfoReport(url, category) {
  const report = {
    url,
    category,
    reportUrl: 'https://aduankonten.id',
    timestamp: new Date().toISOString(),
    instructions: category === 'JUDI_ONLINE'
      ? 'Laporkan melalui aduankonten.id dengan kategori "Judi Online"'
      : 'Laporkan melalui aduankonten.id dengan kategori "Penipuan"'
  };

  console.log(`[WebRiskSubmitter] Catat untuk Kominfo: ${url} (${category})`);
  return report;
}

/**
 * Submit URL ke PhishTank (jika ada API key)
 * @param {string} url 
 * @returns {Promise<object>}
 */
async function submitToPhishTank(url) {
  const PHISHTANK_KEY = process.env.PHISHTANK_API_KEY || '';

  if (!PHISHTANK_KEY) {
    return { submitted: false, error: 'PhishTank API key tidak tersedia' };
  }

  try {
    const response = await fetch('https://checkurl.phishtank.com/checkurl/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
      body: `url=${encodeURIComponent(url)}&format=json&app_key=${PHISHTANK_KEY}`
    });

    if (response.ok) {
      return { submitted: true, platform: 'PhishTank' };
    }
    return { submitted: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { submitted: false, error: error.message };
  }
}

/**
 * Fungsi orkestrator: submitAllReports
 * Mengirim laporan ke semua platform sekaligus
 * 
 * @param {string} url 
 * @param {string} category 
 * @param {object} verdictResult 
 * @returns {Promise<object>}
 */
async function submitAllReports(url, category, verdictResult) {
  const results = {
    webRisk: null,
    kominfo: null,
    phishtank: null,
    timestamp: new Date().toISOString()
  };

  // Google Web Risk
  results.webRisk = await submitThreat(url, category, verdictResult);

  // Log untuk Kominfo
  results.kominfo = logForKominfoReport(url, category);

  // PhishTank (hanya untuk phishing)
  if (category === 'PHISHING') {
    results.phishtank = await submitToPhishTank(url);
  }

  return results;
}

module.exports = {
  submitThreat,
  submitAllReports,
  logForKominfoReport,
  submitToPhishTank
};
