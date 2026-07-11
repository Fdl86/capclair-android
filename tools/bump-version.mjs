import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const version = process.argv[2];
const label = process.argv.slice(3).join(' ').trim() || 'BUILD';

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run version:bump -- 15.1.6 "LABEL"');
  process.exit(1);
}

const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 1000 + minor * 10 + patch;
const devVersion = `DEV${version}`;
const displayBase = `CAP CLAIR ${devVersion} - ${label.toUpperCase()}`;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}

for (const file of ['package.json', 'package-lock.json']) {
  const json = JSON.parse(read(file));
  json.version = version;
  if (json.packages?.['']) json.packages[''].version = version;
  write(file, `${JSON.stringify(json, null, 2)}\n`);
}

write(
  'android/app/build.gradle',
  read('android/app/build.gradle')
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`)
);

write(
  'src/app/version.ts',
  read('src/app/version.ts').replace(
    /export const APP_VERSION_BASE = '[^']+';/,
    `export const APP_VERSION_BASE = '${displayBase}';`
  )
);

write(
  'index.html',
  read('index.html')
    .replace(/<title>[^<]*<\/title>/, `<title>${displayBase}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${displayBase} - Navigation VFR Android native." />`)
);

write(
  '.github/workflows/android-debug-apk.yml',
  read('.github/workflows/android-debug-apk.yml').replace(
    /name: cap-clair-dev\d+-\d+-\d+-debug-apk/,
    `name: cap-clair-dev${major}-${minor}-${patch}-debug-apk`
  )
);

console.log(`${displayBase}`);
console.log(`versionCode ${versionCode}`);
