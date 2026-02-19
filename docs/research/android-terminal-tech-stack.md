# Android Terminal Tech Stack Research

## Target Device
- **Model:** Duali DF-970
- **Android:** 12 (API 31), Rockchip RK3568
- **Screen:** 480×800 (portrait, wall-mount)
- **Camera:** Dual RGB + IR
- **Connectivity:** Ethernet, WiFi, optional 4G

## Recommended Tech Stack

### Language & UI
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | Kotlin | Modern, concise, official Android language. Team familiarity in Vietnam. |
| **UI Framework** | Jetpack Compose | Declarative UI, less boilerplate, great for kiosk-style full-screen apps. Android 12 has full support. |
| **Min SDK** | API 31 (Android 12) | Target device runs Android 12. No need for older compat. |
| **Build** | Gradle 8.x + AGP 8.x | Latest stable Android build toolchain |

### Camera & Face Recognition
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Camera** | CameraX | Jetpack library, handles lifecycle, preview, analysis. Works well with RK3568. |
| **Face Detection** | ML Kit Face Detection | Free, on-device, real-time. Detects faces in camera feed. No cloud dependency. |
| **Face Recognition** | FaceNet / MobileFaceNet (TFLite) | Open-source face embedding model. Generate 128/512-dim vectors, match against local DB. Commercial alternative: Megvii SDK (already licensed by Duali). |
| **IR Liveness** | Custom or Megvii | IR camera for anti-spoofing. Megvii SDK has built-in liveness. If using open-source, combine IR + RGB depth estimation. |

**Decision:** Start with ML Kit for face detection + MobileFaceNet (TFLite) for recognition. Swap to Megvii SDK later when integrating with production hardware. This lets us develop/test without vendor SDK dependency.

### Local Database
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **ORM** | Room (Jetpack) | Type-safe, compile-time verified queries, Kotlin coroutines support. Industry standard for Android local DB. |
| **Underlying** | SQLite | Built into Android. Room wraps it with nice API. |
| **Schema** | Same as simulator | persons, credentials, access_rules, person_groups, event_queue, sync_state |

### MQTT
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Client** | Eclipse Paho Android | Mature, well-tested MQTT 3.1.1/5.0 client. Background service support. Auto-reconnect. |
| **Alternative** | HiveMQ MQTT Client | Newer, Kotlin-friendly, but Paho has better Android-specific features (AlarmManager wake, foreground service). |

**Decision:** Eclipse Paho — proven on Android embedded devices, handles network drops gracefully.

### Architecture
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Architecture** | MVVM + Clean Architecture | ViewModels + UseCases + Repositories. Standard Android pattern. |
| **DI** | Hilt (Dagger) | Compile-time DI, official Jetpack recommendation. |
| **Async** | Kotlin Coroutines + Flow | Structured concurrency, StateFlow for UI state. |
| **Navigation** | Jetpack Navigation Compose | Simple screen navigation (standby → recognition → result → admin) |
| **Background** | Foreground Service | MQTT connection, heartbeat, event queue drain. Must survive screen off. |

### Hardware Interface
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **NFC/Card** | Android NFC API | Built-in. Read Mifare, DESFire UIDs. |
| **Relay/GPIO** | Vendor SDK or sysfs | RK3568 GPIO accessed via `/sys/class/gpio/` or Duali hardware SDK |
| **Wiegand** | Serial/GPIO | If needed, interface via JNI or vendor library |
| **RS485** | USB-Serial or vendor | Android USB host API + serial library |

### Testing
| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Unit** | JUnit 5 + MockK | Kotlin-native mocking |
| **UI** | Compose Testing | Built-in compose test rules |
| **Integration** | Espresso | On-device UI testing |

### Kiosk Mode
- **Device Owner / COSU** — Lock device to single app
- **Immersive mode** — Hide system bars
- **Boot receiver** — Auto-start on power on
- **Disable back/home** — Prevent user exit

## Project Structure
```
dm3-terminal/
├── app/
│   ├── src/main/
│   │   ├── java/com/duali/dm3terminal/
│   │   │   ├── DM3TerminalApp.kt          # Application class + Hilt
│   │   │   ├── MainActivity.kt             # Single activity, Compose host
│   │   │   ├── ui/
│   │   │   │   ├── theme/                  # DM3 dark theme
│   │   │   │   ├── screens/
│   │   │   │   │   ├── StandbyScreen.kt    # Clock + logo + "Tap card or look at camera"
│   │   │   │   │   ├── RecognitionScreen.kt # Camera feed + face overlay
│   │   │   │   │   ├── ResultScreen.kt     # Granted (green) / Denied (red)
│   │   │   │   │   ├── PinScreen.kt        # PIN input keypad
│   │   │   │   │   └── AdminScreen.kt      # Admin menu (PIN protected)
│   │   │   │   └── components/             # Shared UI components
│   │   │   ├── domain/
│   │   │   │   ├── AccessEngine.kt         # Local access decision (same logic as simulator)
│   │   │   │   ├── FaceRecognizer.kt       # Face detection + embedding + match
│   │   │   │   └── models/                 # Domain models
│   │   │   ├── data/
│   │   │   │   ├── local/
│   │   │   │   │   ├── AppDatabase.kt      # Room database
│   │   │   │   │   ├── dao/                # PersonDao, RuleDao, EventDao, etc.
│   │   │   │   │   └── entities/           # Room entities
│   │   │   │   ├── mqtt/
│   │   │   │   │   ├── MqttService.kt      # Foreground service for MQTT
│   │   │   │   │   └── SyncManager.kt      # Full/incremental sync
│   │   │   │   └── repository/             # Repository pattern
│   │   │   ├── hardware/
│   │   │   │   ├── RelayController.kt      # GPIO relay control
│   │   │   │   ├── CardReader.kt           # NFC card reading
│   │   │   │   └── AudioFeedback.kt        # Beep/voice feedback
│   │   │   └── service/
│   │   │       ├── BootReceiver.kt         # Auto-start on boot
│   │   │       └── DeviceAdminReceiver.kt  # Kiosk/device owner
│   │   └── res/                            # Resources, layouts (minimal for Compose)
│   ├── build.gradle.kts
│   └── proguard-rules.pro
├── build.gradle.kts                         # Project-level
├── settings.gradle.kts
├── gradle.properties
└── README.md
```

## Build Phases

### Phase 1: Core Shell (MVP)
- Project scaffold (Kotlin, Compose, Hilt, Room, Paho)
- UI screens: Standby, Result (Granted/Denied), Admin
- Room database with entities matching simulator schema
- Access decision engine (port from Python simulator)
- Mock data seeding

### Phase 2: MQTT + Sync
- Paho MQTT foreground service
- Subscribe to config/sync topics
- Publish events + heartbeat
- Full sync on connect, incremental updates
- Offline event queue + drain

### Phase 3: Camera + Face Recognition
- CameraX preview on recognition screen
- ML Kit face detection
- MobileFaceNet TFLite embedding
- 1:N matching against local person DB
- Face → access decision flow

### Phase 4: Card + Hardware
- NFC card reading (Mifare UID)
- Card → access decision flow
- GPIO relay control (door unlock)
- Audio/visual feedback (beep, voice)

### Phase 5: Kiosk + Production
- Kiosk/COSU mode
- Boot auto-start
- OTA update via MQTT
- Remote config
- Tamper detection (accelerometer)
- Admin PIN menu
