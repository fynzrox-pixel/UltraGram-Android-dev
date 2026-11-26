import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val configuredBaseUrl = (project.findProperty("ultragram.baseUrl") as String?)?.trim().orEmpty()

// Production (release) builds MUST provide a real HTTPS backend URL.
// Failing here prevents shipping an APK with an empty/unusable server address.
val isReleaseRequested = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }
if (isReleaseRequested && configuredBaseUrl.isBlank()) {
    throw GradleException(
        "Release build requires a production HTTPS backend URL. " +
            "Pass -Pultragram.baseUrl=https://api.your-domain/ (or set ULTRAGRAM_BASE_URL in CI). " +
            "Debug builds are unaffected."
    )
}
fun quoted(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "com.ultragram.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ultragram.android"
        minSdk = 26
        targetSdk = 34
        versionCode = 10004
        versionName = "1.0.0.F4"
    }

    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // Android emulator maps 10.0.2.2 to the host machine.
            buildConfigField("String", "DEFAULT_SERVER_URL", quoted("http://10.0.2.2:8787/"))
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Production must use HTTPS. Provide the real address at build time
            // with -Pultragram.baseUrl=https://your-domain/ or enter it in the app.
            buildConfigField("String", "DEFAULT_SERVER_URL", quoted(configuredBaseUrl))
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                // CI without signing secrets still produces an installable APK.
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.2")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}

// The release APK is produced by assembleRelease as app-release.apk and renamed
// to UltraGram-1.0.0.F2.apk in CI / release scripts.
