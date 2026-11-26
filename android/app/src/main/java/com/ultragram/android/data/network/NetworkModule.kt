package com.ultragram.android.data.network

import com.ultragram.android.BuildConfig
import com.ultragram.android.data.AppSettings
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit

object NetworkModule {

    private val authInterceptor = Interceptor { chain ->
        val builder = chain.request().newBuilder()
            .header("Accept", "application/json")
        AppSettings.token?.takeIf { it.isNotBlank() }?.let {
            builder.header("Authorization", "Bearer $it")
        }
        chain.proceed(builder.build())
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        // Never log request bodies in production: they contain passwords/tokens.
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
        else HttpLoggingInterceptor.Level.NONE
        redactHeader("Authorization")
    }

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .build()
    }

    @Volatile
    private var cachedBaseUrl: String? = null

    @Volatile
    private var cachedApi: UltraGramApi? = null

    /** Current, user-visible base URL. */
    fun baseUrl(): String = AppSettings.serverUrl()

    /**
     * Retrofit is rebuilt whenever the user changes the server address, so the
     * setting takes effect immediately without restarting the app.
     */
    val api: UltraGramApi
        get() {
            val baseUrl = baseUrl().ifBlank {
                throw IllegalStateException("Адрес сервера не настроен. Откройте Настройки и укажите адрес.")
            }
            val parsed = baseUrl.toHttpUrlOrNull()
                ?: throw IllegalStateException("Некорректный адрес сервера: $baseUrl")
            if (parsed.scheme != "http" && parsed.scheme != "https") {
                throw IllegalStateException("Поддерживаются только http:// и https://")
            }
            if (!BuildConfig.DEBUG && parsed.scheme != "https") {
                throw IllegalStateException("В production-сборке разрешён только HTTPS")
            }
            synchronized(this) {
                val existing = cachedApi
                if (existing != null && cachedBaseUrl == baseUrl) return existing
                val created = Retrofit.Builder()
                    .baseUrl(parsed)
                    .client(client)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(UltraGramApi::class.java)
                cachedBaseUrl = baseUrl
                cachedApi = created
                return created
            }
        }

    fun invalidate() {
        synchronized(this) {
            cachedApi = null
            cachedBaseUrl = null
        }
    }
}

/** Turns network/HTTP failures into messages a person can act on. */
fun Throwable.friendlyMessage(): String = when (this) {
    is HttpException -> {
        val raw = try {
            response()?.errorBody()?.string()
        } catch (_: Exception) {
            null
        }
        val serverMessage = try {
            if (raw.isNullOrBlank()) "" else JSONObject(raw).optString("error")
        } catch (_: Exception) {
            ""
        }
        when (code()) {
            400 -> serverMessage.ifBlank { "Некорректный запрос" }
            401 -> "Неверный логин или пароль"
            403 -> "Доступ запрещён"
            404 -> "Не найдено"
            409 -> serverMessage.ifBlank { "Такие данные уже используются" }
            429 -> "Слишком много попыток. Подождите минуту."
            in 500..599 -> "Ошибка сервера (${code()})"
            else -> serverMessage.ifBlank { "Ошибка сервера (${code()})" }
        }
    }
    is UnknownHostException -> "Сервер не найден. Проверьте адрес в Настройках."
    is ConnectException -> "Не удалось подключиться к серверу. Попробуйте позже."
    is SocketTimeoutException -> "Сервер не отвечает. Проверьте сеть и адрес сервера."
    is IOException -> "Ошибка сети: ${message ?: "проверьте подключение"}"
    is IllegalStateException, is IllegalArgumentException -> message ?: "Ошибка конфигурации"
    else -> message ?: "Неизвестная ошибка"
}
