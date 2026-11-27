package com.ultragram.android.ui.screens.chats

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ultragram.android.data.AppSettings
import com.ultragram.android.data.model.Chat
import com.ultragram.android.data.model.UserSearchResult
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.*
import kotlinx.coroutines.launch

private val BgDeep = Color(0xFF05050A)
private val BgCard = Color(0xFF0F0F1A)
private val BgField = Color(0xFF16162A)
private val BorderSubtle = Color(0xFF2A2A4A)
private val GradientStart = Color(0xFF8657FF)
private val GradientEnd = Color(0xFF3C8DFF)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatListScreen(navController: androidx.navigation.NavController) {
    var chats by remember { mutableStateOf<List<Chat>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showNewChat by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
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
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgDeep)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "UltraGram",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 22.sp
                        ),
                        color = Color.White
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        IconButton(onClick = { loadChats() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Обновить", tint = UgMuted)
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                // Search bar
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Поиск чатов...", color = UgMuted) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Поиск", tint = UgMuted) },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF8657FF),
                        unfocusedBorderColor = BorderSubtle,
                        focusedContainerColor = BgField,
                        unfocusedContainerColor = BgField,
                        cursorColor = Color(0xFF8657FF)
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showNewChat = true },
                containerColor = Color(0xFF8657FF),
                contentColor = Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Новый чат")
            }
        },
        containerColor = BgDeep
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when {
                loading -> CircularProgressIndicator(
                    Modifier.align(Alignment.Center),
                    color = Color(0xFF8657FF)
                )
                error != null -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(error ?: "", color = UgDanger)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { loadChats() }) { Text("Повторить") }
                }
                chats.isEmpty() -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Пока нет чатов", style = MaterialTheme.typography.titleLarge, color = Color.White)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Нажмите + и найдите пользователя, чтобы начать переписку.",
                        color = UgMuted,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(chats, key = { it.id }) { chat ->
                        ChatRow(chat = chat, onClick = {
                            navController.navigate("chat/${chat.id}")
                        })
                        HorizontalDivider(color = BorderSubtle, thickness = 0.5.dp)
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
                        Icon(Icons.Default.Person, contentDescription = null, tint = UgMuted)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(user.displayName ?: user.username ?: user.id, color = Color.White)
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
        // Avatar
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.linearGradient(
                        colors = listOf(Color(0xFF8657FF), Color(0xFF3C8DFF))
                    )
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                title.take(1).uppercase(),
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 18.sp),
                color = Color.White,
                fontWeight = FontWeight.Bold
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontWeight = FontWeight.SemiBold, color = Color.White, maxLines = 1)
                if (verified) {
                    Spacer(Modifier.width(6.dp))
                    Text("✓", color = Color(0xFF22C55E), fontWeight = FontWeight.Bold)
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                chat.lastMessage?.content ?: "Нет сообщений",
                style = MaterialTheme.typography.bodySmall,
                color = UgMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                formatTime(chat.lastMessage?.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = UgMuted
            )
        }
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

private fun formatTime(ts: Long?): String {
    if (ts == null || ts == 0L) return ""
    val sdf = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(ts))
}

@Preview(showBackground = true, backgroundColor = 0xFF05050A)
@Composable
fun ChatListScreenPreview() {
    UltraGramTheme {
        // Preview requires navController
    }
}
