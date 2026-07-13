package fr.capclair.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;

@CapacitorPlugin(name = "NativeTraceExport")
public class NativeTraceExportPlugin extends Plugin {
    private static final int MAX_CACHED_EXPORTS = 8;
    private static final long MAX_EXPORT_AGE_MS = 24L * 60L * 60L * 1000L;

    @PluginMethod
    public void exportFile(PluginCall call) {
        String fileName = sanitizeFileName(call.getString("fileName", "cap-clair-trace.gpx"));
        String content = call.getString("content", "");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String chooserTitle = call.getString("chooserTitle", "Partager la trace CAP CLAIR");
        String encoding = call.getString("encoding", "utf8");

        if (content == null || content.isEmpty()) {
            call.reject("Contenu export vide.", "empty_content");
            return;
        }

        try {
            File exportDir = new File(getContext().getCacheDir(), "capclair-exports");
            if (!exportDir.exists() && !exportDir.mkdirs()) {
                call.reject("Impossible de créer le dossier d'export.", "directory_error");
                return;
            }
            File exportFile = new File(exportDir, fileName);
            byte[] payload;
            if ("base64".equalsIgnoreCase(encoding)) {
                try {
                    payload = Base64.decode(content, Base64.DEFAULT);
                } catch (IllegalArgumentException error) {
                    call.reject("Contenu Base64 invalide.", "invalid_base64", error);
                    return;
                }
            } else {
                payload = content.getBytes(StandardCharsets.UTF_8);
            }
            if (payload.length == 0) {
                call.reject("Contenu export vide.", "empty_content");
                return;
            }
            try (FileOutputStream output = new FileOutputStream(exportFile, false)) {
                output.write(payload);
                output.flush();
                output.getFD().sync();
            }
            cleanupExports(exportDir);

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                exportFile
            );
            Intent sendIntent = new Intent(Intent.ACTION_SEND);
            sendIntent.setType(mimeType);
            sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
            sendIntent.putExtra(Intent.EXTRA_SUBJECT, fileName);
            sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(sendIntent, chooserTitle);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("shared", true);
            result.put("fileName", fileName);
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Export Android impossible : " + error.getMessage(), "export_failed", error);
        }
    }

    private void cleanupExports(File exportDir) {
        File[] files = exportDir.listFiles();
        if (files == null) return;
        long now = System.currentTimeMillis();
        for (File file : files) {
            if (now - file.lastModified() > MAX_EXPORT_AGE_MS) file.delete();
        }
        files = exportDir.listFiles();
        if (files == null || files.length <= MAX_CACHED_EXPORTS) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
        for (int index = MAX_CACHED_EXPORTS; index < files.length; index += 1) files[index].delete();
    }

    private String sanitizeFileName(String value) {
        String safe = value == null ? "cap-clair-trace.gpx" : value.trim();
        safe = safe.replaceAll("[^A-Za-z0-9._-]+", "-");
        safe = safe.replaceAll("-+", "-");
        if (safe.isEmpty()) safe = "cap-clair-trace.gpx";
        if (safe.length() > 120) safe = safe.substring(0, 120);
        return safe;
    }
}
