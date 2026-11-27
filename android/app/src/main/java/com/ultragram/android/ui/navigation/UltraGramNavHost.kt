package com.ultragram.android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.ultragram.android.data.AppSettings
import com.ultragram.android.ui.screens.auth.AuthScreen

import com.ultragram.android.ui.screens.chats.ChatScreen
import com.ultragram.android.ui.screens.gifts.GiftsScreen
import com.ultragram.android.ui.screens.profile.ProfileScreen
import com.ultragram.android.ui.screens.settings.SettingsScreen
import com.ultragram.android.ui.screens.wallet.WalletScreen

@Composable
fun UltraGramNavHost() {
    val navController = rememberNavController()
    val startDestination = if (AppSettings.isLoggedIn()) "chats" else "auth"
    NavHost(navController = navController, startDestination = startDestination) {
        composable("auth") { AuthScreen(navController) }
        composable("chats") { MainScreen(navController) }
        composable("chat/{chatId}") { backStack ->
            ChatScreen(navController, backStack.arguments?.getString("chatId"))
        }
        composable("profile") { ProfileScreen(navController) }
        composable("settings") { SettingsScreen(navController) }
        composable("wallet") { WalletScreen(navController) }
        composable("gifts") { GiftsScreen(navController) }
    }
}
