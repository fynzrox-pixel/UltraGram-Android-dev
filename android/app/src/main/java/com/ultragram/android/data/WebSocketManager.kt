package com.ultragram.android.data

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Small WebSocket client used for live messages and typing indicators.
 * Works with both http:// (ws://) development backends and https:// (wss://)
 * production backends.
 */
object WebSocketManager {
    private var ws: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    var onMessage: ((JSONObject) -> Unit)? = null
    var onClosed: (() -> Unit)? = null

    fun connect(baseUrl: String, authToken: String) {
        disconnect()
        val parsed = baseUrl.toHttpUrlOrNull() ?: return
        val url = parsed.newBuilder()
            .scheme(if (parsed.isHttps) "wss" else "ws")
            .addPathSegment("ws")
            .addQueryParameter("token", authToken)
            .build()
        val request = Request.Builder().url(url).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    onMessage?.invoke(JSONObject(text))
                } catch (_: Exception) {
                    // Ignore malformed server frames.
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                // REST endpoints remain the source of truth; the next screen
                // refresh will pick up messages if the socket is unavailable.
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onClosed?.invoke()
            }
        })
    }

    fun send(payload: String) {
        ws?.send(payload)
    }

    fun disconnect() {
        ws?.close(1000, "bye")
        ws = null
    }
}
