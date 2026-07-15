package fr.capclair.app;

final class NativeBridgeNumbers {
    private NativeBridgeNumbers() {}

    static long nonNegativeLong(Object raw, long fallback) {
        if (raw instanceof Number) return Math.max(0L, ((Number) raw).longValue());
        if (raw instanceof String) {
            try { return Math.max(0L, Long.parseLong(((String) raw).trim())); }
            catch (NumberFormatException ignored) {}
        }
        return Math.max(0L, fallback);
    }

    static int boundedInt(Object raw, int fallback, int min, int max) {
        int value = fallback;
        if (raw instanceof Number) value = ((Number) raw).intValue();
        else if (raw instanceof String) {
            try { value = Integer.parseInt(((String) raw).trim()); }
            catch (NumberFormatException ignored) {}
        }
        return Math.max(min, Math.min(max, value));
    }
}
