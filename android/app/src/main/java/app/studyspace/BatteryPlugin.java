package app.studyspace;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets Study Space ask to be left out of battery optimisation, so a 50-minute focus timer and its
 * notification keep running with the screen off (Samsung One UI stops background apps quickly).
 */
@CapacitorPlugin(name = "StudyBattery")
public class BatteryPlugin extends Plugin {

    private boolean isIgnoring() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    @PluginMethod
    public void isIgnoringOptimizations(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ignoring", isIgnoring());
        call.resolve(result);
    }

    /** Opens the system prompt; the student chooses Allow or Deny there. */
    @PluginMethod
    public void requestIgnoreOptimizations(PluginCall call) {
        JSObject result = new JSObject();
        if (isIgnoring()) {
            result.put("ignoring", true);
            call.resolve(result);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            // Some phones hide the prompt; fall back to the battery optimisation list.
            Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        result.put("ignoring", false);
        call.resolve(result);
    }
}
