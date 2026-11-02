package app.studyspace;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins are registered before the bridge starts.
        registerPlugin(BatteryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
