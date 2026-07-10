package fr.capclair.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
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
