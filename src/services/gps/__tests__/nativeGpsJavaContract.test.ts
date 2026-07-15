import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const storePath = path.resolve(
  process.cwd(),
  'android/app/src/main/java/fr/capclair/app/NativeGpsStore.java'
);
const pluginPath = path.resolve(
  process.cwd(),
  'android/app/src/main/java/fr/capclair/app/NativeGpsPlugin.java'
);
const servicePath = path.resolve(
  process.cwd(),
  'android/app/src/main/java/fr/capclair/app/NativeGpsForegroundService.java'
);
const manifestPath = path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');

describe('Native GPS Android reliability contract', () => {
  it('skips a malformed JSONL line and advances the file pointer', () => {
    const source = fs.readFileSync(storePath, 'utf8');
    const method = source.slice(
      source.indexOf('private static PointReadResult readPointsSince'),
      source.indexOf('private static JSONArray readPoints')
    );

    expect(method).toContain('catch (Exception malformedLine)');
    expect(method).toContain('isTrailingPartialRecord(reader)');
    expect(method).toContain('reader.seek(lineStart)');
    expect(method).toContain('return new PointReadResult(result, reader.getFilePointer())');
  });

  it('finalizes natively before returning and reads the journal through bounded pages', () => {
    const store = fs.readFileSync(storePath, 'utf8');
    const plugin = fs.readFileSync(pluginPath, 'utf8');

    expect(plugin).toContain('NativeGpsStore.finishCurrentSession();');
    expect(plugin).toContain('getContext().stopService(serviceIntent);');
    expect(plugin).not.toContain('completePoints');
    expect(plugin).toContain('public void getSessionPointsChunk(PluginCall call)');
    expect(store).toContain('readPointsSinceLimited');
    expect(plugin).toContain('result.put("journalLength", journalLength)');
    expect(plugin).toContain('result.put("startOffset", sinceOffset)');
    expect(plugin).toContain('result.put("eofReached", page.eofReached)');
    expect(plugin).toContain('result.put("trailingPartial", page.trailingPartial)');
    expect(store).toContain('syncSessionJournal(activeSessionId);');
  });

  it('runs location callbacks off the UI thread with a wake lock and watchdog', () => {
    const service = fs.readFileSync(servicePath, 'utf8');
    const manifest = fs.readFileSync(manifestPath, 'utf8');

    expect(service).toContain('new HandlerThread("CapClairGpsLocation")');
    expect(service).toContain('requestLocationUpdates(activeProvider, MIN_TIME_MS, MIN_DISTANCE_M, this, callbackLooper)');
    expect(service).toContain('PowerManager.PARTIAL_WAKE_LOCK');
    expect(service).toContain('location_watchdog_restart');
    expect(manifest).toContain('android.permission.WAKE_LOCK');
  });

  it('coalesces bridge wake-ups so a slow WebView cannot block the GPS writer', () => {
    const plugin = fs.readFileSync(pluginPath, 'utf8');

    expect(plugin).toContain('AtomicBoolean pointNotificationPending');
    expect(plugin).toContain('pointNotificationPending.compareAndSet(false, true)');
    expect(plugin).toContain('bridgeEventHandler.post');
  });

  it('keeps saved trace metadata and stops any residual service when confirmed', () => {
    const store = fs.readFileSync(storePath, 'utf8');
    const plugin = fs.readFileSync(pluginPath, 'utf8');

    expect(store).toContain('private static String savedTraceId');
    expect(store).toContain('metadata.put("traceId", savedTraceId)');
    expect(store).toContain('metadata.put("savedAt", savedAt == null ? JSONObject.NULL : savedAt)');
    expect(plugin).toContain('if (saved)');
    expect(plugin).toContain('getContext().stopService(serviceIntent)');
  });

  it('repairs a partial trailing JSONL record before resuming', () => {
    const store = fs.readFileSync(storePath, 'utf8');

    expect(store).toContain('repairTrailingPartialLine(activeSessionId);');
    expect(store).toContain('trailing_partial_point_removed');
  });

  it('does not expose saved sessions to automatic recovery by default', () => {
    const store = fs.readFileSync(storePath, 'utf8');
    const plugin = fs.readFileSync(pluginPath, 'utf8');

    expect(store).toContain('if (!includeSaved && metadata.optBoolean("saved", false)) continue;');
    expect(plugin).toContain('call.getBoolean("includeSaved", false)');
  });

  it('records service health and exports a raw diagnostic bundle', () => {
    const store = fs.readFileSync(storePath, 'utf8');
    const plugin = fs.readFileSync(pluginPath, 'utf8');
    const service = fs.readFileSync(servicePath, 'utf8');

    expect(store).toContain('static synchronized JSObject getSessionDiagnostic(String sessionId)');
    expect(service).toContain('NativeGpsStore.recordDiagnosticEvent("service_heartbeat"');
    expect(service).toContain('NativeGpsStore.recordDiagnosticEvent("location_resumed_after_gap"');
    expect(plugin).toContain('public void exportSessionDiagnostic(PluginCall call)');
    expect(plugin).toContain('writeZipEntry(zip, "native-journal.jsonl"');
    expect(plugin).toContain('writeZipEntry(zip, "native-events.jsonl"');
  });
});
