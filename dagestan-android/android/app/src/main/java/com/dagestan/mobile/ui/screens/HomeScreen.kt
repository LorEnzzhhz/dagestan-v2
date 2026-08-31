package com.dagestan.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dagestan.mobile.services.ServersAdapter
import com.dagestan.mobile.ui.animation.DagestanAnimations
import com.dagestan.mobile.ui.animation.pressScale
import com.dagestan.mobile.ui.animation.rememberPulseAlpha

/**
 * Home tab — native Compose (beta1).
 *
 * The frozen-dashboard invariant is **dropped** in beta1 per user
 * direction. This screen replaces the legacy `dashboard_screen.xml`
 * with three animated server cards. Each card:
 *
 *   - Has a status dot that breathes when the server is running.
 *   - Shows the port + URL.
 *   - Has a single FAB-style Start/Stop button.
 *
 * The cards subscribe to [ServersAdapter] for live state. Animations
 * come from `ui/animation/DagestanAnimations` — see that file for the
 * design tokens.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen() {
    val context = LocalContext.current
    val servers = remember { ServersAdapter.getInstance(context) }
    val codex by servers.codexState.collectAsState()
    val openClaw by servers.openClawState.collectAsState()
    val hermes by servers.hermesState.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Dagestan") }) },
    ) { inner ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { WelcomeCard() }
            item { ServerCard("Codex",    codex,    onStart = { servers.startCodex() },    onStop = { servers.stopCodex() }) }
            item { ServerCard("OpenClaw", openClaw, onStart = { servers.startOpenClaw() }, onStop = { servers.stopOpenClaw() }) }
            item { ServerCard("Hermes",   hermes,   onStart = { servers.startHermes() },   onStop = { servers.stopHermes() }) }
            item { HintCard() }
        }
    }
}

@Composable
private fun WelcomeCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(
                "🏔 Dagestan",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onPrimary,
            )
            Text(
                "Your on-device AI ops station.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        }
    }
}

@Composable
private fun ServerCard(
    label: String,
    state: ServersAdapter.ServerState,
    onStart: () -> Unit,
    onStop: () -> Unit,
) {
    val running = state.isRunning
    val dotAlpha = if (running) rememberPulseAlpha() else 1f
    val dotColor = if (running) MaterialTheme.colorScheme.primary
                   else MaterialTheme.colorScheme.onSurfaceVariant
    val expandedAlpha by animateFloatAsState(
        targetValue = if (running) 1f else 0.6f,
        animationSpec = DagestanAnimations.tweenDefaultFloat(),
        label = "server-card-alpha",
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .pressScale(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .clickable(enabled = false) { /* future: expand */ },
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(dotColor.copy(alpha = dotAlpha)),
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = expandedAlpha),
                )
                Box(modifier = Modifier.weight(1f))
                FloatingActionButton(
                    onClick = { if (running) onStop() else onStart() },
                    containerColor = if (running) MaterialTheme.colorScheme.error
                                     else MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(44.dp),
                ) {
                    Icon(
                        imageVector = if (running) Icons.Filled.Stop else Icons.Filled.PlayArrow,
                        contentDescription = if (running) "Stop $label" else "Start $label",
                    )
                }
            }
            AnimatedVisibility(
                visible = running,
                enter = fadeIn(animationSpec = DagestanAnimations.tweenDefaultFloat()) +
                        expandVertically(animationSpec = DagestanAnimations.tweenDefaultIntSize()),
                exit = fadeOut(animationSpec = DagestanAnimations.tweenFastFloat()) +
                       shrinkVertically(animationSpec = DagestanAnimations.tweenFastIntSize()),
            ) {
                Text(
                    text = "Port ${state.port}  ·  ${state.url}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun HintCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        ),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Tip",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "Long-press the splash logo on the legacy shell to toggle the Compose shell.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
