# UltraGram Android

Нативное Android-приложение UltraGram (Kotlin + Jetpack Compose).

## Требования
- Android Studio (Hedgehog или новее)
- JDK 17
- Android SDK (API 26+)
- Gradle (встроен в Android Studio)

## Открытие проекта
1. Откройте Android Studio
2. File → Open → выберите папку `C:\Users\Користувач\Desktop\UltraGram\android`
3. Дождитесь Gradle Sync
4. Запустите на эмуляторе или устройстве

## Конфигурация backend
В `NetworkModule.kt` измените `BASE_URL`:
- Эмулятор: `http://10.0.2.2:8787/`
- Реальное устройство: `http://<IP-адрес-компьютера>:8787/`

## Сборка APK
- Debug: `./gradlew assembleDebug`
- APK: `app/build/outputs/apk/debug/app-debug.apk`

## Реализованные экраны
- Auth (регистрация/вход по телефону)
- ChatList, Chat, Profile, Wallet, Gifts, Settings

## Статус
Проект создан, но **не собран** — в текущей среде отсутствуют Java/Gradle/Android SDK.
Откройте в Android Studio и соберите.