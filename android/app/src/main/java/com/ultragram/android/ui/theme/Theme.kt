package com.ultragram.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = UgPrimary,
    secondary = UgSecondary,
    tertiary = UgAccent,
    background = UgBg,
    surface = UgPanel,
    onPrimary = UgText,
    onSecondary = UgText,
    onBackground = UgText,
    onSurface = UgText
)

@Composable
fun UltraGramTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}