import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import type {
  AndroidDownloadStatus,
  AndroidUpdateCheckResult,
  InstalledAndroidVersion,
  VerifiedAndroidApk,
  AndroidUpdateVerificationProgress,
} from "../../domain/update.types";

const DEFAULT_UPDATE_MANIFEST_URL =
  "https://github.com/Fdl86/capclair-android/releases/latest/download/update.json";

interface NativeUpdatePlugin {
  getInstalledInfo(): Promise<InstalledAndroidVersion>;
  checkForUpdate(options: {
    manifestUrl: string;
  }): Promise<AndroidUpdateCheckResult>;
  getDownloadStatus(): Promise<AndroidDownloadStatus>;
  startDownload(options: {
    url: string;
    fileName: string;
    sha256: string;
    packageName: string;
    versionName: string;
    versionCode: number;
    signingCertificateSha256: string;
  }): Promise<AndroidDownloadStatus>;
  cancelDownload(): Promise<{ cancelled: boolean; state: "idle" }>;
  verifyDownloadedApk(): Promise<VerifiedAndroidApk>;
  getInstallerPermission(): Promise<{ required: boolean; granted: boolean }>;
  openInstallerPermissionSettings(): Promise<{
    opened: boolean;
    granted: boolean;
  }>;
  installDownloadedApk(): Promise<{
    opened: boolean;
    versionName: string;
    versionCode: number;
  }>;
  cleanupDownloads(): Promise<{ cleaned: boolean }>;
  addListener(
    eventName: "verificationProgress",
    listener: (event: AndroidUpdateVerificationProgress) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeUpdate = registerPlugin<NativeUpdatePlugin>("NativeUpdate");

export function isAndroidUpdateSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function androidUpdateManifestUrl(): string {
  return (
    import.meta.env.VITE_CAPCLAIR_UPDATE_MANIFEST_URL ||
    DEFAULT_UPDATE_MANIFEST_URL
  ).trim();
}

export function getInstalledAndroidVersion(): Promise<InstalledAndroidVersion> {
  return NativeUpdate.getInstalledInfo();
}

export function checkAndroidUpdate(): Promise<AndroidUpdateCheckResult> {
  return NativeUpdate.checkForUpdate({
    manifestUrl: androidUpdateManifestUrl(),
  });
}

export function getAndroidDownloadStatus(): Promise<AndroidDownloadStatus> {
  return NativeUpdate.getDownloadStatus();
}

export function startAndroidUpdateDownload(
  release: AndroidUpdateCheckResult,
): Promise<AndroidDownloadStatus> {
  return NativeUpdate.startDownload({
    url: release.apkUrl,
    fileName: release.fileName,
    sha256: release.apkSha256,
    packageName: release.packageName,
    versionName: release.versionName,
    versionCode: release.versionCode,
    signingCertificateSha256: release.signingCertificateSha256,
  });
}

export function cancelAndroidUpdateDownload(): Promise<{
  cancelled: boolean;
  state: "idle";
}> {
  return NativeUpdate.cancelDownload();
}

export function verifyAndroidUpdateApk(): Promise<VerifiedAndroidApk> {
  return NativeUpdate.verifyDownloadedApk();
}

export function getAndroidInstallerPermission(): Promise<{
  required: boolean;
  granted: boolean;
}> {
  return NativeUpdate.getInstallerPermission();
}

export function openAndroidInstallerPermissionSettings(): Promise<{
  opened: boolean;
  granted: boolean;
}> {
  return NativeUpdate.openInstallerPermissionSettings();
}

export function installAndroidUpdateApk(): Promise<{
  opened: boolean;
  versionName: string;
  versionCode: number;
}> {
  return NativeUpdate.installDownloadedApk();
}

export function cleanupAndroidUpdateDownloads(): Promise<{ cleaned: boolean }> {
  return NativeUpdate.cleanupDownloads();
}

export function addAndroidUpdateVerificationListener(
  listener: (event: AndroidUpdateVerificationProgress) => void,
): Promise<PluginListenerHandle> {
  return NativeUpdate.addListener("verificationProgress", listener);
}
