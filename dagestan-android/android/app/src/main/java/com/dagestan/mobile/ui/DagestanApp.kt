package com.dagestan.mobile.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dagestan.mobile.DagestanPrefs
import com.dagestan.mobile.services.PulseService
import com.dagestan.mobile.services.VoiceService
import com.dagestan.mobile.ui.screens.ChatScreen
import com.dagestan.mobile.ui.screens.HomeScreen
import com.dagestan.mobile.ui.screens.PulseScreen
import com.dagestan.mobile.ui.screens.SkillsScreen
import com.dagestan.mobile.ui.screens.VaultScreen
import com.dagestan.mobile.ui.theme.DagestanPalette
import com.dagestan.mobile.ui.theme.DagestanTheme
import com.dagestan.mobile.ui.theme.DagestanThemeMode

private data class Tab(
    val key: String,
    val label: String,
    val icon: @Composable () -> Unit,
    val content: @Composable (DagestanThemeController) -> Unit,
)

/**
 * Compose root for the v3 shell. Renders a 5-tab bottom nav:
 *
 *   Home | Chat | Skills | Vault | Pulse
 *
 * beta2 additions:
 *   - [VoiceService] starts on first composition (subject to
 *     RECORD_AUDIO permission), stops on dispose. The
 *     [VoiceOverlay] floats above the bottom nav whenever the
 *     service is listening.
 */
@Composable
fun DagestanApp() {
    val context = LocalContext.current
    var palette by remember { mutableStateOf(DagestanPrefs.themePalette(context)) }
    var mode by remember { mutableStateOf(DagestanPrefs.themeMode(context)) }

    val controller = remember(palette, mode) {
        DagestanThemeController(
            palette = palette,
            mode = mode,
            onPaletteChange = { p ->
                DagestanPrefs.setThemePalette(context, p)
                palette = p
            },
            onModeChange = { m ->
                DagestanPrefs.setThemeMode(context, m)
                mode = m
            },
        )
    }

    LaunchedEffect(Unit) {
        PulseService.getInstance(context).start()
        // Voice: only start if we already have the permission. If
        // not, the user can grant it in Settings (beta3). beta2
        // does not prompt inline; the user opens the app once
        // and grants mic permission via the system dialog that
        // pops the first time the recognizer is asked to start.
        val voice = VoiceService.getInstance(context)
        if (voice.hasRecordPermission()) voice.start()
    }
    DisposableEffect(Unit) {
        onDispose {
            PulseService.getInstance(context).stop()
            // Don't stop Voice on dispose: the user can background
            // the app and still want wake-word listening. A real
            // product would move this to a foreground service.
        }
    }

    DagestanTheme(palette = palette, mode = mode) {
        val tabs = remember {
            listOf(
                Tab("home",    "Home",    { Icon(Icons.Filled.Home,    contentDescription = null) },                   { HomeScreen() }),
                Tab("chat",    "Chat",    { Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null) },          { ChatScreen() }),
                Tab("skills",  "Skills",  { Icon(Icons.Filled.Build,   contentDescription = null) },                   { SkillsScreen() }),
                Tab("vault",   "Vault",   { Icon(Icons.Filled.AccountBalanceWallet, contentDescription = null) },        { VaultScreen() }),
                Tab("pulse",   "Pulse",   { Icon(Icons.Filled.Speed,   contentDescription = null) },                   { c -> PulseScreen(controller = c) }),
            )
        }
        var selected by remember { mutableStateOf(tabs.first().key) }
        val current = tabs.first { it.key == selected }

        Scaffold(
            modifier = Modifier.fillMaxSize(),
            bottomBar = {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = tab.key == selected,
                            onClick = { selected = tab.key },
                            icon = tab.icon,
                            label = { Text(tab.label) },
                        )
                    }
                }
            },
        ) { inner ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(inner),
            ) {
                current.content(controller)
                // Float the voice pill above the bottom nav so it's
                // visible on every tab.
                Column(
                    modifier = Modifier.fillMaxSize().padding(bottom = 0.dp),
                ) {
                    Box(modifier = Modifier.weight(1f)) { /* spacer */ }
                    VoiceOverlay()
                }
            }
        }
    }
}

/**
 * Threaded into screens that want to change the theme.
 */
class DagestanThemeController(
    val palette: DagestanPalette,
    val mode: DagestanThemeMode,
    private val onPaletteChange: (DagestanPalette) -> Unit,
    private val onModeChange: (DagestanThemeMode) -> Unit,
) {
    val palettes: List<DagestanPalette> = DagestanPalette.values().toList()
    val modes: List<DagestanThemeMode> = DagestanThemeMode.values().toList()

    fun cyclePalette() {
        val idx = palettes.indexOf(palette)
        val next = palettes[(idx + 1) % palettes.size]
        onPaletteChange(next)
    }

    fun setPalette(p: DagestanPalette) = onPaletteChange(p)
    fun cycleMode() {
        val idx = modes.indexOf(mode)
        val next = modes[(idx + 1) % modes.size]
        onModeChange(next)
    }
    fun setMode(m: DagestanThemeMode) = onModeChange(m)
}
