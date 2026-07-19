package fr.capclair.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeGpsPlugin.class);
        registerPlugin(NativeTraceExportPlugin.class);
        registerPlugin(NativeUpdatePlugin.class);
        registerPlugin(NativeSupAipDataPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
