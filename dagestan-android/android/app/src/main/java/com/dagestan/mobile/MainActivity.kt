package com.dagestan.mobile

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.inputmethod.EditorInfo
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.AppCompatButton
import androidx.activity.compose.setContent
import com.dagestan.mobile.ui.DagestanApp

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "CodexMainActivity"
        /** URL that loads our Vite React dashboard from bundled assets. */
        private const val VITE_ASSETS_URL = "file:///android_asset/web/index.html"
    }

    private lateinit var webView: WebView
    private lateinit var loadingOverlay: View
    private lateinit var statusText: TextView
    private lateinit var statusDetail: TextView
    private lateinit var splashLogo: ImageView
    private lateinit var progressTrack: View
    private lateinit var serverManager: CodexServerManager

    // Dashboard + overlay screens
    private lateinit var dashboardView: View
    private lateinit var settingsView: View
    private lateinit var terminalView: View
    private lateinit var codexStatusDot: View
    private lateinit var codexStatusTitle: TextView
    private lateinit var codexStatusSub: TextView
    private lateinit var btnOpenCodex: Button
    private lateinit var btnCodexBrowser: Button
    private lateinit var btnCodexToggle: Button
    private lateinit var gatewayStatus: TextView
    private lateinit var btnGatewayToggle: Button
    private lateinit var opencodeStatus: TextView
    private lateinit var btnOpenCodeToggle: Button
    private lateinit var hermesStatus: TextView
    private lateinit var btnHermesToggle: Button
    private lateinit var terminalScroll: ScrollView
    private lateinit var terminalOutput: TextView
    private lateinit var terminalInput: EditText
    private lateinit var providerList: LinearLayout
    private lateinit var customUrlInput: EditText
    private lateinit var customModelInput: EditText

    /** Index into [CodexServerManager.PROVIDERS] chosen in Settings. */
    private var selectedSettingsProvider = 0
    private lateinit var providerKeyInput: EditText
    private lateinit var providerNote: TextView
    private lateinit var providerStatus: TextView
    private var dotPulse: ObjectAnimator? = null
    private var terminalHistory = StringBuilder()

    /** Step checklist rows (label + icon) — driven by markStep(). */
    private val stepRows = mutableListOf<Pair<TextView, ImageView>>()
    private val STEP_LABELS = listOf(
        "Extracting environment",
        "Installing proot",
        "Installing Node.js",
        "Installing Codex CLI",
        "Starting OpenClaw",
        "Connecting to your model"
    )
    private var currentStep = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // v3.0 alpha2+: opt-in Compose shell. Default off so v2.8.1 users
        // see no visual change. Long-press the splash logo to toggle.
        if (DagestanPrefs.useComposeShell(this)) {
            setContent { DagestanApp() }
            requestRecordAudioIfNeeded()
            // The legacy wiring (WebView, server, overlays) is intentionally
            // skipped. The shell is a preview; the real wiring is restored
            // when the flag is flipped off.
            return
        }

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        loadingOverlay = findViewById(R.id.loadingOverlay)
        statusText = findViewById(R.id.statusText)
        statusDetail = findViewById(R.id.statusDetail)
        splashLogo = findViewById(R.id.splashLogo)
        progressTrack = findViewById(R.id.progressTrack)

        buildStepList()
        startLogoPulse()
        bindScreens()
        bindComposeShellToggle()
        requestNotificationPermission()

        serverManager = CodexServerManager.getInstance(this)

        requestBatteryOptimizationExemption()
        startForegroundService()
        setupWebView()
        startSetupFlow()
    }


    override fun onDestroy() {
        // CRITICAL: Do NOT stop servers here.
        dotPulse?.cancel()
        super.onDestroy()
    }

    private var isStoppingServer = false

    override fun finish() {
        // ALWAYS minimize instead of close — servers keep running
        // Only the app switcher swipe should truly close the app.
        Log.w(TAG, "finish() intercepted — minimizing (servers keep running)")
        try {
            val intent = android.content.Intent(this, CodexForegroundService::class.java)
            startService(intent)
        } catch (_: Exception) { }
        moveTaskToBack(true)
    }



    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val pm = getSystemService(PowerManager::class.java) ?: return
        if (pm.isIgnoringBatteryOptimizations(packageName)) return

        try {
            @Suppress("BatteryLife")
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "Could not request battery optimization exemption: ${e.message}")
        }
    }

    private fun startForegroundService() {
        try {
            val intent = Intent(this, CodexForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (e: Exception) {
            // Foreground service may fail on Android 12+ when started from
            // certain states. The app still works without it — servers are
            // kept alive by the activity process, just less resilient to
            // background kills.
            Log.w(TAG, "Foreground service start failed (non-fatal): ${e.message}")
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                    arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                    1001,
                )
            }
        }
    }

    @Deprecated("Use onBackPressedDispatcher")
    override fun onBackPressed() {
        when {
            webView.visibility == View.VISIBLE -> showDashboard()
            settingsView.visibility == View.VISIBLE -> hideSettings()
            terminalView.visibility == View.VISIBLE -> hideTerminal()
            else -> moveTaskToBack(true) // minimize; servers keep running
        }
    }

    /** Cached Dagestan skin sources, loaded once from APK assets. */
        /** Skin assets removed — web app uses its own theme. */

    @android.annotation.SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            setSupportZoom(false)
            setUseWideViewPort(true)
            setLoadWithOverviewMode(true)
            @Suppress("DEPRECATION")
            userAgentString = userAgentString
            textZoom = 100
        }

        // Expose the Termux-prefix shell to JS as window.DagestanDroid so the
        // dashboard can droid.run() commands (start/stop the 4 servers, poll
        // ports, write files, etc.) without going through the native Activity.
        webView.addJavascriptInterface(
            DroidBridge(applicationContext),
            DroidBridge.NAME,
        )
        webView.addJavascriptInterface(
            DroidBridge(applicationContext),
            DroidBridge.LEGACY_NAME,
        )
        webView.addJavascriptInterface(
            NativeUiBridge(this),
            "DagestanNative",
        )

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                url: String,
            ): Boolean = false

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                // The bundled codex-web is a SPA that respects window.innerWidth
                // to switch between mobile and desktop layouts. On Android
                // phones we want a *real* mobile viewport, so we let the
                // browser report its actual width and surface CLI features
                // (Skills, Settings, Projects, Automations, Device agent)
                // via a separate overlay injected in onPageFinished.
                view.evaluateJavascript("""
                (function(){
                    try{
                        var vp=document.querySelector('meta[name=viewport]');
                        if(vp)vp.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');
                        document.documentElement.style.minWidth='';
                        document.documentElement.style.overflowX='hidden';
                        document.body && (document.body.style.overflowX='hidden');
                    }catch(e){}
                })();
                """.trimIndent(), null)
            }
            override fun onPageFinished(view: WebView, url: String) {
                // Dagestan branding + mobile sidebar overlay that surfaces
                // CLI features (Skills, Settings, Projects, Automations,
                // Device agent) which the bundled codex-web build does not
                // show in its bare welcome page.
                view.evaluateJavascript(buildDagestanOverlayJs(), null)
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                Log.d(TAG, "[WebView] ${msg.sourceId()}:${msg.lineNumber()} ${msg.message()}")
                return true
            }
        }
    }

    /**
     * Build the JS string injected into codex-web's WebView on every page
     * load. Adds:
     *   1. Dagestan title + theme color.
     *   2. A floating mobile sidebar (hamburger button) with CLI features
     *      that the bundled build hides: Skills, Settings, Projects,
     *      Automations, Device agent, OpenClaw, OpenCodex, Hermes.
     *   3. Mobile-friendly CSS overrides so the page is phone-standard.
     */
    private fun buildDagestanOverlayJs(): String {
        // Build a JSON-safe list of menu items. Each item has a label,
        // an icon glyph, and either an action ("route:URL") or a JS
        // snippet that runs in the WebView when the entry is tapped.
        val items = listOf(
            SidebarItem("Skills",       "⚡", "droid:codex --help 2>&1 | head -30"),
            SidebarItem("Settings",     "⚙",  "native:settings"),
            SidebarItem("Projects",     "📁", "droid:ls -1 /data/user/0/com.dagestan.mobile/files/home 2>/dev/null | head -20 || echo 'no projects yet'"),
            SidebarItem("Automations",  "🤖", "droid:codex --version 2>&1 | head -5"),
            SidebarItem("Device agent", "📶", "native:device-agent"),
            SidebarItem("Terminal",     "▶",  "native:terminal"),
            SidebarItem("Codex web",    "🌐", "route:" + serverManager.serverUrl()),
            SidebarItem("OpenClaw",     "🌐", "route:" + serverManager.controlUiLaunchUrl()),
            SidebarItem("OpenCodex",    "🧪", "route:" + serverManager.opencodexUrl()),
            SidebarItem("Hermes",       "📜", "route:" + serverManager.hermesUrl()),
        )
        val itemsJson = items.joinToString(",") { item ->
            "{" +
                "\"label\":\"" + item.label + "\"," +
                "\"icon\":\"" + item.icon + "\"," +
                "\"action\":\"" + item.action + "\"" +
            "}"
        }

        return """
            (function(){
                try{
                    if(window.__dagestanInjected) return;
                    window.__dagestanInjected = true;

                    // ── title + theme color ──────────────────────────────
                    document.title = 'Dagestan';
                    var m = document.querySelector('meta[name=theme-color]');
                    if(!m){ m = document.createElement('meta'); m.name='theme-color'; document.head.appendChild(m); }
                    m.content = '#020617';

                    // ── mobile CSS shim ─────────────────────────────────
                    var css = document.createElement('style');
                    css.id = 'dagestan-skin';
                    css.textContent = `
                        :root { --dg-bg:#020617; --dg-card:#0f172a; --dg-text:#e2e8f0;
                                --dg-muted:#94a3b8; --dg-accent:#22d3ee; --dg-border:rgba(148,163,184,0.18); }
                        html, body { background:var(--dg-bg) !important; color:var(--dg-text) !important; }
                        body { padding-bottom:80px !important; }
                        #dagestan-fab { position:fixed; bottom:16px; right:16px; z-index:2147483646;
                            width:48px; height:48px; border-radius:24px; border:none;
                            background:linear-gradient(135deg,#22d3ee,#8b5cf6); color:#020617;
                            font-size:22px; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,0.5); }
                        #dagestan-fab:active { transform:scale(0.94); }
                        #dagestan-side { position:fixed; top:0; right:0; bottom:0; width:78vw; max-width:320px;
                            background:var(--dg-card); color:var(--dg-text); z-index:2147483647;
                            transform:translateX(100%); transition:transform .22s ease-out;
                            padding:64px 0 16px 0; box-shadow:-8px 0 30px rgba(0,0,0,0.6);
                            display:flex; flex-direction:column; gap:4px; overflow-y:auto;
                            font-family:system-ui,-apple-system,sans-serif; }
                        #dagestan-side.open { transform:translateX(0); }
                        #dagestan-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.5);
                            z-index:2147483645; opacity:0; pointer-events:none; transition:opacity .22s; }
                        #dagestan-backdrop.open { opacity:1; pointer-events:auto; }
                        .dg-item { display:flex; align-items:center; gap:12px; padding:14px 18px;
                            color:var(--dg-text); text-decoration:none; font-size:15px;
                            border:none; background:transparent; width:100%; text-align:left;
                            cursor:pointer; font-family:inherit; }
                        .dg-item:hover, .dg-item:active { background:rgba(34,211,238,0.08); }
                        .dg-item .ic { font-size:18px; width:24px; text-align:center; }
                        .dg-head { padding:0 18px 12px 18px; font-weight:700; font-size:18px;
                            color:var(--dg-text); border-bottom:1px solid var(--dg-border); margin-bottom:8px; }
                        .dg-tag { padding:8px 18px 0 18px; font-size:11px;
                            color:var(--dg-muted); text-transform:uppercase; letter-spacing:0.5px; }
                    `;
                    document.head.appendChild(css);

                    // ── floating action button ──────────────────────────
                    var fab = document.createElement('button');
                    fab.id = 'dagestan-fab';
                    fab.setAttribute('aria-label', 'Open Dagestan menu');
                    fab.textContent = '\u2630';
                    document.body.appendChild(fab);

                    // ── backdrop ────────────────────────────────────────
                    var back = document.createElement('div');
                    back.id = 'dagestan-backdrop';
                    document.body.appendChild(back);

                    // ── sidebar ─────────────────────────────────────────
                    var side = document.createElement('nav');
                    side.id = 'dagestan-side';
                    var head = document.createElement('div');
                    head.className = 'dg-head';
                    head.textContent = 'Dagestan';
                    side.appendChild(head);

                    var tag = document.createElement('div');
                    tag.className = 'dg-tag';
                    tag.textContent = 'CLI features';
                    side.appendChild(tag);

                    var items = [$itemsJson];
                    items.forEach(function(it){
                        var b = document.createElement('button');
                        b.className = 'dg-item';
                        b.innerHTML = '<span class="ic">' + it.icon + '</span><span>' + it.label + '</span>';
                        b.onclick = function(){
                            try {
                                if(!it.action) return;
                                if(it.action.indexOf('route:') === 0){
                                    var url = it.action.substring(6);
                                    window.location.href = url;
                                } else if(it.action.indexOf('droid:') === 0){
                                    var cmd = it.action.substring(6);
                                    if(window.DagestanDroid && window.DagestanDroid.run){
                                        var out = window.DagestanDroid.run(cmd);
                                        if(out && out.length > 600) out = out.substring(0, 600) + '...';
                                        alert('\n' + out);
                                    }
                                } else if(it.action.indexOf('native:') === 0){
                                    var which = it.action.substring(7);
                                    if(which === 'settings' && window.DagestanNative && window.DagestanNative.openSettings){
                                        window.DagestanNative.openSettings();
                                    } else if(which === 'terminal' && window.DagestanNative && window.DagestanNative.openTerminal){
                                        window.DagestanNative.openTerminal();
                                    } else if(which === 'device-agent' && window.DagestanNative && window.DagestanNative.copyDeviceAgent){
                                        window.DagestanNative.copyDeviceAgent();
                                    }
                                }
                            } catch(err) { console.error('[dagestan] action failed', err); }
                            side.classList.remove('open');
                            back.classList.remove('open');
                        };
                        side.appendChild(b);
                    });
                    document.body.appendChild(side);

                    function openSide(){ side.classList.add('open'); back.classList.add('open'); }
                    function closeSide(){ side.classList.remove('open'); back.classList.remove('open'); }
                    fab.addEventListener('click', openSide);
                    back.addEventListener('click', closeSide);

                    // ── bottom safe-area padding for the composer ───────
                    try {
                        var s = document.createElement('style');
                        s.textContent = 'body { padding-bottom:calc(72px + env(safe-area-inset-bottom, 0px)) !important; }';
                        document.head.appendChild(s);
                    } catch(e) {}
                }catch(e){ console.error('[dagestan] overlay inject failed', e); }
            })();
        """.trimIndent()
    }

    /** Single line of the Dagestan mobile sidebar. */
    private data class SidebarItem(val label: String, val icon: String, val action: String)


    private fun startSetupFlow() {
        showLoading(true)
        setStatus("Initializing…")

        Thread {
            try {
                runSetup()
            } catch (e: Exception) {
                Log.e(TAG, "Setup failed", e)
                runOnUiThread {
                    showError(e.message ?: "Unknown error")
                }
            }
        }.start()
    }

    private fun runSetup() {
        // Step 1: Bootstrap the on-device Linux prefix.
        //
        // We prefer the AnyClaw rootfs (608 MB, pre-baked with node,
        // npm, openclaw, python, hermes-webui, and the proot/talloc/
        // termux JNI libs). It is downloaded once on first launch from
        // `friuns2/anyclaw-rootfs-assets/releases/download/rootfs-latest/`
        // and extracted into the same `files/usr/` directory that the
        // legacy Termux bootstrap would have used — so all downstream
        // code paths (46+ call sites of BootstrapInstaller.getPaths)
        // work unchanged.
        //
        // If the AnyClaw download fails (no network, GitHub rate limit,
        // etc.) we fall back to the legacy Termux bootstrap path: a
        // 30 MB `bootstrap-aarch64.zip` extracted from APK assets, then
        // apt-get-based installs for proot/node/python.
        markStep(0)
        var anyclawReady = false
        if (AnyClawBootstrapper.isInstalled(this)) {
            Log.i(TAG, "AnyClaw rootfs already present — skipping downloads")
            updateStatus("AnyClaw rootfs ready")
            anyclawReady = true
        } else {
            updateStatus("Downloading AnyClaw rootfs (first launch)…", "≈ 600 MB, one-time only")
            val anyclawOk = AnyClawBootstrapper.install(this) { msg -> updateDetail(msg) }
            if (anyclawOk) {
                anyclawReady = true
                updateStatus("AnyClaw rootfs ready")
            } else {
                Log.w(TAG, "AnyClaw bootstrap failed (${AnyClawBootstrapper.lastError}), falling back to Termux")
                updateStatus("AnyClaw unavailable, using Termux bootstrap…", AnyClawBootstrapper.lastError ?: "unknown error")
            }
        }
        if (!anyclawReady) {
            if (!BootstrapInstaller.isBootstrapInstalled(this)) {
                updateStatus("Extracting environment…")
                BootstrapInstaller.install(this) { msg -> updateStatus(msg) }
            }
            updateStatus("Environment ready")
        }

        // Step 1b: Install proot (only needed for the legacy Termux path;
        // the AnyClaw rootfs already includes libproot.so + libtalloc.so).
        markStep(1)
        if (!anyclawReady && !serverManager.isProotInstalled()) {
            updateStatus("Installing proot…", "Needed for package management")
            val prootOk = serverManager.installProot { msg -> updateDetail(msg) }
            if (!prootOk) {
                throw RuntimeException("Failed to install proot")
            }
        }
        updateStatus("proot ready")

        // Step 2: Install Node.js (skipped when AnyClaw rootfs already
        // provides it under usr/bin/node + usr/local/lib/node_modules).
        markStep(2)
        if (!anyclawReady && !serverManager.isNodeInstalled()) {
            updateStatus("Installing Node.js (first run)…", "This may take a few minutes")
            val nodeOk = serverManager.installNode { msg -> updateDetail(msg) }
            if (!nodeOk) {
                throw RuntimeException("Failed to install Node.js")
            }
        }
        updateStatus("Node.js ready")

        // Step 2b: Install Python (skipped when AnyClaw rootfs already
        // provides it under usr/bin/python3).
        if (!anyclawReady && !serverManager.isPythonInstalled()) {
            updateStatus("Installing Python…")
            val pyOk = serverManager.installPython { msg -> updateDetail(msg) }
            if (!pyOk) {
                Log.w(TAG, "Python install failed — continuing without it")
            }
        }

        // Step 2c: Install bionic-compat.js (Android platform shim for Node.js)
        serverManager.ensureBionicCompat()

        // Step 2d: Install OpenClaw
        if (!serverManager.isOpenClawInstalled()) {
            updateStatus("Installing build dependencies…")
            serverManager.installOpenClawDeps { msg -> updateDetail(msg) }

            updateStatus("Installing OpenClaw…", "This may take several minutes")
            val openclawOk = serverManager.installOpenClaw { msg -> updateDetail(msg) }
            if (!openclawOk) {
                Log.w(TAG, "OpenClaw install failed — continuing without it")
            } else {
                updateStatus("OpenClaw installed")
            }
        }

        // Step 3: Install Codex CLI
        markStep(3)
        if (!serverManager.isCodexInstalled()) {
            updateStatus("Installing Codex CLI…", "This may take a few minutes")
            val codexOk = serverManager.installCodex { msg -> updateDetail(msg) }
            if (!codexOk) {
                throw RuntimeException("Failed to install Codex")
            }
        }

        // Ensure codex wrapper script exists
        serverManager.ensureCodexWrapperScript()

        // Step 3a: Install the web server bundle (APK asset, else npm)
        updateStatus("Installing web server…")
        if (!serverManager.installServerBundle { msg -> updateDetail(msg) }) {
            throw RuntimeException(
                serverManager.lastServerError
                    ?: "Failed to install the web server — check your connection and retry",
            )
        }

        // Step 3b: Install native platform binary
        if (!serverManager.isPlatformBinaryInstalled()) {
            updateStatus("Installing Codex platform binary…")
            val binOk = serverManager.installPlatformBinary { msg -> updateDetail(msg) }
            if (!binOk) {
                throw RuntimeException("Failed to install Codex platform binary")
            }
        }
        updateStatus("Codex ready")

        // Step 3c: Write full-access config and create default workspace
        serverManager.ensureFullAccessConfig()
        serverManager.ensureDefaultWorkspace()

        // Step 4: Start CONNECT proxy (needed for native binary DNS/TLS)
        markStep(4)
        updateStatus("Starting network proxy…")
        if (!serverManager.startProxy()) {
            throw RuntimeException("Failed to start network proxy")
        }

        // Step 5: Authenticate — pick a provider (free tiers available) or
        // silently continue when one is already configured.
        markStep(5)
        updateStatus("Checking authentication…")
        val usingSavedProvider = serverManager.isCustomProviderReady()
        if (!serverManager.isLoggedIn() && !usingSavedProvider) {
            runOnUiThread {
                showLoading(false)
                showDashboard()
                requestApiKeyWithInstructions()
            }
            // Wait for API key to be provided
            val lock = Object()
            apiKeyLock = lock
            synchronized(lock) { lock.wait() }
            apiKeyLock = null
            val apiKey = pendingApiKey ?: ""
            when {
                apiKey == "__skip__" ->
                    updateStatus("No provider yet — add a key any time in ⚙ Settings")
                apiKey == "__browser_auth__" -> {
                    // Browser OAuth already wrote auth.json — just verify
                    if (!serverManager.isLoggedIn()) {
                        throw RuntimeException("Browser login did not complete — try pasting your API key instead")
                    }
                }
                apiKey.isBlank() -> throw RuntimeException("No API key provided")
                else -> {
                    // Free providers are wired into ~/.codex/config.toml by
                    // configureProvider(). OpenAI login lives in the Terminal.
                    val providerId = pendingProviderId ?: serverManager.savedProviderId()
                    val loginOk = serverManager.configureProvider(providerId, apiKey)
                    if (!loginOk) {
                        throw RuntimeException("Login failed — check your API key")
                    }
                }
            }
        }
        val activeProvider = serverManager.providerById(serverManager.savedProviderId())
        updateStatus(
            if (serverManager.isCustomProviderReady()) {
                "Connected via " + (activeProvider?.label ?: "custom provider")
            } else {
                "Authenticated"
            },
        )

        // Step 6: Skip health check — it uses big-pickle which can hang.
        // Non-OpenAI providers don't need codex exec verification.
        val authReady = serverManager.isLoggedIn() || serverManager.isCustomProviderReady()
        if (!authReady) {
            updateStatus("Skipping API check — add a key in ⚙ Settings")
        } else {
            updateStatus("API key configured — starting server")
        }

        // Step 7: Start web server FIRST so users see the dashboard immediately.
        updateStatus("Starting server…")
        if (!serverManager.startServerAndWait(timeoutMs = 90_000)) {
            throw RuntimeException(serverManager.lastServerError ?: "Failed to start server")
        }

        // Step 8: Configure and start OpenClaw (after web server is live).
        if (serverManager.isOpenClawInstalled()) {
            updateStatus("Configuring OpenClaw…")
            try {
                serverManager.configureOpenClawAuth()
                updateStatus("Starting OpenClaw gateway…")
                serverManager.startOpenClawGateway()
                updateStatus("Starting OpenClaw Control UI…")
                serverManager.startOpenClawControlUiServer()
            } catch (e: Exception) {
                Log.w(TAG, "OpenClaw setup failed (non-fatal): ${e.message}")
                updateStatus("OpenClaw skipped — ${e.message?.take(40)}")
            }
        }

        // Step 9: Pre-install OpenCodex proxy + Hermes (after server is live).
        if (!serverManager.isOpenCodexInstalled()) {
            updateStatus("Installing OpenCodex proxy…", "Downloads Bun + opencodex (~30s)")
            try {
                serverManager.installOpenCodex { msg -> updateDetail(msg) }
            } catch (e: Exception) {
                Log.w(TAG, "OpenCodex install failed (non-fatal): ${e.message}")
            }
        }
        if (!serverManager.isHermesInstalled()) {
            updateStatus("Installing Hermes Web UI…", "Downloads hermes-webui (~20s)")
            try {
                serverManager.installHermes { msg -> updateDetail(msg) }
            } catch (e: Exception) {
                Log.w(TAG, "Hermes install failed (non-fatal): ${e.message}")
            }
        }

        // Step 10: Show the native dashboard — the Codex web UI opens on demand
        runOnUiThread {
            markStep(STEP_LABELS.size)
            showLoading(false)
            showDashboard()
        }
    }

    /** Escape a raw string for safe embedding inside a JS double-quoted literal. */
        /** jsonEscape removed — no longer needed. */

    private var apiKeyLock: Object? = null
    private var pendingApiKey: String? = null

    /** Provider chosen in the picker dialog; paired with [pendingApiKey]. */
    private var pendingProviderId: String? = null

    /** Selected row index in the provider picker dialog. */
    private var selectedProviderIdx = 0

    /**
     * Stage 1 of sign-in: choose a model provider. OpenRouter, OpenCode Zen,
     * and NVIDIA NIM all have free tiers — no OpenAI account required.
     * Called on the UI thread; chains into [requestProviderKey].
     */
    private fun requestApiKeyWithInstructions() {
        runOnUiThread {
            val providers = CodexServerManager.PROVIDERS
            val labels = providers.map { it.label }.toTypedArray()
            selectedProviderIdx =
                providers.indexOfFirst { it.id == serverManager.savedProviderId() }
                    .coerceAtLeast(0)

            AlertDialog.Builder(this@MainActivity)
                .setTitle("Dagestan — Choose your AI provider")
                .setMessage(
                    "Every option has FREE models — no OpenAI account needed.\n" +
                        "Or skip now and add a key later in ⚙ Settings."
                )
                .setSingleChoiceItems(labels, selectedProviderIdx) { _, which ->
                    selectedProviderIdx = which
                }
                .setCancelable(false)
                .setPositiveButton("Next") { _, _ ->
                    requestProviderKey(providers[selectedProviderIdx])
                }
                .setNegativeButton("Skip for now") { _, _ ->
                    pendingApiKey = "__skip__"
                    apiKeyLock?.let { synchronized(it) { it.notifyAll() } }
                }
                .show()
        }
    }

    /**
     * Stage 2 of sign-in: paste the API key for the chosen provider.
     * Writes [pendingApiKey]/[pendingProviderId] and releases [apiKeyLock]
     * when the user submits.
     */
    private fun requestProviderKey(p: CodexServerManager.ModelProvider) {
        runOnUiThread {
            val input = EditText(this@MainActivity).apply {
                hint = if (p.id == "openai") {
                    "sk-…"
                } else {
                    "Paste your " + p.label.substringBefore(" (") + " key…"
                }
                inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
                setSingleLine(true)
            }
            val padding = (24 * resources.displayMetrics.density).toInt()
            val container = android.widget.FrameLayout(this@MainActivity).apply {
                setPadding(padding, padding / 2, padding, 0)
                addView(input)
            }

            AlertDialog.Builder(this@MainActivity)
                .setTitle(p.label + " — API Key")
                .setMessage(p.note + "\n\n" + "Your key is stored only on this device.")
                .setView(container)
                .setCancelable(false)
                .setPositiveButton("Connect") { _, _ ->
                    val key = input.text.toString().trim()
                    pendingApiKey = key
                    pendingProviderId = p.id
                    apiKeyLock?.let { synchronized(it) { it.notifyAll() } }
                }
                .setNegativeButton("Back") { _, _ ->
                    requestApiKeyWithInstructions()
                }
                .setNeutralButton("Skip for now") { _, _ ->
                    pendingApiKey = "__skip__"
                    apiKeyLock?.let { synchronized(it) { it.notifyAll() } }
                }
                .show()
        }
    }

    // ── Dashboard / settings / terminal ────────────────────────────────

    /** Bind every view of the dashboard + overlay screens and wire actions. */
    private fun bindScreens() {
        dashboardView = findViewById(R.id.dashboardView)
        settingsView = findViewById(R.id.settingsView)
        terminalView = findViewById(R.id.terminalView)

        codexStatusDot = dashboardView.findViewById(R.id.codexStatusDot)
        codexStatusTitle = dashboardView.findViewById(R.id.codexStatusTitle)
        codexStatusSub = dashboardView.findViewById(R.id.codexStatusSub)
        btnOpenCodex = dashboardView.findViewById(R.id.btnOpenCodex)
        btnCodexBrowser = dashboardView.findViewById(R.id.btnCodexBrowser)
        btnCodexToggle = dashboardView.findViewById(R.id.btnCodexToggle)
        gatewayStatus = dashboardView.findViewById(R.id.gatewayStatus)
        btnGatewayToggle = dashboardView.findViewById(R.id.btnGatewayToggle)
        opencodeStatus = dashboardView.findViewById(R.id.opencodeStatus)
        btnOpenCodeToggle = dashboardView.findViewById(R.id.btnOpenCodeToggle)
        hermesStatus = dashboardView.findViewById(R.id.hermesStatus)
        btnHermesToggle = dashboardView.findViewById(R.id.btnHermesToggle)

        terminalScroll = terminalView.findViewById(R.id.terminalScroll)
        terminalOutput = terminalView.findViewById(R.id.terminalOutput)
        terminalInput = terminalView.findViewById(R.id.terminalInput)

        swarmStatus = dashboardView.findViewById(R.id.swarmStatus)
        providerList = settingsView.findViewById(R.id.providerList)
        customUrlInput = settingsView.findViewById(R.id.customUrlInput)
        customModelInput = settingsView.findViewById(R.id.customModelInput)
        providerKeyInput = settingsView.findViewById(R.id.providerKeyInput)
        providerNote = settingsView.findViewById(R.id.providerNote)
        providerStatus = settingsView.findViewById(R.id.providerStatus)

        val version = try {
            "v" + packageManager.getPackageInfo(packageName, 0).versionName
        } catch (_: Exception) {
            ""
        }
        dashboardView.findViewById<TextView>(R.id.dashboardVersion).text =
            "Dagestan $version"
        settingsView.findViewById<TextView>(R.id.aboutVersion).text =
            "Dagestan $version — Codex + OpenClaw running on-device."

        dashboardView.findViewById<View>(R.id.btnSettings)
            .setOnClickListener { showSettings() }
        btnOpenCodex.setOnClickListener { openViteDashboard() }
        btnCodexBrowser.setOnClickListener {
            try {
                startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse(serverManager.serverUrl()))
                )
            } catch (_: Exception) {
                Toast.makeText(this, "No browser found", Toast.LENGTH_SHORT).show()
            }
        }
        btnCodexToggle.setOnClickListener { toggleCodex() }
        btnGatewayToggle.setOnClickListener { toggleGateway() }
        dashboardView.findViewById<View>(R.id.btnControlUi)
            .setOnClickListener { openControlUi() }
        dashboardView.findViewById<View>(R.id.btnOpenCodeTerm)
            .setOnClickListener { showTerminal() }
        dashboardView.findViewById<View>(R.id.btnOpenCodeWeb)
            .setOnClickListener {
                if (!serverManager.isOpenCodexRunning) {
                    Toast.makeText(this, "Starting OpenCodex…", Toast.LENGTH_SHORT).show()
                    Thread {
                        waitForPortRelease(CodexServerManager.OPENCODEX_PORT, 8000)
                        if (!serverManager.isOpenCodexInstalled()) {
                            serverManager.installOpenCodex { msg -> runOnUiThread { appendTerminal("$msg\n") } }
                        }
                        val started = serverManager.startOpenCodexServer()
                        if (started) {
                            val ready = serverManager.waitForOpenCodex(45_000)
                            runOnUiThread {
                                if (ready) openWeb(serverManager.opencodexUrl())
                                else {
                                    val err = serverManager.openCodexLastError ?: "OpenCodex did not become ready"
                                    Toast.makeText(this@MainActivity, err.take(200), Toast.LENGTH_LONG).show()
                                }
                            }
                        } else {
                            runOnUiThread { Toast.makeText(this@MainActivity, "OpenCodex failed to start", Toast.LENGTH_LONG).show() }
                        }
                    }.start()
                } else {
                    openWeb(serverManager.opencodexUrl())
                }
            }
        btnOpenCodeToggle.setOnClickListener { toggleOpenCodex() }
        dashboardView.findViewById<View>(R.id.btnHermesWeb)
            .setOnClickListener {
                if (!serverManager.isHermesRunning) {
                    Toast.makeText(this, "Starting Hermes…", Toast.LENGTH_SHORT).show()
                    Thread {
                        waitForPortRelease(CodexServerManager.HERMES_PORT, 8000)
                        if (!serverManager.isHermesInstalled()) {
                            serverManager.installHermes { msg -> runOnUiThread { appendTerminal("$msg\n") } }
                        }
                        val ok = serverManager.startHermesServer()
                        runOnUiThread {
                            if (ok) openWeb(serverManager.hermesUrl())
                            else {
                                val err = serverManager.hermesLastError ?: "Hermes failed to start"
                                Toast.makeText(this@MainActivity, err.take(200), Toast.LENGTH_LONG).show()
                            }
                        }
                    }.start()
                } else {
                    openWeb(serverManager.hermesUrl())
                }
            }
        btnHermesToggle.setOnClickListener { toggleHermes() }
        dashboardView.findViewById<View>(R.id.btnCodexTerm)
            .setOnClickListener { showTerminal() }
        dashboardView.findViewById<View>(R.id.btnSwarmStart)
            .setOnClickListener { showSwarmDialog() }
        // Connectors: request permissions on tap
        dashboardView.findViewById<View>(R.id.btnConnectorCalendar)
            .setOnClickListener { requestPerm(android.Manifest.permission.READ_CALENDAR, "Calendar") }
        dashboardView.findViewById<View>(R.id.btnConnectorCamera)
            .setOnClickListener { requestPerm(android.Manifest.permission.CAMERA, "Camera") }
        dashboardView.findViewById<View>(R.id.btnConnectorLocation)
            .setOnClickListener { requestPerm(android.Manifest.permission.ACCESS_FINE_LOCATION, "Location") }
        dashboardView.findViewById<View>(R.id.cardTerminal)
            .setOnClickListener { showTerminal() }

        terminalView.findViewById<View>(R.id.btnTerminalClose)
            .setOnClickListener { hideTerminal() }
        terminalView.findViewById<View>(R.id.btnTerminalClear)
            .setOnClickListener {
                terminalHistory = StringBuilder()
                terminalOutput.text = ""
            }
        terminalView.findViewById<View>(R.id.btnTerminalRun)
            .setOnClickListener { runTerminalCommand() }
        terminalView.findViewById<View>(R.id.chipCodexLogin).setOnClickListener {
            showTerminal()
            runTerminalCommand("codex login")
        }
        terminalView.findViewById<View>(R.id.chipLoginStatus).setOnClickListener {
            showTerminal()
            runTerminalCommand("codex login status")
        }
        terminalView.findViewById<View>(R.id.chipGatewayStatus).setOnClickListener {
            showTerminal()
            runTerminalCommand("openclaw gateway status 2>&1 || echo 'gateway not installed'")
        }
        terminalView.findViewById<View>(R.id.chipDisk).setOnClickListener {
            showTerminal()
            runTerminalCommand("df -h")
        }
        terminalView.findViewById<View>(R.id.chipOcxStatus).setOnClickListener {
            showTerminal()
            runTerminalCommand("OPENCODEX_BUN_PATH=\"${BootstrapInstaller.getPaths(this@MainActivity).prefixDir}/bin/bun\" ocx status 2>&1")
        }
        terminalInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                runTerminalCommand()
                true
            } else {
                false
            }
        }

        settingsView.findViewById<View>(R.id.btnSettingsClose)
            .setOnClickListener { hideSettings() }
        settingsView.findViewById<View>(R.id.rowCodexWeb).setOnClickListener {
            hideSettings()
            openWeb(serverManager.serverUrl())
        }
        settingsView.findViewById<View>(R.id.rowControlUi).setOnClickListener {
            hideSettings()
            openControlUi()
        }
        settingsView.findViewById<View>(R.id.btnSaveProvider)
            .setOnClickListener { saveProvider() }
        settingsView.findViewById<View>(R.id.btnGetKey).setOnClickListener {
            val url = CodexServerManager.PROVIDERS
                .getOrNull(selectedSettingsProvider)?.keyUrl ?: ""
            if (url.isBlank()) {
                Toast.makeText(this, "Bring your own endpoint — no key page", Toast.LENGTH_SHORT).show()
            } else {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                } catch (_: Exception) {
                    Toast.makeText(this, "No browser found", Toast.LENGTH_SHORT).show()
                }
            }
        }

        attachPressScale(
            btnOpenCodex, btnCodexBrowser, btnCodexToggle,
            btnGatewayToggle, btnOpenCodeToggle, btnHermesToggle,
            dashboardView.findViewById(R.id.btnCodexTerm),
            dashboardView.findViewById(R.id.btnControlUi),
            dashboardView.findViewById(R.id.btnOpenCodeTerm),
            dashboardView.findViewById(R.id.btnOpenCodeWeb),
            dashboardView.findViewById(R.id.btnHermesWeb),
            dashboardView.findViewById(R.id.cardTerminal),
            settingsView.findViewById(R.id.btnGetKey),
            settingsView.findViewById(R.id.btnSaveProvider),
            terminalView.findViewById(R.id.btnTerminalRun),
        )
    }

    /** Slide-and-fade an overlay in (settings, terminal). */
    private fun showOverlay(view: View) {
        view.alpha = 0f
        view.translationX = 48f
        view.visibility = View.VISIBLE
        view.animate().alpha(1f).translationX(0f)
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    /** Slide-and-fade an overlay out, then hide it. */
    private fun hideOverlay(view: View) {
        view.animate().alpha(0f).translationX(48f)
            .setDuration(180L)
            .withEndAction { view.visibility = View.GONE }
            .start()
    }

    /** Show the native dashboard (hides web view and overlays). */
    private fun showDashboard() {
        settingsView.visibility = View.GONE
        terminalView.visibility = View.GONE
        webView.visibility = View.GONE
        dashboardView.alpha = 0f
        dashboardView.visibility = View.VISIBLE
        dashboardView.animate().alpha(1f).setDuration(240L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
        refreshDashboard()
    }

    /** Load the Dagestan Codex dashboard (bundled WORKSPACE/AI/TOOLS shell). */
    private fun openViteDashboard() {
        settingsView.visibility = View.GONE
        terminalView.visibility = View.GONE
        dashboardView.visibility = View.GONE
        webView.visibility = View.VISIBLE
        // Always start by loading the BUNDLED Dagestan dashboard from app assets.
        // The bundled HTML is the new WORKSPACE / AI / TOOLS shell — NOT the
        // upstream codex-web-local UI. The localhost server on 18925 may still
        // be up for developer live-reload, but it should never be the default
        // landing page.
        webView.loadUrl(VITE_ASSETS_URL)
        // Probe the localhost server in the background so the dashboard's
        // "Live Reload" button can swap to localhost without ever bouncing
        // back to codex-web-local. We do NOT auto-load the server URL.
        val serverUrl = serverManager.serverUrl()
        Thread {
            var serverUp = false
            for (attempt in 1..3) {
                try {
                    val c = java.net.URL(serverUrl).openConnection() as java.net.HttpURLConnection
                    c.connectTimeout = 3000; c.readTimeout = 3000; c.requestMethod = "GET"
                    val code = c.responseCode; c.disconnect()
                    if (code in 200..399) { serverUp = true; break }
                } catch (_: Exception) { }
                Thread.sleep(1000)
            }
            runOnUiThread { _liveServerUrl = if (serverUp) serverUrl else null }
        }.start()
    }

    /** Cached result of the latest localhost health check (set by openViteDashboard). */
    private var _liveServerUrl: String? = null

    /** Switch the WebView to the live localhost server (developer live-reload). */
    fun openLiveServer() {
        val url = _liveServerUrl ?: serverManager.serverUrl()
        webView.visibility = View.VISIBLE
        webView.loadUrl(url)
    }

    /** Open a localhost web UI inside the app's WebView. */
    private fun openWeb(url: String) {
        // Route the main Codex dashboard through the server
        if (url == serverManager.serverUrl()) {
            openViteDashboard()
            return
        }
        if (url == serverManager.hermesUrl() && !serverManager.isHermesRunning) {
            Toast.makeText(this, "Starting Hermes…", Toast.LENGTH_SHORT).show()
            Thread {
                waitForPortRelease(CodexServerManager.HERMES_PORT, 8000)
                if (!serverManager.isHermesInstalled()) {
                    serverManager.installHermes { msg -> runOnUiThread { appendTerminal("$msg\n") } }
                }
                val ok = serverManager.startHermesServer()
                runOnUiThread {
                    if (ok) openWeb(url)
                    else {
                        val err = serverManager.hermesLastError ?: "Hermes failed to start"
                        refreshDashboard()
                        Toast.makeText(this@MainActivity, err.take(200), Toast.LENGTH_LONG).show()
                    }
                }
            }.start()
            return
        }
        if (url == serverManager.opencodexUrl() && !serverManager.isOpenCodexRunning) {
            Toast.makeText(this, "Starting OpenCodex proxy…", Toast.LENGTH_SHORT).show()
            Thread {
                waitForPortRelease(CodexServerManager.OPENCODEX_PORT, 8000)
                if (!serverManager.isOpenCodexInstalled()) {
                    val installed = serverManager.installOpenCodex { msg -> runOnUiThread { appendTerminal("$msg\n") } }
                    if (!installed) {
                        runOnUiThread { Toast.makeText(this@MainActivity,
                            "OpenCodex install failed — check Terminal", Toast.LENGTH_LONG).show() }
                        return@Thread
                    }
                }
                val started = serverManager.startOpenCodexServer()
                if (started) {
                    val ready = serverManager.waitForOpenCodex(45_000)
                    runOnUiThread {
                        if (ready) openWeb(url)
                        else {
                            val err = serverManager.openCodexLastError ?: "OpenCodex proxy did not become ready"
                            refreshDashboard()
                            Toast.makeText(this@MainActivity, err.take(200), Toast.LENGTH_LONG).show()
                        }
                    }
                } else {
                    runOnUiThread { Toast.makeText(this@MainActivity,
                        "OpenCodex failed to start", Toast.LENGTH_LONG).show() }
                }
            }.start()
            return
        }
        if (url == serverManager.serverUrl() && !serverManager.isRunning) {
            Toast.makeText(this, "Starting Codex server…", Toast.LENGTH_SHORT).show()
            btnCodexToggle.text = "Starting…"
            Thread {
                // Wait for port to be free first
                waitForPortRelease(CodexServerManager.SERVER_PORT, 10000)
                serverManager.startProxy()
                val ok = serverManager.startServerAndWait(timeoutMs = 60_000)
                runOnUiThread {
                    if (ok) {
                        openWeb(url)
                    } else {
                        refreshDashboard()
                        Toast.makeText(
                            this@MainActivity,
                            serverManager.lastServerError
                                ?: "Server failed to start — tap Start and check the Terminal",
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                }
            }.start()
            return
        }
        settingsView.visibility = View.GONE
        terminalView.visibility = View.GONE
        dashboardView.visibility = View.GONE
        webView.visibility = View.VISIBLE
        if (webView.url != url) webView.loadUrl(url)
        else webView.reload()
    }

    private fun refreshDashboard() {
        runOnUiThread {
            val running = serverManager.isRunning
            val dot = GradientDrawable()
            dot.shape = GradientDrawable.OVAL
            dot.setColor(if (running) 0xFF22C55E.toInt() else 0xFF475569.toInt())
            codexStatusDot.background = dot
            pulseDot(running)

            codexStatusTitle.text = if (running) "Codex Running" else "Codex Stopped"
            codexStatusSub.text = if (running) {
                "Coding Agent · " + serverManager.serverUrl()
                    .removePrefix("http://").removeSuffix("/")
            } else {
                "Tap Start to launch the coding agent"
            }
            btnCodexToggle.text = if (running) "■  Stop" else "▶  Start"

            val gatewayUp = serverManager.isGatewayRunning
            gatewayStatus.text = if (gatewayUp) "Running" else "Stopped"
            gatewayStatus.setTextColor(
                if (gatewayUp) 0xFF22C55E.toInt() else 0xFF64748B.toInt()
            )
            btnGatewayToggle.text = if (gatewayUp) "Stop" else "Start"

            val opencodexUp = serverManager.isOpenCodexRunning
            opencodeStatus.text =
                if (opencodexUp) "Running · :" + CodexServerManager.OPENCODEX_PORT else "Stopped"
            opencodeStatus.setTextColor(
                if (opencodexUp) 0xFF22C55E.toInt() else 0xFF64748B.toInt()
            )
            btnOpenCodeToggle.text = if (opencodexUp) "Stop" else "Start"

            val hermesUp = serverManager.isHermesRunning
            hermesStatus.text =
                if (hermesUp) "Running · :" + CodexServerManager.HERMES_PORT else "Stopped"
            hermesStatus.setTextColor(
                if (hermesUp) 0xFF22C55E.toInt() else 0xFF64748B.toInt()
            )
            btnHermesToggle.text = if (hermesUp) "Stop" else "Start"
        }
    }

    /** Tactile press animation: shrink on touch-down, spring back on release. */
    private fun attachPressScale(vararg views: View) {
        for (v in views) {
            v.setOnTouchListener { view, ev ->
                when (ev.actionMasked) {
                    MotionEvent.ACTION_DOWN ->
                        view.animate().scaleX(0.96f).scaleY(0.96f).setDuration(90).start()
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
                        view.animate().scaleX(1f).scaleY(1f).setDuration(140).withLayer().start()
                }
                false // don't consume — click listeners still fire
            }
        }
    }

    /** Gentle alpha pulse on the status dot while Codex is running. */
    private fun pulseDot(running: Boolean) {
        dotPulse?.cancel()
        dotPulse = null
        codexStatusDot.alpha = 1f
        if (!running) return
        dotPulse = ObjectAnimator.ofFloat(codexStatusDot, View.ALPHA, 1f, 0.35f).apply {
            duration = 900
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
            start()
        }
    }

    private fun toggleCodex() {
        btnCodexToggle.isEnabled = false
        if (serverManager.isRunning) {
            isStoppingServer = true
            Thread {
                try { serverManager.stopWebServer() }
                catch (e: Exception) { Log.e(TAG, "Error stopping server: ${e.message}") }
                // Wait for port to be fully released
                waitForPortRelease(CodexServerManager.SERVER_PORT, 8000)
                isStoppingServer = false
                refreshDashboard()
                runOnUiThread { btnCodexToggle.isEnabled = true }
            }.start()
        } else {
            btnCodexToggle.text = "Starting…"
            Thread {
                // Wait for port to be free before starting
                waitForPortRelease(CodexServerManager.SERVER_PORT, 10000)
                serverManager.startProxy()
                var started = serverManager.startServerAndWait(timeoutMs = 60_000)
                // Auto-retry up to 2 times on EADDRINUSE
                var retries = 0
                while (!started && retries < 2 && (
                    serverManager.lastServerError?.contains("EADDRINUSE") == true ||
                    serverManager.lastServerError?.contains("already in use") == true)) {
                    retries++
                    Log.w(TAG, "EADDRINUSE — retry $retries/2 in 5s…")
                    runOnUiThread { Toast.makeText(this@MainActivity, "Port busy, retrying… ($retries/2)", Toast.LENGTH_SHORT).show() }
                    try { serverManager.stopWebServer() } catch (_: Exception) { }
                    waitForPortRelease(CodexServerManager.SERVER_PORT, 8000)
                    started = serverManager.startServerAndWait(timeoutMs = 60_000)
                }
                refreshDashboard()
                runOnUiThread {
                    btnCodexToggle.isEnabled = true
                    if (!started) {
                        Toast.makeText(
                            this@MainActivity,
                            serverManager.lastServerError
                                ?: "Codex failed to start — check the Terminal for errors",
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                }
            }.start()
        }
    }

    /** Wait until a TCP port is free (no process listening on it). */
    private fun waitForPortRelease(port: Int, maxWaitMs: Long) {
        val deadline = System.currentTimeMillis() + maxWaitMs
        while (System.currentTimeMillis() < deadline) {
            try {
                val conn = java.net.URL("http://127.0.0.1:$port/").openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 500; conn.readTimeout = 500; conn.requestMethod = "GET"
                conn.disconnect()
                // Port is still occupied — wait
                Thread.sleep(500)
            } catch (_: Exception) {
                // Port is free or unreachable — good
                return
            }
        }
    }

    private fun toggleGateway() {
        btnGatewayToggle.isEnabled = false
        Thread {
            try {
                if (serverManager.isGatewayRunning) {
                    isStoppingServer = true
                    serverManager.stopGateway()
                    isStoppingServer = false
                } else {
                    serverManager.configureOpenClawAuth()
                    val gwOk = serverManager.startOpenClawGateway()
                    if (!gwOk) {
                        runOnUiThread {
                            Toast.makeText(this@MainActivity,
                                "OpenClaw gateway failed to start — check Terminal",
                                Toast.LENGTH_LONG).show()
                        }
                        return@Thread
                    }
                    serverManager.startOpenClawControlUiServer()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Gateway toggle error: ${e.message}")
                runOnUiThread {
                    Toast.makeText(this@MainActivity,
                        "Gateway error: ${e.message?.take(100)}",
                        Toast.LENGTH_LONG).show()
                }
            }
            refreshDashboard()
            runOnUiThread { btnGatewayToggle.isEnabled = true }
        }.start()
    }

    private fun openControlUi() {
        Thread {
            try {
                // Ensure auth + gateway are running before opening the Control UI
                if (!serverManager.isGatewayRunning) {
                    runOnUiThread { Toast.makeText(this@MainActivity, "Starting OpenClaw gateway…", Toast.LENGTH_SHORT).show() }
                    serverManager.configureOpenClawAuth()
                    val gwOk = serverManager.startOpenClawGateway()
                    if (!gwOk) {
                        runOnUiThread { Toast.makeText(this@MainActivity,
                            "Gateway failed to start — check Terminal", Toast.LENGTH_LONG).show() }
                        return@Thread
                    }
                    // Wait for gateway WebSocket to be ready
                    Thread.sleep(2000)
                }
                serverManager.startOpenClawControlUiServer()
                // Wait for the control UI server to be ready
                val deadline = System.currentTimeMillis() + 15_000
                while (System.currentTimeMillis() < deadline) {
                    try {
                        val c = java.net.URL(serverManager.controlUiUrl()).openConnection() as java.net.HttpURLConnection
                        c.connectTimeout = 1000; c.readTimeout = 1000; c.requestMethod = "GET"
                        if (c.responseCode in 200..399) { c.disconnect(); break }
                        c.disconnect()
                    } catch (_: Exception) { }
                    Thread.sleep(500)
                }
                // Also wait for WebSocket port to be ready
                Thread.sleep(1000)
                runOnUiThread { openWeb(serverManager.controlUiLaunchUrl()) }
            } catch (e: Exception) {
                Log.e(TAG, "Control UI error: ${e.message}")
                runOnUiThread {
                    Toast.makeText(this@MainActivity,
                        "Control UI error: ${e.message?.take(100)}",
                        Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private var swarmStatus: TextView? = null
    private val permLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { granted ->
        Toast.makeText(this,
            if (granted) "Permission granted ✓" else "Permission denied — the agent won't be able to use this",
            Toast.LENGTH_SHORT).show()
    }
    private fun requestPerm(perm: String, label: String) {
        if (checkSelfPermission(perm) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "$label already connected ✓", Toast.LENGTH_SHORT).show()
        } else {
            permLauncher.launch(perm)
        }
    }

    /** Show the AI Swarm task dialog — user enters a task, agents run in parallel. */
    private fun showSwarmDialog() {
        val input = EditText(this).apply {
            hint = "e.g. Build a React auth dashboard with Postgres"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 2
            setPadding(48, 32, 48, 16)
        }
        AlertDialog.Builder(this)
            .setTitle("\uD83D\uDC1D AI Swarm \u2014 Enter your task")
            .setMessage("Multiple free AI models collaborate on this task in parallel.\n\nAgents: Architect (DeepSeek) \u00B7 Coder (Qwen) \u00B7 Reviewer (Llama) \u00B7 DevOps (Gemma)\n\nRequires the OpenCodex proxy running.")
            .setView(input)
            .setPositiveButton("Launch Swarm") { _, _ ->
                val task = input.text.toString().trim()
                if (task.isBlank()) return@setPositiveButton
                if (!serverManager.isOpenCodexRunning) {
                    Toast.makeText(this, "Start the OpenCodex proxy first", Toast.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                showTerminal()
                Thread {
                    runOnUiThread { swarmStatus?.text = "Running 4 agents\u2026" }
                    val ok = serverManager.launchSwarm(task) { line -> appendTerminal(line) }
                    runOnUiThread {
                        swarmStatus?.text = "Swarm complete \u2014 $ok/4 agents succeeded"
                        Toast.makeText(this@MainActivity,
                            "AI Swarm finished: $ok/4 agents completed",
                            Toast.LENGTH_SHORT).show()
                    }
                }.start()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun toggleOpenCodex() {
        btnOpenCodeToggle.isEnabled = false
        Thread {
            try {
                if (serverManager.isOpenCodexRunning) {
                    isStoppingServer = true
                    serverManager.stopOpenCodex()
                    waitForPortRelease(CodexServerManager.OPENCODEX_PORT, 5000)
                    isStoppingServer = false
                } else {
                    waitForPortRelease(CodexServerManager.OPENCODEX_PORT, 8000)
                    if (!serverManager.isOpenCodexInstalled()) {
                        val installed = serverManager.installOpenCodex { msg -> runOnUiThread { appendTerminal("$msg\n") } }
                        if (!installed) {
                            runOnUiThread {
                                Toast.makeText(this@MainActivity,
                                    "OpenCodex install failed — check the Terminal",
                                    Toast.LENGTH_LONG).show()
                            }
                            return@Thread
                        }
                    }
                    val started = serverManager.startOpenCodexServer()
                    if (!started) {
                        runOnUiThread {
                            Toast.makeText(this@MainActivity,
                                "OpenCodex failed to start",
                                Toast.LENGTH_LONG).show()
                        }
                        return@Thread
                    }
                    val ready = serverManager.waitForOpenCodex(45_000)
                    if (!ready) {
                        val err = serverManager.openCodexLastError ?: "OpenCodex proxy did not become ready"
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, err.take(200), Toast.LENGTH_LONG).show()
                        }
                    } else {
                        runOnUiThread {
                            Toast.makeText(this@MainActivity,
                                "Codex now routes through OpenCodex at :10101",
                                Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "OpenCodex toggle error: ${e.message}")
            }
            refreshDashboard()
            runOnUiThread { btnOpenCodeToggle.isEnabled = true }
        }.start()
    }

    private fun toggleHermes() {
        btnHermesToggle.isEnabled = false
        Thread {
            try {
                if (serverManager.isHermesRunning) {
                    isStoppingServer = true
                    serverManager.stopHermes()
                    waitForPortRelease(CodexServerManager.HERMES_PORT, 5000)
                    isStoppingServer = false
                } else {
                    waitForPortRelease(CodexServerManager.HERMES_PORT, 8000)
                    if (!serverManager.isHermesInstalled()) {
                        val installed = serverManager.installHermes { msg -> runOnUiThread { appendTerminal("$msg\n") } }
                        if (!installed) {
                            runOnUiThread {
                                Toast.makeText(this@MainActivity,
                                    "Hermes install failed — check Terminal (Python required)",
                                    Toast.LENGTH_LONG).show()
                            }
                            return@Thread
                        }
                    }
                    val hermesOk = serverManager.startHermesServer()
                    if (!hermesOk) {
                        val err = serverManager.hermesLastError ?: "Hermes failed to start"
                        runOnUiThread {
                            Toast.makeText(this@MainActivity, err.take(200), Toast.LENGTH_LONG).show()
                        }
                        return@Thread
                    }
                    runOnUiThread {
                        Toast.makeText(this@MainActivity,
                            "Hermes WebUI ready at :8788",
                            Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Hermes toggle error: ${e.message}")
            }
            refreshDashboard()
            runOnUiThread { btnHermesToggle.isEnabled = true }
        }.start()
    }

    // ── Terminal overlay ────────────────────────────────────────────────────

    internal fun showTerminal() {
        if (terminalView.visibility != View.VISIBLE) showOverlay(terminalView)
        if (terminalHistory.isEmpty()) {
            terminalHistory
                .append("Dagestan proot shell — type a command and press Run.\n\n")
            terminalOutput.text = terminalHistory
        }
    }

    private fun hideTerminal() {
        hideOverlay(terminalView)
    }

    private fun appendTerminal(text: String) {
        runOnUiThread {
            terminalHistory.append(text)
            terminalOutput.text = terminalHistory
            terminalScroll.post { terminalScroll.fullScroll(View.FOCUS_DOWN) }
        }
    }

    private fun runTerminalCommand() {
        val cmd = terminalInput.text.toString().trim()
        if (cmd.isEmpty()) return
        terminalInput.setText("")
        runTerminalCommand(cmd)
    }

    /** Run [cmd] in the proot prefix, streaming output into the terminal. */
    private fun runTerminalCommand(cmd: String) {
        appendTerminal("❯ $cmd\n")
        Thread {
            try {
                serverManager.runInPrefix(cmd) { line -> appendTerminal("$line\n") }
            } catch (e: Exception) {
                appendTerminal("error: ${e.message}\n")
            }
            appendTerminal("\n")
        }.start()
    }

    // ── Settings overlay ───────────────────────────────────────────────────

    internal fun showSettings() {
        val savedId = serverManager.savedProviderId()
        selectedSettingsProvider = CodexServerManager.PROVIDERS
            .indexOfFirst { it.id == savedId }
            .coerceAtLeast(0)
        updateProviderFields()
        providerStatus.visibility = View.GONE
        showOverlay(settingsView)
    }

    private fun hideSettings() {
        hideOverlay(settingsView)
    }

    /** Sync the provider card UI with [selectedSettingsProvider]. */
    private fun updateProviderFields() {
        val p = CodexServerManager.PROVIDERS.getOrNull(selectedSettingsProvider) ?: return
        buildProviderList()
        providerKeyInput.setText(serverManager.savedApiKey(p.id))
        providerKeyInput.hint = "Paste your ${p.label} key…"
        providerNote.text = p.note
        val isCustom = p.id == "custom"
        customUrlInput.visibility = if (isCustom) View.VISIBLE else View.GONE
        customModelInput.visibility = if (isCustom) View.VISIBLE else View.GONE
        if (isCustom) {
            if (customUrlInput.text.isNullOrBlank()) {
                customUrlInput.setText(serverManager.customBaseUrl())
            }
            if (customModelInput.text.isNullOrBlank()) {
                customModelInput.setText(serverManager.customModel())
            }
        }
        settingsView.findViewById<View>(R.id.btnGetKey).visibility =
            if (p.keyUrl.isBlank()) View.GONE else View.VISIBLE
    }

    /** Rebuild the inline provider rows — tap a row to select it. */
    private fun buildProviderList() {
        val density = resources.displayMetrics.density
        providerList.removeAllViews()
        CodexServerManager.PROVIDERS.forEachIndexed { index, p ->
            val selected = index == selectedSettingsProvider
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setBackgroundResource(R.drawable.btn_secondary)
                setPadding(
                    (14 * density).toInt(), (11 * density).toInt(),
                    (14 * density).toInt(), (11 * density).toInt(),
                )
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = if (index == 0) 0 else (8 * density).toInt() }
                setOnClickListener {
                    selectedSettingsProvider = index
                    updateProviderFields()
                }
            }
            val label = TextView(this).apply {
                text = "${p.label}  ·  ${p.badge}"
                setTextColor(0xFFE2E8F0.toInt())
                textSize = 14f
                layoutParams = LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f,
                )
            }
            val radio = TextView(this).apply {
                text = if (selected) "◉" else "○"
                setTextColor(
                    if (selected) 0xFF22C55E.toInt() else 0xFF475569.toInt()
                )
                textSize = 16f
            }
            row.addView(label)
            row.addView(radio)
            attachPressScale(row)
            providerList.addView(row)
        }
    }

    private fun saveProvider() {
        val provider = CodexServerManager.PROVIDERS.getOrNull(selectedSettingsProvider)
            ?: return
        val key = providerKeyInput.text.toString().trim()
        if (key.isEmpty()) {
            providerStatus.setTextColor(0xFFF87171.toInt())
            providerStatus.text = "Enter your ${provider.label} API key"
            providerStatus.visibility = View.VISIBLE
            return
        }
        if (provider.id == "custom" && customUrlInput.text.toString().trim().isBlank()) {
            providerStatus.setTextColor(0xFFF87171.toInt())
            providerStatus.text = "Enter the base URL (https://…/v1)"
            providerStatus.visibility = View.VISIBLE
            return
        }
        if (provider.id == "custom") {
            serverManager.setCustomEndpoint(
                customUrlInput.text.toString(),
                customModelInput.text.toString(),
            )
        }
        val btn = settingsView.findViewById<View>(R.id.btnSaveProvider)
        btn.isEnabled = false
        Thread {
            val ok = serverManager.configureProvider(provider.id, key)
            runOnUiThread {
                btn.isEnabled = true
                providerStatus.setTextColor(
                    if (ok) 0xFF34D399.toInt() else 0xFFF87171.toInt()
                )
                providerStatus.text = if (ok) {
                    "Connected to ${provider.label}"
                } else {
                    "Could not save — check the key and try again"
                }
                providerStatus.alpha = 0f
                providerStatus.visibility = View.VISIBLE
                providerStatus.animate().alpha(1f).setDuration(200L).start()
                refreshDashboard()
            }
        }.start()
    }

    // ── UI helpers ──────────────────────────────────────────────────────────

    /** Inflate the 6-row setup checklist. */
    private fun buildStepList() {
        val list = findViewById<LinearLayout>(R.id.stepList)
        val ids = listOf(
            R.id.step1, R.id.step2, R.id.step3,
            R.id.step4, R.id.step5, R.id.step6,
        )
        for (id in ids) {
            val row = list.findViewById<View>(id)
            val label = row.findViewById<TextView>(R.id.stepLabel)
            val icon = row.findViewById<ImageView>(R.id.stepIcon)
            label.text = STEP_LABELS[stepRows.size]
            stepRows.add(label to icon)
        }
    }

    /** Gentle infinite scale-pulse on the splash logo. */
    /**
     * v3.0 alpha2+: hidden gesture — long-press the splash logo to toggle
     * the Compose shell. A Toast confirms the new state. Replaces the
     * legacy activity on next launch. rc1+ replaces this with a real
     * Settings toggle.
     */
    private fun bindComposeShellToggle() {
        splashLogo.setOnLongClickListener {
            val current = DagestanPrefs.useComposeShell(this)
            val next = !current
            DagestanPrefs.setUseComposeShell(this, next)
            val msg = if (next) "Compose shell ON — relaunch" else "Legacy shell ON — relaunch"
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
            true
        }
    }

    private fun startLogoPulse() {
        val scaleX = ObjectAnimator.ofFloat(splashLogo, View.SCALE_X, 1f, 1.08f)
        val scaleY = ObjectAnimator.ofFloat(splashLogo, View.SCALE_Y, 1f, 1.08f)
        listOf(scaleX, scaleY).forEach {
            it.duration = 1100
            it.repeatCount = ObjectAnimator.INFINITE
            it.repeatMode = ObjectAnimator.REVERSE
            it.interpolator = AccelerateDecelerateInterpolator()
        }
        AnimatorSet().apply { playTogether(scaleX, scaleY); start() }
    }

    /**
     * Mark checklist state: steps before [index] are done, [index] is active,
     * the rest pending. Pass STEP_LABELS.size to complete everything.
     */
    private fun markStep(index: Int) {
        runOnUiThread {
            currentStep = index
            for (i in stepRows.indices) {
                val (label, icon) = stepRows[i]
                when {
                    i < index -> {
                        label.setTextColor(0xFF94A3B8.toInt())
                        icon.setImageResource(R.drawable.setup_step_done)
                    }
                    i == index -> {
                        label.setTextColor(0xFFF8FAFC.toInt())
                        icon.setImageResource(R.drawable.setup_step_active)
                    }
                    else -> {
                        label.setTextColor(0xFF475569.toInt())
                        icon.setImageResource(R.drawable.setup_step_pending)
                    }
                }
            }
            val parent = progressTrack.parent as View
            val pct = (index.coerceIn(0, STEP_LABELS.size)) / STEP_LABELS.size.toFloat()
            val target = (parent.width * pct).toInt().coerceAtLeast(2)
            ValueAnimator.ofInt(
                progressTrack.layoutParams.width.coerceAtLeast(2),
                target,
            ).apply {
                duration = 400
                addUpdateListener { anim ->
                    progressTrack.layoutParams.width = anim.animatedValue as Int
                    progressTrack.requestLayout()
                }
                start()
            }
        }
    }

    private fun showError(message: String) {
        // Truncate long stack traces — show only the first meaningful line
        val friendlyMessage = message
            .split("\n")
            .firstOrNull { it.isNotBlank() && !it.startsWith("at ") && !it.startsWith("\tat ") }
            ?.take(300) ?: message.take(300)

        // Add helpful context if it's an EADDRINUSE error
        val displayMessage = if (friendlyMessage.contains("EADDRINUSE") || friendlyMessage.contains("already in use")) {
            "Port ${CodexServerManager.SERVER_PORT} is busy. Close other apps using it, or wait 10 seconds and try again.\n\n" + friendlyMessage.take(200)
        } else {
            friendlyMessage
        }

        AlertDialog.Builder(this)
            .setTitle(R.string.error_title)
            .setMessage(displayMessage)
            .setPositiveButton(R.string.retry) { _, _ ->
                startSetupFlow()
            }
            .setNegativeButton(R.string.cancel) { _, _ ->
                // Go to dashboard instead of leaving user stuck on loading
                showLoading(false)
                showDashboard()
            }
            .setCancelable(true)
            .show()
    }

    private fun showLoading(show: Boolean) {
        loadingOverlay.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun setStatus(text: String, detail: String? = null) {
        statusText.text = text
        if (detail != null) {
            statusDetail.text = detail
            statusDetail.visibility = View.VISIBLE
        } else {
            statusDetail.visibility = View.GONE
        }
    }

    private fun updateStatus(text: String, detail: String? = null) {
        runOnUiThread { setStatus(text, detail) }
    }

    private fun updateDetail(text: String) {
        runOnUiThread {
            statusDetail.text = text
            statusDetail.visibility = View.VISIBLE
        }
    }


    /**
     * Ask for RECORD_AUDIO the first time the user opens the shell.
     * The voice service can only start once this is granted. If the
     * user declines, the chat still works via the keyboard — only
     * the wake-word "Hey Dagestan" loop is disabled.
     */
    private fun requestRecordAudioIfNeeded() {
        if (android.content.pm.PackageManager.PERMISSION_GRANTED ==
            checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)) {
            // Already granted — start the voice loop immediately.
            com.dagestan.mobile.services.VoiceService.getInstance(applicationContext).start()
            return
        }
        requestPermissions(
            arrayOf(android.Manifest.permission.RECORD_AUDIO),
            0xDA65, // arbitrary request code
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 0xDA65 &&
            grantResults.isNotEmpty() &&
            grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            com.dagestan.mobile.services.VoiceService.getInstance(applicationContext).start()
        }
    }
}
