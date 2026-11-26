package com.ultragram.android.ui.screens.wallet

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ultragram.android.data.model.Wallet
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletScreen(navController: androidx.navigation.NavController) {
    var wallet by remember { mutableStateOf<Wallet?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun load() {
        loading = true
        error = null
        scope.launch {
            try {
                wallet = NetworkModule.api.wallet()
            } catch (e: Exception) {
                error = e.friendlyMessage()
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Кошелёк") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = { TextButton(onClick = { load() }) { Text("Обновить") } }
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize().padding(16.dp)) {
            when {
                loading -> CircularProgressIndicator()
                error != null -> {
                    Text(error ?: "", color = UgDanger)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { load() }) { Text("Повторить") }
                }
                else -> {
                    val w = wallet
                    Text("Баланс", color = UgMuted)
                    Text(
                        "${w?.balance ?: 0} огоньков",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text("Получено: ${w?.received ?: 0}", color = UgMuted)
                        Text("Потрачено: ${w?.spent ?: 0}", color = UgMuted)
                    }
                    Spacer(Modifier.height(16.dp))
                    Text("Последние операции", fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    if (w?.transactions.isNullOrEmpty()) {
                        Text("Операций пока нет", color = UgMuted)
                    } else {
                        LazyColumn {
                            items(w?.transactions ?: emptyList()) { tx ->
                                ListItem(
                                    headlineContent = { Text(tx.type) },
                                    supportingContent = {
                                        Text(tx.note ?: tx.id.take(8), color = UgMuted)
                                    },
                                    trailingContent = {
                                        Text(
                                            (if (tx.toUser == null) "+" else "") + tx.amount,
                                            color = UgMuted
                                        )
                                    }
                                )
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }
}
