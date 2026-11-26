package com.ultragram.android.ui.screens.gifts

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
import com.ultragram.android.data.model.Gift
import com.ultragram.android.data.network.NetworkModule
import com.ultragram.android.data.network.friendlyMessage
import com.ultragram.android.ui.theme.UgDanger
import com.ultragram.android.ui.theme.UgMuted
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GiftsScreen(navController: androidx.navigation.NavController) {
    var gifts by remember { mutableStateOf<List<Gift>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    fun load() {
        loading = true
        error = null
        scope.launch {
            try {
                gifts = NetworkModule.api.gifts()
            } catch (e: Exception) {
                error = e.friendlyMessage()
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    val visible = remember(gifts, query) {
        if (query.isBlank()) gifts
        else gifts.filter {
            it.name.contains(query, ignoreCase = true) ||
                it.description?.contains(query, ignoreCase = true) == true ||
                it.rarity.contains(query, ignoreCase = true)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Подарки") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад")
                    }
                },
                actions = { TextButton(onClick = { load() }) { Text("Обновить") } }
            )
        }
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Поиск подарка") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)
            )
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                error != null -> Column(
                    Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(error ?: "", color = UgDanger)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = { load() }) { Text("Повторить") }
                }
                visible.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Подарки не найдены", color = UgMuted)
                }
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(visible, key = { it.id }) { gift ->
                        ListItem(
                            headlineContent = {
                                Text(gift.name, fontWeight = FontWeight.SemiBold)
                            },
                            supportingContent = {
                                Column {
                                    Text("${gift.rarity} · ${gift.category ?: "UltraGram"}")
                                    gift.description?.let {
                                        Text(it, color = UgMuted, maxLines = 2)
                                    }
                                }
                            },
                            trailingContent = { Text("${gift.price}") }
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}
