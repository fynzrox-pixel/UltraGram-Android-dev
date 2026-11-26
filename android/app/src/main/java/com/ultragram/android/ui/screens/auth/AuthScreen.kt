package com.ultragram.android.ui.screens.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.ultragram.android.data.AppSettings
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import com.ultragram.android.ui.theme.UgPrimary
import com.ultragram.android.ui.theme.UgSuccess
import kotlinx.coroutines.launch

@Composable
fun AuthScreen(navController: androidx.navigation.NavController) {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var password2 by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var isRegister by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var serverUrl by remember { mutableStateOf(AppSettings.serverUrl()) }
    var showServer by remember { mutableStateOf(AppSettings.serverUrl().isBlank()) }
    var checking by remember { mutableStateOf(false) }
    var serverStatus by remember { mutableStateOf<String?>(null) }
    var serverOk by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun applyServer(): Boolean {
        val problem = AppSettings.validateServerUrl(serverUrl)
        if (problem != null) {
            error = problem
            return false
        }
        AppSettings.setServerUrl(serverUrl)
        serverUrl = AppSettings.serverUrl()
        return true
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("UltraGram", style = MaterialTheme.typography.titleLarge, color = UgPrimary)
        Text(
            "OWN PLATFORM. OWN ECOSYSTEM. OWN FUTURE.",
            style = MaterialTheme.typography.labelMedium,
            color = UgMuted
        )
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it },
            label = { Text(if (isRegister) "Телефон" else "Телефон, email или @username") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (isRegister) KeyboardType.Phone else KeyboardType.Email,
                imeAction = ImeAction.Next
            ),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Пароль") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = if (isRegister) ImeAction.Next else ImeAction.Done
            ),
            modifier = Modifier.fillMaxWidth()
        )
        if (isRegister) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = password2,
                onValueChange = { password2 = it },
                label = { Text("Повтор пароля") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Next
                ),
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = displayName,
                onValueChange = { displayName = it },
                label = { Text("Отображаемое имя") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }
        Spacer(Modifier.height(16.dp))

        if (loading) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = {
                    error = null
                    serverStatus = null
                    if (!applyServer()) return@Button
                    if (identifier.isBlank() || password.isBlank()) {
                        error = "Заполните логин и пароль"
                        return@Button
                    }
                    if (isRegister && password != password2) {
                        error = "Пароли не совпадают"
                        return@Button
                    }
                    loading = true
                    scope.launch {
                        try {
                            val body = if (isRegister) {
                                mapOf(
                                    "phone" to identifier.trim(),
                                    "password" to password,
                                    "password2" to password2,
                                    "display_name" to displayName.trim().ifBlank { "User" }
                                )
                            } else {
                                mapOf(
                                    "login" to identifier.trim(),
                                    "password" to password
                                )
                            }
                            val response = if (isRegister) {
                                NetworkModule.api.register(body)
                            } else {
                                NetworkModule.api.login(body)
                            }
                            if (response.requires2fa) {
                                error = "Для аккаунта включена 2FA. Вход из Android-приложения пока не поддерживает код 2FA."
                                return@launch
                            }
                            val token = response.token
                            val userId = response.userId
                            if (token.isNullOrBlank() || userId.isNullOrBlank()) {
                                error = "Сервер не вернул токен авторизации"
                                return@launch
                            }
                            AppSettings.saveSession(token, userId)
                            navController.navigate("chats") {
                                popUpTo("auth") { inclusive = true }
                            }
                        } catch (e: Exception) {
                            error = e.friendlyMessage()
                        } finally {
                            loading = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isRegister) "Создать аккаунт" else "Войти")
            }
        }

        Spacer(Modifier.height(8.dp))
        TextButton(onClick = {
            isRegister = !isRegister
            error = null
        }) {
            Text(if (isRegister) "Уже есть аккаунт? Войти" else "Нет аккаунта? Регистрация")
        }

        TextButton(onClick = { showServer = !showServer }) {
            Text(if (showServer) "Скрыть настройки сервера" else "Настройки сервера")
        }

        if (showServer) {
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Адрес backend") },
                singleLine = true,
                supportingText = {
                    Text(
                        "Эмулятор: http://10.0.2.2:8787/\n" +
                            "Телефон: http://<LAN-IP>:8787/ (debug) или https://… (release)",
                        style = MaterialTheme.typography.labelMedium
                    )
                },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        error = null
                        serverStatus = null
                        if (!applyServer()) return@Button
                        checking = true
                        scope.launch {
                            try {
                                val health = NetworkModule.api.health()
                                serverOk = true
                                serverStatus = "Подключено: ${health["name"] ?: "UltraGram"} ${health["version"] ?: ""}"
                            } catch (e: Exception) {
                                serverOk = false
                                serverStatus = e.friendlyMessage()
                            } finally {
                                checking = false
                            }
                        }
                    },
                    enabled = !checking,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (checking) "Проверка…" else "Проверить")
                }
                OutlinedButton(
                    onClick = {
                        serverUrl = AppSettings.defaultServerUrl()
                        serverStatus = null
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("По умолчанию")
                }
            }
            serverStatus?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    it,
                    color = if (serverOk) UgSuccess else UgDanger,
                    style = MaterialTheme.typography.labelMedium
                )
            }
        }

        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = UgDanger)
        }
    }
}
