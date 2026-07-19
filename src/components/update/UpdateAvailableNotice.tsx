import type { AndroidUpdateState } from "../../hooks/useAndroidUpdate";
import { Button } from "../ui/Button";

interface UpdateAvailableNoticeProps {
  update: AndroidUpdateState;
  onOpen: () => void;
}

export function UpdateAvailableNotice({
  update,
  onOpen,
}: UpdateAvailableNoticeProps) {
  if (!update.showUpdateNotice || !update.release?.available) return null;

  const ready = update.phase === "ready";

  return (
    <aside className="android-update-notice" role="status" aria-live="polite">
      <div>
        <span>{ready ? "Mise à jour prête" : "Mise à jour disponible"}</span>
        <strong>CAP CLAIR DEV{update.release.versionName}</strong>
      </div>
      <div className="android-update-notice-actions">
        <Button variant="secondary" onClick={update.remindLater}>
          Plus tard
        </Button>
        <Button variant="primary" onClick={onOpen}>
          Voir
        </Button>
      </div>
    </aside>
  );
}
