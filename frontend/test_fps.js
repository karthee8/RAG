const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('BROWSER_LOG:', msg.text());
  });

  try {
    console.log('Navigating to http://localhost:3000/login ...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
    console.log('Waiting 6 seconds for FPS logs...');
    await new Promise(resolve => setTimeout(resolve, 6000));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
})();
