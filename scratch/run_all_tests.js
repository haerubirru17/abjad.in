const fs = require('fs');

async function testUrl(input, type = 'url') {
  try {
    const response = await fetch('http://localhost:8080/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [type]: input, context: "Stress Test Automated Script" })
    });
    const data = await response.json();
    return {
      input: input.substring(0, 50) + (input.length > 50 ? '...' : ''),
      verdict: data.verdict || 'ERROR',
      score: data.score !== undefined ? data.score : 'N/A',
      category: data.category || 'N/A'
    };
  } catch (err) {
    return {
      input: input.substring(0, 50) + '...',
      verdict: 'FETCH_ERROR',
      score: 'N/A',
      category: err.message
    };
  }
}

async function runTests() {
  const tests = [
    // Kategori 1: AMAN
    { type: 'url', expected: 'AMAN', value: 'https://www.google.co.id' },
    { type: 'url', expected: 'AMAN', value: 'https://id.wikipedia.org/wiki/Kecerdasan_buatan' },
    { type: 'url', expected: 'AMAN', value: 'https://www.bca.co.id/id/Individu/Layanan/e-Banking/BCA-Mobile' },
    { type: 'url', expected: 'AMAN', value: 'https://www.tokopedia.com' },
    { type: 'url', expected: 'AMAN', value: 'https://github.com' },

    // Kategori 2: PHISHING
    { type: 'url', expected: 'BERBAHAYA/MENCURIGAKAN', value: 'http://www.klikbca-update-data.com/login' },
    { type: 'url', expected: 'BERBAHAYA/MENCURIGAKAN', value: 'https://instagram.verify-badge.support-center.com' },
    { type: 'url', expected: 'BERBAHAYA/MENCURIGAKAN', value: 'http://wa-me.hadiah-undian-shopee-2026.id' },
    { type: 'url', expected: 'BERBAHAYA/MENCURIGAKAN', value: 'https://g00gle-accounts-login.security-alert.net' },
    { type: 'url', expected: 'BERBAHAYA/MENCURIGAKAN', value: 'http://login.facebook.com.secure-connection.top' },

    // Kategori 3: JUDOL
    { type: 'url', expected: 'BLOKIR/BERBAHAYA', value: 'https://agen-slot-gacor-88-pasti-maxwin.vip' },
    { type: 'url', expected: 'BLOKIR/BERBAHAYA', value: 'http://rtp-live-pragmatic-zeus-hari-ini.com' },
    { type: 'url', expected: 'BLOKIR/BERBAHAYA', value: 'https://link-alternatif-sbobet-indonesia.net' },
    { type: 'url', expected: 'BLOKIR/BERBAHAYA', value: 'https://deposit-pulsa-tanpa-potongan-toto.org' },
    { type: 'url', expected: 'BLOKIR/BERBAHAYA', value: 'https://daftar-member-baru-slot-jackpot.cloud' },

    // Kategori 4: HOMOGRAPH / OBFUSCATION
    { type: 'url', expected: 'MENCURIGAKAN/BERBAHAYA', value: 'https://www.bса.co.id' },
    { type: 'url', expected: '...', value: 'http://bit.ly/3x8Ab9Z' },
    { type: 'url', expected: 'MENCURIGAKAN/BERBAHAYA', value: 'http://192.168.1.1/login.php' },

    // Kategori 5: TEKS (Social Engineering)
    { type: 'text', expected: 'MENCURIGAKAN/BERBAHAYA', value: 'INFO RESMI! Selamat nomor WA Anda memenangkan Rp 50 Juta dari Bank BRI. Silakan klaim hadiah anda sebelum hangus dengan klik link berikut: http://bri-hadiah-festival-2026.com/klaim (Pesan ini bebas biaya)' }
  ];

  console.log("Memulai Stress Test Abjad.in API...");
  console.log("--------------------------------------------------------------------------------");
  console.log(String("Input").padEnd(55) + " | " + String("Expected").padEnd(25) + " | " + String("Actual").padEnd(15) + " | Score | Category");
  console.log("--------------------------------------------------------------------------------");

  for (const t of tests) {
    const res = await testUrl(t.value, t.type);
    const expectedMatch = t.expected.includes(res.verdict) || t.expected === '...';
    const statusIcon = expectedMatch ? '✅' : (res.verdict === 'AMAN' && t.expected !== 'AMAN' ? '❌' : '⚠️');
    
    console.log(`${res.input.padEnd(55)} | ${t.expected.padEnd(25)} | ${statusIcon} ${res.verdict.padEnd(12)} | ${String(res.score).padEnd(5)} | ${res.category}`);
  }
}

runTests();
