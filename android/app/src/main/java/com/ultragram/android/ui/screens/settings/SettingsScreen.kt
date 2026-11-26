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
import com.ultragram.android.ui.theme.UgMuted
import com.ultragram.android.ui.theme.UgSuccess


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(navController: androidx.navigation.NavController) {
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
