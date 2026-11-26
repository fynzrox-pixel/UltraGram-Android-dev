package com.ultragram.android.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ultragram.android.data.AppSettings
import com.ultragram.android.data.WebSocketManager
import com.ultragram.android.data.model.User
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import com.ultragram.android.ui.theme.UgSuccess
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(navController: androidx.navigation.NavController) {
    var user by remember { mutableStateOf<User?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf(false) }
    var displayName by remember { mutableStateOf("") }
    var bio by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var saveMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun loadProfile() {
        loading = true
        error = null
        scope.launch {
            try {
                val me = NetworkModule.api.me()
                user = me
                displayName = me.profile?.displayName ?: ""
                bio = me.profile?.bio ?: ""
            } catch (e: Exception) {
                error = e.friendlyMessage()
                if (e is retrofit2.HttpException && e.code() == 401) {
                    AppSettings.clearSession()
                    navController.navigate("auth") {
                        popUpTo("profile") { inclusive = true }
                    }
                }
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { loadProfile() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Профиль") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            try {
                                NetworkModule.api.logout()
                            } catch (_: Exception) {
                                // Local logout must work even if the server is down.
                            }
                            AppSettings.clearSession()
                            WebSocketManager.disconnect()
                            navController.navigate("auth") {
                                popUpTo(navController.graph.startDestinationId) { inclusive = true }
                            }
                        }
                    }) {
                        Icon(Icons.Default.Logout, contentDescription = "Выйти")
                    }
                }
            )
        }
    ) { pad ->
        Column(
            modifier = Modifier
                .padding(pad)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            if (loading) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                return@Column
            }
            error?.let {
                Text(it, color = UgDanger)
                Spacer(Modifier.height(8.dp))
                Button(onClick = { loadProfile() }) { Text("Повторить") }
                return@Column
            }

            val u = user ?: return@Column
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(64.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            (u.profile?.displayName ?: "U").take(1).uppercase(),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        u.profile?.displayName ?: "Без имени",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        u.profile?.username?.let { "@$it" } ?: "username не задан",
                        color = UgMuted
                    )
                }
            }

            Spacer(Modifier.height(12.dp))
            val verified = u.verification != "Unverified"
            Text(
                if (verified) "✓ Verified (${u.verification})" else "Не верифицирован",
                color = if (verified) UgSuccess else UgMuted,
                fontWeight = FontWeight.SemiBold
            )
            Text("Роли: ${if (u.roles.isEmpty()) "нет" else u.roles.joinToString(", ")}", color = UgMuted)
            Text("Баланс: ${u.balance} огоньков")
            u.phone?.let { Text("Телефон: $it") }
            u.email?.let { Text("Email: $it") }

            Spacer(Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(Modifier.height(16.dp))

            if (editing) {
                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it },
                    label = { Text("Отображаемое имя") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = bio,
                    onValueChange = { bio = it },
                    label = { Text("О себе") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        enabled = !saving,
                        onClick = {
                            saving = true
                            saveMessage = null
                            scope.launch {
                                try {
                                    NetworkModule.api.updateProfile(
                                        mapOf(
                                            "display_name" to displayName.trim(),
                                            "bio" to bio.trim()
                                        )
                                    )
                                    saveMessage = "Профиль сохранён"
                                    editing = false
                                    loadProfile()
                                } catch (e: Exception) {
                                    saveMessage = e.friendlyMessage()
                                } finally {
                                    saving = false
                                }
                            }
                        }
                    ) {
                        Text(if (saving) "Сохранение…" else "Сохранить")
                    }
                    OutlinedButton(onClick = { editing = false }) { Text("Отмена") }
                }
            } else {
                if (!u.profile?.bio.isNullOrBlank()) {
                    Text(u.profile?.bio ?: "")
                    Spacer(Modifier.height(8.dp))
                }
                Button(onClick = { editing = true }) { Text("Редактировать профиль") }
            }
            saveMessage?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = UgMuted)
            }
        }
    }
}
