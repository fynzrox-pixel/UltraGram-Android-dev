package com.ultragram.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.ultragram.android.ui.navigation.UltraGramNavHost
import com.ultragram.android.ui.theme.UltraGramTheme
import com.ultragram.android.ui.theme.UgBg

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            UltraGramTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = UgBg) {
                    UltraGramNavHost()
                }
            }
        }
    }
}