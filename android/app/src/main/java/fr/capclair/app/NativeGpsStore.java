package fr.capclair.app;

import android.content.Context;
import com.getcapacitor.JSObject;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Durable native journal for GPS sessions.
 *
 * Points are appended to a JSONL file before being exposed to React. The in-memory
 * list is only a fast cache; the session file remains the source of truth after a
 * WebView/process restart.
 */
final class NativeGpsStore {
    interface EventSink {
        void onPoint(JSObject point);
        void onStatus(JSObject status);
    }

    private static final int SCHEMA_VERSION = 2;
    private static final int MAX_MEMORY_POINTS = 18000;
    private static final List<JSObject> MEMORY_POINTS = new ArrayList<>();
    private static EventSink sink = null;
    private static Context appContext;
    private static File sessionsDir;
    private static File activePointerFile;
    private static boolean running = false;
    private static boolean acceptingPoints = false;
    private static String provider = "none";
    private static String lastError = null;
    private static String activeSessionId = null;
    private static String routeId = "";
    private static String routeName = "Trace GPS";
    private static long startedAt = 0L;
    private static Long endedAt = null;
    private static boolean saved = false;
    private static int persistentPointCount = 0;

    private NativeGpsStore() {}

    static synchronized void initialize(Context context) {
        if (appContext != null) return;
        appContext = context.getApplicationContext();
        sessionsDir = new File(appContext.getFilesDir(), "gps-sessions");
        if (!sessionsDir.exists()) sessionsDir.mkdirs();
        activePointerFile = new File(sessionsDir, "active-session.txt");
        loadActivePointer();
        cleanupSavedSessions();
    }

    static synchronized void setEventSink(EventSink nextSink) {
        sink = nextSink;
    }

    static synchronized JSObject beginSession(String requestedRouteId, String requestedRouteName) {
        ensureInitialized();
        boolean resumed = false;
        if (activeSessionId != null && endedAt == null && !saved) {
            resumed = true;
            loadMemoryCache();
        } else {
            activeSessionId = UUID.randomUUID().toString();
            routeId = requestedRouteId == null ? "" : requestedRouteId;
            routeName = requestedRouteName == null || requestedRouteName.trim().isEmpty() ? "Trace GPS" : requestedRouteName.trim();
            startedAt = System.currentTimeMillis();
            endedAt = null;
            saved = false;
            persistentPointCount = 0;
            MEMORY_POINTS.clear();
            acceptingPoints = true;
            writeActivePointer();
            writeMetadata();
        }
        JSObject result = getStatus();
        result.put("resumed", resumed);
        return result;
    }

    static synchronized void ensureActiveSession() {
        ensureInitialized();
        if (activeSessionId != null && endedAt == null && !saved) {
            acceptingPoints = true;
            return;
        }
        beginSession("", "Trace GPS restaurée");
    }

    static void setRunning(boolean isRunning, String activeProvider) {
        EventSink currentSink;
        JSObject status;
        synchronized (NativeGpsStore.class) {
            running = isRunning;
            if (isRunning) acceptingPoints = true;
            provider = activeProvider == null ? "none" : activeProvider;
            if (isRunning) lastError = null;
            status = getStatus();
            status.put("status", isRunning ? "started" : "stopped");
            currentSink = sink;
        }
        if (currentSink != null) currentSink.onStatus(status);
    }

    static void setError(String message, String activeProvider) {
        EventSink currentSink;
        JSObject status;
        synchronized (NativeGpsStore.class) {
            lastError = message;
            provider = activeProvider == null ? provider : activeProvider;
            status = getStatus();
            status.put("status", "error");
            currentSink = sink;
        }
        if (currentSink != null) currentSink.onStatus(status);
    }

    static void addPoint(JSObject point) {
        EventSink currentSink;
        synchronized (NativeGpsStore.class) {
            if (!acceptingPoints) return;
            ensureActiveSession();
            appendPointToDisk(point);
            MEMORY_POINTS.add(point);
            if (MEMORY_POINTS.size() > MAX_MEMORY_POINTS) MEMORY_POINTS.remove(0);
            persistentPointCount += 1;
            if (persistentPointCount == 1 || persistentPointCount % 30 == 0) writeMetadata();
            currentSink = sink;
        }
        if (currentSink != null) currentSink.onPoint(point);
    }

    static synchronized void finishCurrentSession() {
        if (activeSessionId == null || endedAt != null) return;
        acceptingPoints = false;
        endedAt = System.currentTimeMillis();
        running = false;
        writeMetadata();
    }

    static synchronized JSObject getStatus() {
        JSObject status = new JSObject();
        status.put("running", running);
        status.put("provider", provider);
        status.put("bufferedPoints", persistentPointCount);
        status.put("lastError", lastError);
        status.put("sessionId", activeSessionId);
        status.put("routeId", routeId);
        status.put("routeName", routeName);
        status.put("startedAt", startedAt > 0 ? startedAt : null);
        status.put("endedAt", endedAt);
        status.put("saved", saved);
        status.put("schemaVersion", SCHEMA_VERSION);
        return status;
    }

    static synchronized JSONArray getPointsSince(long sinceTimestamp) {
        ensureInitialized();
        JSONArray points = new JSONArray();
        File file = pointsFile(activeSessionId);
        if (file == null || !file.exists()) return points;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                JSObject point = new JSObject(line);
                if (point.optLong("timestamp", 0L) > sinceTimestamp) points.put(point);
            }
        } catch (Exception error) {
            lastError = "Lecture journal GPS impossible : " + error.getMessage();
        }
        return points;
    }

    static synchronized JSONArray getAllCurrentPoints() {
        return getPointsSince(0L);
    }

    static synchronized int bufferedPointCount() {
        return persistentPointCount;
    }

    static synchronized JSONArray getRecoverableSessions() {
        ensureInitialized();
        JSONArray result = new JSONArray();
        File[] files = sessionsDir.listFiles((dir, name) -> name.startsWith("session-") && name.endsWith(".json"));
        if (files == null) return result;
        for (File metadataFile : files) {
            try {
                JSONObject metadata = readJson(metadataFile);
                if (metadata.optBoolean("deleted", false)) continue;
                String sessionId = metadata.optString("sessionId", "");
                if (sessionId.isEmpty()) continue;
                if (running && sessionId.equals(activeSessionId)) continue;
                JSONArray positions = readPoints(sessionId);
                if (positions.length() < 2) continue;
                JSONObject lastPoint = positions.optJSONObject(positions.length() - 1);
                long lastPointAt = lastPoint == null ? 0L : lastPoint.optLong("timestamp", 0L);
                boolean hasEndedAt = metadata.has("endedAt") && !metadata.isNull("endedAt");
                if (!hasEndedAt && lastPointAt > 0L && System.currentTimeMillis() - lastPointAt < 60_000L) continue;
                JSObject session = new JSObject();
                session.put("schemaVersion", metadata.optInt("schemaVersion", SCHEMA_VERSION));
                session.put("sessionId", sessionId);
                session.put("routeId", metadata.optString("routeId", ""));
                session.put("routeName", metadata.optString("routeName", "Trace GPS récupérée"));
                session.put("startedAt", metadata.optLong("startedAt", 0L));
                session.put("endedAt", hasEndedAt ? metadata.optLong("endedAt") : (lastPointAt > 0L ? lastPointAt : null));
                session.put("source", "android-native");
                session.put("saved", metadata.optBoolean("saved", false));
                session.put("traceId", metadata.optString("traceId", ""));
                session.put("running", running && sessionId.equals(activeSessionId));
                session.put("positions", positions);
                result.put(session);
            } catch (Exception ignored) {
                // Keep scanning other sessions.
            }
        }
        return result;
    }

    static synchronized boolean markSessionSaved(String sessionId, String traceId) {
        ensureInitialized();
        File metadataFile = metadataFile(sessionId);
        if (metadataFile == null || !metadataFile.exists()) return false;
        try {
            JSONObject metadata = readJson(metadataFile);
            metadata.put("saved", true);
            metadata.put("traceId", traceId == null ? "" : traceId);
            metadata.put("savedAt", System.currentTimeMillis());
            writeJson(metadataFile, metadata);
            if (sessionId.equals(activeSessionId)) {
                saved = true;
            }
            return true;
        } catch (Exception error) {
            lastError = "Validation sauvegarde native impossible : " + error.getMessage();
            return false;
        }
    }

    static synchronized boolean markSessionDeleted(String sessionId) {
        ensureInitialized();
        File metadataFile = metadataFile(sessionId);
        if (metadataFile == null) return false;
        // Deletion is idempotent: if the native journal is already gone, the
        // local trace can still be removed safely without being resurrected.
        if (!metadataFile.exists()) return true;
        try {
            JSONObject metadata = readJson(metadataFile);
            metadata.put("deleted", true);
            metadata.put("deletedAt", System.currentTimeMillis());
            writeJson(metadataFile, metadata);
            return true;
        } catch (Exception error) {
            lastError = "Suppression session native impossible : " + error.getMessage();
            return false;
        }
    }

    private static void ensureInitialized() {
        if (appContext == null) throw new IllegalStateException("NativeGpsStore non initialisé");
    }

    private static void appendPointToDisk(JSObject point) {
        File file = pointsFile(activeSessionId);
        if (file == null) return;
        boolean shouldSync = (persistentPointCount + 1) % 5 == 0;
        try (FileOutputStream output = new FileOutputStream(file, true);
             BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8))) {
            writer.write(point.toString());
            writer.newLine();
            writer.flush();
            if (shouldSync) output.getFD().sync();
        } catch (Exception error) {
            lastError = "Écriture journal GPS impossible : " + error.getMessage();
        }
    }

    private static JSONArray readPoints(String sessionId) {
        JSONArray result = new JSONArray();
        File file = pointsFile(sessionId);
        if (file == null || !file.exists()) return result;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.trim().isEmpty()) result.put(new JSObject(line));
            }
        } catch (Exception ignored) {}
        return result;
    }

    private static void loadActivePointer() {
        if (activePointerFile == null || !activePointerFile.exists()) return;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(activePointerFile), StandardCharsets.UTF_8))) {
            String sessionId = reader.readLine();
            if (sessionId == null || sessionId.trim().isEmpty()) return;
            activeSessionId = sessionId.trim();
            loadMetadata(activeSessionId);
            loadMemoryCache();
        } catch (Exception ignored) {
            activeSessionId = null;
        }
    }

    private static void loadMetadata(String sessionId) {
        File file = metadataFile(sessionId);
        if (file == null || !file.exists()) return;
        try {
            JSONObject metadata = readJson(file);
            routeId = metadata.optString("routeId", "");
            routeName = metadata.optString("routeName", "Trace GPS");
            startedAt = metadata.optLong("startedAt", 0L);
            endedAt = metadata.has("endedAt") && !metadata.isNull("endedAt") ? metadata.optLong("endedAt") : null;
            saved = metadata.optBoolean("saved", false);
            persistentPointCount = metadata.optInt("pointCount", 0);
        } catch (Exception ignored) {}
    }

    private static void loadMemoryCache() {
        MEMORY_POINTS.clear();
        JSONArray points = readPoints(activeSessionId);
        persistentPointCount = points.length();
        int start = Math.max(0, points.length() - MAX_MEMORY_POINTS);
        for (int index = start; index < points.length(); index += 1) {
            JSONObject point = points.optJSONObject(index);
            if (point == null) continue;

            try {
                MEMORY_POINTS.add(new JSObject(point.toString()));
            } catch (JSONException ignored) {
                // Ignore a corrupted point and continue restoring the session.
            }
        }
    }

    private static void writeActivePointer() {
        if (activePointerFile == null || activeSessionId == null) return;
        try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(new FileOutputStream(activePointerFile, false), StandardCharsets.UTF_8))) {
            writer.write(activeSessionId);
        } catch (Exception ignored) {}
    }

    private static void writeMetadata() {
        if (activeSessionId == null) return;
        try {
            JSONObject metadata = new JSONObject();
            metadata.put("schemaVersion", SCHEMA_VERSION);
            metadata.put("sessionId", activeSessionId);
            metadata.put("routeId", routeId);
            metadata.put("routeName", routeName);
            metadata.put("startedAt", startedAt);
            metadata.put("endedAt", endedAt == null ? JSONObject.NULL : endedAt);
            metadata.put("saved", saved);
            metadata.put("deleted", false);
            metadata.put("pointCount", persistentPointCount);
            metadata.put("source", "android-native");
            writeJson(metadataFile(activeSessionId), metadata);
        } catch (Exception ignored) {}
    }

    private static File metadataFile(String sessionId) {
        if (sessionsDir == null || sessionId == null || sessionId.isEmpty()) return null;
        return new File(sessionsDir, "session-" + sessionId + ".json");
    }

    private static File pointsFile(String sessionId) {
        if (sessionsDir == null || sessionId == null || sessionId.isEmpty()) return null;
        return new File(sessionsDir, "session-" + sessionId + ".jsonl");
    }

    private static void cleanupSavedSessions() {
        if (sessionsDir == null) return;
        File[] metadataFiles = sessionsDir.listFiles((dir, name) -> name.startsWith("session-") && name.endsWith(".json"));
        if (metadataFiles == null || metadataFiles.length == 0) return;
        java.util.Arrays.sort(metadataFiles, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));
        long cutoff = System.currentTimeMillis() - 30L * 24L * 60L * 60L * 1000L;
        int savedKept = 0;
        for (File metadataFile : metadataFiles) {
            try {
                JSONObject metadata = readJson(metadataFile);
                if (!metadata.optBoolean("saved", false)) continue;
                savedKept += 1;
                if (savedKept <= 20 && metadataFile.lastModified() >= cutoff) continue;
                String sessionId = metadata.optString("sessionId", "");
                metadataFile.delete();
                File points = pointsFile(sessionId);
                if (points != null) points.delete();
            } catch (Exception ignored) {}
        }
    }

    private static JSONObject readJson(File file) throws Exception {
        StringBuilder content = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) content.append(line);
        }
        return new JSONObject(content.toString());
    }

    private static void writeJson(File file, JSONObject json) throws Exception {
        try (FileOutputStream output = new FileOutputStream(file, false)) {
            output.write(json.toString().getBytes(StandardCharsets.UTF_8));
            output.flush();
            output.getFD().sync();
        }
    }
}
