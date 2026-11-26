package com.ultragram.android.ui.screens.chats

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.gson.Gson
import com.ultragram.android.data.AppSettings
import com.ultragram.android.data.WebSocketManager
import com.ultragram.android.data.model.Message
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import com.ultragram.android.ui.theme.UgSuccess
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(navController: androidx.navigation.NavController, chatId: String?) {
    var messages by remember { mutableStateOf<List<Message>>(emptyList()) }
    var input by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    fun loadMessages() {
        if (chatId == null) {
            loading = false
            error = "Чат не выбран"
            return
        }
        loading = true
        error = null
        scope.launch {
            try {
                messages = NetworkModule.api.messages(chatId)
            } catch (e: Exception) {
                error = e.friendlyMessage()
                if (e is retrofit2.HttpException && e.code() == 401) {
                    AppSettings.clearSession()
                    navController.navigate("auth") {
                        popUpTo("chats") { inclusive = true }
                    }
                }
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(chatId) {
        loadMessages()
    }

    DisposableEffect(chatId) {
        val token = AppSettings.token
        if (chatId != null && !token.isNullOrBlank()) {
            WebSocketManager.onMessage = { payload ->
                if (payload.optString("type") == "new_message" &&
                    payload.optString("chat_id") == chatId
                ) {
                    val incoming = try {
                        Gson().fromJson(payload.getJSONObject("message").toString(), Message::class.java)
                    } catch (_: Exception) {
                        null
                    }
                    if (incoming != null) {
                        scope.launch {
                            if (messages.none { it.id == incoming.id }) {
                                messages = messages + incoming
                            }
                        }
                    }
                }
            }
            WebSocketManager.connect(AppSettings.serverUrl(), token)
        }
        onDispose {
            WebSocketManager.onMessage = null
            WebSocketManager.disconnect()
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Чат") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = {
                    TextButton(onClick = { loadMessages() }) { Text("Обновить") }
                }
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            if (loading) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (messages.isEmpty()) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Text("Сообщений пока нет", color = UgMuted)
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    items(messages, key = { it.id }) { message ->
                        MessageBubble(message)
                    }
                }
            }

            error?.let {
                Text(
                    it,
                    color = UgDanger,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
            }

            HorizontalDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    placeholder = { Text("Сообщение…") },
                    maxLines = 4,
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(8.dp))
                FilledIconButton(
                    enabled = input.isNotBlank() && !sending && chatId != null,
                    onClick = {
                        val text = input.trim()
                        if (text.isEmpty() || chatId == null) return@FilledIconButton
                        sending = true
                        error = null
                        scope.launch {
                            try {
                                val sent = NetworkModule.api.sendMessage(
                                    chatId,
                                    mapOf("content" to text, "type" to "text")
                                )
                                if (messages.none { it.id == sent.id }) {
                                    messages = messages + sent
                                }
                                input = ""
                            } catch (e: Exception) {
                                error = e.friendlyMessage()
                            } finally {
                                sending = false
                            }
                        }
                    }
                ) {
                    if (sending) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(Icons.Default.Send, contentDescription = "Отправить")
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: Message) {
    val mine = message.senderId == AppSettings.userId
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
    ) {
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
            tonalElevation = 1.dp,
            modifier = Modifier.widthIn(max = 300.dp)
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                if (!mine) {
                    Text(
                        message.senderId.take(8),
                        style = MaterialTheme.typography.labelMedium,
                        color = if (message.senderId.isNotBlank()) UgSuccess else UgMuted,
                        fontWeight = FontWeight.SemiBold
                    )
                }
                Text(
                    message.content ?: "",
                    color = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(message.createdAt)),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (mine) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.7f)
                    else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
        }
    }
}
