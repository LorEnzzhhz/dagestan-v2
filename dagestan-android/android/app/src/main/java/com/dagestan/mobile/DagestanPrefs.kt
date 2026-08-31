package com.dagestan.mobile

import android.content.Context
import com.dagestan.mobile.ui.theme.DagestanPalette
import com.dagestan.mobile.ui.theme.DagestanThemeMode

/**
 * Dagestan feature flags + persistent prefs.
 *
 * alpha2: useComposeShell
 * alpha3: + theme palette + theme mode
 *
 * The Settings UI that flips the theme prefs is a beta1 feature. For
 * alpha3 the user can flip them via the Pulse screen's palette button
 * (a quick test affordance) or programmatically. rc1 replaces the
 * palette button with a real Settings sheet.
 */
object DagestanPrefs {

    private const val FILE = "dagestan_prefs"
    private const val KEY_USE_COMPOSE_SHELL = "use_compose_shell"
    private const val KEY_THEME_PALETTE = "theme_palette"
    private const val KEY_THEME_MODE = "theme_mode"

    fun useComposeShell(context: Context): Boolean =
        prefs(context).getBoolean(KEY_USE_COMPOSE_SHELL, false)

    fun setUseComposeShell(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_USE_COMPOSE_SHELL, value).apply()
    }

    fun themePalette(context: Context): DagestanPalette {
        val raw = prefs(context).getString(KEY_THEME_PALETTE, null) ?: return DagestanPalette.CAUCASUS
        return runCatching { DagestanPalette.valueOf(raw) }.getOrDefault(DagestanPalette.CAUCASUS)
    }

    fun setThemePalette(context: Context, palette: DagestanPalette) {
        prefs(context).edit().putString(KEY_THEME_PALETTE, palette.name).apply()
    }

    fun themeMode(context: Context): DagestanThemeMode {
        val raw = prefs(context).getString(KEY_THEME_MODE, null) ?: return DagestanThemeMode.SYSTEM
        return runCatching { DagestanThemeMode.valueOf(raw) }.getOrDefault(DagestanThemeMode.SYSTEM)
    }

    fun setThemeMode(context: Context, mode: DagestanThemeMode) {
        prefs(context).edit().putString(KEY_THEME_MODE, mode.name).apply()
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
