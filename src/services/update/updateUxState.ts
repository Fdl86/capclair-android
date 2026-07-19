export type UpdateDiagnosticLevel = "info" | "success" | "warning" | "error";

export interface UpdateDiagnosticEntry {
  id: string;
  timestamp: number;
  level: UpdateDiagnosticLevel;
  action: string;
  message: string;
}

const LAST_CHECKED_KEY = "capclair.update.lastCheckedAt.v1";
const SNOOZED_UNTIL_KEY = "capclair.update.snoozedUntil.v1";
const DIAGNOSTICS_KEY = "capclair.update.diagnostics.v1";
const MAX_DIAGNOSTIC_ENTRIES = 30;
export const UPDATE_REMIND_LATER_MS = 12 * 60 * 60 * 1000;

function storageAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function finiteTimestamp(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function readUpdateLastCheckedAt(): number | null {
  if (!storageAvailable()) return null;
  try {
    return finiteTimestamp(window.localStorage.getItem(LAST_CHECKED_KEY));
  } catch {
    return null;
  }
}

export function writeUpdateLastCheckedAt(timestamp: number): number {
  const safe = finiteTimestamp(timestamp) ?? Date.now();
  if (storageAvailable()) {
    try {
      window.localStorage.setItem(LAST_CHECKED_KEY, String(safe));
    } catch {
      // The updater remains usable even if localStorage is unavailable.
    }
  }
  return safe;
}

export function readUpdateSnoozedUntil(): number | null {
  if (!storageAvailable()) return null;
  try {
    return finiteTimestamp(window.localStorage.getItem(SNOOZED_UNTIL_KEY));
  } catch {
    return null;
  }
}

export function writeUpdateSnoozedUntil(timestamp: number): number {
  const safe = finiteTimestamp(timestamp) ?? Date.now();
  if (storageAvailable()) {
    try {
      window.localStorage.setItem(SNOOZED_UNTIL_KEY, String(safe));
    } catch {
      // The updater remains usable even if localStorage is unavailable.
    }
  }
  return safe;
}

export function clearUpdateSnooze(): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(SNOOZED_UNTIL_KEY);
  } catch {
    // No-op.
  }
}

export function updateNoticeIsSnoozed(
  snoozedUntil: number | null,
  now = Date.now(),
): boolean {
  return Boolean(snoozedUntil && snoozedUntil > now);
}

export function readUpdateDiagnostics(): UpdateDiagnosticEntry[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(DIAGNOSTICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is UpdateDiagnosticEntry => {
        return Boolean(
          entry &&
            typeof entry.id === "string" &&
            finiteTimestamp(entry.timestamp) &&
            typeof entry.level === "string" &&
            typeof entry.action === "string" &&
            typeof entry.message === "string",
        );
      })
      .slice(0, MAX_DIAGNOSTIC_ENTRIES);
  } catch {
    return [];
  }
}

export function appendUpdateDiagnostic(
  entry: Omit<UpdateDiagnosticEntry, "id" | "timestamp"> & {
    id?: string;
    timestamp?: number;
  },
): UpdateDiagnosticEntry[] {
  const timestamp = finiteTimestamp(entry.timestamp) ?? Date.now();
  const nextEntry: UpdateDiagnosticEntry = {
    id:
      entry.id ??
      `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    level: entry.level,
    action: entry.action.trim() || "update",
    message: entry.message.trim() || "Événement sans détail.",
  };
  const next = [nextEntry, ...readUpdateDiagnostics()].slice(
    0,
    MAX_DIAGNOSTIC_ENTRIES,
  );
  if (storageAvailable()) {
    try {
      window.localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next));
    } catch {
      // The in-memory result is still returned to the hook.
    }
  }
  return next;
}

export function clearUpdateDiagnostics(): UpdateDiagnosticEntry[] {
  if (storageAvailable()) {
    try {
      window.localStorage.removeItem(DIAGNOSTICS_KEY);
    } catch {
      // No-op.
    }
  }
  return [];
}
