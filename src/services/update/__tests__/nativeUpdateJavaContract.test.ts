import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pluginPath = path.resolve(
  root,
  "android/app/src/main/java/fr/capclair/app/NativeUpdatePlugin.java",
);
const manifestPath = path.resolve(
  root,
  "android/app/src/main/AndroidManifest.xml",
);
const filePathsPath = path.resolve(
  root,
  "android/app/src/main/res/xml/file_paths.xml",
);
const mainActivityPath = path.resolve(
  root,
  "android/app/src/main/java/fr/capclair/app/MainActivity.java",
);
const workflowPath = path.resolve(
  root,
  ".github/workflows/android-release-apk.yml",
);

const EXPECTED_CERTIFICATE =
  "d6d2de057dcd199dfbdaa3085b59d4c227530015f817355ddcc403f33ea0d737";

describe("Native Android updater security contract", () => {
  it("pins CAP CLAIR package and certificate and verifies every APK property", () => {
    const source = fs.readFileSync(pluginPath, "utf8");

    expect(source).toContain(
      'private static final String PACKAGE_NAME = "fr.capclair.app"',
    );
    expect(source).toContain(
      `private static final String CERTIFICATE_SHA256 = "${EXPECTED_CERTIFICATE}"`,
    );
    expect(source).toContain("String actualSha256 = sha256(apkFile)");
    expect(source).toContain("if (!expectedSha256.equals(actualSha256))");
    expect(source).toContain(
      "if (!PACKAGE_NAME.equals(archiveInfo.packageName))",
    );
    expect(source).toContain("if (versionCode <= installedVersionCode)");
    expect(source).toContain(
      "if (!expectedVersionName.equals(actualVersionName))",
    );
    expect(source).toContain("if (minimumAndroidSdk > Build.VERSION.SDK_INT)");
    expect(source).toContain(
      "if (!CERTIFICATE_SHA256.equals(certificate) || !installedCertificate.equals(certificate))",
    );
    expect(source).toContain("verifyCurrentApk();");
  });

  it("uses Android DownloadManager, deletes invalid files and never installs silently", () => {
    const source = fs.readFileSync(pluginPath, "utf8");

    expect(source).toContain("DownloadManager.Request request");
    expect(source).toContain("downloadManager().remove(downloadId)");
    expect(source).toContain("cleanupInvalidDownload()");
    expect(source).toContain("if (shouldDeleteDownloadedApk(error.code))");
    expect(source).not.toContain('if ("gps_active".equals(code))');
    expect(source).toContain("Intent.ACTION_VIEW");
    expect(source).toContain("FLAG_GRANT_READ_URI_PERMISSION");
    expect(source).not.toContain("PackageInstaller.Session");
    expect(source).not.toContain("commit(");
  });

  it("blocks download and installation while GPS or an unsaved native trace is active", () => {
    const source = fs.readFileSync(pluginPath, "utf8");

    expect(source).toContain("JSObject status = NativeGpsStore.getStatus()");
    expect(source).toContain('if (status.optBoolean("running", false))');
    expect(source).toContain(
      "if (!sessionId.isEmpty() && hasEndedAt && !saved)",
    );
    expect(
      source.match(/ensureUpdateActivityAllowed\(\);/g)?.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("declares only the installer permission and a scoped FileProvider directory", () => {
    const manifest = fs.readFileSync(manifestPath, "utf8");
    const filePaths = fs.readFileSync(filePathsPath, "utf8");
    const mainActivity = fs.readFileSync(mainActivityPath, "utf8");

    expect(manifest).toContain("android.permission.REQUEST_INSTALL_PACKAGES");
    expect(manifest).not.toContain("WRITE_EXTERNAL_STORAGE");
    expect(manifest).not.toContain("MANAGE_EXTERNAL_STORAGE");
    expect(filePaths).toContain(
      '<external-files-path name="capclair_updates" path="Download/capclair-updates/" />',
    );
    expect(mainActivity).toContain("registerPlugin(NativeUpdatePlugin.class)");
  });
});

describe("GitHub Release publication contract", () => {
  it("builds a signed release APK and publishes immutable assets only after verification", () => {
    const workflow = fs.readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("./gradlew assembleRelease");
    expect(workflow).toContain("apksigner");
    expect(workflow).toContain("package: name='fr.capclair.app'");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("Tag $TAG already exists");
    expect(workflow).toContain("update.json");
    expect(workflow).toContain("SHA256SUMS.txt");
  });

  it("generates a coherent public update.json from the signed APK", () => {
    const temp = fs.mkdtempSync(
      path.join(os.tmpdir(), "capclair-release-test-"),
    );
    const apkPath = path.join(temp, "fake.apk");
    const signaturePath = path.join(temp, "signature.txt");
    const outputPath = path.join(temp, "bundle");
    fs.writeFileSync(apkPath, "fake signed apk fixture");
    fs.writeFileSync(
      signaturePath,
      `Signer #1 certificate SHA-256 digest: ${EXPECTED_CERTIFICATE}\n`,
    );

    execFileSync(
      "node",
      [
        path.resolve(root, "tools/generate-android-release.mjs"),
        "--apk",
        apkPath,
        "--signature-file",
        signaturePath,
        "--repository",
        "Fdl86/capclair-android",
        "--output",
        outputPath,
      ],
      { cwd: root, stdio: "pipe" },
    );

    const update = JSON.parse(
      fs.readFileSync(path.join(outputPath, "update.json"), "utf8"),
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
    const [major, minor, patch] = packageJson.version.split(".").map(Number);

    expect(update.schemaVersion).toBe(1);
    expect(update.platform).toBe("android");
    expect(update.packageName).toBe("fr.capclair.app");
    expect(update.versionName).toBe(packageJson.version);
    expect(update.versionCode).toBe(major * 100000 + minor * 1000 + patch);
    expect(update.apk.url).toContain(
      `/releases/download/android-v${packageJson.version}/`,
    );
    expect(update.apk.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(update.signingCertificateSha256).toBe(EXPECTED_CERTIFICATE);
    expect(update.changelog.length).toBeGreaterThan(0);
  });
});
