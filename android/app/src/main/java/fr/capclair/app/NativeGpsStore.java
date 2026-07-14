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
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
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

    static final class PointReadResult {
        final JSONArray points;
        final long nextOffset;

        PointReadResult(JSONArray points, long nextOffset) {
            this.points = points;
            this.nextOffset = nextOffset;
        }
    }

    private static final int SCHEMA_VERSION = 3;
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
    private static JSONObject plannedRoute = null;
    private static long startedAt = 0L;
    private static Long endedAt = null;
    private static boolean saved = false;
    private static boolean journalWriteHealthy = true;
    private static int persistentPointCount = 0;

    private NativeGpsStore() {}

    static synchronized void initialize(Context context) {
        if (appContext != null) return;
        appContext = context.getApplicationContext();
        sessionsDir = new File(appContext.getFilesDir(), "gps-sessions");
        if (!sessionsDir.exists()) sessionsDir.mkdirs();
        activePointerFile = new File(sessionsDir, "active-session.txt");
        cleanupDeletedSessions();
        loadActivePointer();
        cleanupSavedSessions();
    }

    static synchronized void setEventSink(EventSink nextSink) {
        sink = nextSink;
    }

    static synchronized JSObject beginSession(String requestedRouteId, String requestedRouteName, JSObject requestedPlannedRoute) {
        ensureInitialized();
        boolean resumed = false;
        if (activeSessionId != null && endedAt == null && !saved) {
            resumed = true;
            if (plannedRoute == null && requestedPlannedRoute != null) {
                plannedRoute = cloneJson(requestedPlannedRoute);
                writeMetadata();
            }
            refreshPersistentPointCount();
        } else {
            activeSessionId = UUID.randomUUID().toString();
            routeId = requestedRouteId == null ? "" : requestedRouteId;
            routeName = requestedRouteName == null || requestedRouteName.trim().isEmpty() ? "Trace GPS" : requestedRouteName.trim();
            plannedRoute = requestedPlannedRoute == null ? null : cloneJson(requestedPlannedRoute);
            startedAt = System.currentTimeMillis();
            endedAt = null;
            saved = false;
            journalWriteHealthy = true;
            lastError = null;
            persistentPointCount = 0;
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
        beginSession("", "Trace GPS restaurée", null);
    }

    static void setRunning(boolean isRunning, String activeProvider) {
        EventSink currentSink;
        JSObject status;
        synchronized (NativeGpsStore.class) {
            running = isRunning;
            if (isRunning) acceptingPoints = true;
            provider = activeProvider == null ? "none" : activeProvider;
            if (isRunning && journalWriteHealthy) lastError = null;
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
        JSObject emittedPoint;
        JSObject errorStatus = null;
        synchronized (NativeGpsStore.class) {
            if (!acceptingPoints) return;
            ensureActiveSession();
            boolean persisted = appendPointToDisk(point);
            emittedPoint = cloneJson(point);
            emittedPoint.put("persisted", persisted);
            if (persisted) {
                persistentPointCount += 1;
                if (persistentPointCount == 1 || persistentPointCount % 30 == 0) writeMetadata();
            } else {
                journalWriteHealthy = false;
                writeMetadata();
                errorStatus = getStatus();
                errorStatus.put("status", "error");
            }
            currentSink = sink;
        }
        if (currentSink != null) {
            if (errorStatus != null) currentSink.onStatus(errorStatus);
            currentSink.onPoint(emittedPoint);
        }
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
        if (plannedRoute != null) status.put("plannedRoute", plannedRoute);
        status.put("startedAt", startedAt > 0 ? startedAt : null);
        status.put("endedAt", endedAt);
        status.put("saved", saved);
        status.put("journalWriteHealthy", journalWriteHealthy);
        File journal = pointsFile(activeSessionId);
        status.put("journalOffset", journal != null && journal.exists() ? journal.length() : 0L);
        status.put("schemaVersion", SCHEMA_VERSION);
        return status;
    }

    static synchronized PointReadResult getPointsSince(long sinceOffset, long sinceTimestamp) {
        ensureInitialized();
        return readPointsSince(activeSessionId, sinceOffset, sinceTimestamp);
    }

    static synchronized JSONArray getAllCurrentPoints() {
        return readPoints(activeSessionId);
    }

    static synchronized JSONArray getSessionPoints(String sessionId) {
        ensureInitialized();
        return readPoints(sessionId);
    }

    static synchronized int bufferedPointCount() {
        return persistentPointCount;
    }

    static synchronized JSONArray getRecoverableSessions(boolean includeSaved) {
        ensureInitialized();
        JSONArray result = new JSONArray();
        File[] files = sessionsDir.listFiles((dir, name) -> name.startsWith("session-") && name.endsWith(".json"));
        if (files == null) return result;
        Arrays.sort(files, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));

        for (File metadataFile : files) {
            try {
                JSONObject metadata = readJson(metadataFile);
                if (metadata.optBoolean("deleted", false)) continue;
                if (!includeSaved && metadata.optBoolean("saved", false)) continue;
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
                if (metadata.has("plannedRoute") && !metadata.isNull("plannedRoute")) {
                    session.put("plannedRoute", metadata.optJSONObject("plannedRoute"));
                }
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
            if (sessionId.equals(activeSessionId)) saved = true;
            return true;
        } catch (Exception error) {
            lastError = "Validation sauvegarde native impossible : " + error.getMessage();
            return false;
        }
    }

    static synchronized boolean markSessionDeleted(String sessionId) {
        ensureInitialized();
        File metadata = metadataFile(sessionId);
        if (metadata == null) return false;
        if (!metadata.exists()) {
            deleteSessionFiles(sessionId);
            return true;
        }
        try {
            JSONObject data = readJson(metadata);
            data.put("deleted", true);
            data.put("deletedAt", System.currentTimeMillis());
            writeJson(metadata, data);
            deleteSessionFiles(sessionId);
            return true;
        } catch (Exception error) {
            lastError = "Suppression session native impossible : " + error.getMessage();
            return false;
        }
    }

    private static void ensureInitialized() {
        if (appContext == null) throw new IllegalStateException("NativeGpsStore non initialisé");
    }

    private static boolean appendPointToDisk(JSObject point) {
        File file = pointsFile(activeSessionId);
        if (file == null) {
            lastError = "Écriture journal GPS impossible : session absente.";
            return false;
        }
        boolean shouldSync = (persistentPointCount + 1) % 5 == 0;
        try (FileOutputStream output = new FileOutputStream(file, true);
             BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(output, StandardCharsets.UTF_8))) {
            writer.write(point.toString());
            writer.newLine();
            writer.flush();
            if (shouldSync) output.getFD().sync();
            return true;
        } catch (Exception error) {
            lastError = "Écriture journal GPS impossible : " + error.getMessage();
            return false;
        }
    }

    private static PointReadResult readPointsSince(String sessionId, long requestedOffset, long sinceTimestamp) {
        JSONArray result = new JSONArray();
        File file = pointsFile(sessionId);
        if (file == null || !file.exists()) return new PointReadResult(result, 0L);

        long offset = Math.max(0L, requestedOffset);
        if (offset > file.length()) offset = 0L;
        boolean timestampFallback = offset == 0L && sinceTimestamp > 0L;

        try (RandomAccessFile reader = new RandomAccessFile(file, "r")) {
            reader.seek(offset);
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                String utf8Line = new String(line.getBytes(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8);
                try {
                    JSObject point = new JSObject(utf8Line);
                    if (!timestampFallback || point.optLong("timestamp", 0L) > sinceTimestamp) result.put(point);
                } catch (Exception malformedLine) {
                    // A partially written/corrupted JSONL line must never pin the incremental offset.
                    // Skip only this line and keep scanning later valid points.
                    lastError = "Ligne journal GPS illisible ignorée.";
                }
            }
            return new PointReadResult(result, reader.getFilePointer());
        } catch (Exception error) {
            lastError = "Lecture journal GPS impossible : " + error.getMessage();
            return new PointReadResult(result, offset);
        }
    }

    private static JSONArray readPoints(String sessionId) {
        JSONArray result = new JSONArray();
        File file = pointsFile(sessionId);
        if (file == null || !file.exists()) return result;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                try {
                    result.put(new JSObject(line));
                } catch (Exception malformedLine) {
                    // Keep every valid point around a damaged/truncated JSONL line.
                    lastError = "Ligne journal GPS illisible ignorée.";
                }
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
            refreshPersistentPointCount();
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
            plannedRoute = metadata.has("plannedRoute") && !metadata.isNull("plannedRoute")
                ? metadata.optJSONObject("plannedRoute")
                : null;
            startedAt = metadata.optLong("startedAt", 0L);
            endedAt = metadata.has("endedAt") && !metadata.isNull("endedAt") ? metadata.optLong("endedAt") : null;
            saved = metadata.optBoolean("saved", false);
            journalWriteHealthy = metadata.optBoolean("journalWriteHealthy", true);
            persistentPointCount = metadata.optInt("pointCount", 0);
        } catch (Exception ignored) {}
    }

    private static void refreshPersistentPointCount() {
        File file = pointsFile(activeSessionId);
        if (file == null || !file.exists()) {
            persistentPointCount = 0;
            return;
        }
        int count = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            while (reader.readLine() != null) count += 1;
            persistentPointCount = count;
        } catch (Exception ignored) {
            // Keep the metadata count if the recovery scan cannot complete.
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
            metadata.put("plannedRoute", plannedRoute == null ? JSONObject.NULL : plannedRoute);
            metadata.put("startedAt", startedAt);
            metadata.put("endedAt", endedAt == null ? JSONObject.NULL : endedAt);
            metadata.put("saved", saved);
            metadata.put("deleted", false);
            metadata.put("journalWriteHealthy", journalWriteHealthy);
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

    private static void deleteSessionFiles(String sessionId) {
        File metadata = metadataFile(sessionId);
        File points = pointsFile(sessionId);
        if (points != null && points.exists()) points.delete();
        if (metadata != null && metadata.exists()) metadata.delete();
        if (sessionId != null && sessionId.equals(activeSessionId)) {
            activeSessionId = null;
            routeId = "";
            routeName = "Trace GPS";
            plannedRoute = null;
            startedAt = 0L;
            endedAt = null;
            saved = false;
            acceptingPoints = false;
            persistentPointCount = 0;
            if (activePointerFile != null && activePointerFile.exists()) activePointerFile.delete();
        }
    }

    private static void cleanupDeletedSessions() {
        if (sessionsDir == null) return;
        File[] metadataFiles = sessionsDir.listFiles((dir, name) -> name.startsWith("session-") && name.endsWith(".json"));
        if (metadataFiles == null) return;
        for (File metadataFile : metadataFiles) {
            try {
                JSONObject metadata = readJson(metadataFile);
                if (!metadata.optBoolean("deleted", false)) continue;
                deleteSessionFiles(metadata.optString("sessionId", ""));
            } catch (Exception ignored) {}
        }
    }

    private static void cleanupSavedSessions() {
        if (sessionsDir == null) return;
        File[] metadataFiles = sessionsDir.listFiles((dir, name) -> name.startsWith("session-") && name.endsWith(".json"));
        if (metadataFiles == null || metadataFiles.length == 0) return;
        Arrays.sort(metadataFiles, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));
        long cutoff = System.currentTimeMillis() - 30L * 24L * 60L * 60L * 1000L;
        int savedKept = 0;
        for (File metadataFile : metadataFiles) {
            try {
                JSONObject metadata = readJson(metadataFile);
                if (!metadata.optBoolean("saved", false)) continue;
                savedKept += 1;
                if (savedKept <= 20 && metadataFile.lastModified() >= cutoff) continue;
                deleteSessionFiles(metadata.optString("sessionId", ""));
            } catch (Exception ignored) {}
        }
    }

    private static JSObject cloneJson(JSONObject source) {
        if (source == null) return new JSObject();
        try {
            return new JSObject(source.toString());
        } catch (JSONException error) {
            return new JSObject();
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
