# UltraGram Android

Нативное Android-приложение UltraGram (Kotlin + Jetpack Compose).

## Версия

- Version Name: `1.0.0.F2`
- Version Code: `10002`
- Package: `com.ultragram.android`
- APK: `UltraGram-1.0.0.F2.apk`

## Требования

- JDK 17
- Android SDK Platform 34 + Build-Tools 34.0.0
- Gradle 8.9 (в CI подключается через `gradle/actions/setup-gradle`)

## Сборка

```bash
# debug (эмулятор, HTTP разрешён)
gradle assembleDebug

# release (HTTPS-only; адрес можно задать при сборке)
gradle assembleRelease -Pultragram.baseUrl=https://your-domain/
```

Готовый файл: `app/build/outputs/UltraGram-1.0.0.F2.apk`.

Release-сборка использует `android/keystore.properties` + `ultragram-release.jks`, если они есть.
Без них APK подписывается debug-ключом и остаётся устанавливаемым для тестирования.

## Подключение к backend

Приложение больше не имеет жёстко прошитого «настоящего» IP или домена.

| Сценарий | Адрес |
| --- | --- |
| Android Emulator | `http://10.0.2.2:8787/` (значение по умолчанию для debug) |
| Реальный телефон в LAN (debug) | `http://<IP-компьютера>:8787/` — указывается в Настройках |
| Production (release) | `https://<ваш-домен>/` — указывается в Настройках или через `-Pultragram.baseUrl` |

- Адрес сохраняется в приложении и применяется без перезапуска.
- Кнопка «Проверить подключение» вызывает `/api/health`.
- В release-сборке HTTP заблокирован политикой `network_security_config`
  и проверкой в `NetworkModule`; разрешён только HTTPS.
- Debug-сборка разрешает HTTP для `10.0.2.2` и локальной сети.

Backend по умолчанию слушает `0.0.0.0:8787`, поэтому доступен и эмулятору,
и телефонам в той же сети. Запуск из корня проекта:

```bash
node backend/server.js
```

При старте backend печатает LAN-адреса, которые можно ввести в Настройках.
Windows Firewall должен разрешать входящие подключения к Node.js на порт 8787.

## Вход

- Телефон + пароль
- Email + пароль
- `@username` + пароль

Токен сохраняется локально и автоматически добавляется в `Authorization: Bearer …`.
При 401 приложение очищает сессию и возвращает на экран входа.

## Проверка backend

```bash
node tests/release-e2e.js
```

Тест работает с копией базы, проверяет регистрацию, вход, профиль, чаты,
сообщения, кошелёк, подарки и обоих администраторов.
