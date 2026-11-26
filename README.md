# UltraGram

UltraGram — независимая платформа общения и цифровая экосистема: backend на Node.js,
веб-клиент, desktop-приложение и нативное Android-приложение на Kotlin + Jetpack Compose.

## Что в репозитории

| Каталог | Назначение |
| --- | --- |
| `backend/` | HTTP/WebSocket API, авторизация, чаты, профили, кошелёк, подарки |
| `android/` | Android-приложение (Kotlin, Jetpack Compose, Retrofit, OkHttp) |
| `public/` | Веб-клиент |
| `desktop/` | Electron-клиент |
| `admin-panel/` | Панель администратора |
| `scripts/` | Служебные скрипты (проверка и создание администраторов, резервные копии) |
| `tests/` | Тесты backend, включая `release-e2e.js` |
| `database/` | Локальная база sql.js (файлы `*.db` не коммитятся) |
| `deployment/` | Материалы для развёртывания |

## Быстрый старт backend

Требуется Node.js 18+.

```bash
npm install
node backend/server.js
```

По умолчанию сервер слушает `0.0.0.0:8787`. При старте он печатает LAN-адреса,
которые можно указать в настройках Android-приложения. Проверка:

```bash
curl http://127.0.0.1:8787/api/health
```

База создаётся автоматически при первом запуске и заполняется схемой и подарками.
Файлы базы (`database/*.db`) не попадают в git.

## Android

```bash
cd android

# debug: адрес эмулятора 10.0.2.2:8787
gradle assembleDebug

# release: production-адрес обязателен и должен быть HTTPS
gradle assembleRelease -Pultragram.baseUrl=https://your-domain/
```

Готовый APK: `android/app/build/outputs/UltraGram-1.0.0.F1.apk`.

- Version Name: `1.0.0.F1`
- Version Code: `10001`
- Package: `com.ultragram.android`
- Минимальная версия: Android 8.0 (API 26), target API 34

Адрес сервера можно изменить прямо в приложении: экран входа → «Настройки сервера»
или раздел «Настройки» после входа. Кнопка «Проверить подключение» вызывает `/api/health`.

### Адреса backend

| Сценарий | Адрес |
| --- | --- |
| Android Emulator | `http://10.0.2.2:8787/` (debug по умолчанию) |
| Реальный телефон в LAN | `http://<IP-компьютера>:8787/` — задаётся в приложении |
| Production | `https://<ваш-домен>/` — HTTPS обязателен |

Release-сборка запрещает cleartext HTTP на уровне `network_security_config` и
`NetworkModule`. Debug-сборка разрешает HTTP только для эмулятора и локальной сети.

## Тесты

```bash
# backend E2E: здоровье, регистрация, вход, профиль, чаты, кошелёк, подарки, администраторы
node tests/release-e2e.js

# общий набор тестов проекта
npm test
```

E2E-тест использует отдельную копию базы (`database/test-release.db`) и не изменяет
рабочие данные.

## Администраторы

В базе присутствуют две учётные записи с ролью `ADMIN` и статусом проверки `Admin`:
основной администратор и второй администратор `Fyn8zrox2`. Пароли и токены в
репозитории не хранятся и не публикуются.

## CI и релизы

`.github/workflows/android-build.yml` собирает release APK, сохраняет его как artifact
и публикует GitHub Release при push тега `v*`. Для подписи в CI используются секреты
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`; без них APK подписывается debug-ключом и остаётся устанавливаемым.

## Лицензия

MIT
