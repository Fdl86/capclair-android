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

describe('NativeGpsStore Java robustness contract', () => {
  it('skips a malformed JSONL line inside the incremental loop and advances the file pointer', () => {
    const source = fs.readFileSync(storePath, 'utf8');
    const method = source.slice(
      source.indexOf('private static PointReadResult readPointsSince'),
      source.indexOf('private static JSONArray readPoints')
    );

    expect(method).toContain('catch (Exception malformedLine)');
    expect(method).toContain('return new PointReadResult(result, reader.getFilePointer())');
    expect(method.indexOf('catch (Exception malformedLine)')).toBeLessThan(
      method.indexOf('return new PointReadResult(result, reader.getFilePointer())')
    );
  });

  it('returns the complete native journal when stopping a session', () => {
    const plugin = fs.readFileSync(pluginPath, 'utf8');
    expect(plugin).toContain('result.put("completePoints", NativeGpsStore.getAllCurrentPoints())');
  });

  it('supports targeted reads of a saved session journal for local trace repair', () => {
    const store = fs.readFileSync(storePath, 'utf8');
    const plugin = fs.readFileSync(pluginPath, 'utf8');
    expect(store).toContain('static synchronized JSONArray getSessionPoints(String sessionId)');
    expect(plugin).toContain('public void getSessionPoints(PluginCall call)');
  });

  it('does not expose saved sessions to automatic recovery by default', () => {
    const store = fs.readFileSync(storePath, 'utf8');
    const plugin = fs.readFileSync(pluginPath, 'utf8');

    expect(store).toContain('if (!includeSaved && metadata.optBoolean("saved", false)) continue;');
    expect(plugin).toContain('call.getBoolean("includeSaved", false)');
  });
  it('records native service heartbeats and exports a raw diagnostic bundle', () => {
    const store = fs.readFileSync(storePath, 'utf8');
    const plugin = fs.readFileSync(pluginPath, 'utf8');
    const service = fs.readFileSync(path.resolve(
      process.cwd(),
      'android/app/src/main/java/fr/capclair/app/NativeGpsForegroundService.java'
    ), 'utf8');

    expect(store).toContain('static synchronized JSObject getSessionDiagnostic(String sessionId)');
    expect(store).toContain('static synchronized String getSessionJournalText(String sessionId)');
    expect(store).toContain('static synchronized String getSessionEventsText(String sessionId)');
    expect(service).toContain('NativeGpsStore.recordDiagnosticEvent("service_heartbeat"');
    expect(service).toContain('NativeGpsStore.recordDiagnosticEvent("location_resumed_after_gap"');
    expect(plugin).toContain('public void exportSessionDiagnostic(PluginCall call)');
    expect(plugin).toContain('writeZipEntry(zip, "native-journal.jsonl"');
    expect(plugin).toContain('writeZipEntry(zip, "native-events.jsonl"');
  });

});
