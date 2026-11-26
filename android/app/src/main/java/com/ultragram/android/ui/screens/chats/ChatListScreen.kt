package com.ultragram.android.ui.screens.chats

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ultragram.android.data.AppSettings
import com.ultragram.android.data.model.Chat
import com.ultragram.android.data.model.UserSearchResult
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import com.ultragram.android.ui.theme.UgSuccess
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListScreen(navController: androidx.navigation.NavController) {
    var chats by remember { mutableStateOf<List<Chat>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showNewChat by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun loadChats() {
        loading = true
        error = null
        scope.launch {
            try {
                chats = NetworkModule.api.chats()
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

    LaunchedEffect(Unit) {
        if (!AppSettings.isLoggedIn()) {
            navController.navigate("auth") {
                popUpTo("chats") { inclusive = true }
            }
            return@LaunchedEffect
        }
        loadChats()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("UltraGram", fontWeight = FontWeight.Bold)
                        Text(
                            AppSettings.serverUrl().ifBlank { "Сервер не настроен" },
                            style = MaterialTheme.typography.labelMedium,
                            color = UgMuted
                        )
                    }
                },
                actions = {
                    IconButton(onClick = { loadChats() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Обновить")
                    }
                    IconButton(onClick = { navController.navigate("wallet") }) {
                        Icon(Icons.Default.AccountBalanceWallet, contentDescription = "Кошелёк")
                    }
                    IconButton(onClick = { navController.navigate("gifts") }) {
                        Icon(Icons.Default.CardGiftcard, contentDescription = "Подарки")
                    }
                    IconButton(onClick = { navController.navigate("profile") }) {
                        Icon(Icons.Default.Person, contentDescription = "Профиль")
                    }
                    IconButton(onClick = { navController.navigate("settings") }) {
                        Icon(Icons.Default.Settings, contentDescription = "Настройки")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showNewChat = true }) {
                Icon(Icons.Default.Add, contentDescription = "Новый чат")
            }
        }
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when {
                loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                error != null -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(error ?: "", color = UgDanger)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { loadChats() }) { Text("Повторить") }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = { navController.navigate("settings") }) {
                        Text("Настройки сервера")
                    }
                }
                chats.isEmpty() -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Пока нет чатов", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Нажмите + и найдите пользователя, чтобы начать переписку.",
                        color = UgMuted
                    )
                }
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(chats, key = { it.id }) { chat ->
                        ChatRow(chat = chat, onClick = {
                            navController.navigate("chat/${chat.id}")
                        })
                        HorizontalDivider()
                    }
                }
            }
        }
    }

    if (showNewChat) {
        NewChatDialog(
            onDismiss = { showNewChat = false },
            onChatCreated = { chatId ->
                showNewChat = false
                loadChats()
                navController.navigate("chat/$chatId")
            }
        )
    }
}

private fun chatTitle(chat: Chat): String {
    return chat.name
        ?: chat.otherUser?.displayName
        ?: chat.otherUser?.username?.let { "@$it" }
        ?: when (chat.type) {
            "dm" -> "Личный чат"
            "channel" -> "Канал"
            "group" -> "Группа"
            else -> "Чат"
        }
}

@Composable
private fun ChatRow(chat: Chat, onClick: () -> Unit) {
    val title = chatTitle(chat)
    val verified = chat.otherUser?.verification?.let { it != "Unverified" } == true
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.primaryContainer,
            modifier = Modifier.size(44.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    title.take(1).uppercase(),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontWeight = FontWeight.SemiBold)
                if (verified) {
                    Spacer(Modifier.width(6.dp))
                    Text("✓", color = UgSuccess, fontWeight = FontWeight.Bold)
                }
            }
            val last = chat.lastMessage?.content
            Text(
                if (last.isNullOrBlank()) "Нет сообщений" else last,
                color = UgMuted,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1
            )
        }
        Text(
            when (chat.type) {
                "dm" -> "личный"
                "channel" -> "канал"
                "group" -> "группа"
                else -> chat.type
            },
            style = MaterialTheme.typography.labelMedium,
            color = UgMuted
        )
    }
}

@Composable
private fun NewChatDialog(
    onDismiss: () -> Unit,
    onChatCreated: (String) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<UserSearchResult>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun search() {
        if (query.isBlank()) return
        searching = true
        error = null
        scope.launch {
            try {
                results = NetworkModule.api.searchUsers(query.trim())
            } catch (e: Exception) {
                error = e.friendlyMessage()
            } finally {
                searching = false
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Новый чат") },
        text = {
            Column {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Имя, @username или email") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                if (searching) {
                    CircularProgressIndicator(Modifier.size(24.dp))
                }
                error?.let { Text(it, color = UgDanger) }
                if (!searching && results.isEmpty() && query.isNotBlank() && error == null) {
                    Text("Ничего не найдено", color = UgMuted)
                }
                results.take(10).forEach { user ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                scope.launch {
                                    try {
                                        val chat = NetworkModule.api.createChat(
                                            mapOf(
                                                "type" to "dm",
                                                "member_ids" to listOf(user.id)
                                            )
                                        )
                                        onChatCreated(chat.id)
                                    } catch (e: Exception) {
                                        error = e.friendlyMessage()
                                    }
                                }
                            }
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Person, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(user.displayName ?: user.username ?: user.id)
                            user.username?.let {
                                Text("@$it", color = UgMuted, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { search() }, enabled = !searching) {
                Icon(Icons.Default.Search, contentDescription = null)
                Spacer(Modifier.width(4.dp))
                Text("Найти")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Закрыть") }
        }
    )
}
