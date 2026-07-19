import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CERTIFICATE_SHA256 =
  "d6d2de057dcd199dfbdaa3085b59d4c227530015f817355ddcc403f33ea0d737";
const PACKAGE_NAME = "fr.capclair.app";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function parseReleaseNotes(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim());
  const items = lines
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
  if (items.length === 0)
    fail("RELEASE_NOTES_ANDROID.md must contain at least one bullet item.");
  if (items.some((item) => /todo|à compléter|placeholder/i.test(item))) {
    fail("RELEASE_NOTES_ANDROID.md still contains a placeholder.");
  }
  return items;
}

const root = process.cwd();
const apkInput = path.resolve(root, argument("apk"));
const signatureInput = path.resolve(root, argument("signature-file"));
const repository = argument(
  "repository",
  process.env.GITHUB_REPOSITORY || "Fdl86/capclair-android",
);
const outputDirectory = path.resolve(
  root,
  argument("output", "release-bundle"),
);

if (!fs.existsSync(apkInput)) fail(`APK not found: ${apkInput}`);
if (!fs.existsSync(signatureInput))
  fail(`Signature report not found: ${signatureInput}`);
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
  fail(`Invalid repository: ${repository}`);

const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const version = String(packageJson.version || "");
if (!/^\d+\.\d+\.\d+$/.test(version))
  fail(`Invalid package version: ${version}`);
const [major, minor, patch] = version.split(".").map(Number);
const versionCode = major * 100000 + minor * 1000 + patch;
const tag = `android-v${version}`;
const apkFileName = `cap-clair-dev${major}-${minor}-${patch}.apk`;
const releaseTitle = `CAP CLAIR DEV${version}`;
const notesSource = fs.readFileSync(
  path.join(root, "RELEASE_NOTES_ANDROID.md"),
  "utf8",
);
const changelog = parseReleaseNotes(notesSource);

const signatureReport = fs.readFileSync(signatureInput, "utf8");
const certificateMatch = signatureReport.match(
  /certificate SHA-256 digest:\s*([0-9a-f:]{64,95})/i,
);
if (!certificateMatch)
  fail("Certificate SHA-256 digest not found in apk-signature.txt.");
const certificate = certificateMatch[1].replaceAll(":", "").toLowerCase();
if (certificate !== CERTIFICATE_SHA256)
  fail(`Unexpected certificate SHA-256: ${certificate}`);

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });
const apkOutput = path.join(outputDirectory, apkFileName);
fs.copyFileSync(apkInput, apkOutput);
fs.copyFileSync(
  signatureInput,
  path.join(outputDirectory, "apk-signature.txt"),
);

const apkHash = sha256(apkOutput);
const apkSize = fs.statSync(apkOutput).size;
const releaseBaseUrl = `https://github.com/${repository}/releases/download/${tag}`;
const manifest = {
  schemaVersion: 1,
  platform: "android",
  channel: "dev",
  packageName: PACKAGE_NAME,
  versionName: version,
  versionCode,
  minimumAndroidSdk: 24,
  publishedAt: new Date().toISOString(),
  releaseTag: tag,
  releasePageUrl: `https://github.com/${repository}/releases/tag/${tag}`,
  changelog,
  apk: {
    fileName: apkFileName,
    url: `${releaseBaseUrl}/${apkFileName}`,
    sizeBytes: apkSize,
    sha256: apkHash,
  },
  signingCertificateSha256: certificate,
};

fs.writeFileSync(
  path.join(outputDirectory, "update.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "SHA256SUMS.txt"),
  `${apkHash}  ${apkFileName}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "CHANGELOG.md"),
  `${releaseTitle}\n${"=".repeat(releaseTitle.length)}\n\n${changelog.map((item) => `- ${item}`).join("\n")}\n`,
);
fs.writeFileSync(
  path.join(outputDirectory, "release-metadata.json"),
  `${JSON.stringify({ tag, releaseTitle, apkFileName, version, versionCode }, null, 2)}\n`,
);

console.log(
  JSON.stringify({
    tag,
    releaseTitle,
    apkFileName,
    version,
    versionCode,
    apkHash,
    apkSize,
  }),
);
