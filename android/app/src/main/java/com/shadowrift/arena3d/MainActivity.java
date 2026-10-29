package com.shadowrift.arena3d;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.res.AssetManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private WebView webView;
    private LocalHttpServer server;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        try {
            server = new LocalHttpServer(getAssets());
            server.start();
        } catch (IOException e) {
            Log.e("Shadowrift", "local server failed", e);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 8, 10));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(v -> true);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setTextZoom(100);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        ws.setSupportMultipleWindows(false);
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(true);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        ws.setDefaultTextEncodingName("UTF-8");
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ws.setSafeBrowsingEnabled(false);
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }

        WebView.setWebContentsDebuggingEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e("Shadowrift", "webview error " + errorCode + " " + description + " " + failingUrl);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.d("ShadowriftJS", msg.message() + " @" + msg.lineNumber());
                return true;
            }
        });

        setContentView(webView);
        if (server != null) {
            webView.loadUrl("http://127.0.0.1:" + server.getPort() + "/index.html?lowq=1&android=1");
        }
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript(
            "(function(){ if(!window.App || !App.game) return 'exit'; if(window.TouchUI && TouchUI.layoutEditing){ TouchUI.closeLayoutEditor(); return 'cancel'; } if(window.TouchUI && TouchUI.settingsOpen){ TouchUI.closeSettings(); return 'cancel'; } if(window.TouchUI && (App.game.skillAiming || TouchUI.skillDrag)){ TouchUI.cancelSkillAim(); return 'cancel'; } if(App.game.state==='playing'){ UI.togglePause(); return 'paused'; } return 'exit'; })()",
            value -> {
                if (value == null || value.contains("exit")) moveTaskToBack(true);
            }
        );
    }

    @Override
    protected void onDestroy() {
        if (server != null) {
            server.stop();
            server = null;
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    static class LocalHttpServer {
        private final AssetManager assets;
        private ServerSocket serverSocket;
        private ExecutorService pool;
        private volatile boolean running;
        private int port;

        LocalHttpServer(AssetManager assets) {
            this.assets = assets;
        }

        void start() throws IOException {
            serverSocket = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
            port = serverSocket.getLocalPort();
            pool = Executors.newFixedThreadPool(4);
            running = true;
            Thread thread = new Thread(() -> {
                while (running) {
                    try {
                        Socket client = serverSocket.accept();
                        pool.execute(() -> handle(client));
                    } catch (IOException e) {
                        if (running) Log.w("Shadowrift", "accept failed", e);
                    }
                }
            }, "shadowrift-assets");
            thread.setDaemon(true);
            thread.start();
        }

        int getPort() {
            return port;
        }

        void stop() {
            running = false;
            try {
                if (serverSocket != null) serverSocket.close();
            } catch (IOException ignored) {
            }
            if (pool != null) pool.shutdownNow();
        }

        private void handle(Socket client) {
            try (Socket socket = client) {
                socket.setSoTimeout(10000);
                BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                String request = reader.readLine();
                if (request == null) return;
                String line;
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    // consume headers
                }
                String[] parts = request.split(" ");
                if (parts.length < 2) return;
                String path = parts[1];
                int query = path.indexOf('?');
                if (query >= 0) path = path.substring(0, query);
                if (!path.startsWith("/")) path = "/" + path;
                if (path.equals("/")) path = "/index.html";
                if (path.contains("..")) {
                    sendText(socket, 400, "Bad Request");
                    return;
                }
                byte[] data;
                try (InputStream in = assets.open("www" + path)) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[16384];
                    int n;
                    while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                    data = out.toByteArray();
                } catch (FileNotFoundException e) {
                    sendText(socket, 404, "Not Found");
                    return;
                }
                String header = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: " + mimeType(path) + "\r\n"
                    + "Content-Length: " + data.length + "\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n";
                OutputStream os = socket.getOutputStream();
                os.write(header.getBytes(StandardCharsets.US_ASCII));
                os.write(data);
                os.flush();
            } catch (IOException e) {
                Log.w("Shadowrift", "request failed", e);
            }
        }

        private void sendText(Socket socket, int code, String message) {
            try {
                byte[] body = message.getBytes(StandardCharsets.UTF_8);
                String header = "HTTP/1.1 " + code + " " + message + "\r\n"
                    + "Content-Type: text/plain; charset=utf-8\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + "Connection: close\r\n\r\n";
                OutputStream os = socket.getOutputStream();
                os.write(header.getBytes(StandardCharsets.US_ASCII));
                os.write(body);
                os.flush();
            } catch (IOException ignored) {
            }
        }

        private String mimeType(String path) {
            String p = path.toLowerCase();
            if (p.endsWith(".html")) return "text/html; charset=utf-8";
            if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
            if (p.endsWith(".css")) return "text/css; charset=utf-8";
            if (p.endsWith(".json")) return "application/json; charset=utf-8";
            if (p.endsWith(".glb")) return "model/gltf-binary";
            if (p.endsWith(".gltf")) return "model/gltf+json";
            if (p.endsWith(".png")) return "image/png";
            if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
            if (p.endsWith(".txt")) return "text/plain; charset=utf-8";
            return "application/octet-stream";
        }
    }
}
