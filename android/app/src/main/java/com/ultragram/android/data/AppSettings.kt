package com.ultragram.android.data

import android.content.Context
import android.content.SharedPreferences
import com.ultragram.android.BuildConfig
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Persisted app configuration and session storage.
 *
 * Server URL rules:
 *  - Debug builds default to the Android emulator host address (10.0.2.2).
 *  - Release builds have no invented domain: the user (or a CI build with
 *    -Pultragram.baseUrl=https://...) must provide the production HTTPS URL.
 *  - A real phone can always override the address in Settings.
 */
object AppSettings {
    private const val PREFS = "ultragram_settings"
    private const val KEY_SERVER = "server_url"
    private const val KEY_TOKEN = "auth_token"
    private const val KEY_USER = "user_id"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        if (!::prefs.isInitialized) {
            prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        }
    }

    fun defaultServerUrl(): String = BuildConfig.DEFAULT_SERVER_URL

    fun serverUrl(): String {
        val saved = if (::prefs.isInitialized) prefs.getString(KEY_SERVER, null) else null
        return if (!saved.isNullOrBlank()) saved else defaultServerUrl()
    }

    fun setServerUrl(url: String) {
        prefs.edit().putString(KEY_SERVER, normalizeServerUrl(url)).apply()
    }

    var token: String?
        get() = if (::prefs.isInitialized) prefs.getString(KEY_TOKEN, null) else null
        set(value) {
            prefs.edit().putString(KEY_TOKEN, value).apply()
        }

    var userId: String?
        get() = if (::prefs.isInitialized) prefs.getString(KEY_USER, null) else null
        set(value) {
            prefs.edit().putString(KEY_USER, value).apply()
        }

    fun saveSession(token: String, userId: String) {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER, userId)
            .apply()
    }

    fun clearSession() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_USER).apply()
    }

    fun isLoggedIn(): Boolean = !token.isNullOrBlank()

    /**
     * Adds a scheme when the user typed only host:port and always keeps the
     * trailing slash Retrofit requires. Private/LAN addresses get HTTP by
     * default; public hostnames get HTTPS so production traffic is encrypted.
     */
    fun normalizeServerUrl(input: String): String {
        var value = input.trim()
        if (value.isEmpty()) return ""
        if (!value.contains("://")) {
            val host = value.substringBefore('/').substringBefore(':').lowercase()
            val isLocal = host == "localhost" ||
                host == "127.0.0.1" ||
                host == "10.0.2.2" ||
                host.startsWith("10.") ||
                host.startsWith("192.168.") ||
                host.endsWith(".local") ||
                Regex("^172\\.(1[6-9]|2[0-9]|3[0-1])\\.").containsMatchIn(host)
            value = (if (isLocal) "http://" else "https://") + value
        }
        if (!value.endsWith("/")) value += "/"
        return value
    }

    /** Returns a user-facing error, or null when the URL is usable. */
    fun validateServerUrl(input: String): String? {
        val normalized = normalizeServerUrl(input)
        if (normalized.isBlank()) return "Укажите адрес сервера"
        val parsed = normalized.toHttpUrlOrNull() ?: return "Некорректный адрес сервера"
        if (parsed.scheme != "http" && parsed.scheme != "https") {
            return "Поддерживаются только http:// и https://"
        }
        if (!BuildConfig.DEBUG && parsed.scheme != "https") {
            return "В production-сборке разрешён только HTTPS"
        }
        return null
    }
}
