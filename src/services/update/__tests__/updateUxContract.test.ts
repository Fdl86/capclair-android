import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(root, relativePath), "utf8");
}

describe("Android updater UX contract", () => {
  it("checks automatically after launch while respecting sensitive activity", () => {
    const app = source("src/app/App.tsx");
    const hook = source("src/hooks/useAndroidUpdate.ts");

    expect(app).toContain("autoCheckEnabled: true");
    expect(hook).toContain("const DEFAULT_AUTO_CHECK_DELAY_MS = 7000");
    expect(hook).toContain("phase !== \"idle\"");
    expect(hook).toContain("busyReason ||");
    expect(hook).toContain("autoCheckAttemptedRef.current");
    expect(hook).toContain("void checkNow(true)");
  });

  it("shows a badge, a discreet notice and a 12-hour reminder action", () => {
    const app = source("src/app/App.tsx");
    const nav = source("src/components/layout/BottomNav.tsx");
    const notice = source("src/components/update/UpdateAvailableNotice.tsx");
    const uxState = source("src/services/update/updateUxState.ts");

    expect(app).toContain("moreBadge={androidUpdate.updateBadgeVisible}");
    expect(app).toContain("<UpdateAvailableNotice");
    expect(nav).toContain("bottom-nav-badge");
    expect(notice).toContain("Plus tard");
    expect(uxState).toContain("12 * 60 * 60 * 1000");
  });

  it("exposes the last check, exact verification steps and local diagnostics", () => {
    const card = source("src/components/update/AndroidUpdateCard.tsx");
    const hook = source("src/hooks/useAndroidUpdate.ts");

    expect(card).toContain("Dernière vérification");
    expect(card).toContain("Journal diagnostic");
    expect(card).toContain("update.verificationProgress.label");
    expect(hook).toContain("addAndroidUpdateVerificationListener");
    expect(hook).toContain("appendUpdateDiagnostic");
  });
});
