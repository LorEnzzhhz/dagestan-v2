package com.dagestan.mobile.services

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.dagestan.mobile.bus.BusEvent
import com.dagestan.mobile.bus.DagestanBus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Vault — encrypted secret store.
 *
 * Backed by [EncryptedSharedPreferences] (AES-256-GCM, key in Android
 * Keystore). The on-disk file lives at
 * `/data/data/com.dagestan.mobile/shared_prefs/dagestan_vault.xml` and
 * is unreadable without the device-bound Keystore key — that is, the
 * key never leaves the secure hardware, so even a rooted device can't
 * decrypt the file without an additional exploit.
 *
 * alpha3 ships the **device-bound** variant: any process running as the
 * same UID can read the vault. A user-passphrase variant (PBKDF2-wrapped
 * key) is a beta1 feature.
 *
 * Bus events:
 *   - [BusEvent.VaultLocked]    — emitted on init and on explicit lock
 *   - [BusEvent.VaultUnlocked]  — emitted when the first [get] succeeds
 *   - [BusEvent.SecretStored]   — emitted on [store]
 *   - [BusEvent.SecretDeleted]  — emitted on [delete]
 */
class VaultService private constructor(
    private val appContext: Context,
) {

    private val masterKey: MasterKey = MasterKey.Builder(appContext)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = try {
        EncryptedSharedPreferences.create(
            appContext,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (t: Throwable) {
        // Keystore failure (rare — e.g. wiped keystore after a factory
        // reset, or a non-standard device). Fall back to in-memory so
        // the rest of the app keeps working. The bus still gets a
        // VaultLocked event so the UI can warn the user.
        Log.e(TAG, "EncryptedSharedPreferences unavailable: ${t.message}")
        InMemoryPrefs
    }

    private val _isUnlocked = MutableStateFlow(false)
    val isUnlocked: StateFlow<Boolean> = _isUnlocked.asStateFlow()

    init {
        // The device-bound vault starts "unlocked" the first time the
        // prefs file is successfully opened.
        if (prefs !== InMemoryPrefs) {
            _isUnlocked.value = true
            DagestanBus.publishAsync(BusEvent.VaultUnlocked(reason = "device-bound"))
        } else {
            DagestanBus.publishAsync(
                BusEvent.VaultLocked(reason = "encrypted-prefs-failed")
            )
        }
    }

    fun store(key: String, value: String) {
        if (prefs === InMemoryPrefs) return
        prefs.edit().putString(key, value).apply()
        if (!_isUnlocked.value) {
            _isUnlocked.value = true
            DagestanBus.publishAsync(BusEvent.VaultUnlocked(reason = "first-write"))
        }
        DagestanBus.publishAsync(BusEvent.SecretStored(key))
    }

    fun get(key: String): String? {
        if (prefs === InMemoryPrefs) return null
        return prefs.getString(key, null)
    }

    fun delete(key: String) {
        if (prefs === InMemoryPrefs) return
        prefs.edit().remove(key).apply()
        DagestanBus.publishAsync(BusEvent.SecretDeleted(key))
    }

    fun listKeys(): List<String> {
        if (prefs === InMemoryPrefs) return emptyList()
        return prefs.all.keys.sorted()
    }

    fun lock() {
        // alpha3: the device-bound vault can't truly lock (the key is
        // always available). The "lock" call clears the in-memory
        // _isUnlocked flag so the UI can show a locked state, and the
        // in-process cache (none yet) would be cleared. Persistence
        // stays so the secrets are still on disk for the next unlock.
        _isUnlocked.value = false
        DagestanBus.publishAsync(BusEvent.VaultLocked(reason = "user"))
    }

    fun unlock() {
        if (prefs === InMemoryPrefs) return
        _isUnlocked.value = true
        DagestanBus.publishAsync(BusEvent.VaultUnlocked(reason = "user"))
    }

    companion object {
        private const val TAG = "DagestanVault"
        private const val PREFS_FILE = "dagestan_vault"

        @Volatile
        private var instance: VaultService? = null

        fun getInstance(context: Context): VaultService =
            instance ?: synchronized(this) {
                instance ?: VaultService(context.applicationContext)
                    .also { instance = it }
            }
    }
}
