package fr.capclair.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import com.getcapacitor.JSObject;

public class NativeGpsForegroundService extends Service implements LocationListener {
    static final String ACTION_START = "fr.capclair.app.nativegps.START";
    static final String ACTION_STOP = "fr.capclair.app.nativegps.STOP";
    private static final String CHANNEL_ID = "capclair_gps_tracking";
    private static final int NOTIFICATION_ID = 1512;
    private static final long MIN_TIME_MS = 1000L;
    private static final float MIN_DISTANCE_M = 0f;
    private static final long HEARTBEAT_MS = 60_000L;
    private static final long LOCATION_GAP_EVENT_MS = 30_000L;

    private LocationManager locationManager;
    private boolean listening = false;
    private String activeProvider = "none";
    private Handler heartbeatHandler;
    private Runnable heartbeatRunnable;
    private long serviceCreatedAt = 0L;
    private long lastLocationAt = 0L;
    private long locationCallbackCount = 0L;

    @Override
    public void onCreate() {
        super.onCreate();
        NativeGpsStore.initialize(this);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        serviceCreatedAt = System.currentTimeMillis();
        heartbeatHandler = new Handler(Looper.getMainLooper());
        ensureNotificationChannel();
        JSObject details = new JSObject();
        details.put("serviceCreatedAt", serviceCreatedAt);
        NativeGpsStore.recordDiagnosticEvent("service_created", details);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        JSObject startDetails = new JSObject();
        startDetails.put("action", action);
        startDetails.put("flags", flags);
        startDetails.put("startId", startId);
        startDetails.put("serviceCreatedAt", serviceCreatedAt);
        NativeGpsStore.recordDiagnosticEvent("service_start_command", startDetails);
        if (ACTION_STOP.equals(action)) {
            stopTracking(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        NativeGpsStore.ensureActiveSession();
        startAsForeground();
        startTracking();
        startHeartbeat();
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        stopHeartbeat();
        JSObject details = serviceStateDetails();
        NativeGpsStore.recordDiagnosticEvent("service_destroyed", details);
        stopTracking(false);
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        NativeGpsStore.recordDiagnosticEvent("service_task_removed", serviceStateDetails());
        super.onTaskRemoved(rootIntent);
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void startTracking() {
        if (!hasLocationPermission()) {
            NativeGpsStore.setError("Permission GPS Android manquante.", activeProvider);
            stopSelf();
            return;
        }
        if (locationManager == null) {
            NativeGpsStore.setError("LocationManager Android indisponible.", "none");
            stopSelf();
            return;
        }
        switchToBestProvider();
    }

    private void switchToBestProvider() {
        if (locationManager == null) return;
        try {
            String bestProvider = chooseBestProvider();
            if (bestProvider == null) {
                removeLocationUpdates();
                activeProvider = "none";
                NativeGpsStore.recordDiagnosticEvent("provider_unavailable", serviceStateDetails());
                NativeGpsStore.setError("Aucun provider GPS Android actif.", activeProvider);
                return;
            }

            if (listening && bestProvider.equals(activeProvider)) {
                NativeGpsStore.setRunning(true, activeProvider);
                return;
            }

            removeLocationUpdates();
            activeProvider = bestProvider;
            locationManager.requestLocationUpdates(activeProvider, MIN_TIME_MS, MIN_DISTANCE_M, this, Looper.getMainLooper());
            listening = true;
            NativeGpsStore.recordDiagnosticEvent("provider_listening", serviceStateDetails());
            NativeGpsStore.setRunning(true, activeProvider);
        } catch (SecurityException error) {
            NativeGpsStore.setError("Permission GPS Android refusée.", activeProvider);
        } catch (RuntimeException error) {
            NativeGpsStore.setError(error.getMessage() == null ? "Erreur GPS Android." : error.getMessage(), activeProvider);
        }
    }

    private String chooseBestProvider() {
        boolean gpsEnabled = false;
        boolean networkEnabled = false;
        try {
            gpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
            networkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {}
        if (gpsEnabled) return LocationManager.GPS_PROVIDER;
        if (networkEnabled) return LocationManager.NETWORK_PROVIDER;
        return null;
    }

    private void removeLocationUpdates() {
        if (locationManager != null && listening) {
            try { locationManager.removeUpdates(this); } catch (SecurityException ignored) {}
        }
        listening = false;
    }

    private void stopTracking(boolean finishSession) {
        stopHeartbeat();
        removeLocationUpdates();
        if (finishSession) NativeGpsStore.finishCurrentSession();
        NativeGpsStore.setRunning(false, activeProvider);
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onLocationChanged(Location location) {
        long now = System.currentTimeMillis();
        long previousLocationAt = lastLocationAt;
        lastLocationAt = now;
        locationCallbackCount += 1L;
        if (locationCallbackCount == 1L) {
            JSObject details = serviceStateDetails();
            details.put("locationTimestamp", location.getTime());
            NativeGpsStore.recordDiagnosticEvent("first_location", details);
        } else if (previousLocationAt > 0L && now - previousLocationAt > LOCATION_GAP_EVENT_MS) {
            JSObject details = serviceStateDetails();
            details.put("gapMs", now - previousLocationAt);
            details.put("previousLocationAt", previousLocationAt);
            details.put("locationTimestamp", location.getTime());
            NativeGpsStore.recordDiagnosticEvent("location_resumed_after_gap", details);
        }
        NativeGpsStore.addPoint(toPoint(location));
    }

    @Override
    public void onProviderDisabled(String provider) {
        JSObject details = serviceStateDetails();
        details.put("changedProvider", provider);
        NativeGpsStore.recordDiagnosticEvent("provider_disabled", details);
        switchToBestProvider();
    }

    @Override
    public void onProviderEnabled(String provider) {
        JSObject details = serviceStateDetails();
        details.put("changedProvider", provider);
        NativeGpsStore.recordDiagnosticEvent("provider_enabled", details);
        // GPS always has priority over network when it becomes available.
        switchToBestProvider();
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private void startHeartbeat() {
        if (heartbeatHandler == null) heartbeatHandler = new Handler(Looper.getMainLooper());
        stopHeartbeat();
        heartbeatRunnable = new Runnable() {
            @Override public void run() {
                NativeGpsStore.recordDiagnosticEvent("service_heartbeat", serviceStateDetails());
                if (heartbeatHandler != null) heartbeatHandler.postDelayed(this, HEARTBEAT_MS);
            }
        };
        heartbeatHandler.post(heartbeatRunnable);
    }

    private void stopHeartbeat() {
        if (heartbeatHandler != null && heartbeatRunnable != null) heartbeatHandler.removeCallbacks(heartbeatRunnable);
        heartbeatRunnable = null;
    }

    private JSObject serviceStateDetails() {
        JSObject details = new JSObject();
        details.put("provider", activeProvider);
        details.put("listening", listening);
        details.put("lastLocationAt", lastLocationAt > 0L ? lastLocationAt : null);
        details.put("locationCallbackCount", locationCallbackCount);
        details.put("serviceCreatedAt", serviceCreatedAt);
        if (locationManager != null) {
            try {
                details.put("gpsEnabled", locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER));
                details.put("networkEnabled", locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            } catch (RuntimeException ignored) {}
        }
        return details;
    }

    private JSObject toPoint(Location location) {
        JSObject point = new JSObject();
        point.put("latitude", location.getLatitude());
        point.put("longitude", location.getLongitude());
        point.put("altitude", location.hasAltitude() ? location.getAltitude() : null);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()) {
            point.put("altitudeAccuracy", location.getVerticalAccuracyMeters());
        } else {
            point.put("altitudeAccuracy", null);
        }
        point.put("vitesse", location.hasSpeed() ? location.getSpeed() * 1.94384 : null);
        point.put("track", location.hasBearing() ? location.getBearing() : null);
        point.put("timestamp", location.getTime() > 0 ? location.getTime() : System.currentTimeMillis());
        point.put("precision", location.hasAccuracy() ? location.getAccuracy() : null);
        point.put("provider", location.getProvider());
        point.put("native", true);
        return point;
    }

    private void startAsForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Intent stopIntent = new Intent(this, NativeGpsForegroundService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 1, stopIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setContentTitle("CAP CLAIR - suivi GPS actif")
            .setContentText("Journal GPS natif sécurisé en cours")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Arrêter", stopPendingIntent)
            .build();
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Suivi GPS CAP CLAIR", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Notification persistante pendant le suivi GPS natif.");
        manager.createNotificationChannel(channel);
    }
}
