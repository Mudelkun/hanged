/*
 * Build-time downloads (the dictionaries and word lists behind data/words.json).
 * Each file is fetched once into scripts/.cache/ (gitignored); the app never
 * reads any of them.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const CACHE_DIR = path.join(__dirname, '.cache');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(download(new URL(res.headers.location, url).href, dest));
        }
        if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        const tmp = `${dest}.part`;
        res.pipe(fs.createWriteStream(tmp)).on('finish', () => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      })
      .on('error', reject);
  });
}

/** The cached copy of `url` (as `name` in scripts/.cache/), downloading it the first time. */
async function cached(name, url, label) {
  const file = path.join(CACHE_DIR, name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`Downloading ${label}…`);
    await download(url, file);
  }
  return file;
}

/** The files of a cached .tar.gz whose names `keep` accepts, as name → Buffer. */
function untar(file, keep) {
  const tar = zlib.gunzipSync(fs.readFileSync(file));
  const files = new Map();
  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512);
    const name = header.toString('latin1', 0, 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(header.toString('latin1', 124, 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const type = header[156];
    if ((type === 0 || type === 0x30) && keep(name)) files.set(name, tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

module.exports = { cached, untar };
