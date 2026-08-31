package com.dagestan.mobile.ui.animation

import android.provider.Settings
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/**
 * Single source of truth for animation tokens in the v3 Compose shell.
 * Every screen pulls durations, easings, and spring specs from here —
 * no magic numbers scattered around.
 */
object DagestanAnimations {

    // ── Duration tokens (ms) ──────────────────────────────────────────
    const val INSTANT_MS = 0
    const val FAST_MS = 120
    const val DEFAULT_MS = 240
    const val SLOW_MS = 360
    const val PAGE_MS = 300
    const val PULSE_MS = 1500

    // ── Easing tokens ────────────────────────────────────────────────
    val EnterExit = FastOutSlowInEasing
    val ItemSlide = LinearOutSlowInEasing
    val Linear = LinearEasing
    val Pulse = EaseInOut

    // ── Spring tokens ────────────────────────────────────────────────
    val PressSpring: androidx.compose.animation.core.SpringSpec<Float> = spring(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    val DefaultSpring: androidx.compose.animation.core.SpringSpec<Float> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )

    // ── Spec builders ────────────────────────────────────────────────
    // Concrete Float variants; the screens that need IntSize/IntOffset
    // animations can call the underlying tween() directly.
    fun tweenFastFloat(): androidx.compose.animation.core.FiniteAnimationSpec<Float> =
        tween(durationMillis = FAST_MS, easing = EnterExit)
    fun tweenDefaultFloat(): androidx.compose.animation.core.FiniteAnimationSpec<Float> =
        tween(durationMillis = DEFAULT_MS, easing = EnterExit)
    fun tweenSlowFloat(): androidx.compose.animation.core.FiniteAnimationSpec<Float> =
        tween(durationMillis = SLOW_MS, easing = EnterExit)
    fun tweenPageFloat(): androidx.compose.animation.core.FiniteAnimationSpec<Float> =
        tween(durationMillis = PAGE_MS, easing = EnterExit)
    fun tweenFastIntSize(): androidx.compose.animation.core.FiniteAnimationSpec<androidx.compose.ui.unit.IntSize> =
        tween(durationMillis = FAST_MS, easing = EnterExit)
    fun tweenDefaultIntSize(): androidx.compose.animation.core.FiniteAnimationSpec<androidx.compose.ui.unit.IntSize> =
        tween(durationMillis = DEFAULT_MS, easing = EnterExit)
    fun tweenFastIntOffset(): androidx.compose.animation.core.FiniteAnimationSpec<androidx.compose.ui.unit.IntOffset> =
        tween(durationMillis = FAST_MS, easing = EnterExit)
    fun tweenDefaultIntOffset(): androidx.compose.animation.core.FiniteAnimationSpec<androidx.compose.ui.unit.IntOffset> =
        tween(durationMillis = DEFAULT_MS, easing = EnterExit)
}

/**
 * True iff the user (or system) has asked for reduced motion. When true
 * the v3 shell should skip non-essential animations. Reads
 * `Settings.Global.ANIMATOR_DURATION_SCALE` (0 = off).
 */
@Composable
fun prefersReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        try {
            val scale = android.provider.Settings.Global.getFloat(
                context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1f,
            )
            scale == 0f
        } catch (_: Throwable) {
            false
        }
    }
}

/**
 * Press-scale modifier. Card scales down to 0.97 on press, springs
 * back when released. Honors `prefersReducedMotion()`.
 */
fun Modifier.pressScale(
    pressedScale: Float = 0.97f,
    enabled: Boolean = true,
): Modifier = composed {
    if (!enabled) return@composed this
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val reduced = prefersReducedMotion()
    val scale by animateFloatAsState(
        targetValue = if (isPressed && !reduced) pressedScale else 1f,
        animationSpec = DagestanAnimations.PressSpring,
        label = "press-scale",
    )
    this
        .scale(scale)
}

/**
 * Infinite breathing alpha for status dots. Goes 1.0 → 0.4 → 1.0.
 * Used on the Home tab server status dots when a service is running.
 */
@Composable
fun rememberPulseAlpha(
    durationMs: Int = DagestanAnimations.PULSE_MS,
    minAlpha: Float = 0.4f,
    maxAlpha: Float = 1f,
): Float {
    val reduced = prefersReducedMotion()
    val transition = rememberInfiniteTransition(label = "pulse-alpha")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = durationMs, easing = DagestanAnimations.Pulse),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse-alpha-anim",
    )
    return if (reduced) maxAlpha else (minAlpha + (maxAlpha - minAlpha) * t)
}
