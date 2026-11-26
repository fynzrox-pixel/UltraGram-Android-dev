package com.ultragram.android.ui.screens.settings

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
import com.ultragram.android.BuildConfig
import com.ultragram.android.data.AppSettings
import com.ultragram.android.data.WebSocketManager
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import com.ultragram.android.ui.theme.UgSuccess
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(navController: androidx.navigation.NavController) {
    var serverUrl by remember { mutableStateOf(AppSettings.serverUrl()) }
    var status by remember { mutableStateOf<String?>(null) }
    var statusOk by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var savedMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun save(): Boolean {
        val problem = AppSettings.validateServerUrl(serverUrl)
        if (problem != null) {
            status = problem
            statusOk = false
            return false
        }
        AppSettings.setServerUrl(serverUrl)
        serverUrl = AppSettings.serverUrl()
        NetworkModule.invalidate()
        savedMessage = "Адрес сохранён: $serverUrl"
        return true
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Настройки") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        AppSettings.clearSession()
                        WebSocketManager.disconnect()
                        navController.navigate("auth") {
                            popUpTo(navController.graph.startDestinationId) { inclusive = true }
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
            Text("Подключение", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(
                "Эмулятор Android обращается к компьютеру по адресу 10.0.2.2. " +
                    "Реальный телефон должен использовать IP компьютера в локальной сети " +
                    "(debug) или HTTPS-адрес production-сервера (release).",
                color = UgMuted
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Адрес backend") },
                singleLine = true,
                supportingText = {
                    Text(
                        "Примеры: http://10.0.2.2:8787/ (эмулятор), " +
                            "http://192.168.x.x:8787/ (телефон в LAN, debug), " +
                            "https://ваш-домен/ (production)"
                    )
                },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { save() },
                    modifier = Modifier.weight(1f)
                ) { Text("Сохранить") }
                OutlinedButton(
                    onClick = {
                        serverUrl = AppSettings.defaultServerUrl()
                        savedMessage = null
                    },
                    modifier = Modifier.weight(1f)
                ) { Text("По умолчанию") }
            }
            Spacer(Modifier.height(8.dp))
            Button(
                enabled = !checking,
                onClick = {
                    if (!save()) return@Button
                    checking = true
                    status = null
                    scope.launch {
                        try {
                            val health = NetworkModule.api.health()
                            statusOk = true
                            status = "Подключено: ${health["name"] ?: "UltraGram"} " +
                                "${health["version"] ?: ""}"
                        } catch (e: Exception) {
                            statusOk = false
                            status = e.friendlyMessage()
                        } finally {
                            checking = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (checking) "Проверка…" else "Проверить подключение")
            }
            status?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = if (statusOk) UgSuccess else UgDanger)
            }
            savedMessage?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = UgMuted)
            }

            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(16.dp))

            Text("Аккаунт", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(
                if (AppSettings.isLoggedIn()) "Выполнен вход" else "Вход не выполнен",
                color = if (AppSettings.isLoggedIn()) UgSuccess else UgMuted
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = {
                    AppSettings.clearSession()
                    WebSocketManager.disconnect()
                    navController.navigate("auth") {
                        popUpTo(navController.graph.startDestinationId) { inclusive = true }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Выйти из аккаунта") }

            Spacer(Modifier.height(24.dp))
            HorizontalDivider()
            Spacer(Modifier.height(16.dp))

            Text("О приложении", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("UltraGram Android ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            Text(
                if (BuildConfig.DEBUG) "Сборка: debug (разрешён HTTP для разработки)"
                else "Сборка: release (только HTTPS)",
                color = UgMuted
            )
            Text("Пакет: ${BuildConfig.APPLICATION_ID}", color = UgMuted)
        }
    }
}
