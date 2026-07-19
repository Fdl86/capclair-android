import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const javaPath = path.join(root, 'android', 'app', 'src', 'main', 'java', 'fr', 'capclair', 'app', 'NativeSupAipDataPlugin.java');
const mainActivityPath = path.join(root, 'android', 'app', 'src', 'main', 'java', 'fr', 'capclair', 'app', 'MainActivity.java');
const transportPath = path.join(root, 'src', 'services', 'supaip', 'supAipTransport.ts');

describe('native SUP AIP byte-preserving transport contract', () => {
  it('registers an isolated native plugin without changing the existing plugin registrations', () => {
    const mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
    expect(mainActivity).toContain('registerPlugin(NativeGpsPlugin.class)');
    expect(mainActivity).toContain('registerPlugin(NativeTraceExportPlugin.class)');
    expect(mainActivity).toContain('registerPlugin(NativeUpdatePlugin.class)');
    expect(mainActivity).toContain('registerPlugin(NativeSupAipDataPlugin.class)');
  });

  it('restricts downloads to HTTPS CAP CLAIR SUP AIP data with hard size and redirect limits', () => {
    const source = fs.readFileSync(javaPath, 'utf8');
    expect(source).toContain('ALLOWED_HOST = "capclair.pages.dev"');
    expect(source).toContain('"https".equalsIgnoreCase(url.getProtocol())');
    expect(source).toContain('path.startsWith("/data/supaip/") || path.startsWith("/data/supaip-")');
    expect(source).toContain('ABSOLUTE_MAX_BYTES = 8 * 1024 * 1024');
    expect(source).toContain('connection.setInstanceFollowRedirects(false)');
    expect(source).toContain('connection.setRequestProperty("Accept-Encoding", "identity")');
    expect(source).toContain('new String(bytes, StandardCharsets.UTF_8)');
    expect(source).toContain('executor = Executors.newSingleThreadExecutor()');
  });

  it('uses the native raw-text bridge on Android before computing SHA-256', () => {
    const source = fs.readFileSync(transportPath, 'utf8');
    expect(source).toContain("registerPlugin<NativeSupAipDataPlugin>('NativeSupAipData')");
    expect(source).toContain('NativeSupAipData.fetchText');
    expect(source).toContain('new TextEncoder().encode(response.text).byteLength');
    expect(source).not.toContain('CapacitorHttp');
  });
});
