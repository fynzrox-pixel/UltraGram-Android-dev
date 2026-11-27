package com.ultragram.android.ui.screens.contacts

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
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
fun ContactsScreen(navController: androidx.navigation.NavController) {
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

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgDeep)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text(
                    "Контакты",
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 22.sp
                    ),
                    color = Color.White
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Поиск по имени или @username", color = UgMuted) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Поиск", tint = UgMuted) },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = GradientStart,
                        unfocusedBorderColor = BorderSubtle,
                        focusedContainerColor = BgField,
                        unfocusedContainerColor = BgField,
                        cursorColor = GradientStart
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        containerColor = BgDeep
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when {
                searching -> CircularProgressIndicator(
                    Modifier.align(Alignment.Center),
                    color = GradientStart
                )
                error != null -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(error ?: "", color = UgDanger)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { search() }) { Text("Повторить") }
                }
                results.isEmpty() && query.isNotBlank() -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Ничего не найдено", style = MaterialTheme.typography.titleLarge, color = Color.White)
                    Spacer(Modifier.height(8.dp))
                    Text("Попробуйте другой запрос", color = UgMuted)
                }
                results.isEmpty() -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Найдите пользователей", style = MaterialTheme.typography.titleLarge, color = Color.White)
                    Spacer(Modifier.height(8.dp))
                    Text("Введите имя, @username или email для поиска", color = UgMuted)
                }
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(results, key = { it.id }) { user ->
                        ContactRow(user = user, onClick = {
                            // Start DM chat
                            navController.navigate("profile")
                        }, onMessageClick = {
                            // Create chat and navigate
                        })
                        HorizontalDivider(color = BorderSubtle, thickness = 0.5.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ContactRow(
    user: UserSearchResult,
    onClick: () -> Unit,
    onMessageClick: () -> Unit
) {
    val verified = user.verification?.let { it != "Unverified" } == true
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(
                    Brush.linearGradient(colors = listOf(GradientStart, GradientEnd))
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                (user.displayName ?: user.username ?: "?").take(1).uppercase(),
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 18.sp),
                color = Color.White,
                fontWeight = FontWeight.Bold
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    user.displayName ?: user.username ?: user.id,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                    maxLines = 1
                )
                if (verified) {
                    Spacer(Modifier.width(6.dp))
                    Text("✓", color = Color(0xFF22C55E), fontWeight = FontWeight.Bold)
                }
            }
            user.username?.let {
                Text("@$it", color = UgMuted, style = MaterialTheme.typography.labelMedium)
            }
        }
        IconButton(onClick = onMessageClick) {
            Icon(Icons.Default.Person, contentDescription = "Написать", tint = GradientStart)
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF05050A)
@Composable
fun ContactsScreenPreview() {
    UltraGramTheme {
    }
}
