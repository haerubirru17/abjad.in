const { calculateVerdict } = require('../backend/services/verdictEngine');

const mockResults = {
  normalized: { flags: [], score: 0, originalUrl: 'https://www.google.co.id' },
  homograph: { riskScore: 0, hasHomograph: false, flags: [] },
  domain: { totalScore: 0, isWhitelisted: true, flags: ['WHITELISTED'] },
  resolver: { riskScore: 0, chain: [], finalUrl: 'https://www.google.co.id' },
  threatIntel: { hasOverride: false, totalScore: 0, flags: [] },
  gemini: {
    url: { 
      verdict: 'MENCURIGAKAN', 
      confidence: 0.9, 
      explanation: 'Saya curiga ini link google.' 
    },
    socialEng: { isSocialEngineering: false, confidence: 0 },
    judolSlang: { isJudol: false, confidence: 0 },
    vision: null,
    content: null
  }
};

const verdict = calculateVerdict(mockResults);
console.log(JSON.stringify(verdict, null, 2));
