import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const version = packageJson.version;
const [major, minor, patch] = version.split('.').map(Number);
const expectedCode = major * 100000 + minor * 1000 + patch;
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const versionSource = fs.readFileSync('src/app/version.ts', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const workflow = fs.readFileSync('.github/workflows/android-release-apk.yml', 'utf8');
const expectedArtifact = `cap-clair-dev${major}-${minor}-${patch}-release-apk`;

const failures = [];
if (packageLock.version !== version || packageLock.packages?.['']?.version !== version) {
  failures.push('package-lock.json version mismatch');
}
if (!gradle.includes(`versionCode ${expectedCode}`)) failures.push(`build.gradle versionCode must be ${expectedCode}`);
if (!gradle.includes(`versionName "${version}"`)) failures.push(`build.gradle versionName must be ${version}`);
if (!versionSource.includes(`DEV${version}`)) failures.push(`src/app/version.ts must contain DEV${version}`);
if (!html.includes(`DEV${version}`)) failures.push(`index.html must contain DEV${version}`);
if (!workflow.includes('name: cap-clair-dev${{ steps.version.outputs.slug }}-release-apk')) {
  failures.push('workflow artifact naming expression missing');
}
if (!workflow.includes('assembleRelease')) failures.push('workflow must build assembleRelease');
if (!workflow.includes('gh release create')) failures.push('workflow must publish a GitHub Release');
if (!workflow.includes(expectedArtifact.replace(`dev${major}-${minor}-${patch}`, 'dev${{ steps.version.outputs.slug }}'))) {
  failures.push(`workflow artifact template must produce ${expectedArtifact}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Version coherence OK: ${version} / ${expectedCode}`);
