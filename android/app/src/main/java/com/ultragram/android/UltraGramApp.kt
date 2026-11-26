package com.ultragram.android

import android.app.Application
import com.ultragram.android.data.AppSettings

class UltraGramApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AppSettings.init(this)
    }
}
