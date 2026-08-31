package com.dagestan.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dagestan.mobile.bus.DagestanBus
import com.dagestan.mobile.services.SkillsService
import com.dagestan.mobile.ui.animation.DagestanAnimations
import com.dagestan.mobile.ui.animation.pressScale

/**
 * Skills screen — marketplace + installed (beta1).
 *
 * Top half: search + marketplace list. Each row has an Install button.
 * Bottom half: installed list, with Uninstall buttons.
 *
 * The marketplace is **bundled** in beta1 (no network). A
 * network-backed index with version checks is a beta2 feature.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkillsScreen() {
    val context = LocalContext.current
    val skills = remember { SkillsService.getInstance(context) }
    val installed by skills.installed.collectAsState()
    val marketplace by skills.marketplace.collectAsState()
    var query by remember { mutableStateOf("") }

    // Refresh on bus events.
    LaunchedEffect(Unit) {
        DagestanBus.events.collect { ev ->
            when (ev) {
                is com.dagestan.mobile.bus.BusEvent.SkillInstalled,
                is com.dagestan.mobile.bus.BusEvent.SkillRemoved -> {
                    // The StateFlows are already updated; this is just
                    // a hook to trigger recomposition if needed.
                }
                else -> Unit
            }
        }
    }

    val filteredMarketplace = remember(marketplace, query) {
        if (query.isBlank()) marketplace
        else marketplace.filter { skill ->
            skill.name.contains(query, ignoreCase = true) ||
            skill.title.contains(query, ignoreCase = true) ||
            skill.description.contains(query, ignoreCase = true) ||
            skill.tags.any { it.contains(query, ignoreCase = true) }
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Skills") }) },
    ) { inner ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(inner),
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                placeholder = { Text("Search skills…") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
            )
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (filteredMarketplace.isNotEmpty()) {
                    item { SectionHeader("Marketplace (${filteredMarketplace.size})") }
                    items(filteredMarketplace, key = { "m-" + it.name }) { skill ->
                        val isInstalled = installed.contains(skill.name)
                        SkillRow(
                            name = skill.name,
                            title = skill.title,
                            description = skill.description,
                            version = skill.version,
                            tags = skill.tags,
                            action = if (isInstalled) ({
                                IconButton(onClick = { skills.uninstall(skill.name) }) {
                                    Icon(Icons.Filled.Delete, contentDescription = "Uninstall")
                                }
                            }) else ({
                                IconButton(onClick = { skills.install(skill.name) }) {
                                    Icon(Icons.Filled.CloudDownload, contentDescription = "Install")
                                }
                            }),
                            trailing = if (isInstalled) "Installed" else "Available",
                        )
                    }
                } else {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                "No skills match \"$query\".",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                if (installed.isNotEmpty()) {
                    item { SectionHeader("Installed (${installed.size})") }
                    items(installed, key = { "i-" + it }) { name ->
                        SkillRow(
                            name = name,
                            title = name,
                            description = "Installed in $name/",
                            version = "—",
                            tags = emptyList(),
                            action = {
                                IconButton(onClick = { skills.uninstall(name) }) {
                                    Icon(Icons.Filled.Delete, contentDescription = "Uninstall")
                                }
                            },
                            trailing = "Installed",
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.padding(vertical = 8.dp),
    )
}

@Composable
private fun SkillRow(
    name: String,
    title: String,
    description: String,
    version: String,
    tags: List<String>,
    action: @Composable () -> Unit,
    trailing: String,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .pressScale(pressedScale = 0.98f),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(
                    description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (tags.isNotEmpty()) {
                    Text(
                        text = tags.joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = "v$version · $trailing",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            action()
        }
    }
}
