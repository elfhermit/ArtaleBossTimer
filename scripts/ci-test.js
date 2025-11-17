const { chromium } = require('playwright');

(async () => {
  const base = 'http://localhost:8000/docs/index.html';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log('goto', base);
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 15000 });

    console.log('wait for monitor card');
    await page.waitForSelector('#monitor-root .monitor-card', { timeout: 8000 });

    const bossButton = await page.$('#monitor-root .monitor-card button[data-boss-id]');
    if (!bossButton) throw new Error('no quick-record button found');
    const bossId = await bossButton.getAttribute('data-boss-id');
    console.log('found bossId:', bossId);

    console.log('click quick-record');
    await bossButton.click();

    console.log('wait for record form to reflect boss selection');
    await page.waitForFunction((id) => {
      const el = document.getElementById('record-boss');
      return el && el.value === id;
    }, bossId, { timeout: 3000 });

    console.log('set channel to 1 and apply +1 minute via DOM (avoid click interception)');
    await page.evaluate(() => {
      const ch = document.getElementById('record-channel');
      if (ch) { ch.value = '1'; ch.dispatchEvent(new Event('input', { bubbles: true })); }
      const isoEl = document.getElementById('record-timestamp-iso');
      if (isoEl) {
        const dt = new Date(Date.now() + 60000); // +1 minute
        isoEl.value = dt.toISOString();
        const disp = document.getElementById('record-time-display');
        if (disp) disp.innerText = `擊殺時間：${dt.toLocaleString()}`;
      } else {
        const disp = document.getElementById('record-time-display');
        if (disp) {
          const dt = new Date(Date.now() + 60000);
          disp.innerText = `擊殺時間：${dt.toLocaleString()}`;
        }
      }
    });

    console.log('ensure looted toggle / radio is set to "no"');
    // set looted toggle (new UI) or fallback to legacy radio
    await page.evaluate(() => {
      const elToggle = document.getElementById('looted-toggle');
      if (elToggle) {
        // ensure unchecked => 'no'
        elToggle.checked = false;
        elToggle.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const elRadio = document.getElementById('looted-no');
      if (elRadio) {
        elRadio.checked = true;
        elRadio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    console.log('fill note and submit');
    await page.fill('#record-note', 'e2e test');
    await page.click('#record-add');

    // wait briefly for storage update
    await page.waitForTimeout(800);

    const storageSummary = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('abt_records_v1:'));
      const out = {};
      keys.forEach(k => {
        try {
          const obj = JSON.parse(localStorage.getItem(k));
          out[k] = (obj && Array.isArray(obj.records) && obj.records.length) ? obj.records[obj.records.length-1] : null;
        } catch (e) { out[k] = null; }
      });
      return out;
    });

    console.log('localStorage summary keys:', Object.keys(storageSummary));
    const hasBossKey = Object.keys(storageSummary).some(k => k.endsWith(':' + bossId));
    console.log('hasBossKey:', hasBossKey);

    const rowsCount = await page.$$eval('#records-root table tbody tr', els => els.length);
    console.log('records table rows:', rowsCount);

    if (!hasBossKey) throw new Error('no per-boss key created for bossId ' + bossId);
    if (rowsCount === 0) throw new Error('no rows in records table after adding');

    console.log('E2E test passed');
  } catch (err) {
    console.error('E2E test failed:', err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
