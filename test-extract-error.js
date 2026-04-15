/**
 * Quick diagnostic: calls extract-shot and prints the exact error returned from
 * the server WITHOUT waiting for actual Grok automation to complete.
 * Uses `dummy-test` project + `fake.png` so the route will immediately fail
 * on the image-access step and surface the real error text.
 */
const fs = require('fs');
const path = require('path');

// Try to read the real active project + first PNG so we get the real failure path
let projectName = 'dummy-test';
let filename = 'none.png';
try {
  const active = fs.readFileSync(path.join(__dirname, 'projects', 'active.txt'), 'utf8').trim();
  if (active) projectName = active;
  const gridsDir = path.join(__dirname, 'projects', active, 'grids');
  const pngs = fs.readdirSync(gridsDir).filter(f => f.endsWith('.png'));
  if (pngs.length) filename = pngs[0];
} catch (e) { /* ok — will use defaults */ }

console.log(`Testing with project="${projectName}", filename="${filename}"`);

const controller = new AbortController();
// Kill after 8 seconds — we just want the error message, not the full run
const timer = setTimeout(() => controller.abort(), 8000);

fetch('http://localhost:3000/api/open-browser', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'extract-shot', gridIndex: 0, filename, projectName }),
  signal: controller.signal,
})
  .then(r => {
    clearTimeout(timer);
    console.log('HTTP status:', r.status);
    return r.text();
  })
  .then(body => console.log('Response body:', body))
  .catch(e => {
    if (e.name === 'AbortError') {
      console.log('Request aborted after 8s (expected for long-running automation).');
      console.log('This means the server accepted the call without throwing immediately — the 500 has a different trigger.');
    } else {
      console.error('Fetch error:', e.message);
    }
  });
