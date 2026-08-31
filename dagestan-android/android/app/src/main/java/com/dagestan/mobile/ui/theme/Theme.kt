package com.dagestan.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Dagestan palettes (alpha3).
 *
 * Each palette defines a "primary" + "secondary" + "tertiary" triplet
 * plus a 4-step neutral ramp. 4 palettes are shipped:
 *
 *   - Caucasus     (the original; green/red/blue flag bands, slate bg)
 *   - BlackSea     (cool blue, deep teal, slate bg)
 *   - SunsetRidge  (warm amber, ember red, near-black bg)
 *   - SnowPeak     (monochrome white/grey, off-white bg, light)
 *
 * The user picks palette + light/dark/system in Settings (alpha3 ships
 * the choice through [DagestanTheme]; the Settings UI is a beta1 feature).
 */
enum class DagestanPalette {
    CAUCASUS,
    BLACK_SEA,
    SUNSET_RIDGE,
    SNOW_PEAK,
}

data class PaletteColors(
    val primary: Color,
    val onPrimary: Color,
    val secondary: Color,
    val onSecondary: Color,
    val tertiary: Color,
    val onTertiary: Color,
    val background: Color,
    val onBackground: Color,
    val surface: Color,
    val onSurface: Color,
    val surfaceVariant: Color,
    val onSurfaceVariant: Color,
    val error: Color,
    val onError: Color,
)

object DagestanPalettes {

    val CAUCASUS_DARK = PaletteColors(
        primary = Color(0xFF22C55E),  onPrimary = Color(0xFF020617),
        secondary = Color(0xFF3B82F6), onSecondary = Color(0xFFF1F5F9),
        tertiary = Color(0xFFEF4444),  onTertiary = Color(0xFFF1F5F9),
        background = Color(0xFF020617), onBackground = Color(0xFFF1F5F9),
        surface = Color(0xFF0F172A), onSurface = Color(0xFFF1F5F9),
        surfaceVariant = Color(0xFF1E293B), onSurfaceVariant = Color(0xFF94A3B8),
        error = Color(0xFFEF4444), onError = Color(0xFFF1F5F9),
    )

    val CAUCASUS_LIGHT = PaletteColors(
        primary = Color(0xFF16A34A),  onPrimary = Color(0xFFFFFFFF),
        secondary = Color(0xFF2563EB), onSecondary = Color(0xFFFFFFFF),
        tertiary = Color(0xFFDC2626),  onTertiary = Color(0xFFFFFFFF),
        background = Color(0xFFF8FAFC), onBackground = Color(0xFF0F172A),
        surface = Color(0xFFFFFFFF),  onSurface = Color(0xFF0F172A),
        surfaceVariant = Color(0xFFE2E8F0), onSurfaceVariant = Color(0xFF475569),
        error = Color(0xFFDC2626), onError = Color(0xFFFFFFFF),
    )

    val BLACK_SEA_DARK = PaletteColors(
        primary = Color(0xFF06B6D4),  onPrimary = Color(0xFF022C22),
        secondary = Color(0xFF14B8A6), onSecondary = Color(0xFF022C22),
        tertiary = Color(0xFF0EA5E9),  onTertiary = Color(0xFF022C22),
        background = Color(0xFF0A0F1C), onBackground = Color(0xFFE0F2FE),
        surface = Color(0xFF111827), onSurface = Color(0xFFE0F2FE),
        surfaceVariant = Color(0xFF1F2937), onSurfaceVariant = Color(0xFF93C5FD),
        error = Color(0xFFEF4444), onError = Color(0xFFFFFFFF),
    )

    val SUNSET_RIDGE_DARK = PaletteColors(
        primary = Color(0xFFF59E0B),  onPrimary = Color(0xFF1C1917),
        secondary = Color(0xFFEAB308), onSecondary = Color(0xFF1C1917),
        tertiary = Color(0xFFEF4444),  onTertiary = Color(0xFFFFFFFF),
        background = Color(0xFF0C0A09), onBackground = Color(0xFFFEF3C7),
        surface = Color(0xFF1C1917), onSurface = Color(0xFFFEF3C7),
        surfaceVariant = Color(0xFF292524), onSurfaceVariant = Color(0xFFD6D3D1),
        error = Color(0xFFEF4444), onError = Color(0xFFFFFFFF),
    )

    val SNOW_PEAK_LIGHT = PaletteColors(
        primary = Color(0xFF111827),  onPrimary = Color(0xFFFFFFFF),
        secondary = Color(0xFF4B5563), onSecondary = Color(0xFFFFFFFF),
        tertiary = Color(0xFF1F2937),  onTertiary = Color(0xFFFFFFFF),
        background = Color(0xFFFAFAFA), onBackground = Color(0xFF111827),
        surface = Color(0xFFFFFFFF),  onSurface = Color(0xFF111827),
        surfaceVariant = Color(0xFFF1F5F9), onSurfaceVariant = Color(0xFF6B7280),
        error = Color(0xFFB91C1C), onError = Color(0xFFFFFFFF),
    )

    fun forPalette(palette: DagestanPalette, dark: Boolean): PaletteColors = when (palette) {
        DagestanPalette.CAUCASUS     -> if (dark) CAUCASUS_DARK    else CAUCASUS_LIGHT
        DagestanPalette.BLACK_SEA    -> BLACK_SEA_DARK   // dark only
        DagestanPalette.SUNSET_RIDGE -> SUNSET_RIDGE_DARK // dark only
        DagestanPalette.SNOW_PEAK    -> SNOW_PEAK_LIGHT  // light only
    }
}

enum class DagestanThemeMode { SYSTEM, LIGHT, DARK }

val LocalDagestanPalette = staticCompositionLocalOf { DagestanPalette.CAUCASUS }
val LocalDagestanThemeMode = staticCompositionLocalOf { DagestanThemeMode.SYSTEM }

@Composable
fun DagestanTheme(
    palette: DagestanPalette = DagestanPalette.CAUCASUS,
    mode: DagestanThemeMode = DagestanThemeMode.SYSTEM,
    content: @Composable () -> Unit,
) {
    val systemDark = isSystemInDarkTheme()
    val dark = when (mode) {
        DagestanThemeMode.SYSTEM -> systemDark
        DagestanThemeMode.LIGHT  -> false
        DagestanThemeMode.DARK   -> true
    }
    val colors = DagestanPalettes.forPalette(palette, dark)
    val baseScheme = if (dark) darkColorScheme() else lightColorScheme()
    val scheme = baseScheme.copy(
        primary = colors.primary, onPrimary = colors.onPrimary,
        secondary = colors.secondary, onSecondary = colors.onSecondary,
        tertiary = colors.tertiary, onTertiary = colors.onTertiary,
        background = colors.background, onBackground = colors.onBackground,
        surface = colors.surface, onSurface = colors.onSurface,
        surfaceVariant = colors.surfaceVariant, onSurfaceVariant = colors.onSurfaceVariant,
        error = colors.error, onError = colors.onError,
    )
    CompositionLocalProvider(
        LocalDagestanPalette provides palette,
        LocalDagestanThemeMode provides mode,
    ) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
