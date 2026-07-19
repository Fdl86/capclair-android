import type { AndroidUpdateState } from "../../hooks/useAndroidUpdate";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

function formatBytes(value: number | undefined): string {
  if (!value || value <= 0) return "-";
  const megabytes = value / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1).replace(".", ",")} Mo`;
}

function phaseLabel(update: AndroidUpdateState): string {
  switch (update.phase) {
    case "initializing":
      return "Initialisation";
    case "checking":
      return "Vérification en cours";
    case "up-to-date":
      return "Application à jour";
    case "available":
      return "Nouvelle version disponible";
    case "downloading":
      return "Téléchargement en cours";
    case "downloaded":
      return "Vérification en attente";
    case "verifying":
      return "Vérifications de sécurité";
    case "ready":
      return "Mise à jour prête";
    case "permission-required":
      return "Autorisation Android requise";
    case "installer-opened":
      return "Installateur Android ouvert";
    case "error":
      return "Action interrompue";
    case "unsupported":
      return "Android uniquement";
    default:
      return "Prêt";
  }
}

function phaseTone(update: AndroidUpdateState): string {
  if (update.phase === "up-to-date" || update.phase === "ready") return "ok";
  if (update.phase === "error") return "error";
  if (update.phase === "available" || update.phase === "permission-required")
    return "warn";
  return "neutral";
}

export function AndroidUpdateCard({ update }: { update: AndroidUpdateState }) {
  if (!update.supported) return null;

  const progress = Math.max(0, Math.min(100, update.download?.progress ?? 0));
  const canDownload = update.phase === "available" && !update.busyReason;
  const canInstall =
    (update.phase === "ready" ||
      update.phase === "permission-required" ||
      update.phase === "installer-opened") &&
    !update.busyReason;

  return (
    <Card className="android-update-card">
      <div className="android-update-heading">
        <div>
          <span>Mises à jour Android</span>
          <h2>CAP CLAIR</h2>
        </div>
        <strong className={`android-update-status is-${phaseTone(update)}`}>
          {phaseLabel(update)}
        </strong>
      </div>

      <div className="android-update-version-grid">
        <div>
          <span>Version installée</span>
          <strong>
            {update.installed?.versionName
              ? `DEV${update.installed.versionName}`
              : "-"}
          </strong>
          <small>
            {update.installed?.versionCode
              ? `versionCode ${update.installed.versionCode}`
              : ""}
          </small>
        </div>
        <div>
          <span>Dernière version</span>
          <strong>
            {update.release?.versionName
              ? `DEV${update.release.versionName}`
              : "-"}
          </strong>
          <small>
            {update.release?.versionCode
              ? `versionCode ${update.release.versionCode}`
              : ""}
          </small>
        </div>
      </div>

      {update.release?.available && (
        <div className="android-update-release">
          <div className="android-update-release-meta">
            <span>APK {formatBytes(update.release.apkSizeBytes)}</span>
            {update.release.releaseTag && (
              <span>{update.release.releaseTag}</span>
            )}
          </div>
          <h3>Notes de mise à jour</h3>
          {update.release.changelog.length > 0 ? (
            <ul>
              {update.release.changelog.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>Notes non disponibles pour ce téléchargement déjà présent.</p>
          )}
        </div>
      )}

      {update.phase === "downloading" && (
        <div className="android-update-progress" aria-live="polite">
          <div>
            <span>Téléchargement</span>
            <strong>{progress}%</strong>
          </div>
          <progress max={100} value={progress} />
          <small>
            {formatBytes(update.download?.downloadedBytes)} sur{" "}
            {formatBytes(
              update.download?.totalBytes || update.release?.apkSizeBytes,
            )}
          </small>
        </div>
      )}

      {update.busyReason && (
        <p className="android-update-blocked" role="status">
          {update.busyReason}
        </p>
      )}
      {update.message && (
        <p className="android-update-message" role="status">
          {update.message}
        </p>
      )}
      {update.error && (
        <p className="android-update-error" role="alert">
          {update.error}
        </p>
      )}

      <div className="android-update-actions">
        {(update.phase === "idle" ||
          update.phase === "up-to-date" ||
          update.phase === "error" ||
          update.phase === "installer-opened") && (
          <Button
            variant="secondary"
            onClick={() => void update.checkNow(false)}
          >
            Vérifier les mises à jour
          </Button>
        )}
        {update.phase === "checking" && (
          <Button variant="secondary" disabled>
            Vérification...
          </Button>
        )}
        {update.phase === "available" && (
          <Button
            variant="primary"
            onClick={() => void update.startDownload()}
            disabled={!canDownload}
          >
            Télécharger la mise à jour
          </Button>
        )}
        {update.phase === "downloading" && (
          <Button variant="danger" onClick={() => void update.cancelDownload()}>
            Annuler le téléchargement
          </Button>
        )}
        {update.phase === "downloaded" && (
          <Button
            variant="primary"
            onClick={() => void update.refreshDownloadState()}
            disabled={Boolean(update.busyReason)}
          >
            Vérifier l’APK téléchargé
          </Button>
        )}
        {update.phase === "verifying" && (
          <Button variant="secondary" disabled>
            Vérification APK...
          </Button>
        )}
        {update.phase === "ready" && (
          <Button
            variant="primary"
            onClick={() => void update.install()}
            disabled={!canInstall}
          >
            Ouvrir l’installation Android
          </Button>
        )}
        {update.phase === "permission-required" && (
          <>
            <Button
              variant="secondary"
              onClick={() => void update.openPermissionSettings()}
            >
              Autoriser cette source
            </Button>
            <Button
              variant="primary"
              onClick={() => void update.install()}
              disabled={!canInstall}
            >
              Vérifier et installer
            </Button>
          </>
        )}
        {update.phase === "installer-opened" && (
          <Button
            variant="primary"
            onClick={() => void update.install()}
            disabled={!canInstall}
          >
            Rouvrir l’installation Android
          </Button>
        )}
      </div>

      <p className="android-update-safety">
        CAP CLAIR vérifie le SHA-256, le package, le versionCode et la signature
        avant d’ouvrir l’installateur. Android demande toujours ta confirmation.
      </p>
    </Card>
  );
}
