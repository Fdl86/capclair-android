export interface InstalledAndroidVersion {
  platform: "android";
  packageName: string;
  versionName: string;
  versionCode: number;
  signingCertificateSha256: string;
  androidSdk: number;
}

export interface AndroidUpdateRelease {
  packageName: string;
  versionName: string;
  versionCode: number;
  publishedAt: string;
  releaseTag: string;
  channel: string;
  minimumAndroidSdk: number;
  signingCertificateSha256: string;
  fileName: string;
  apkUrl: string;
  apkSha256: string;
  apkSizeBytes: number;
  changelog: string[];
}

export interface AndroidUpdateCheckResult extends AndroidUpdateRelease {
  available: boolean;
  reason: "newer_version" | "same_version" | "older_version" | string;
  installedVersionName: string;
  installedVersionCode: number;
}

export type AndroidDownloadState =
  | "idle"
  | "pending"
  | "downloading"
  | "paused"
  | "downloaded"
  | "verified"
  | "failed"
  | "missing";

export interface AndroidDownloadStatus {
  state: AndroidDownloadState;
  downloadId?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  progress?: number;
  reason?: number | string;
  verified?: boolean;
  fileName?: string;
  versionName?: string;
  versionCode?: number;
  startedAt?: number;
  verifiedAt?: number;
}

export interface VerifiedAndroidApk {
  state: "verified";
  verified: true;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  signingCertificateSha256: string;
}

export type AndroidUpdatePhase =
  | "unsupported"
  | "initializing"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "verifying"
  | "ready"
  | "permission-required"
  | "installer-opened"
  | "error";
