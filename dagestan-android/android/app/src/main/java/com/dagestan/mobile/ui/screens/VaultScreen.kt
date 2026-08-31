package com.dagestan.mobile.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.dagestan.mobile.bus.DagestanBus
import com.dagestan.mobile.services.VaultService
import kotlinx.coroutines.flow.collect

/**
 * Vault screen — list, add, copy, delete stored secrets.
 *
 * Backing store: [VaultService] (alpha3+). Each row shows the key
 * (visible) + a masked value (••••••). Long-press to delete, tap the
 * copy icon to put the plaintext on the system clipboard. The "Add"
 * FAB opens a dialog to store a new secret.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VaultScreen() {
    val context = LocalContext.current
    val vault = remember { VaultService.getInstance(context) }
    val isUnlocked by vault.isUnlocked.collectAsState()

    // Refresh the list whenever a bus event changes the set of keys.
    val keys = remember { mutableStateListOf<String>() }
    LaunchedEffect(isUnlocked) {
        keys.clear()
        keys.addAll(vault.listKeys())
    }
    LaunchedEffect(Unit) {
        DagestanBus.events.collect { ev ->
            when (ev) {
                is com.dagestan.mobile.bus.BusEvent.SecretStored,
                is com.dagestan.mobile.bus.BusEvent.SecretDeleted -> {
                    keys.clear()
                    keys.addAll(vault.listKeys())
                }
                else -> Unit
            }
        }
    }

    var showAddDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Vault") },
                actions = {
                    if (isUnlocked) {
                        IconButton(onClick = { vault.lock() }) {
                            Icon(Icons.Filled.Lock, contentDescription = "Lock")
                        }
                    } else {
                        IconButton(onClick = { vault.unlock() }) {
                            Icon(Icons.Filled.Lock, contentDescription = "Unlock")
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Filled.Add, contentDescription = "Add secret")
            }
        },
    ) { inner ->
        if (keys.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(inner),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (isUnlocked) "No secrets stored yet.\nTap + to add one."
                           else "Vault is locked.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(inner),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(keys, key = { it }) { key ->
                    VaultRow(
                        key = key,
                        value = vault.get(key).orEmpty(),
                        onCopy = { copyToClipboard(context, key, vault.get(key).orEmpty()) },
                        onDelete = { vault.delete(key) },
                    )
                }
            }
        }
    }

    if (showAddDialog) {
        AddSecretDialog(
            onDismiss = { showAddDialog = false },
            onAdd = { k, v ->
                vault.store(k, v)
                showAddDialog = false
            },
        )
    }
}

@Composable
private fun VaultRow(
    key: String,
    value: String,
    onCopy: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = key, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = if (value.isEmpty()) "(empty)" else "•".repeat(minOf(value.length, 12)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onCopy) {
                Icon(Icons.Filled.ContentCopy, contentDescription = "Copy")
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Delete")
            }
        }
    }
}

@Composable
private fun AddSecretDialog(onDismiss: () -> Unit, onAdd: (String, String) -> Unit) {
    var key by remember { mutableStateOf("") }
    var value by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New secret") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = key,
                    onValueChange = { key = it },
                    label = { Text("Name") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text("Value") },
                    singleLine = false,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (key.isNotBlank() && value.isNotEmpty()) onAdd(key, value) },
                enabled = key.isNotBlank() && value.isNotEmpty(),
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        properties = DialogProperties(),
    )
}

private fun copyToClipboard(context: Context, label: String, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText(label, text))
}
