package fr.capclair.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeSupAipData")
public class NativeSupAipDataPlugin extends Plugin {
    private static final String ALLOWED_HOST = "capclair.pages.dev";
    private static final int DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
    private static final int ABSOLUTE_MAX_BYTES = 8 * 1024 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 45_000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void fetchText(PluginCall call) {
        String urlValue = call.getString("url", "");
        int requestedMaxBytes = call.getInt("maxBytes", DEFAULT_MAX_BYTES);
        int maxBytes = Math.max(1, Math.min(requestedMaxBytes, ABSOLUTE_MAX_BYTES));

        if (!isAllowedUrl(urlValue)) {
            call.reject("URL SUP AIP non autorisée.", "invalid_supaip_url");
            return;
        }

        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(urlValue);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setUseCaches(false);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/json, application/geo+json, text/plain");
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("Accept-Encoding", "identity");
                connection.connect();

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    call.reject("Téléchargement SUP AIP impossible (HTTP " + status + ").", "supaip_http_" + status);
                    return;
                }

                int declaredLength = connection.getContentLength();
                if (declaredLength > maxBytes) {
                    call.reject("Fichier SUP AIP trop volumineux.", "supaip_payload_too_large");
                    return;
                }

                byte[] bytes;
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream(Math.max(8192, declaredLength))) {
                    byte[] buffer = new byte[16 * 1024];
                    int total = 0;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        total += read;
                        if (total > maxBytes) {
                            throw new PayloadTooLargeException();
                        }
                        output.write(buffer, 0, read);
                    }
                    bytes = output.toByteArray();
                }

                JSObject result = new JSObject();
                result.put("status", status);
                result.put("byteLength", bytes.length);
                result.put("text", new String(bytes, StandardCharsets.UTF_8));
                String contentType = connection.getContentType();
                result.put("contentType", contentType == null ? "" : contentType);
                call.resolve(result);
            } catch (PayloadTooLargeException error) {
                call.reject("Fichier SUP AIP trop volumineux.", "supaip_payload_too_large");
            } catch (Exception error) {
                call.reject("Téléchargement natif SUP AIP impossible.", "supaip_download_failed", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private static boolean isAllowedUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            URL url = new URL(value);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
            if (!ALLOWED_HOST.equalsIgnoreCase(url.getHost())) return false;
            int port = url.getPort();
            if (port != -1 && port != 443) return false;
            String path = url.getPath().toLowerCase(Locale.ROOT);
            return path.startsWith("/data/supaip/") || path.startsWith("/data/supaip-");
        } catch (Exception error) {
            return false;
        }
    }

    private static final class PayloadTooLargeException extends Exception {
        private static final long serialVersionUID = 1L;
    }
}
