import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AndroidDownloadStatus,
  AndroidUpdateCheckResult,
  AndroidUpdatePhase,
  AndroidUpdateVerificationProgress,
  InstalledAndroidVersion,
  VerifiedAndroidApk,
} from "../domain/update.types";
import {
  addAndroidUpdateVerificationListener,
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
import {
  appendUpdateDiagnostic,
  clearUpdateDiagnostics,
  clearUpdateSnooze,
  readUpdateDiagnostics,
  readUpdateLastCheckedAt,
  readUpdateSnoozedUntil,
  UPDATE_REMIND_LATER_MS,
  updateNoticeIsSnoozed,
  writeUpdateLastCheckedAt,
  writeUpdateSnoozedUntil,
} from "../services/update/updateUxState";
import type {
  UpdateDiagnosticEntry,
  UpdateDiagnosticLevel,
} from "../services/update/updateUxState";

interface UseAndroidUpdateOptions {
  busyReason: string | null;
  autoCheckEnabled: boolean;
  autoCheckDelayMs?: number;
}

const DOWNLOAD_POLL_MS = 1000;
const DEFAULT_AUTO_CHECK_DELAY_MS = 7000;

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
  autoCheckDelayMs = DEFAULT_AUTO_CHECK_DELAY_MS,
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
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() =>
    readUpdateLastCheckedAt(),
  );
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() =>
    readUpdateSnoozedUntil(),
  );
  const [diagnostics, setDiagnostics] = useState<UpdateDiagnosticEntry[]>(() =>
    readUpdateDiagnostics(),
  );
  const [verificationProgress, setVerificationProgress] =
    useState<AndroidUpdateVerificationProgress | null>(null);
  const checkingRef = useRef(false);
  const autoCheckAttemptedRef = useRef(false);

  const addDiagnostic = useCallback(
    (
      level: UpdateDiagnosticLevel,
      action: string,
      diagnosticMessage: string,
    ) => {
      setDiagnostics(
        appendUpdateDiagnostic({
          level,
          action,
          message: diagnosticMessage,
        }),
      );
    },
    [],
  );

  useEffect(() => {
    if (!snoozedUntil) return undefined;
    const remaining = snoozedUntil - Date.now();
    if (remaining <= 0) {
      clearUpdateSnooze();
      setSnoozedUntil(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      clearUpdateSnooze();
      setSnoozedUntil(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [snoozedUntil]);

  useEffect(() => {
    if (!supported) return undefined;
    let disposed = false;
    let listener: Awaited<
      ReturnType<typeof addAndroidUpdateVerificationListener>
    > | null = null;
    void addAndroidUpdateVerificationListener((event) => {
      if (disposed) return;
      setVerificationProgress(event);
      setMessage(event.label);
      addDiagnostic(
        event.step === "complete" ? "success" : "info",
        "verification",
        event.label,
      );
    }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    });
    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [addDiagnostic, supported]);

  const verifyDownloadedApk = useCallback(
    async (status: AndroidDownloadStatus) => {
      setPhase("verifying");
      setVerificationProgress({
        step: "preparing",
        label: "Préparation de la vérification",
      });
      setMessage("Préparation de la vérification");
      setError(null);
      try {
        const verified = await verifyAndroidUpdateApk();
        setVerifiedApk(verified);
        setDownload((current) => ({
          ...(current ?? status),
          state: "verified",
          verified: true,
        }));
        setPhase("ready");
        setMessage("APK vérifié et prêt à installer.");
        addDiagnostic(
          "success",
          "verification",
          `DEV${verified.versionName} validée : SHA-256, package, version et signature conformes.`,
        );
      } catch (verificationError) {
        const text = errorMessage(verificationError);
        setPhase("error");
        setError(text);
        setMessage(null);
        addDiagnostic("error", "verification", text);
      }
    },
    [addDiagnostic],
  );

  const refreshDownloadState = useCallback(async () => {
    if (!supported) return null;
    const next = await getAndroidDownloadStatus();
    setDownload(next);
    if (next.state === "verified") {
      setPhase("ready");
      setRelease((current) => current ?? releaseFromDownload(next));
      setMessage("APK vérifié et prêt à installer.");
    } else if (next.state === "downloaded") {
      setRelease((current) => current ?? releaseFromDownload(next));
      if (busyReason) {
        setPhase("downloaded");
        setMessage(
          "APK téléchargé. Vérification en attente de la fin de l’activité en cours.",
        );
      } else {
        await verifyDownloadedApk(next);
      }
    } else if (
      next.state === "downloading" ||
      next.state === "pending" ||
      next.state === "paused"
    ) {
      setPhase("downloading");
      setRelease((current) => current ?? releaseFromDownload(next));
      setMessage(
        next.state === "paused"
          ? "Téléchargement temporairement suspendu par Android."
          : null,
      );
    } else if (next.state === "failed" || next.state === "missing") {
      const text =
        "Le téléchargement a échoué ou a été interrompu. Le fichier incomplet a été supprimé.";
      setPhase("error");
      setError(text);
      setMessage(null);
      addDiagnostic("error", "download", text);
    } else if (phase === "initializing") {
      setPhase("idle");
    }
    return next;
  }, [
    addDiagnostic,
    busyReason,
    phase,
    supported,
    verifyDownloadedApk,
  ]);

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    Promise.all([getInstalledAndroidVersion(), getAndroidDownloadStatus()])
      .then(async ([installedInfo, downloadStatus]) => {
        if (cancelled) return;
        setInstalled(installedInfo);
        setDownload(downloadStatus);
        addDiagnostic(
          "info",
          "initialization",
          `Updater initialisé sur DEV${installedInfo.versionName}.`,
        );
        if (downloadStatus.state === "verified") {
          setRelease(releaseFromDownload(downloadStatus));
          setPhase("ready");
          setMessage("APK vérifié et prêt à installer.");
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
          await verifyDownloadedApk(downloadStatus);
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
        const text = errorMessage(initializationError);
        setPhase("error");
        setError(text);
        addDiagnostic("error", "initialization", text);
      });
    return () => {
      cancelled = true;
    };
  }, [addDiagnostic, supported, verifyDownloadedApk]);

  const checkNow = useCallback(
    async (automatic = false) => {
      if (!supported || checkingRef.current) return;
      if (busyReason) {
        if (!automatic) setError(busyReason);
        addDiagnostic(
          "warning",
          "check",
          automatic
            ? "Vérification automatique reportée : activité sensible en cours."
            : busyReason,
        );
        return;
      }
      checkingRef.current = true;
      setPhase("checking");
      setError(null);
      setMessage(
        automatic
          ? "Vérification automatique des mises à jour..."
          : "Recherche d’une nouvelle version...",
      );
      addDiagnostic(
        "info",
        "check",
        automatic
          ? "Vérification automatique démarrée."
          : "Vérification manuelle démarrée.",
      );
      try {
        const result = await checkAndroidUpdate();
        const installedInfo = installed ?? (await getInstalledAndroidVersion());
        setInstalled(installedInfo);
        setRelease(result);
        setMessage(null);
        if (result.available) {
          setPhase("available");
          if (!automatic) {
            clearUpdateSnooze();
            setSnoozedUntil(null);
          }
          addDiagnostic(
            "success",
            "check",
            `DEV${result.versionName} disponible pour DEV${installedInfo.versionName}.`,
          );
        } else {
          setPhase("up-to-date");
          clearUpdateSnooze();
          setSnoozedUntil(null);
          addDiagnostic(
            "success",
            "check",
            `DEV${installedInfo.versionName} est à jour.`,
          );
        }
      } catch (checkError) {
        const text = errorMessage(checkError);
        setMessage(null);
        addDiagnostic("error", "check", text);
        if (automatic) {
          setPhase("idle");
          setError(null);
        } else {
          setPhase("error");
          setError(text);
        }
      } finally {
        const checkedAt = writeUpdateLastCheckedAt(Date.now());
        setLastCheckedAt(checkedAt);
        checkingRef.current = false;
      }
    },
    [addDiagnostic, busyReason, installed, supported],
  );

  useEffect(() => {
    if (
      !supported ||
      !autoCheckEnabled ||
      phase !== "idle" ||
      busyReason ||
      autoCheckAttemptedRef.current
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      autoCheckAttemptedRef.current = true;
      void checkNow(true);
    }, Math.max(1000, autoCheckDelayMs));
    return () => window.clearTimeout(timer);
  }, [
    autoCheckDelayMs,
    autoCheckEnabled,
    busyReason,
    checkNow,
    phase,
    supported,
  ]);

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
        const text = errorMessage(pollError);
        setPhase("error");
        setError(text);
        addDiagnostic("error", "download", text);
      }
    };
    const timer = window.setTimeout(poll, DOWNLOAD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addDiagnostic, phase, refreshDownloadState, supported]);

  const startDownload = useCallback(async () => {
    if (!release?.available) return;
    if (busyReason) {
      setError(busyReason);
      addDiagnostic("warning", "download", busyReason);
      return;
    }
    setError(null);
    setMessage("Préparation du téléchargement sécurisé...");
    setPhase("preparing-download");
    addDiagnostic(
      "info",
      "download",
      `Préparation du téléchargement de DEV${release.versionName}.`,
    );
    try {
      const status = await startAndroidUpdateDownload(release);
      setDownload(status);
      setPhase("downloading");
      setMessage(null);
      addDiagnostic(
        "success",
        "download",
        `Téléchargement de ${release.fileName} confié à Android.`,
      );
    } catch (downloadError) {
      const text = errorMessage(downloadError);
      setPhase("error");
      setMessage(null);
      setError(text);
      addDiagnostic("error", "download", text);
    }
  }, [addDiagnostic, busyReason, release]);

  const cancelDownload = useCallback(async () => {
    try {
      await cancelAndroidUpdateDownload();
      setDownload(null);
      setVerifiedApk(null);
      setVerificationProgress(null);
      const restoredOnly = release?.reason === "download_restored";
      if (restoredOnly) setRelease(null);
      setPhase(release?.available && !restoredOnly ? "available" : "idle");
      setMessage("Téléchargement annulé et fichier incomplet supprimé.");
      setError(null);
      addDiagnostic(
        "warning",
        "download",
        "Téléchargement annulé et fichier local supprimé.",
      );
    } catch (cancelError) {
      const text = errorMessage(cancelError);
      setPhase("error");
      setError(text);
      addDiagnostic("error", "download", text);
    }
  }, [addDiagnostic, release?.available, release?.reason]);

  const install = useCallback(async () => {
    if (busyReason) {
      setError(busyReason);
      addDiagnostic("warning", "install", busyReason);
      return;
    }
    setError(null);
    setMessage("Contrôle de l’autorisation d’installation Android...");
    setPhase("verifying");
    try {
      const permission = await getAndroidInstallerPermission();
      setInstallerPermissionGranted(permission.granted);
      if (!permission.granted) {
        setPhase("permission-required");
        setMessage("Android doit autoriser CAP CLAIR à ouvrir l’installateur.");
        addDiagnostic(
          "warning",
          "install",
          "Autorisation « Installer des applications inconnues » requise.",
        );
        return;
      }
      setMessage("Nouvelle vérification de sécurité avant installation...");
      await installAndroidUpdateApk();
      setPhase("installer-opened");
      setMessage(
        "Installateur Android ouvert. Confirme l’installation dans l’écran système.",
      );
      addDiagnostic(
        "success",
        "install",
        "APK vérifié une dernière fois et installateur Android ouvert.",
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
      addDiagnostic("error", "install", text);
    }
  }, [addDiagnostic, busyReason]);

  const openPermissionSettings = useCallback(async () => {
    try {
      await openAndroidInstallerPermissionSettings();
      setMessage(
        "Active « Autoriser depuis cette source », puis reviens dans CAP CLAIR.",
      );
      setError(null);
      addDiagnostic(
        "info",
        "permission",
        "Réglage Android d’autorisation d’installation ouvert.",
      );
    } catch (settingsError) {
      const text = errorMessage(settingsError);
      setError(text);
      addDiagnostic("error", "permission", text);
    }
  }, [addDiagnostic]);

  const remindLater = useCallback(() => {
    const until = writeUpdateSnoozedUntil(
      Date.now() + UPDATE_REMIND_LATER_MS,
    );
    setSnoozedUntil(until);
    addDiagnostic(
      "info",
      "notice",
      "Notification de mise à jour reportée pendant 12 heures.",
    );
  }, [addDiagnostic]);

  const clearDiagnostics = useCallback(() => {
    setDiagnostics(clearUpdateDiagnostics());
  }, []);

  const noticeSnoozed = updateNoticeIsSnoozed(snoozedUntil);
  const updateAvailable = Boolean(release?.available);
  const showUpdateNotice =
    !busyReason &&
    !noticeSnoozed &&
    updateAvailable &&
    (phase === "available" || phase === "ready");
  const updateBadgeVisible =
    !busyReason &&
    ((phase === "available" && !noticeSnoozed) ||
      phase === "downloading" ||
      phase === "downloaded" ||
      phase === "verifying" ||
      phase === "ready" ||
      phase === "permission-required");
  const operationActive =
    phase === "preparing-download" ||
    phase === "downloading" ||
    phase === "verifying";
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
      lastCheckedAt,
      snoozedUntil,
      diagnostics,
      verificationProgress,
      showUpdateNotice,
      updateBadgeVisible,
      checkNow,
      startDownload,
      cancelDownload,
      install,
      openPermissionSettings,
      refreshDownloadState,
      remindLater,
      clearDiagnostics,
    }),
    [
      busyReason,
      cancelDownload,
      checkNow,
      clearDiagnostics,
      diagnostics,
      displayBusyReason,
      download,
      error,
      install,
      installed,
      installerPermissionGranted,
      lastCheckedAt,
      message,
      openPermissionSettings,
      operationActive,
      phase,
      refreshDownloadState,
      release,
      remindLater,
      showUpdateNotice,
      snoozedUntil,
      startDownload,
      supported,
      updateBadgeVisible,
      verificationProgress,
      verifiedApk,
    ],
  );
}

export type AndroidUpdateState = ReturnType<typeof useAndroidUpdate>;
