package com.ultragram.android.ui.screens.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallMissed
import androidx.compose.material.icons.filled.PhoneCallback
import androidx.compose.material.icons.filled.PhoneForwarded
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
import com.ultragram.android.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

private val BgDeep = Color(0xFF05050A)
private val BgCard = Color(0xFF0F0F1A)
private val BgField = Color(0xFF16162A)
private val BorderSubtle = Color(0xFF2A2A4A)
private val GradientStart = Color(0xFF8657FF)
private val GradientEnd = Color(0xFF3C8DFF)

data class CallHistoryItem(
    val id: String,
    val name: String,
    val type: String, // "incoming", "outgoing", "missed"
    val timestamp: Long,
    val duration: Int // seconds
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallsScreen(navController: androidx.navigation.NavController) {
    // Call history is not yet backed by a real backend endpoint.
    // Show empty state honestly.
    var calls by remember { mutableStateOf<List<CallHistoryItem>>(emptyList()) }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(BgDeep)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text(
                    "Звонки",
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 22.sp
                    ),
                    color = Color.White
                )
            }
        },
        containerColor = BgDeep
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            if (calls.isEmpty()) {
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        Icons.Default.Call,
                        contentDescription = null,
                        tint = UgMuted,
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(Modifier.height(16.dp))
                    Text("Нет звонков", style = MaterialTheme.typography.titleLarge, color = Color.White)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "История звонков появится здесь после первого вызова.",
                        color = UgMuted,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(calls, key = { it.id }) { call ->
                        CallRow(call = call)
                        HorizontalDivider(color = BorderSubtle, thickness = 0.5.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun CallRow(call: CallHistoryItem) {
    val (icon, color, label) = when (call.type) {
        "incoming" -> Triple(Icons.Default.PhoneCallback, Color(0xFF22C55E), "Входящий")
        "outgoing" -> Triple(Icons.Default.PhoneForwarded, Color(0xFF3C8DFF), "Исходящий")
        "missed" -> Triple(Icons.Default.CallMissed, Color(0xFFEF4444), "Пропущенный")
        else -> Triple(Icons.Default.Call, UgMuted, "Звонок")
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(color.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, tint = color, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(call.name, fontWeight = FontWeight.SemiBold, color = Color.White)
            Text(label, color = UgMuted, style = MaterialTheme.typography.labelMedium)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(formatCallTime(call.timestamp), color = UgMuted, style = MaterialTheme.typography.labelSmall)
            if (call.duration > 0) {
                Text(formatDuration(call.duration), color = UgMuted, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

private fun formatCallTime(ts: Long): String {
    val sdf = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault())
    return sdf.format(Date(ts))
}

private fun formatDuration(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return if (m > 0) "${m}м ${s}с" else "${s}с"
}

@Preview(showBackground = true, backgroundColor = 0xFF05050A)
@Composable
fun CallsScreenPreview() {
    UltraGramTheme {
    }
}
