const urlParser = require('url');

function extractLexicalFeatures(urlString) {
  try {
    // Tambahkan http:// jika tidak ada protokol agar bisa di-parse
    let parseUrl = urlString;
    if (!parseUrl.startsWith('http://') && !parseUrl.startsWith('https://')) {
      parseUrl = 'http://' + parseUrl;
    }
    
    const parsed = new URL(parseUrl);
    const hostname = parsed.hostname;
    
    const URLLength = urlString.length;
    const DomainLength = hostname.length;
    
    // Cek apakah IP (IPv4 atau IPv6)
    const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    const ipv6Regex = /^(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}$/;
    const IsDomainIP = (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) ? 1 : 0;
    
    // Hitung subdomain (asumsi minimal .com = 2 parts, jadi length - 2)
    // misal: www.google.com -> parts = 3, subdomains = 1
    // misal: google.com -> parts = 2, subdomains = 0
    const parts = hostname.split('.');
    const NoOfSubDomain = Math.max(0, parts.length - (IsDomainIP ? 1 : 2));
    
    const NoOfLettersInURL = (urlString.match(/[a-zA-Z]/g) || []).length;
    const LetterRatioInURL = URLLength > 0 ? NoOfLettersInURL / URLLength : 0;
    
    const NoOfDegitsInURL = (urlString.match(/[0-9]/g) || []).length;
    const DegitRatioInURL = URLLength > 0 ? NoOfDegitsInURL / URLLength : 0;
    
    const NoOfEqualsInURL = (urlString.match(/=/g) || []).length;
    const NoOfQMarkInURL = (urlString.match(/\?/g) || []).length;
    const NoOfAmpersandInURL = (urlString.match(/&/g) || []).length;
    
    // Special chars selain alfanumerik
    const specialChars = (urlString.match(/[^a-zA-Z0-9]/g) || []).length;
    // Asumsikan OtherSpecialChars adalah selain = ? & (dan mungkin : / . tapi kita gunakan sesuai paper umumnya)
    const NoOfOtherSpecialCharsInURL = Math.max(0, specialChars - NoOfEqualsInURL - NoOfQMarkInURL - NoOfAmpersandInURL);
    const SpacialCharRatioInURL = URLLength > 0 ? NoOfOtherSpecialCharsInURL / URLLength : 0;
    
    const IsHTTPS = urlString.startsWith('https://') ? 1 : 0;

    return [
      URLLength,
      DomainLength,
      IsDomainIP,
      NoOfSubDomain,
      NoOfLettersInURL,
      LetterRatioInURL,
      NoOfDegitsInURL,
      DegitRatioInURL,
      NoOfEqualsInURL,
      NoOfQMarkInURL,
      NoOfAmpersandInURL,
      NoOfOtherSpecialCharsInURL,
      SpacialCharRatioInURL,
      IsHTTPS
    ];
  } catch (err) {
    // Fallback array dengan 14 fitur bernilai 0 jika gagal parse
    return Array(14).fill(0);
  }
}

module.exports = {
  extractLexicalFeatures
};
