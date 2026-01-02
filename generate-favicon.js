// Small script to write a favicon binary from an embedded small PNG base64.
// This writes a file at the repository root as `favicon.ico` (many browsers accept PNG bytes here).

const fs = require('fs');
const path = require('path');

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAB1JREFUCNdjYGBgYAAAAAQAAV6D+NwAAAAASUVORK5CYII=';
const outPath = path.resolve(__dirname, '..', 'favicon.ico');
fs.writeFileSync(outPath, Buffer.from(pngBase64, 'base64'));
console.log('Wrote favicon to', outPath);
