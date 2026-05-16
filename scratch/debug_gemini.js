require('../backend/node_modules/dotenv').config({ path: './backend/.env' });
console.log('API_KEY is:', process.env.GEMINI_API_KEY ? 'Set' : 'NOT SET', process.env.GEMINI_API_KEY);
const geminiAnalyzer = require('../backend/services/geminiAnalyzer');

async function debug() {
  const url1 = 'http://www.klikbca-update-data.com/login';
  const url2 = 'https://agen-slot-gacor-88-pasti-maxwin.vip';
  
  console.log("Analyzing URL 1...");
  const res1 = await geminiAnalyzer.analyzeURL(url1, []);
  console.log("Result 1:", res1);

  console.log("Analyzing URL 2...");
  const res2 = await geminiAnalyzer.analyzeURL(url2, []);
  console.log("Result 2:", res2);
}

debug();
