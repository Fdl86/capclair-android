package fr.capclair.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeUpdate")
public class NativeUpdatePlugin extends Plugin {
    private static final String PACKAGE_NAME = "fr.capclair.app";
    private static final String CERTIFICATE_SHA256 = "d6d2de057dcd199dfbdaa3085b59d4c227530015f817355ddcc403f33ea0d737";
    private static final String PREFS_NAME = "capclair.native.update.v1";
    private static final String UPDATE_DIR = "capclair-updates";
    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";
    private static final long STALE_UNVERIFIED_MS = 24L * 60L * 60L * 1000L;
    private static final long STALE_VERIFIED_MS = 7L * 24L * 60L * 60L * 1000L;
    private static final int MAX_MANIFEST_BYTES = 512 * 1024;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        executor.execute(this::cleanupStaleDownload);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getInstalledInfo(PluginCall call) {
        executor.execute(() -> {
            try {
                call.resolve(installedInfo());
            } catch (Exception error) {
                reject(call, "installed_info_failed", "Lecture de la version installée impossible.", error);
            }
        });
    }

    @PluginMethod
    public void checkForUpdate(PluginCall call) {
        String manifestUrl = call.getString("manifestUrl", "");
        if (!isHttpsUrl(manifestUrl)) {
            call.reject("URL de mise à jour HTTPS invalide.", "invalid_manifest_url");
            return;
        }

        executor.execute(() -> {
            try {
                JSONObject manifest = fetchJson(manifestUrl);
                JSObject result = validateManifest(manifest);
                call.resolve(result);
            } catch (UpdateException error) {
                call.reject(error.getMessage(), error.code);
            } catch (Exception error) {
                reject(call, "update_check_failed", "Vérification de mise à jour impossible.", error);
            }
        });
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        executor.execute(() -> {
            try {
                call.resolve(readDownloadStatus(true));
            } catch (Exception error) {
                reject(call, "download_status_failed", "Lecture du téléchargement impossible.", error);
            }
        });
    }

    @PluginMethod
    public void startDownload(PluginCall call) {
        String url = call.getString("url", "");
        String fileName = sanitizeApkFileName(call.getString("fileName", "cap-clair-update.apk"));
        String sha256 = normalizeSha256(call.getString("sha256", ""));
        String expectedPackageName = call.getString("packageName", "");
        String expectedVersionName = call.getString("versionName", "");
        long expectedVersionCode = NativeBridgeNumbers.nonNegativeLong(
            call.getData().opt("versionCode"),
            0L
        );
        String expectedCertificate = normalizeSha256(call.getString("signingCertificateSha256", ""));

        if (!isHttpsUrl(url)) {
            call.reject("URL APK HTTPS invalide.", "invalid_apk_url");
            return;
        }
        if (!PACKAGE_NAME.equals(expectedPackageName)) {
            call.reject("Package de mise à jour incorrect.", "package_mismatch");
            return;
        }
        if (expectedVersionName == null || expectedVersionName.trim().isEmpty()) {
            call.reject("versionName de mise à jour invalide.", "invalid_version_name");
            return;
        }
        if (expectedVersionCode <= 0L) {
            call.reject("versionCode de mise à jour invalide.", "invalid_version_code");
            return;
        }
        if (!isSha256(sha256)) {
            call.reject("SHA-256 de mise à jour invalide.", "invalid_sha256");
            return;
        }
        if (!CERTIFICATE_SHA256.equals(expectedCertificate)) {
            call.reject("Certificat de mise à jour non reconnu.", "certificate_mismatch");
            return;
        }

        executor.execute(() -> {
            try {
                ensureUpdateActivityAllowed();
                long installedVersionCode = installedVersionCode();
                if (expectedVersionCode <= installedVersionCode) {
                    throw new UpdateException("version_not_newer", "La version proposée n'est pas plus récente que la version installée.");
                }

                clearCurrentDownload(true);
                File updateDirectory = updateDirectory();
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                    throw new UpdateException("directory_error", "Impossible de créer le dossier de mise à jour.");
                }
                File destination = new File(updateDirectory, fileName);
                if (destination.exists() && !destination.delete()) {
                    throw new UpdateException("cleanup_failed", "Impossible de supprimer l'ancien téléchargement.");
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle("Mise à jour CAP CLAIR " + expectedVersionName);
                request.setDescription("Téléchargement de " + fileName);
                request.setMimeType(APK_MIME_TYPE);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(true);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, UPDATE_DIR + "/" + fileName);

                DownloadManager manager = downloadManager();
                long downloadId = manager.enqueue(request);
                SharedPreferences.Editor editor = preferences().edit();
                editor.putLong("downloadId", downloadId);
                editor.putString("fileName", fileName);
                editor.putString("filePath", destination.getAbsolutePath());
                editor.putString("url", url);
                editor.putString("sha256", sha256);
                editor.putString("packageName", expectedPackageName);
                editor.putString("versionName", expectedVersionName);
                editor.putLong("versionCode", expectedVersionCode);
                editor.putString("certificateSha256", expectedCertificate);
                editor.putLong("startedAt", System.currentTimeMillis());
                editor.putBoolean("verified", false);
                editor.remove("verifiedAt");
                editor.apply();

                JSObject result = new JSObject();
                result.put("state", "downloading");
                result.put("downloadId", downloadId);
                result.put("fileName", fileName);
                result.put("versionName", expectedVersionName);
                result.put("versionCode", expectedVersionCode);
                call.resolve(result);
            } catch (UpdateException error) {
                call.reject(error.getMessage(), error.code);
            } catch (Exception error) {
                reject(call, "download_start_failed", "Démarrage du téléchargement impossible.", error);
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        executor.execute(() -> {
            try {
                clearCurrentDownload(true);
                JSObject result = new JSObject();
                result.put("cancelled", true);
                result.put("state", "idle");
                call.resolve(result);
            } catch (Exception error) {
                reject(call, "download_cancel_failed", "Annulation du téléchargement impossible.", error);
            }
        });
    }

    @PluginMethod
    public void verifyDownloadedApk(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureUpdateActivityAllowed();
                call.resolve(verifyCurrentApk());
            } catch (UpdateException error) {
                if (shouldDeleteDownloadedApk(error.code)) cleanupInvalidDownload();
                call.reject(error.getMessage(), error.code);
            } catch (Exception error) {
                cleanupInvalidDownload();
                reject(call, "verification_failed", "Vérification de l'APK impossible.", error);
            }
        });
    }

    @PluginMethod
    public void getInstallerPermission(PluginCall call) {
        JSObject result = new JSObject();
        boolean required = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O;
        boolean granted = !required || getContext().getPackageManager().canRequestPackageInstalls();
        result.put("required", required);
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallerPermissionSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                JSObject result = new JSObject();
                result.put("opened", false);
                result.put("granted", true);
                call.resolve(result);
                return;
            }
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("granted", false);
            call.resolve(result);
        } catch (Exception error) {
            reject(call, "permission_settings_failed", "Ouverture du réglage Android impossible.", error);
        }
    }

    @PluginMethod
    public void installDownloadedApk(PluginCall call) {
        executor.execute(() -> {
            try {
                ensureUpdateActivityAllowed();
                JSObject verified = verifyCurrentApk();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
                    throw new UpdateException("install_permission_required", "Autorisation Android d'installation requise.");
                }
                File apkFile = currentApkFile();
                if (apkFile == null || !apkFile.isFile()) {
                    throw new UpdateException("apk_missing", "APK vérifié introuvable.");
                }
                Uri contentUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    apkFile
                );
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(contentUri, APK_MIME_TYPE);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(intent);

                JSObject result = new JSObject();
                result.put("opened", true);
                result.put("versionName", verified.optString("versionName", ""));
                result.put("versionCode", verified.optLong("versionCode", 0L));
                call.resolve(result);
            } catch (UpdateException error) {
                call.reject(error.getMessage(), error.code);
            } catch (Exception error) {
                reject(call, "installer_open_failed", "Ouverture de l'installateur Android impossible.", error);
            }
        });
    }

    @PluginMethod
    public void cleanupDownloads(PluginCall call) {
        executor.execute(() -> {
            try {
                clearCurrentDownload(true);
                JSObject result = new JSObject();
                result.put("cleaned", true);
                call.resolve(result);
            } catch (Exception error) {
                reject(call, "cleanup_failed", "Nettoyage des téléchargements impossible.", error);
            }
        });
    }

    private JSObject validateManifest(JSONObject manifest) throws Exception {
        int schemaVersion = manifest.optInt("schemaVersion", 0);
        String platform = manifest.optString("platform", "");
        String packageName = manifest.optString("packageName", "");
        String versionName = manifest.optString("versionName", "");
        long versionCode = manifest.optLong("versionCode", 0L);
        int minimumAndroidSdk = manifest.optInt("minimumAndroidSdk", 0);
        String certificate = normalizeSha256(manifest.optString("signingCertificateSha256", ""));
        JSONObject apk = manifest.optJSONObject("apk");

        if (schemaVersion != 1) throw new UpdateException("unsupported_schema", "Format update.json non pris en charge.");
        if (!"android".equals(platform)) throw new UpdateException("platform_mismatch", "Cette mise à jour n'est pas destinée à Android.");
        if (!PACKAGE_NAME.equals(packageName)) throw new UpdateException("package_mismatch", "Le manifeste ne correspond pas à CAP CLAIR.");
        if (versionName.trim().isEmpty() || versionCode <= 0L) throw new UpdateException("invalid_version", "Version distante invalide.");
        if (minimumAndroidSdk > Build.VERSION.SDK_INT) throw new UpdateException("android_too_old", "Cette mise à jour nécessite une version Android plus récente.");
        if (!CERTIFICATE_SHA256.equals(certificate)) throw new UpdateException("certificate_mismatch", "Certificat distant non reconnu.");
        if (apk == null) throw new UpdateException("invalid_manifest", "Bloc APK absent de update.json.");

        String apkUrl = apk.optString("url", "");
        String fileName = sanitizeApkFileName(apk.optString("fileName", "cap-clair-update.apk"));
        String sha256 = normalizeSha256(apk.optString("sha256", ""));
        long sizeBytes = apk.optLong("sizeBytes", 0L);
        if (!isHttpsUrl(apkUrl)) throw new UpdateException("invalid_apk_url", "URL APK distante invalide.");
        if (!isSha256(sha256)) throw new UpdateException("invalid_sha256", "SHA-256 distant invalide.");

        JSObject installed = installedInfo();
        long installedCode = installed.optLong("versionCode", 0L);
        boolean available = versionCode > installedCode;
        long storedVersionCode = preferences().getLong("versionCode", 0L);
        if (available && storedVersionCode > installedCode && storedVersionCode < versionCode) {
            clearCurrentDownload(true);
        }

        JSObject result = new JSObject();
        result.put("available", available);
        result.put("reason", available ? "newer_version" : versionCode == installedCode ? "same_version" : "older_version");
        result.put("installedVersionName", installed.optString("versionName", ""));
        result.put("installedVersionCode", installedCode);
        result.put("packageName", packageName);
        result.put("versionName", versionName);
        result.put("versionCode", versionCode);
        result.put("publishedAt", manifest.optString("publishedAt", ""));
        result.put("releaseTag", manifest.optString("releaseTag", ""));
        result.put("channel", manifest.optString("channel", "dev"));
        result.put("minimumAndroidSdk", minimumAndroidSdk);
        result.put("signingCertificateSha256", certificate);
        result.put("fileName", fileName);
        result.put("apkUrl", apkUrl);
        result.put("apkSha256", sha256);
        result.put("apkSizeBytes", sizeBytes);
        JSONArray changelog = manifest.optJSONArray("changelog");
        result.put("changelog", changelog == null ? new JSONArray() : changelog);
        return result;
    }

    private JSObject installedInfo() throws Exception {
        PackageInfo info = installedPackageInfo();
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("packageName", info.packageName);
        result.put("versionName", info.versionName == null ? "" : info.versionName);
        result.put("versionCode", packageVersionCode(info));
        result.put("signingCertificateSha256", primaryCertificateDigest(info));
        result.put("androidSdk", Build.VERSION.SDK_INT);
        return result;
    }

    private JSObject readDownloadStatus(boolean cleanupFailed) throws Exception {
        SharedPreferences prefs = preferences();
        long downloadId = prefs.getLong("downloadId", -1L);
        boolean verified = prefs.getBoolean("verified", false);
        File apkFile = currentApkFile();

        if (downloadId < 0L) {
            JSObject result = new JSObject();
            boolean filePresent = apkFile != null && apkFile.isFile() && apkFile.length() > 0L;
            result.put("state", filePresent ? (verified ? "verified" : "downloaded") : "idle");
            result.put("verified", verified && filePresent);
            appendStoredMetadata(result);
            return result;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloadManager().query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                JSObject result = new JSObject();
                boolean filePresent = apkFile != null && apkFile.isFile() && apkFile.length() > 0L;
                if (filePresent) {
                    result.put("state", verified ? "verified" : "downloaded");
                    result.put("verified", verified);
                    appendStoredMetadata(result);
                    return result;
                }
                if (cleanupFailed) clearCurrentDownload(false);
                result.put("state", "missing");
                result.put("reason", "download_not_found");
                return result;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long downloadedBytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long totalBytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));

            JSObject result = new JSObject();
            result.put("downloadId", downloadId);
            result.put("downloadedBytes", Math.max(0L, downloadedBytes));
            result.put("totalBytes", Math.max(0L, totalBytes));
            result.put("progress", totalBytes > 0L ? Math.min(100, Math.round(downloadedBytes * 100f / totalBytes)) : 0);
            result.put("reason", reason);
            result.put("verified", verified);
            appendStoredMetadata(result);

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                result.put("state", verified ? "verified" : "downloaded");
                if (apkFile == null || !apkFile.isFile()) {
                    clearCurrentDownload(false);
                    result.put("state", "missing");
                    result.put("reason", "apk_missing");
                }
                return result;
            }
            if (status == DownloadManager.STATUS_FAILED) {
                result.put("state", "failed");
                if (cleanupFailed) clearCurrentDownload(true);
                return result;
            }
            if (status == DownloadManager.STATUS_PAUSED) result.put("state", "paused");
            else if (status == DownloadManager.STATUS_PENDING) result.put("state", "pending");
            else result.put("state", "downloading");
            return result;
        }
    }

    private JSObject verifyCurrentApk() throws Exception {
        notifyVerificationProgress("preparing", "Préparation de la vérification");
        JSObject downloadStatus = readDownloadStatus(false);
        String state = downloadStatus.optString("state", "idle");
        if (!("downloaded".equals(state) || "verified".equals(state))) {
            throw new UpdateException("download_incomplete", "Le téléchargement APK n'est pas terminé.");
        }

        SharedPreferences prefs = preferences();
        File apkFile = currentApkFile();
        if (apkFile == null || !apkFile.isFile() || apkFile.length() <= 0L) {
            throw new UpdateException("apk_missing", "Fichier APK téléchargé introuvable.");
        }

        notifyVerificationProgress("sha256", "Calcul du SHA-256");
        String expectedSha256 = normalizeSha256(prefs.getString("sha256", ""));
        String actualSha256 = sha256(apkFile);
        if (!expectedSha256.equals(actualSha256)) {
            throw new UpdateException("checksum_mismatch", "SHA-256 incorrect. Le téléchargement a été supprimé.");
        }

        notifyVerificationProgress("package", "Vérification du package CAP CLAIR");
        PackageInfo archiveInfo = archivePackageInfo(apkFile);
        if (archiveInfo == null) throw new UpdateException("apk_invalid", "APK Android illisible.");
        if (!PACKAGE_NAME.equals(archiveInfo.packageName)) {
            throw new UpdateException("package_mismatch", "L'APK ne correspond pas au package CAP CLAIR.");
        }

        notifyVerificationProgress("version", "Vérification de la version Android");
        long versionCode = packageVersionCode(archiveInfo);
        long expectedVersionCode = prefs.getLong("versionCode", 0L);
        long installedVersionCode = installedVersionCode();
        if (versionCode != expectedVersionCode) {
            throw new UpdateException("version_mismatch", "Le versionCode de l'APK ne correspond pas au manifeste.");
        }
        String expectedVersionName = prefs.getString("versionName", "");
        String actualVersionName = archiveInfo.versionName == null ? "" : archiveInfo.versionName;
        if (!expectedVersionName.equals(actualVersionName)) {
            throw new UpdateException("version_name_mismatch", "Le versionName de l'APK ne correspond pas au manifeste.");
        }
        if (versionCode <= installedVersionCode) {
            throw new UpdateException("version_not_newer", "L'APK n'est pas plus récent que la version installée.");
        }

        notifyVerificationProgress("signature", "Vérification de la signature Android");
        String certificate = primaryCertificateDigest(archiveInfo);
        String installedCertificate = primaryCertificateDigest(installedPackageInfo());
        if (!CERTIFICATE_SHA256.equals(certificate) || !installedCertificate.equals(certificate)) {
            throw new UpdateException("signature_mismatch", "La signature Android de l'APK ne correspond pas à CAP CLAIR.");
        }

        String expectedCertificate = normalizeSha256(prefs.getString("certificateSha256", ""));
        if (!certificate.equals(expectedCertificate)) {
            throw new UpdateException("signature_mismatch", "La signature Android ne correspond pas au manifeste.");
        }

        preferences().edit()
            .putBoolean("verified", true)
            .putLong("verifiedAt", System.currentTimeMillis())
            .apply();

        notifyVerificationProgress("complete", "APK vérifié et prêt à installer");
        JSObject result = new JSObject();
        result.put("state", "verified");
        result.put("verified", true);
        result.put("fileName", apkFile.getName());
        result.put("fileSizeBytes", apkFile.length());
        result.put("sha256", actualSha256);
        result.put("packageName", archiveInfo.packageName);
        result.put("versionName", archiveInfo.versionName == null ? "" : archiveInfo.versionName);
        result.put("versionCode", versionCode);
        result.put("signingCertificateSha256", certificate);
        return result;
    }


    private void notifyVerificationProgress(String step, String label) {
        JSObject event = new JSObject();
        event.put("step", step);
        event.put("label", label);
        notifyListeners("verificationProgress", event, true);
    }

    private boolean shouldDeleteDownloadedApk(String code) {
        return "checksum_mismatch".equals(code)
            || "package_mismatch".equals(code)
            || "version_mismatch".equals(code)
            || "version_not_newer".equals(code)
            || "version_name_mismatch".equals(code)
            || "signature_mismatch".equals(code)
            || "apk_invalid".equals(code)
            || "apk_missing".equals(code);
    }

    private void ensureUpdateActivityAllowed() throws UpdateException {
        JSObject status = NativeGpsStore.getStatus();
        if (status.optBoolean("running", false)) {
            throw new UpdateException("gps_active", "Mise à jour interdite pendant un enregistrement GPS.");
        }
        String sessionId = status.optString("sessionId", "");
        boolean saved = status.optBoolean("saved", false);
        boolean hasEndedAt = !status.isNull("endedAt");
        if (!sessionId.isEmpty() && hasEndedAt && !saved) {
            throw new UpdateException("trace_pending", "Mise à jour interdite pendant la finalisation ou la récupération d'une trace.");
        }
    }

    private JSONObject fetchJson(String address) throws Exception {
        URL current = new URL(address);
        for (int redirect = 0; redirect < 6; redirect += 1) {
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            connection.setConnectTimeout(12_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "CAP-CLAIR-Android-Updater");
            connection.setInstanceFollowRedirects(false);
            int code = connection.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) throw new Exception("Redirection GitHub sans destination.");
                current = new URL(current, location);
                if (!"https".equalsIgnoreCase(current.getProtocol())) throw new Exception("Redirection non HTTPS refusée.");
                continue;
            }
            if (code < 200 || code >= 300) {
                String message = readStream(connection.getErrorStream(), 32 * 1024);
                connection.disconnect();
                throw new Exception("HTTP " + code + (message.isEmpty() ? "" : " - " + message));
            }
            String content = readStream(connection.getInputStream(), MAX_MANIFEST_BYTES);
            connection.disconnect();
            return new JSONObject(content);
        }
        throw new Exception("Trop de redirections lors de la lecture de update.json.");
    }

    private String readStream(InputStream stream, int maxBytes) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        int total = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int count;
            while ((count = reader.read(buffer)) >= 0) {
                total += count;
                if (total > maxBytes) throw new Exception("Réponse distante trop volumineuse.");
                builder.append(buffer, 0, count);
            }
        }
        return builder.toString();
    }

    private PackageInfo installedPackageInfo() throws Exception {
        PackageManager manager = getContext().getPackageManager();
        if (Build.VERSION.SDK_INT >= 33) {
            return manager.getPackageInfo(getContext().getPackageName(), PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES));
        }
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return manager.getPackageInfo(getContext().getPackageName(), flags);
    }

    @SuppressWarnings("deprecation")
    private PackageInfo archivePackageInfo(File apkFile) {
        PackageManager manager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        if (Build.VERSION.SDK_INT >= 33) {
            return manager.getPackageArchiveInfo(apkFile.getAbsolutePath(), PackageManager.PackageInfoFlags.of(flags));
        }
        return manager.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
    }

    @SuppressWarnings("deprecation")
    private long packageVersionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private long installedVersionCode() throws Exception {
        return packageVersionCode(installedPackageInfo());
    }

    @SuppressWarnings("deprecation")
    private Signature[] signatures(PackageInfo info) throws UpdateException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) throw new UpdateException("signature_missing", "Signature Android absente.");
            return info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory();
        }
        if (info.signatures == null) throw new UpdateException("signature_missing", "Signature Android absente.");
        return info.signatures;
    }

    private String primaryCertificateDigest(PackageInfo info) throws Exception {
        Signature[] signatures = signatures(info);
        if (signatures.length == 0) throw new UpdateException("signature_missing", "Signature Android absente.");
        return sha256(signatures[0].toByteArray());
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) digest.update(buffer, 0, count);
        }
        return hex(digest.digest());
    }

    private String sha256(byte[] value) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return hex(digest.digest(value));
    }

    private String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) builder.append(String.format(Locale.US, "%02x", value));
        return builder.toString();
    }

    private void appendStoredMetadata(JSObject result) {
        SharedPreferences prefs = preferences();
        result.put("fileName", prefs.getString("fileName", ""));
        result.put("versionName", prefs.getString("versionName", ""));
        result.put("versionCode", prefs.getLong("versionCode", 0L));
        result.put("startedAt", prefs.getLong("startedAt", 0L));
        result.put("verifiedAt", prefs.getLong("verifiedAt", 0L));
    }

    private DownloadManager downloadManager() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private File updateDirectory() throws UpdateException {
        File downloads = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloads == null) {
            throw new UpdateException("storage_unavailable", "Stockage privé Android indisponible.");
        }
        return new File(downloads, UPDATE_DIR);
    }

    private File currentApkFile() {
        String path = preferences().getString("filePath", "");
        return path == null || path.isEmpty() ? null : new File(path);
    }

    private void clearCurrentDownload(boolean removeFromManager) {
        SharedPreferences prefs = preferences();
        long downloadId = prefs.getLong("downloadId", -1L);
        if (removeFromManager && downloadId >= 0L) {
            try {
                downloadManager().remove(downloadId);
            } catch (Exception ignored) {}
        }
        File apkFile = currentApkFile();
        if (apkFile != null && apkFile.exists()) apkFile.delete();
        prefs.edit().clear().apply();
    }

    private void cleanupInvalidDownload() {
        try {
            clearCurrentDownload(true);
        } catch (Exception ignored) {}
    }

    private void cleanupStaleDownload() {
        try {
            SharedPreferences prefs = preferences();
            long storedVersionCode = prefs.getLong("versionCode", 0L);
            if (storedVersionCode > 0L && storedVersionCode <= installedVersionCode()) {
                clearCurrentDownload(true);
                return;
            }
            long startedAt = prefs.getLong("startedAt", 0L);
            long verifiedAt = prefs.getLong("verifiedAt", 0L);
            boolean verified = prefs.getBoolean("verified", false);
            long reference = verified ? verifiedAt : startedAt;
            long maxAge = verified ? STALE_VERIFIED_MS : STALE_UNVERIFIED_MS;
            if (reference > 0L && System.currentTimeMillis() - reference > maxAge) {
                clearCurrentDownload(true);
                return;
            }
            JSObject status = readDownloadStatus(false);
            String state = status.optString("state", "idle");
            if ("failed".equals(state) || "missing".equals(state)) clearCurrentDownload(true);
        } catch (Exception ignored) {}
    }

    private String sanitizeApkFileName(String value) {
        String safe = value == null ? "cap-clair-update.apk" : value.trim();
        safe = safe.replaceAll("[^A-Za-z0-9._-]+", "-").replaceAll("-+", "-");
        if (!safe.toLowerCase(Locale.ROOT).endsWith(".apk")) safe += ".apk";
        if (safe.length() > 120) safe = safe.substring(0, 116) + ".apk";
        return safe.isEmpty() ? "cap-clair-update.apk" : safe;
    }

    private String normalizeSha256(String value) {
        return value == null ? "" : value.replace(":", "").trim().toLowerCase(Locale.ROOT);
    }

    private boolean isSha256(String value) {
        return value != null && value.matches("[0-9a-f]{64}");
    }

    private boolean isHttpsUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            return "https".equalsIgnoreCase(new URL(value).getProtocol());
        } catch (Exception ignored) {
            return false;
        }
    }

    private void reject(PluginCall call, String code, String prefix, Exception error) {
        String detail = error.getMessage() == null || error.getMessage().trim().isEmpty() ? "Erreur inconnue" : error.getMessage();
        call.reject(prefix + " " + detail, code, error);
    }

    private static final class UpdateException extends Exception {
        final String code;

        UpdateException(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}
