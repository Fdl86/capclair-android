package fr.capclair.app;

/**
 * Pure state machine for background GNSS recovery.
 *
 * A one-shot probe is useful as a degraded fallback position, but it must never
 * be mistaken for the return of the continuous Android location stream. The
 * stream is considered restored only after three tightly-spaced continuous
 * callbacks.
 */
final class GpsRecoveryState {
    static final long DEGRADED_AFTER_MS = 15_000L;
    static final long SOFT_RECOVERY_AFTER_MS = 30_000L;
    static final long HARD_RECOVERY_AFTER_MS = 60_000L;
    static final long RUNTIME_RECOVERY_AFTER_MS = 120_000L;
    static final long RUNTIME_RECOVERY_BACKOFF_MS = 180_000L;
    static final long RECOVERY_ACTION_COOLDOWN_MS = 15_000L;
    static final long FAST_PROBE_INTERVAL_MS = 5_000L;
    static final long SLOW_PROBE_INTERVAL_MS = 10_000L;
    static final long SLOW_PROBE_AFTER_MS = 120_000L;
    static final long CONTINUOUS_STREAK_MAX_GAP_MS = 5_000L;
    static final int CONTINUOUS_FIXES_TO_RESTORE = 3;

    enum RecoveryAction {
        NONE,
        SOFT,
        HARD,
        RUNTIME
    }

    static final class Decision {
        final long staleForMs;
        final boolean enteredDegraded;
        final boolean requestProbe;
        final RecoveryAction action;

        Decision(long staleForMs, boolean enteredDegraded, boolean requestProbe, RecoveryAction action) {
            this.staleForMs = Math.max(0L, staleForMs);
            this.enteredDegraded = enteredDegraded;
            this.requestProbe = requestProbe;
            this.action = action == null ? RecoveryAction.NONE : action;
        }
    }

    private boolean continuousStreamHealthy = false;
    private boolean degradedAnnounced = false;
    private long lastAnyLocationAt = 0L;
    private long lastContinuousLocationAt = 0L;
    private long lastProbeLocationAt = 0L;
    private long lastConfirmedContinuousAt = 0L;
    private long recoveryStartedAt = 0L;
    private long lastRecoveryActionAt = 0L;
    private long lastProbeRequestedAt = 0L;
    private long lastRecoveryContinuousAt = 0L;
    private int recoveryStage = 0;
    private int continuousRecoveryStreak = 0;

    boolean onContinuousLocation(long now) {
        long safeNow = Math.max(1L, now);
        lastAnyLocationAt = safeNow;
        lastContinuousLocationAt = safeNow;

        if (!degradedAnnounced) {
            continuousStreamHealthy = true;
            lastConfirmedContinuousAt = safeNow;
            continuousRecoveryStreak = 0;
            lastRecoveryContinuousAt = 0L;
            return false;
        }

        if (
            lastRecoveryContinuousAt > 0L
            && safeNow - lastRecoveryContinuousAt <= CONTINUOUS_STREAK_MAX_GAP_MS
        ) {
            continuousRecoveryStreak += 1;
        } else {
            continuousRecoveryStreak = 1;
        }
        lastRecoveryContinuousAt = safeNow;

        if (continuousRecoveryStreak < CONTINUOUS_FIXES_TO_RESTORE) return false;

        continuousStreamHealthy = true;
        degradedAnnounced = false;
        lastConfirmedContinuousAt = safeNow;
        recoveryStartedAt = 0L;
        lastRecoveryActionAt = 0L;
        lastProbeRequestedAt = 0L;
        lastRecoveryContinuousAt = 0L;
        recoveryStage = 0;
        continuousRecoveryStreak = 0;
        return true;
    }

    void onProbeLocation(long now) {
        long safeNow = Math.max(1L, now);
        lastAnyLocationAt = safeNow;
        lastProbeLocationAt = safeNow;
        // Intentionally do not update lastConfirmedContinuousAt, recoveryStage,
        // or the continuous recovery streak. A probe is not a recovered stream.
    }

    Decision evaluate(long now, long serviceCreatedAt, boolean probeActive, int runtimeRecoveryCount) {
        long safeNow = Math.max(1L, now);
        long initialReference = lastConfirmedContinuousAt > 0L
            ? lastConfirmedContinuousAt
            : Math.max(1L, serviceCreatedAt);
        long staleForMs = Math.max(0L, safeNow - initialReference);
        boolean enteredDegraded = false;

        if (!degradedAnnounced && staleForMs >= DEGRADED_AFTER_MS) {
            continuousStreamHealthy = false;
            degradedAnnounced = true;
            recoveryStartedAt = initialReference;
            recoveryStage = 0;
            continuousRecoveryStreak = 0;
            lastRecoveryContinuousAt = 0L;
            enteredDegraded = true;
        }

        if (!degradedAnnounced) {
            return new Decision(staleForMs, false, false, RecoveryAction.NONE);
        }

        long recoveryReference = recoveryStartedAt > 0L ? recoveryStartedAt : initialReference;
        staleForMs = Math.max(0L, safeNow - recoveryReference);
        RecoveryAction action = RecoveryAction.NONE;
        boolean actionCooldownElapsed = lastRecoveryActionAt == 0L
            || safeNow - lastRecoveryActionAt >= RECOVERY_ACTION_COOLDOWN_MS;

        if (actionCooldownElapsed && recoveryStage == 0 && staleForMs >= SOFT_RECOVERY_AFTER_MS) {
            recoveryStage = 1;
            lastRecoveryActionAt = safeNow;
            action = RecoveryAction.SOFT;
        } else if (
            actionCooldownElapsed
            && recoveryStage == 1
            && staleForMs >= HARD_RECOVERY_AFTER_MS
        ) {
            recoveryStage = 2;
            lastRecoveryActionAt = safeNow;
            action = RecoveryAction.HARD;
        } else {
            long runtimeThreshold = RUNTIME_RECOVERY_AFTER_MS
                + (long) Math.max(0, runtimeRecoveryCount) * RUNTIME_RECOVERY_BACKOFF_MS;
            if (
                actionCooldownElapsed
                && recoveryStage >= 2
                && staleForMs >= runtimeThreshold
            ) {
                recoveryStage = 3;
                lastRecoveryActionAt = safeNow;
                action = RecoveryAction.RUNTIME;
            }
        }

        long probeInterval = staleForMs < SLOW_PROBE_AFTER_MS
            ? FAST_PROBE_INTERVAL_MS
            : SLOW_PROBE_INTERVAL_MS;
        boolean requestProbe = staleForMs >= SOFT_RECOVERY_AFTER_MS
            && !probeActive
            && (lastProbeRequestedAt == 0L || safeNow - lastProbeRequestedAt >= probeInterval);

        return new Decision(staleForMs, enteredDegraded, requestProbe, action);
    }

    void markProbeRequested(long now) {
        lastProbeRequestedAt = Math.max(1L, now);
    }

    boolean isContinuousStreamHealthy() { return continuousStreamHealthy; }
    boolean isRecovering() { return degradedAnnounced; }
    long getLastAnyLocationAt() { return lastAnyLocationAt; }
    long getLastContinuousLocationAt() { return lastContinuousLocationAt; }
    long getLastProbeLocationAt() { return lastProbeLocationAt; }
    long getLastConfirmedContinuousAt() { return lastConfirmedContinuousAt; }
    long getRecoveryStartedAt() { return recoveryStartedAt; }
    int getRecoveryStage() { return recoveryStage; }
    int getContinuousRecoveryStreak() { return continuousRecoveryStreak; }
}
