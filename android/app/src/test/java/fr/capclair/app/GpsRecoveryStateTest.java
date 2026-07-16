package fr.capclair.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class GpsRecoveryStateTest {
    @Test
    public void successfulProbeDoesNotResetRecoveryEscalation() {
        GpsRecoveryState state = new GpsRecoveryState();
        state.onContinuousLocation(1_000L);

        GpsRecoveryState.Decision soft = state.evaluate(31_100L, 0L, false, 0);
        assertEquals(GpsRecoveryState.RecoveryAction.SOFT, soft.action);
        assertTrue(state.isRecovering());

        state.markProbeRequested(31_100L);
        state.onProbeLocation(32_000L);
        assertTrue(state.isRecovering());
        assertFalse(state.isContinuousStreamHealthy());
        assertEquals(1, state.getRecoveryStage());

        GpsRecoveryState.Decision hard = state.evaluate(61_100L, 0L, false, 0);
        assertEquals(GpsRecoveryState.RecoveryAction.HARD, hard.action);

        GpsRecoveryState.Decision runtime = state.evaluate(121_100L, 0L, false, 0);
        assertEquals(GpsRecoveryState.RecoveryAction.RUNTIME, runtime.action);
    }

    @Test
    public void threeContinuousFixesRestoreTheStream() {
        GpsRecoveryState state = new GpsRecoveryState();
        state.onContinuousLocation(1_000L);
        state.evaluate(31_100L, 0L, false, 0);

        assertFalse(state.onContinuousLocation(32_000L));
        assertFalse(state.onContinuousLocation(33_000L));
        assertTrue(state.onContinuousLocation(34_000L));
        assertTrue(state.isContinuousStreamHealthy());
        assertFalse(state.isRecovering());
        assertEquals(0, state.getRecoveryStage());
    }

    @Test
    public void isolatedContinuousFixesDoNotCreateAFalseRecovery() {
        GpsRecoveryState state = new GpsRecoveryState();
        state.onContinuousLocation(1_000L);
        state.evaluate(31_100L, 0L, false, 0);

        assertFalse(state.onContinuousLocation(32_000L));
        assertFalse(state.onContinuousLocation(40_000L));
        assertFalse(state.onContinuousLocation(48_000L));
        assertTrue(state.isRecovering());
        assertFalse(state.isContinuousStreamHealthy());
    }

    @Test
    public void degradedModeRequestsBoundedFallbackProbes() {
        GpsRecoveryState state = new GpsRecoveryState();
        state.onContinuousLocation(1_000L);

        GpsRecoveryState.Decision first = state.evaluate(31_100L, 0L, false, 0);
        assertTrue(first.requestProbe);
        state.markProbeRequested(31_100L);

        GpsRecoveryState.Decision tooSoon = state.evaluate(34_000L, 0L, false, 0);
        assertFalse(tooSoon.requestProbe);

        GpsRecoveryState.Decision next = state.evaluate(36_200L, 0L, false, 0);
        assertTrue(next.requestProbe);
    }
    @Test
    public void healthyContinuousStreamStaysOnTheNormalPath() {
        GpsRecoveryState state = new GpsRecoveryState();
        state.onContinuousLocation(1_000L);
        state.onContinuousLocation(2_000L);
        state.onContinuousLocation(3_000L);

        GpsRecoveryState.Decision decision = state.evaluate(10_000L, 0L, false, 0);
        assertEquals(GpsRecoveryState.RecoveryAction.NONE, decision.action);
        assertFalse(decision.requestProbe);
        assertTrue(state.isContinuousStreamHealthy());
        assertFalse(state.isRecovering());
    }

}
