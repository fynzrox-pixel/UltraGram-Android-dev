package com.ultragram.android.ui.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Contacts
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ultragram.android.ui.screens.calls.CallsScreen
import com.ultragram.android.ui.screens.chats.ChatListScreen
import com.ultragram.android.ui.screens.contacts.ContactsScreen
import com.ultragram.android.ui.screens.profile.ProfileScreen
import com.ultragram.android.ui.theme.UgMuted

private val BgDeep = Color(0xFF05050A)
private val GradientStart = Color(0xFF8657FF)

sealed class BottomTab(val route: String, val label: String, val icon: ImageVector) {
    data object Chats : BottomTab("main_chats", "Чаты", Icons.Default.Chat)
    data object Contacts : BottomTab("main_contacts", "Контакты", Icons.Default.Contacts)
    data object Calls : BottomTab("main_calls", "Звонки", Icons.Default.Call)
    data object Profile : BottomTab("main_profile", "Профиль", Icons.Default.Person)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(navController: androidx.navigation.NavController) {
    var selectedTab by remember { mutableStateOf<BottomTab>(BottomTab.Chats) }

    Scaffold(
        containerColor = BgDeep,
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF0A0A14),
                contentColor = Color.White
            ) {
                listOf(BottomTab.Chats, BottomTab.Contacts, BottomTab.Calls, BottomTab.Profile).forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label, fontSize = 11.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = GradientStart,
                            selectedTextColor = GradientStart,
                            unselectedIconColor = UgMuted,
                            unselectedTextColor = UgMuted,
                            indicatorColor = GradientStart.copy(alpha = 0.15f)
                        )
                    )
                }
            }
        }
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when (selectedTab) {
                BottomTab.Chats -> ChatListScreen(navController)
                BottomTab.Contacts -> ContactsScreen(navController)
                BottomTab.Calls -> CallsScreen(navController)
                BottomTab.Profile -> ProfileScreen(navController)
            }
        }
    }
}
