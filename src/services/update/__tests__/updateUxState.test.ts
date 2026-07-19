import { beforeEach, describe, expect, it, vi } from "vitest";
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
} from "../updateUxState";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  } satisfies Storage;
}

describe("Android update UX state", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: createStorage() });
  });

  it("persists the last check and a 12-hour reminder delay", () => {
    const now = 1_750_000_000_000;
    writeUpdateLastCheckedAt(now);
    writeUpdateSnoozedUntil(now + UPDATE_REMIND_LATER_MS);

    expect(readUpdateLastCheckedAt()).toBe(now);
    expect(readUpdateSnoozedUntil()).toBe(now + UPDATE_REMIND_LATER_MS);
    expect(
      updateNoticeIsSnoozed(readUpdateSnoozedUntil(), now + 1000),
    ).toBe(true);
    expect(
      updateNoticeIsSnoozed(
        readUpdateSnoozedUntil(),
        now + UPDATE_REMIND_LATER_MS + 1,
      ),
    ).toBe(false);

    clearUpdateSnooze();
    expect(readUpdateSnoozedUntil()).toBeNull();
  });

  it("keeps only the 30 latest diagnostic entries and clears them", () => {
    for (let index = 0; index < 35; index += 1) {
      appendUpdateDiagnostic({
        id: `entry-${index}`,
        timestamp: 1_750_000_000_000 + index,
        level: "info",
        action: "test",
        message: `event ${index}`,
      });
    }

    const entries = readUpdateDiagnostics();
    expect(entries).toHaveLength(30);
    expect(entries[0]?.message).toBe("event 34");
    expect(entries.at(-1)?.message).toBe("event 5");

    expect(clearUpdateDiagnostics()).toEqual([]);
    expect(readUpdateDiagnostics()).toEqual([]);
  });
});
