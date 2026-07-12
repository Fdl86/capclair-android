package fr.capclair.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;

@CapacitorPlugin(
    name = "NativeGps",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeGpsPlugin extends Plugin {
    private PluginCall pendingStartCall;
    private PluginCall pendingPositionCall;
    private LocationManager oneShotLocationManager;
    private LocationListener oneShotLocationListener;
    private Handler oneShotHandler;
    private Runnable oneShotTimeout;

    @Override
    public void load() {
        NativeGpsStore.initialize(getContext());
        NativeGpsStore.setEventSink(new NativeGpsStore.EventSink() {
            @Override public void onPoint(JSObject point) { notifyListeners("nativeGpsPoint", point); }
            @Override public void onStatus(JSObject status) { notifyListeners("nativeGpsStatus", status); }
        });
    }

    @PluginMethod
    public void start(PluginCall call) {
        pendingStartCall = call;
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermissionCallback");
            return;
        }
        requestNotificationThenStart(call);
    }

    @PermissionCallback
    public void locationPermissionCallback(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            pendingStartCall = null;
            call.reject("Permission GPS Android refusée.", "denied");
            return;
        }
        requestNotificationThenStart(call);
    }

    @PermissionCallback
    public void notificationPermissionCallback(PluginCall call) {
        startService(call);
    }


    @PluginMethod
    public void getCurrentPosition(PluginCall call) {
        if (pendingPositionCall != null) {
            call.reject("Une localisation GPS ponctuelle est déjà en cours.", "busy");
            return;
        }
        pendingPositionCall = call;
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "currentPositionPermissionCallback");
            return;
        }
        startOneShotLocation(call);
    }

    @PermissionCallback
    public void currentPositionPermissionCallback(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            pendingPositionCall = null;
            call.reject("Permission GPS Android refusée.", "denied");
            return;
        }
        startOneShotLocation(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), NativeGpsForegroundService.class);
        intent.setAction(NativeGpsForegroundService.ACTION_STOP);
        NativeGpsStore.finishCurrentSession();
        getContext().startService(intent);
        JSObject result = NativeGpsStore.getStatus();
        result.put("stopped", true);
        result.put("points", NativeGpsStore.getAllCurrentPoints());
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(NativeGpsStore.getStatus());
    }

    @PluginMethod
    public void getPointsSince(PluginCall call) {
        Long since = call.getLong("sinceTimestamp", 0L);
        JSONArray points = NativeGpsStore.getPointsSince(since == null ? 0L : since);
        JSObject result = NativeGpsStore.getStatus();
        result.put("points", points);
        call.resolve(result);
    }

    @PluginMethod
    public void getRecoverableSessions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("sessions", NativeGpsStore.getRecoverableSessions());
        call.resolve(result);
    }

    @PluginMethod
    public void markSessionSaved(PluginCall call) {
        String sessionId = call.getString("sessionId", "");
        String traceId = call.getString("traceId", "");
        boolean saved = NativeGpsStore.markSessionSaved(sessionId, traceId);
        JSObject result = new JSObject();
        result.put("saved", saved);
        call.resolve(result);
    }


    @PluginMethod
    public void deleteSession(PluginCall call) {
        String sessionId = call.getString("sessionId", "");
        boolean deleted = NativeGpsStore.markSessionDeleted(sessionId);
        JSObject result = new JSObject();
        result.put("deleted", deleted);
        call.resolve(result);
    }


    private void startOneShotLocation(PluginCall call) {
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            rejectOneShot(call, "LocationManager Android indisponible.", "unavailable");
            return;
        }

        String provider = chooseOneShotProvider(manager);
        if (provider == null) {
            rejectOneShot(call, "Aucun provider GPS Android actif.", "unavailable");
            return;
        }

        Long requestedTimeout = call.getLong("timeoutMs", 12000L);
        long timeoutMs = requestedTimeout == null ? 12000L : Math.max(3000L, Math.min(20000L, requestedTimeout));
        Location fallbackLocation = null;
        try {
            fallbackLocation = manager.getLastKnownLocation(provider);
        } catch (SecurityException ignored) {}
        final Location cachedFallback = fallbackLocation;

        oneShotLocationManager = manager;
        oneShotHandler = new Handler(Looper.getMainLooper());
        oneShotLocationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location location) {
                resolveOneShot(location, false);
            }

            @Override public void onProviderDisabled(String providerName) {}
            @Override public void onProviderEnabled(String providerName) {}
            @Override public void onStatusChanged(String providerName, int status, Bundle extras) {}
        };
        oneShotTimeout = () -> {
            if (isUsableCachedLocation(cachedFallback)) {
                resolveOneShot(cachedFallback, true);
            } else {
                rejectOneShot(pendingPositionCall, "Délai de localisation GPS dépassé.", "timeout");
            }
        };

        try {
            manager.requestSingleUpdate(provider, oneShotLocationListener, Looper.getMainLooper());
            oneShotHandler.postDelayed(oneShotTimeout, timeoutMs);
        } catch (SecurityException error) {
            rejectOneShot(call, "Permission GPS Android refusée.", "denied");
        } catch (RuntimeException error) {
            rejectOneShot(call, error.getMessage() == null ? "Localisation GPS Android impossible." : error.getMessage(), "unavailable");
        }
    }

    private boolean isUsableCachedLocation(Location location) {
        if (location == null) return false;
        long ageMs = Math.abs(System.currentTimeMillis() - location.getTime());
        boolean accurateEnough = !location.hasAccuracy() || location.getAccuracy() <= 150f;
        return ageMs <= 30000L && accurateEnough;
    }

    private String chooseOneShotProvider(LocationManager manager) {
        try {
            if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) return LocationManager.GPS_PROVIDER;
            if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) return LocationManager.NETWORK_PROVIDER;
        } catch (RuntimeException ignored) {}
        return null;
    }

    private void resolveOneShot(Location location, boolean cached) {
        PluginCall call = pendingPositionCall;
        if (call == null) return;
        clearOneShotListener();
        JSObject point = toPoint(location);
        point.put("cached", cached);
        pendingPositionCall = null;
        call.resolve(point);
    }

    private void rejectOneShot(PluginCall call, String message, String code) {
        clearOneShotListener();
        pendingPositionCall = null;
        if (call != null) call.reject(message, code);
    }

    private void clearOneShotListener() {
        if (oneShotHandler != null && oneShotTimeout != null) oneShotHandler.removeCallbacks(oneShotTimeout);
        if (oneShotLocationManager != null && oneShotLocationListener != null) {
            try { oneShotLocationManager.removeUpdates(oneShotLocationListener); } catch (SecurityException ignored) {}
        }
        oneShotLocationManager = null;
        oneShotLocationListener = null;
        oneShotHandler = null;
        oneShotTimeout = null;
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

    private void requestNotificationThenStart(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        startService(call);
    }

    private void startService(PluginCall call) {
        String routeId = call.getString("routeId", "");
        String routeName = call.getString("routeName", "Trace GPS");
        JSObject session = NativeGpsStore.beginSession(routeId, routeName);
        Intent intent = new Intent(getContext(), NativeGpsForegroundService.class);
        intent.setAction(NativeGpsForegroundService.ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
        else getContext().startService(intent);
        session.put("started", true);
        session.put("notificationPermissionGranted", notificationPermissionGranted());
        pendingStartCall = null;
        call.resolve(session);
    }

    private boolean notificationPermissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }
}
