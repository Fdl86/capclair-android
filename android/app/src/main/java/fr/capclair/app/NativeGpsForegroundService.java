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
import android.location.GnssStatus;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import com.getcapacitor.JSObject;
import java.util.concurrent.Executor;

public class NativeGpsForegroundService extends Service {
    static final String ACTION_START = "fr.capclair.app.nativegps.START";
    static final String ACTION_STOP = "fr.capclair.app.nativegps.STOP";
    private static final String CHANNEL_ID = "capclair_gps_tracking";
    private static final int NOTIFICATION_ID = 1512;
    private static final long MIN_TIME_MS = 1000L;
    private static final float MIN_DISTANCE_M = 0f;
    private static final long HEARTBEAT_MS = 60_000L;
    private static final long WATCHDOG_INTERVAL_MS = 5_000L;
    private static final long LOCATION_GAP_EVENT_MS = 30_000L;
    private static final long PROBE_TIMEOUT_MS = 8_000L;
    private static final long MAX_PROBE_LOCATION_AGE_MS = 15_000L;

    private LocationManager locationManager;
    private HandlerThread locationThread;
    private Looper locationLooper;
    private Handler locationHandler;
    private Handler heartbeatHandler;
    private Runnable heartbeatRunnable;
    private int heartbeatGeneration = 0;

    private LocationListener activeLocationListener;
    private int listenerGeneration = 0;
    private boolean listening = false;
    private String activeProvider = "none";

    private CancellationSignal currentLocationCancellation;
    private LocationListener legacyProbeListener;
    private Runnable probeTimeoutRunnable;
    private boolean probeActive = false;
    private int probeGeneration = 0;

    private GnssStatus.Callback gnssStatusCallback;
    private int satelliteCount = 0;
    private int satellitesUsedInFix = 0;
    private long lastGnssStatusAt = 0L;

    private long serviceCreatedAt = 0L;
    private long locationCallbackCount = 0L;
    private long continuousLocationCallbackCount = 0L;
    private long probeLocationCallbackCount = 0L;
    private long lastHeartbeatWrittenAt = 0L;
    private final GpsRecoveryState gpsRecoveryState = new GpsRecoveryState();
    private int softRecoveryCount = 0;
    private int hardRecoveryCount = 0;
    private int runtimeRecoveryCount = 0;
    private int consecutiveRuntimeRecoveryCount = 0;
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        NativeGpsStore.initialize(this);
        serviceCreatedAt = System.currentTimeMillis();
        ensureNotificationChannel();
        createLocationRuntime("service_create");
        NativeGpsStore.recordDiagnosticEvent("service_created", serviceStateDetails());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        JSObject startDetails = serviceStateDetails();
        startDetails.put("action", action);
        startDetails.put("flags", flags);
        startDetails.put("startId", startId);
        NativeGpsStore.recordDiagnosticEvent("service_start_command", startDetails);

        if (ACTION_STOP.equals(action)) {
            stopTracking(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        NativeGpsStore.ensureActiveSession();
        startAsForeground();
        acquireCpuWakeLock();
        startTracking();
        startHeartbeat();
        return START_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        stopHeartbeat();
        NativeGpsStore.recordDiagnosticEvent("service_destroyed", serviceStateDetails());
        stopTracking(false);
        destroyLocationRuntime();
        releaseCpuWakeLock();
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

    private void createLocationRuntime(String reason) {
        satelliteCount = 0;
        satellitesUsedInFix = 0;
        lastGnssStatusAt = 0L;
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        locationThread = new HandlerThread("CapClairGpsLocation-" + System.currentTimeMillis());
        locationThread.start();
        locationLooper = locationThread.getLooper();
        locationHandler = new Handler(locationLooper);
        heartbeatHandler = locationHandler;
        registerGnssStatusCallback();
        JSObject details = serviceStateDetails();
        details.put("reason", reason);
        NativeGpsStore.recordDiagnosticEvent("location_runtime_created", details);
    }

    private void destroyLocationRuntime() {
        cancelImmediateProbe();
        removeLocationUpdates();
        unregisterGnssStatusCallback();
        HandlerThread thread = locationThread;
        locationThread = null;
        locationLooper = null;
        locationHandler = null;
        heartbeatHandler = null;
        locationManager = null;
        if (thread != null) thread.quitSafely();
    }

    private void startTracking() {
        if (!hasLocationPermission()) {
            NativeGpsStore.setError("Permission GPS Android manquante.", activeProvider);
            stopSelf();
            return;
        }
        if (locationManager == null || locationThread == null || !locationThread.isAlive()) {
            destroyLocationRuntime();
            createLocationRuntime("tracking_runtime_missing");
        }
        switchToBestProvider(true, "tracking_start");
    }

    private void switchToBestProvider(boolean force, String reason) {
        if (locationManager == null || locationLooper == null) return;
        try {
            String bestProvider = chooseBestProvider();
            if (bestProvider == null) {
                removeLocationUpdates();
                activeProvider = "none";
                JSObject details = serviceStateDetails();
                details.put("reason", reason);
                NativeGpsStore.recordDiagnosticEvent("provider_unavailable", details);
                NativeGpsStore.setError("Aucun provider GPS Android actif.", activeProvider);
                return;
            }

            if (!force && listening && bestProvider.equals(activeProvider)) {
                NativeGpsStore.setRunning(true, activeProvider);
                return;
            }

            removeLocationUpdates();
            activeProvider = bestProvider;
            final int generation = ++listenerGeneration;
            activeLocationListener = new LocationListener() {
                @Override public void onLocationChanged(Location location) {
                    if (generation != listenerGeneration) return;
                    handleLocationChanged(location, "continuous");
                }
                @Override public void onProviderDisabled(String provider) {
                    if (generation != listenerGeneration) return;
                    handleProviderDisabled(provider);
                }
                @Override public void onProviderEnabled(String provider) {
                    if (generation != listenerGeneration) return;
                    handleProviderEnabled(provider);
                }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            };
            locationManager.requestLocationUpdates(
                activeProvider,
                MIN_TIME_MS,
                MIN_DISTANCE_M,
                activeLocationListener,
                locationLooper
            );
            listening = true;
            JSObject details = serviceStateDetails();
            details.put("reason", reason);
            details.put("listenerGeneration", generation);
            NativeGpsStore.recordDiagnosticEvent("provider_listening", details);
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
            gpsEnabled = locationManager != null && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
            networkEnabled = locationManager != null && locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (RuntimeException ignored) {}
        if (gpsEnabled) return LocationManager.GPS_PROVIDER;
        if (networkEnabled) return LocationManager.NETWORK_PROVIDER;
        return null;
    }

    private void removeLocationUpdates() {
        listenerGeneration += 1;
        if (locationManager != null && activeLocationListener != null) {
            try { locationManager.removeUpdates(activeLocationListener); }
            catch (RuntimeException ignored) {}
        }
        activeLocationListener = null;
        listening = false;
    }

    private void stopTracking(boolean finishSession) {
        stopHeartbeat();
        cancelImmediateProbe();
        removeLocationUpdates();
        unregisterGnssStatusCallback();
        if (finishSession) NativeGpsStore.finishCurrentSession();
        NativeGpsStore.setRunning(false, activeProvider);
        releaseCpuWakeLock();
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    private void handleLocationChanged(Location location, String source) {
        if (location == null) return;
        long now = System.currentTimeMillis();
        long previousAnyLocationAt = gpsRecoveryState.getLastAnyLocationAt();
        boolean continuous = "continuous".equals(source);
        boolean streamRestored = continuous
            ? gpsRecoveryState.onContinuousLocation(now)
            : false;
        if (!continuous) gpsRecoveryState.onProbeLocation(now);

        locationCallbackCount += 1L;
        if (continuous) continuousLocationCallbackCount += 1L;
        else probeLocationCallbackCount += 1L;

        // A delivered callback completes the current one-shot request. A probe
        // never resets recovery. A continuous callback only restores the stream
        // after the state machine has observed three tightly-spaced fixes.
        cancelImmediateProbe();

        if (locationCallbackCount == 1L) {
            JSObject details = serviceStateDetails();
            details.put("locationTimestamp", location.getTime());
            details.put("source", source);
            NativeGpsStore.recordDiagnosticEvent("first_location", details);
        } else if (
            previousAnyLocationAt > 0L
            && now - previousAnyLocationAt > LOCATION_GAP_EVENT_MS
        ) {
            JSObject details = serviceStateDetails();
            details.put("gapMs", now - previousAnyLocationAt);
            details.put("previousLocationAt", previousAnyLocationAt);
            details.put("locationTimestamp", location.getTime());
            details.put("source", source);
            NativeGpsStore.recordDiagnosticEvent("location_resumed_after_gap", details);
        }

        if (streamRestored) {
            consecutiveRuntimeRecoveryCount = 0;
            JSObject details = serviceStateDetails();
            details.put("locationTimestamp", location.getTime());
            details.put("source", source);
            NativeGpsStore.recordDiagnosticEvent("continuous_location_stream_restored", details);
        } else if (continuous && gpsRecoveryState.isRecovering()) {
            JSObject details = serviceStateDetails();
            details.put("locationTimestamp", location.getTime());
            details.put("source", source);
            NativeGpsStore.recordDiagnosticEvent("continuous_location_recovery_progress", details);
        }

        NativeGpsStore.addPoint(toPoint(location, source));
    }

    private void handleProviderDisabled(String provider) {
        JSObject details = serviceStateDetails();
        details.put("changedProvider", provider);
        NativeGpsStore.recordDiagnosticEvent("provider_disabled", details);
        switchToBestProvider(true, "provider_disabled");
    }

    private void handleProviderEnabled(String provider) {
        JSObject details = serviceStateDetails();
        details.put("changedProvider", provider);
        NativeGpsStore.recordDiagnosticEvent("provider_enabled", details);
        switchToBestProvider(true, "provider_enabled");
    }

    private void startHeartbeat() {
        stopHeartbeat();
        if (heartbeatHandler == null) return;
        final int generation = ++heartbeatGeneration;
        lastHeartbeatWrittenAt = 0L;
        heartbeatRunnable = new Runnable() {
            @Override public void run() {
                if (generation != heartbeatGeneration) return;
                long now = System.currentTimeMillis();
                if (lastHeartbeatWrittenAt == 0L || now - lastHeartbeatWrittenAt >= HEARTBEAT_MS) {
                    NativeGpsStore.recordDiagnosticEvent("service_heartbeat", serviceStateDetails());
                    lastHeartbeatWrittenAt = now;
                }
                runLocationWatchdog(now);
                if (generation == heartbeatGeneration && heartbeatHandler != null) {
                    heartbeatHandler.postDelayed(this, WATCHDOG_INTERVAL_MS);
                }
            }
        };
        heartbeatHandler.post(heartbeatRunnable);
    }

    private void stopHeartbeat() {
        heartbeatGeneration += 1;
        Handler handler = heartbeatHandler;
        Runnable runnable = heartbeatRunnable;
        if (handler != null && runnable != null) handler.removeCallbacks(runnable);
        heartbeatRunnable = null;
    }

    private void runLocationWatchdog(long now) {
        if (locationManager == null) return;
        GpsRecoveryState.Decision decision = gpsRecoveryState.evaluate(
            now,
            serviceCreatedAt,
            probeActive,
            consecutiveRuntimeRecoveryCount
        );

        if (decision.enteredDegraded) {
            JSObject details = serviceStateDetails();
            details.put("staleForMs", decision.staleForMs);
            NativeGpsStore.recordDiagnosticEvent("continuous_location_stream_degraded", details);
        }

        if (decision.action == GpsRecoveryState.RecoveryAction.SOFT) {
            softRecoveryCount += 1;
            performSoftRecovery(decision.staleForMs);
            return;
        }
        if (decision.action == GpsRecoveryState.RecoveryAction.HARD) {
            hardRecoveryCount += 1;
            performHardRecovery(decision.staleForMs);
            return;
        }
        if (decision.action == GpsRecoveryState.RecoveryAction.RUNTIME) {
            runtimeRecoveryCount += 1;
            consecutiveRuntimeRecoveryCount += 1;
            performRuntimeRecovery(decision.staleForMs);
            return;
        }

        if (decision.requestProbe) {
            requestImmediateGpsProbe("watchdog_fallback");
        }
    }

    private void performSoftRecovery(long staleForMs) {
        JSObject details = serviceStateDetails();
        details.put("staleForMs", staleForMs);
        details.put("recoveryStage", "soft");
        NativeGpsStore.recordDiagnosticEvent("location_watchdog_soft_recovery", details);
        switchToBestProvider(true, "watchdog_soft");
        requestImmediateGpsProbe("watchdog_soft");
    }

    private void performHardRecovery(long staleForMs) {
        JSObject before = serviceStateDetails();
        before.put("staleForMs", staleForMs);
        before.put("recoveryStage", "hard");
        NativeGpsStore.recordDiagnosticEvent("location_watchdog_hard_recovery", before);

        stopHeartbeat();
        destroyLocationRuntime();
        createLocationRuntime("watchdog_hard");
        switchToBestProvider(true, "watchdog_hard");
        requestImmediateGpsProbe("watchdog_hard");
        startHeartbeat();
    }

    private void performRuntimeRecovery(long staleForMs) {
        JSObject details = serviceStateDetails();
        details.put("staleForMs", staleForMs);
        details.put("recoveryStage", "runtime");
        NativeGpsStore.recordDiagnosticEvent("location_watchdog_runtime_recovery", details);

        // Full in-place service runtime recycle. Keeping the same foreground
        // service and native session avoids Android background-start restrictions
        // while rebuilding every GNSS component that can become wedged on OEM ROMs.
        stopHeartbeat();
        releaseCpuWakeLock();
        destroyLocationRuntime();
        createLocationRuntime("watchdog_runtime");
        startAsForeground();
        acquireCpuWakeLock();
        switchToBestProvider(true, "watchdog_runtime");
        requestImmediateGpsProbe("watchdog_runtime");
        startHeartbeat();
    }

    private void requestImmediateGpsProbe(String reason) {
        cancelImmediateProbe();
        if (!hasLocationPermission() || locationManager == null || locationHandler == null) return;
        String provider = chooseBestProvider();
        if (provider == null) return;
        final int generation = ++probeGeneration;
        probeActive = true;
        gpsRecoveryState.markProbeRequested(System.currentTimeMillis());
        JSObject details = serviceStateDetails();
        details.put("reason", reason);
        details.put("probeProvider", provider);
        NativeGpsStore.recordDiagnosticEvent("location_probe_requested", details);

        probeTimeoutRunnable = () -> {
            if (!probeActive || generation != probeGeneration) return;
            JSObject timeoutDetails = serviceStateDetails();
            timeoutDetails.put("reason", reason);
            NativeGpsStore.recordDiagnosticEvent("location_probe_timeout", timeoutDetails);
            cancelImmediateProbe();
        };
        locationHandler.postDelayed(probeTimeoutRunnable, PROBE_TIMEOUT_MS);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                currentLocationCancellation = new CancellationSignal();
                Executor executor = command -> {
                    Handler handler = locationHandler;
                    if (handler != null) handler.post(command);
                };
                locationManager.getCurrentLocation(provider, currentLocationCancellation, executor, location -> {
                    if (!probeActive || generation != probeGeneration || location == null) return;
                    if (!isFreshProbeLocation(location)) {
                        JSObject staleDetails = serviceStateDetails();
                        staleDetails.put("reason", reason);
                        staleDetails.put("locationAgeMs", Math.abs(System.currentTimeMillis() - location.getTime()));
                        NativeGpsStore.recordDiagnosticEvent("location_probe_stale", staleDetails);
                        cancelImmediateProbe();
                        return;
                    }
                    JSObject probeDetails = serviceStateDetails();
                    probeDetails.put("reason", reason);
                    NativeGpsStore.recordDiagnosticEvent("location_probe_succeeded", probeDetails);
                    handleLocationChanged(location, "probe");
                });
            } else {
                legacyProbeListener = new LocationListener() {
                    @Override public void onLocationChanged(Location location) {
                        if (!probeActive || generation != probeGeneration) return;
                        if (!isFreshProbeLocation(location)) {
                            JSObject staleDetails = serviceStateDetails();
                            staleDetails.put("reason", reason);
                            staleDetails.put("locationAgeMs", Math.abs(System.currentTimeMillis() - location.getTime()));
                            NativeGpsStore.recordDiagnosticEvent("location_probe_stale", staleDetails);
                            cancelImmediateProbe();
                            return;
                        }
                        JSObject probeDetails = serviceStateDetails();
                        probeDetails.put("reason", reason);
                        NativeGpsStore.recordDiagnosticEvent("location_probe_succeeded", probeDetails);
                        handleLocationChanged(location, "probe");
                    }
                    @Override public void onProviderDisabled(String provider) {}
                    @Override public void onProviderEnabled(String provider) {}
                    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                };
                locationManager.requestSingleUpdate(provider, legacyProbeListener, locationLooper);
            }
        } catch (SecurityException error) {
            cancelImmediateProbe();
            NativeGpsStore.setError("Permission GPS Android refusée pendant la récupération.", activeProvider);
        } catch (RuntimeException error) {
            JSObject errorDetails = serviceStateDetails();
            errorDetails.put("reason", reason);
            errorDetails.put("message", error.getMessage());
            NativeGpsStore.recordDiagnosticEvent("location_probe_failed", errorDetails);
            cancelImmediateProbe();
        }
    }

    private boolean isFreshProbeLocation(Location location) {
        if (location == null) return false;
        long locationTime = location.getTime();
        if (locationTime <= 0L) return true;
        return Math.abs(System.currentTimeMillis() - locationTime) <= MAX_PROBE_LOCATION_AGE_MS;
    }

    private void cancelImmediateProbe() {
        probeGeneration += 1;
        probeActive = false;
        if (locationHandler != null && probeTimeoutRunnable != null) {
            locationHandler.removeCallbacks(probeTimeoutRunnable);
        }
        probeTimeoutRunnable = null;
        if (currentLocationCancellation != null) {
            try { currentLocationCancellation.cancel(); } catch (RuntimeException ignored) {}
        }
        currentLocationCancellation = null;
        if (locationManager != null && legacyProbeListener != null) {
            try { locationManager.removeUpdates(legacyProbeListener); }
            catch (RuntimeException ignored) {}
        }
        legacyProbeListener = null;
    }

    private void registerGnssStatusCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || locationManager == null || locationHandler == null) return;
        gnssStatusCallback = new GnssStatus.Callback() {
            @Override public void onStarted() {
                NativeGpsStore.recordDiagnosticEvent("gnss_started", serviceStateDetails());
            }
            @Override public void onStopped() {
                NativeGpsStore.recordDiagnosticEvent("gnss_stopped", serviceStateDetails());
            }
            @Override public void onFirstFix(int ttffMillis) {
                JSObject details = serviceStateDetails();
                details.put("ttffMillis", ttffMillis);
                NativeGpsStore.recordDiagnosticEvent("gnss_first_fix", details);
            }
            @Override public void onSatelliteStatusChanged(GnssStatus status) {
                int total = status == null ? 0 : status.getSatelliteCount();
                int used = 0;
                if (status != null) {
                    for (int index = 0; index < total; index += 1) {
                        if (status.usedInFix(index)) used += 1;
                    }
                }
                satelliteCount = total;
                satellitesUsedInFix = used;
                lastGnssStatusAt = System.currentTimeMillis();
            }
        };
        try {
            locationManager.registerGnssStatusCallback(gnssStatusCallback, locationHandler);
        } catch (RuntimeException error) {
            gnssStatusCallback = null;
        }
    }

    private void unregisterGnssStatusCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || locationManager == null || gnssStatusCallback == null) return;
        try { locationManager.unregisterGnssStatusCallback(gnssStatusCallback); }
        catch (RuntimeException ignored) {}
        gnssStatusCallback = null;
    }

    private void acquireCpuWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) return;
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CapClair:NativeGpsTracking");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
        NativeGpsStore.recordDiagnosticEvent("cpu_wake_lock_acquired", serviceStateDetails());
    }

    private void releaseCpuWakeLock() {
        if (wakeLock == null) return;
        try {
            if (wakeLock.isHeld()) wakeLock.release();
        } catch (RuntimeException ignored) {}
        wakeLock = null;
    }

    private JSObject serviceStateDetails() {
        JSObject details = new JSObject();
        details.put("provider", activeProvider);
        details.put("listening", listening);
        details.put(
            "lastLocationAt",
            gpsRecoveryState.getLastAnyLocationAt() > 0L
                ? gpsRecoveryState.getLastAnyLocationAt()
                : null
        );
        details.put(
            "lastAnyLocationAt",
            gpsRecoveryState.getLastAnyLocationAt() > 0L
                ? gpsRecoveryState.getLastAnyLocationAt()
                : null
        );
        details.put(
            "lastContinuousLocationAt",
            gpsRecoveryState.getLastContinuousLocationAt() > 0L
                ? gpsRecoveryState.getLastContinuousLocationAt()
                : null
        );
        details.put(
            "lastProbeLocationAt",
            gpsRecoveryState.getLastProbeLocationAt() > 0L
                ? gpsRecoveryState.getLastProbeLocationAt()
                : null
        );
        details.put(
            "lastConfirmedContinuousAt",
            gpsRecoveryState.getLastConfirmedContinuousAt() > 0L
                ? gpsRecoveryState.getLastConfirmedContinuousAt()
                : null
        );
        details.put(
            "recoveryStartedAt",
            gpsRecoveryState.getRecoveryStartedAt() > 0L
                ? gpsRecoveryState.getRecoveryStartedAt()
                : null
        );
        details.put("locationCallbackCount", locationCallbackCount);
        details.put("continuousLocationCallbackCount", continuousLocationCallbackCount);
        details.put("probeLocationCallbackCount", probeLocationCallbackCount);
        details.put("serviceCreatedAt", serviceCreatedAt);
        details.put("continuousStreamHealthy", gpsRecoveryState.isContinuousStreamHealthy());
        details.put("continuousRecoveryStreak", gpsRecoveryState.getContinuousRecoveryStreak());
        details.put("recoveryStage", gpsRecoveryState.getRecoveryStage());
        details.put("softRecoveryCount", softRecoveryCount);
        details.put("hardRecoveryCount", hardRecoveryCount);
        details.put("runtimeRecoveryCount", runtimeRecoveryCount);
        details.put("consecutiveRuntimeRecoveryCount", consecutiveRuntimeRecoveryCount);
        details.put("probeActive", probeActive);
        details.put("probeGeneration", probeGeneration);
        details.put("satelliteCount", satelliteCount);
        details.put("satellitesUsedInFix", satellitesUsedInFix);
        details.put("lastGnssStatusAt", lastGnssStatusAt > 0L ? lastGnssStatusAt : null);
        details.put("wakeLockHeld", wakeLock != null && wakeLock.isHeld());
        details.put("dedicatedLocationThread", locationThread != null && locationThread.isAlive());
        details.put("listenerGeneration", listenerGeneration);
        if (locationManager != null) {
            try {
                details.put("gpsEnabled", locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER));
                details.put("networkEnabled", locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            } catch (RuntimeException ignored) {}
        }
        return details;
    }

    private JSObject toPoint(Location location, String source) {
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
        point.put("locationSource", source);
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
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent stopIntent = new Intent(this, NativeGpsForegroundService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

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
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Suivi GPS CAP CLAIR",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Notification persistante pendant le suivi GPS natif.");
        manager.createNotificationChannel(channel);
    }
}
