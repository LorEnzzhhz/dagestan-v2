# Dagestan Animations — research summary (beta1)

Sources consulted:
- developer.android.com/develop/ui/compose/animation/introduction
- developer.android.com/develop/ui/compose/animation/customize-animation
- developer.android.com/develop/ui/compose/animation/animate-content-size
- developer.android.com/develop/ui/compose/animation/value-based-animation
- developer.android.com/develop/ui/compose/animation/shared-elements

## Available APIs (Compose 1.6.8, what beta1 ships)

| API | Purpose | Where used in beta1 |
|---|---|---|
| `animateFloatAsState` | Smoothly animate a single Float (alpha, scale, offset) | Status dot pulse, FAB press |
| `animateDpAsState` / `animateColorAsState` | Same but for `Dp` / `Color` | Card press elevation, color tween |
| `AnimatedVisibility` | Show/hide with enter/exit transitions | Vault "Add" dialog, Chat composer slide-in |
| `animateContentSize` | Auto-animate size changes | Vault row delete, Chat message bubble append |
| `AnimatedContent` | Crossfade / slide between different composables | Bottom nav tab switch (Home → Chat → Skills …) |
| `Crossfade` | Lightweight variant of `AnimatedContent` | Theme palette switch preview |
| `rememberInfiniteTransition` | Continuous looped animation | Status pulse dots (1.5 s breathing) |
| `Transition` + `updateTransition` | Coordinated multi-value animation | Card press (scale + elevation + alpha) |
| `spring()` / `tween()` / `keyframes()` | AnimationSpec builders | Centralized in `DagestanAnimations` |

## What 1.6.8 does NOT give us (1.7+ only)

- `SharedTransitionLayout` / `Modifier.sharedElement()` — would unlock
  real list-to-detail transitions. Out of scope for beta1; tracked for rc1.

## Design decisions for beta1

1. **Single source of truth** for durations, easings, and spring specs
   in `DagestanAnimations.kt`. No magic numbers scattered in screens.
2. **Respect reduced motion.** Every animation reads
   `Settings.Global.ANIMATOR_DURATION_SCALE`; if the user (or system) set
   it to 0, all custom animations short-circuit to 0 ms.
3. **Spring over tween by default** for in-place state changes (press,
   selection) — feels more physical, less robotic.
4. **Tween for tab/page-level transitions** (300 ms, FastOutSlowInEasing)
   — snappier.
5. **No third-party animation libraries** (Lottie / Rive). Pure Compose
   APIs only — keeps APK size flat and avoids version drift.

## Token vocabulary

```
INSTANT  = 0 ms      (sentinel; no animation)
FAST     = 120 ms    (press, ripple)
DEFAULT  = 240 ms    (small state changes, FAB)
SLOW     = 360 ms    (panel / dialog enter)
PAGE     = 300 ms    (tab switch)
PULSE    = 1500 ms   (status dot breathing loop)
```

Easings used:
- `FastOutSlowInEasing` — Material standard enter/exit.
- `LinearOutSlowInEasing` — items sliding into a list.
- Spring with `dampingRatio = MediumBouncy`, `stiffness = Medium` for
  press / selection feedback.
