package fr.capclair.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class NativeBridgeNumbersTest {
    @Test
    public void nonNegativeLongAcceptsIntegerNumber() {
        assertEquals(1503003L, NativeBridgeNumbers.nonNegativeLong(1503003, 0L));
    }

    @Test
    public void nonNegativeLongAcceptsJavascriptDouble() {
        assertEquals(1503003L, NativeBridgeNumbers.nonNegativeLong(1503003.0d, 0L));
    }

    @Test
    public void nonNegativeLongAcceptsNumericString() {
        assertEquals(1503003L, NativeBridgeNumbers.nonNegativeLong("1503003", 0L));
    }

    @Test
    public void nonNegativeLongUsesFallbackForInvalidValue() {
        assertEquals(42L, NativeBridgeNumbers.nonNegativeLong("not-a-number", 42L));
    }

    @Test
    public void nonNegativeLongNeverReturnsNegativeValue() {
        assertEquals(0L, NativeBridgeNumbers.nonNegativeLong(-1.0d, 0L));
    }
}
