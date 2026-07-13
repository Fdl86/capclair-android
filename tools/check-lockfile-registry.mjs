import fs from 'node:fs';

const lockPath = 'package-lock.json';
const raw = fs.readFileSync(lockPath, 'utf8');
const forbiddenPatterns = [
  /applied-caas-gateway/i,
  /\.internal\./i,
  /\/artifactory\//i,
  /packages\.openai\.org/i,
];

const matchedPattern = forbiddenPatterns.find((pattern) => pattern.test(raw));
if (matchedPattern) {
  console.error(`Forbidden private package registry reference found in ${lockPath}: ${matchedPattern}`);
  process.exit(1);
}

const lock = JSON.parse(raw);
const invalidResolvedUrls = [];
for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  const resolved = metadata?.resolved;
  if (typeof resolved !== 'string') continue;

  let url;
  try {
    url = new URL(resolved);
  } catch {
    invalidResolvedUrls.push(`${packagePath}: invalid URL ${resolved}`);
    continue;
  }

  if (url.protocol !== 'https:') {
    invalidResolvedUrls.push(`${packagePath}: non-HTTPS URL ${resolved}`);
  }
}

if (invalidResolvedUrls.length > 0) {
  console.error('Invalid package-lock resolved URLs:');
  for (const line of invalidResolvedUrls) console.error(`- ${line}`);
  process.exit(1);
}

console.log('Package lock registry check OK: no private registry URL');
