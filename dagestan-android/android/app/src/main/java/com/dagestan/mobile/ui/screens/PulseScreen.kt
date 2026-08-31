package com.dagestan.mobile.ui.screens

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.Canvas
import com.dagestan.mobile.services.PulseService
import com.dagestan.mobile.ui.DagestanThemeController

/**
 * Pulse screen — live system monitor.
 *
 * Subscribes to [PulseService.state] and renders a card per metric.
 * A "Cycle palette" + "Cycle mode" button at the bottom lets the user
 * test the alpha3 theming without opening a Settings sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PulseScreen(controller: DagestanThemeController) {
    val context = LocalContext.current
    val pulse = remember { PulseService.getInstance(context) }
    val snap by pulse.state.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Pulse") }) },
    ) { inner ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                MetricCard(label = "CPU", value = "${"%.1f".format(snap.cpuPercent)} %", subtitle = "system-wide")
            }
            item {
                MetricCard(
                    label = "RAM",
                    value = "${snap.memUsedMb} / ${snap.memTotalMb} MB",
                    subtitle = "%.0f%% used".format(
                        if (snap.memTotalMb == 0L) 0f
                        else snap.memUsedMb.toFloat() / snap.memTotalMb.toFloat() * 100f
                    ),
                )
            }
            item {
                MetricCard(
                    label = "Battery",
                    value = "${snap.batteryLevel}%",
                    subtitle = "${"%.1f".format(snap.batteryTempC)} °C",
                )
            }
            item {
                MetricCard(
                    label = "Network",
                    value = "↓ ${humanBps(snap.netRxBps)} · ↑ ${humanBps(snap.netTxBps)}",
                    subtitle = "total interface",
                )
            }
            item {
                ThemeControls(controller)
            }
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, subtitle: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(text = value, style = MaterialTheme.typography.headlineSmall)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ThemeControls(controller: DagestanThemeController) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Theme", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                controller.palettes.forEach { p ->
                    FilterChip(
                        selected = controller.palette == p,
                        onClick = { controller.setPalette(p) },
                        label = { Text(p.name.replace('_', ' ').lowercase().replaceFirstChar { it.titlecase() }) },
                    )
                }
            }
            Text("Mode", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                controller.modes.forEach { m ->
                    FilterChip(
                        selected = controller.mode == m,
                        onClick = { controller.setMode(m) },
                        label = { Text(m.name.lowercase().replaceFirstChar { it.titlecase() }) },
                    )
                }
            }
        }
    }
}

private fun humanBps(bps: Long): String = when {
    bps >= 1024L * 1024L -> "%.1f MB/s".format(bps / (1024.0 * 1024.0))
    bps >= 1024L         -> "%.0f KB/s".format(bps / 1024.0)
    else                 -> "$bps B/s"
}
