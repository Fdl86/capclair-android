import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AndroidDownloadStatus,
  AndroidUpdateCheckResult,
  AndroidUpdatePhase,
  InstalledAndroidVersion,
  VerifiedAndroidApk,
} from "../domain/update.types";
import {
  cancelAndroidUpdateDownload,
  checkAndroidUpdate,
  getAndroidDownloadStatus,
  getAndroidInstallerPermission,
  getInstalledAndroidVersion,
  installAndroidUpdateApk,
  isAndroidUpdateSupported,
  openAndroidInstallerPermissionSettings,
  startAndroidUpdateDownload,
  verifyAndroidUpdateApk,
} from "../services/update/nativeUpdate";

interface UseAndroidUpdateOptions {
  busyReason: string | null;
  autoCheckEnabled: boolean;
}

const DOWNLOAD_POLL_MS = 1000;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error || "Erreur inconnue");
}

function releaseFromDownload(
  download: AndroidDownloadStatus,
): AndroidUpdateCheckResult | null {
  if (!download.versionName || !download.versionCode || !download.fileName)
    return null;
  return {
    available: true,
    reason: "download_restored",
    installedVersionName: "",
    installedVersionCode: 0,
    packageName: "fr.capclair.app",
    versionName: download.versionName,
    versionCode: download.versionCode,
    publishedAt: "",
    releaseTag: "",
    channel: "dev",
    minimumAndroidSdk: 24,
    signingCertificateSha256: "",
    fileName: download.fileName,
    apkUrl: "",
    apkSha256: "",
    apkSizeBytes: download.totalBytes ?? 0,
    changelog: [],
  };
}

export function useAndroidUpdate({
  busyReason,
  autoCheckEnabled,
}: UseAndroidUpdateOptions) {
  const supported = isAndroidUpdateSupported();
  const [phase, setPhase] = useState<AndroidUpdatePhase>(
    supported ? "initializing" : "unsupported",
  );
  const [installed, setInstalled] = useState<InstalledAndroidVersion | null>(
    null,
  );
  const [release, setRelease] = useState<AndroidUpdateCheckResult | null>(null);
  const [download, setDownload] = useState<AndroidDownloadStatus | null>(null);
  const [verifiedApk, setVerifiedApk] = useState<VerifiedAndroidApk | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installerPermissionGranted, setInstallerPermissionGranted] = useState<
    boolean | null
  >(null);
  const checkingRef = useRef(false);
  const autoCheckAttemptedRef = useRef(false);

  const refreshDownloadState = useCallback(async () => {
    if (!supported) return null;
    const next = await getAndroidDownloadStatus();
    setDownload(next);
    if (next.state === "verified") {
      setPhase("ready");
      setRelease((current) => current ?? releaseFromDownload(next));
    } else if (next.state === "downloaded") {
      setRelease((current) => current ?? releaseFromDownload(next));
      if (busyReason) {
        setPhase("downloaded");
        setMessage(
          "APK téléchargé. Vérification en attente de la fin de l’activité en cours.",
        );
      } else {
        setPhase("verifying");
        try {
          const verified = await verifyAndroidUpdateApk();
          setVerifiedApk(verified);
          setDownload((current) => ({
            ...(current ?? next),
            state: "verified",
            verified: true,
          }));
          setPhase("ready");
          setMessage("APK téléchargé et vérifié. Installation prête.");
        } catch (verificationError) {
          setPhase("error");
          setError(errorMessage(verificationError));
        }
      }
    } else if (
      next.state === "downloading" ||
      next.state === "pending" ||
      next.state === "paused"
    ) {
      setPhase("downloading");
      setRelease((current) => current ?? releaseFromDownload(next));
    } else if (next.state === "failed" || next.state === "missing") {
      setPhase("error");
      setError(
        "Le téléchargement a échoué ou a été interrompu. Le fichier incomplet a été supprimé.",
      );
    } else if (phase === "initializing") {
      setPhase("idle");
    }
    return next;
  }, [busyReason, phase, supported]);

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    Promise.all([getInstalledAndroidVersion(), getAndroidDownloadStatus()])
      .then(async ([installedInfo, downloadStatus]) => {
        if (cancelled) return;
        setInstalled(installedInfo);
        setDownload(downloadStatus);
        if (downloadStatus.state === "verified") {
          setRelease(releaseFromDownload(downloadStatus));
          setPhase("ready");
          return;
        }
        if (downloadStatus.state === "downloaded") {
          setRelease(releaseFromDownload(downloadStatus));
          if (busyReason) {
            setPhase("downloaded");
            setMessage(
              "APK téléchargé. Vérification en attente de la fin de l’activité en cours.",
            );
            return;
          }
          setPhase("verifying");
          try {
            const verified = await verifyAndroidUpdateApk();
            if (cancelled) return;
            setVerifiedApk(verified);
            setDownload({
              ...downloadStatus,
              state: "verified",
              verified: true,
            });
            setPhase("ready");
          } catch (verificationError) {
            if (cancelled) return;
            setPhase("error");
            setError(errorMessage(verificationError));
          }
          return;
        }
        if (
          downloadStatus.state === "downloading" ||
          downloadStatus.state === "pending" ||
          downloadStatus.state === "paused"
        ) {
          setRelease(releaseFromDownload(downloadStatus));
          setPhase("downloading");
          return;
        }
        setPhase("idle");
      })
      .catch((initializationError) => {
        if (cancelled) return;
        setPhase("error");
        setError(errorMessage(initializationError));
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const checkNow = useCallback(
    async (automatic = false) => {
      if (!supported || checkingRef.current) return;
      checkingRef.current = true;
      setPhase("checking");
      setError(null);
      setMessage(
        automatic
          ? "Vérification automatique..."
          : "Recherche d’une nouvelle version...",
      );
      try {
        const result = await checkAndroidUpdate();
        const installedInfo = installed ?? (await getInstalledAndroidVersion());
        setInstalled(installedInfo);
        setRelease(result);
        setMessage(null);
        if (result.available) {
          setPhase("available");
        } else {
          setPhase("up-to-date");
        }
      } catch (checkError) {
        setPhase("error");
        setError(errorMessage(checkError));
        setMessage(null);
      } finally {
        checkingRef.current = false;
      }
    },
    [installed, supported],
  );

  useEffect(() => {
    if (
      !supported ||
      !autoCheckEnabled ||
      phase !== "idle" ||
      autoCheckAttemptedRef.current
    )
      return;
    autoCheckAttemptedRef.current = true;
    void checkNow(true);
  }, [autoCheckEnabled, checkNow, phase, supported]);

  useEffect(() => {
    if (!supported || phase !== "downloaded" || busyReason) return;
    void refreshDownloadState();
  }, [busyReason, phase, refreshDownloadState, supported]);

  useEffect(() => {
    if (!supported || phase !== "downloading") return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await refreshDownloadState();
        if (
          !cancelled &&
          next &&
          (next.state === "downloading" ||
            next.state === "pending" ||
            next.state === "paused")
        ) {
          window.setTimeout(poll, DOWNLOAD_POLL_MS);
        }
      } catch (pollError) {
        if (cancelled) return;
        setPhase("error");
        setError(errorMessage(pollError));
      }
    };
    const timer = window.setTimeout(poll, DOWNLOAD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, refreshDownloadState, supported]);

  const startDownload = useCallback(async () => {
    if (!release?.available) return;
    if (busyReason) {
      setError(busyReason);
      return;
    }
    setError(null);
    setMessage("Démarrage du téléchargement...");
    setPhase("verifying");
    try {
      const status = await startAndroidUpdateDownload(release);
      setDownload(status);
      setPhase("downloading");
      setMessage(null);
    } catch (downloadError) {
      setPhase("error");
      setMessage(null);
      setError(errorMessage(downloadError));
    }
  }, [busyReason, release]);

  const cancelDownload = useCallback(async () => {
    try {
      await cancelAndroidUpdateDownload();
      setDownload(null);
      setVerifiedApk(null);
      const restoredOnly = release?.reason === "download_restored";
      if (restoredOnly) setRelease(null);
      setPhase(release?.available && !restoredOnly ? "available" : "idle");
      setMessage("Téléchargement annulé et fichier incomplet supprimé.");
      setError(null);
    } catch (cancelError) {
      setPhase("error");
      setError(errorMessage(cancelError));
    }
  }, [release?.available, release?.reason]);

  const install = useCallback(async () => {
    if (busyReason) {
      setError(busyReason);
      return;
    }
    setError(null);
    setMessage("Nouvelle vérification de sécurité avant installation...");
    setPhase("verifying");
    try {
      const permission = await getAndroidInstallerPermission();
      setInstallerPermissionGranted(permission.granted);
      if (!permission.granted) {
        setPhase("permission-required");
        setMessage("Android doit autoriser CAP CLAIR à ouvrir l’installateur.");
        return;
      }
      await installAndroidUpdateApk();
      setPhase("installer-opened");
      setMessage(
        "Installateur Android ouvert. Confirme l’installation dans l’écran système.",
      );
    } catch (installError) {
      const text = errorMessage(installError);
      if (
        text.toLowerCase().includes("autorisation") ||
        text.toLowerCase().includes("permission")
      ) {
        setPhase("permission-required");
      } else {
        setPhase("error");
      }
      setError(text);
      setMessage(null);
    }
  }, [busyReason]);

  const openPermissionSettings = useCallback(async () => {
    try {
      await openAndroidInstallerPermissionSettings();
      setMessage(
        "Active « Autoriser depuis cette source », puis reviens dans CAP CLAIR.",
      );
      setError(null);
    } catch (settingsError) {
      setError(errorMessage(settingsError));
    }
  }, []);

  const operationActive = phase === "downloading" || phase === "verifying";
  const displayBusyReason =
    busyReason ??
    (operationActive ? "Une mise à jour Android est en cours." : null);

  return useMemo(
    () => ({
      supported,
      phase,
      installed,
      release,
      download,
      verifiedApk,
      message,
      error,
      busyReason,
      displayBusyReason,
      installerPermissionGranted,
      operationActive,
      checkNow,
      startDownload,
      cancelDownload,
      install,
      openPermissionSettings,
      refreshDownloadState,
    }),
    [
      busyReason,
      cancelDownload,
      checkNow,
      displayBusyReason,
      download,
      error,
      install,
      installed,
      installerPermissionGranted,
      message,
      openPermissionSettings,
      operationActive,
      phase,
      refreshDownloadState,
      release,
      startDownload,
      supported,
      verifiedApk,
    ],
  );
}

export type AndroidUpdateState = ReturnType<typeof useAndroidUpdate>;
