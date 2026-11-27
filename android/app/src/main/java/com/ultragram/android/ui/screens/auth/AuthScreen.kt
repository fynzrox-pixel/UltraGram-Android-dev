package com.ultragram.android.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ultragram.android.data.AppSettings
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import com.ultragram.android.ui.theme.UgSuccess
import com.ultragram.android.ui.theme.UltraGramTheme
import com.ultragram.android.ui.theme.*
import kotlinx.coroutines.launch

private val GradientStart = Color(0xFF8657FF)
private val GradientEnd = Color(0xFF3C8DFF)
private val BgDeep = Color(0xFF05050A)
private val BgCard = Color(0xFF0F0F1A)
private val BgField = Color(0xFF16162A)
private val BorderSubtle = Color(0xFF2A2A4A)

@Composable
fun AuthScreen(navController: androidx.navigation.NavController) {
    var identifier by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var password2 by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var isRegister by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var passwordVisible by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(BgDeep, Color(0xFF0A0A18), BgDeep)
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp, vertical = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Logo
            Text(
                "UltraGram",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontSize = 36.sp,
                    fontWeight = FontWeight.ExtraBold
                ),
                color = Color.White
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "OWN PLATFORM. OWN ECOSYSTEM. OWN FUTURE.",
                style = MaterialTheme.typography.labelMedium.copy(fontSize = 11.sp),
                color = UgMuted,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "NoInfoTeam",
                style = MaterialTheme.typography.labelMedium.copy(fontSize = 10.sp),
                color = UgMuted.copy(alpha = 0.6f)
            )

            Spacer(Modifier.height(40.dp))

            // Card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(BgCard)
                    .border(1.dp, BorderSubtle, RoundedCornerShape(24.dp))
                    .padding(24.dp)
            ) {
                Text(
                    if (isRegister) "Создать аккаунт" else "Вход",
                    style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp),
                    color = UgText
                )
                Spacer(Modifier.height(20.dp))

                // Identifier field
                PremiumField(
                    value = identifier,
                    onValueChange = { identifier = it },
                    label = if (isRegister) "Телефон" else "Телефон, email или @username",
                    keyboardType = if (isRegister) KeyboardType.Phone else KeyboardType.Email,
                    imeAction = ImeAction.Next
                )

                Spacer(Modifier.height(12.dp))

                // Password field
                PremiumField(
                    value = password,
                    onValueChange = { password = it },
                    label = "Пароль",
                    keyboardType = KeyboardType.Password,
                    imeAction = if (isRegister) ImeAction.Next else ImeAction.Done,
                    isPassword = true,
                    passwordVisible = passwordVisible,
                    onTogglePassword = { passwordVisible = !passwordVisible }
                )

                if (isRegister) {
                    Spacer(Modifier.height(12.dp))
                    PremiumField(
                        value = password2,
                        onValueChange = { password2 = it },
                        label = "Повтор пароля",
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Next,
                        isPassword = true,
                        passwordVisible = passwordVisible,
                        onTogglePassword = { passwordVisible = !passwordVisible }
                    )
                    Spacer(Modifier.height(12.dp))
                    PremiumField(
                        value = displayName,
                        onValueChange = { displayName = it },
                        label = "Отображаемое имя",
                        keyboardType = KeyboardType.Text,
                        imeAction = ImeAction.Done
                    )
                }

                Spacer(Modifier.height(24.dp))

                // Error
                error?.let {
                    Text(it, color = UgDanger, style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.height(12.dp))
                }

                // Button
                if (loading) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = GradientStart)
                    }
                } else {
                    GradientButton(
                        text = if (isRegister) "Создать аккаунт" else "Войти",
                        onClick = {
                            error = null
                            if (identifier.isBlank() || password.isBlank()) {
                                error = "Заполните логин и пароль"
                                return@GradientButton
                            }
                            if (isRegister && password != password2) {
                                error = "Пароли не совпадают"
                                return@GradientButton
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
                                        error = "Для аккаунта включена 2FA. Вход из приложения пока не поддерживает код 2FA."
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
                    )
                }

                Spacer(Modifier.height(16.dp))

                // Toggle register/login
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        if (isRegister) "Уже есть аккаунт? " else "Нет аккаунта? ",
                        color = UgMuted,
                        style = MaterialTheme.typography.labelMedium
                    )
                    Text(
                        if (isRegister) "Войти" else "Регистрация",
                        color = GradientStart,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.clickable {
                            isRegister = !isRegister
                            error = null
                        }
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // Terms
            Text(
                "Регистрируясь, вы соглашаетесь с Условиями использования и Политикой конфиденциальности NoInfoTeam.",
                style = MaterialTheme.typography.labelMedium.copy(fontSize = 10.sp),
                color = UgMuted.copy(alpha = 0.6f),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun PremiumField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType,
    imeAction: ImeAction,
    isPassword: Boolean = false,
    passwordVisible: Boolean = false,
    onTogglePassword: () -> Unit = {}
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        trailingIcon = if (isPassword) {
            {
                IconButton(onClick = onTogglePassword) {
                    Icon(
                        if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = "Показать пароль",
                        tint = UgMuted
                    )
                }
            }
        } else null,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = GradientStart,
            unfocusedBorderColor = BorderSubtle,
            focusedLabelColor = GradientStart,
            unfocusedLabelColor = UgMuted,
            cursorColor = GradientStart,
            focusedContainerColor = BgField,
            unfocusedContainerColor = BgField
        ),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun GradientButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
        contentPadding = PaddingValues(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(colors = listOf(GradientStart, GradientEnd)),
                    RoundedCornerShape(14.dp)
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(text, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF05050A)
@Composable
fun AuthScreenPreview() {
    UltraGramTheme {
        // Preview placeholder - full preview requires navController
    }
}
