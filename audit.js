const YahooFinance = require('yahoo-finance2').default;
const fs = require('fs');
const yf = new YahooFinance();

(async () => {
  // Test Kilburn
  try {
    const q = await yf.quote('KLBRENG-B.BO');
    console.log('KLBRENG-B.BO =>', q.regularMarketPrice, q.shortName);
  } catch(e) { console.log('KLBRENG-B.BO => ERROR'); }

  // Full audit
  const db = JSON.parse(fs.readFileSync('data/database.json', 'utf8'));
  const tm = db.ticker_map;
  const errors = [];
  const good = [];

  for (const [tikr, yfSym] of Object.entries(tm)) {
    try {
      const q = await yf.quote(yfSym);
      const price = q.regularMarketPrice;
      if (price === null || price === undefined || price === 0) {
        errors.push(tikr + ' (' + yfSym + ') => ZERO/UNDEF: ' + price);
      } else {
        good.push(tikr);
      }
    } catch(e) {
      errors.push(tikr + ' (' + yfSym + ') => ERR: ' + String(e.message).substring(0, 60));
    }
  }
  console.log('\nERROR SYMBOLS (' + errors.length + '):');
  errors.forEach(e => console.log('  ' + e));
  console.log('\nWorking:', good.length, '/', Object.keys(tm).length);
})();
