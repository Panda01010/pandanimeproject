const url = process.argv[2];
const shotId = process.argv[3] || 'manual_redownload';
const filename = `${shotId}.png`;

if (!url) {
  console.error("Usage: node redownload-shot.js <url> [shotId]");
  process.exit(1);
}

console.log(`Requesting redownload for URL: ${url}`);
console.log(`Target filename: ${filename}`);

(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/open-browser', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'redownload-shot',
        projectName: '', // Empty or specific
        sourceUrl: url,
        targetFilename: filename
      })
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`✅ Success! Redownloaded and saved to ${filename}`);
    } else {
      console.error(`❌ Failed:`, data);
    }
  } catch (err) {
    console.error(`❌ Request error:`, err);
  }
})();
