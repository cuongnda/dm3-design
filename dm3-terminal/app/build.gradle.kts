plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.duali.dm3terminal"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.duali.dm3terminal"
        minSdk = 31
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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

    // Safe mode: set to true to disable ALL hardware access for debugging
    defaultConfig {
        // Camera1 API (face recognition) causes kernel panic on DF-970 firmware
        // Keep true until firmware fix or Camera2 API migration
        // Camera driver causes kernel panic on DF-970 — both Camera1 and Camera2
        // Needs firmware fix from hardware team
        buildConfigField("boolean", "HARDWARE_SAFE_MODE", "true")
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
        resources {
            excludes += setOf(
                "META-INF/INDEX.LIST",
                "META-INF/io.netty.versions.properties",
                "META-INF/DEPENDENCIES"
            )
        }
    }
}

dependencies {
    // Core
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    debugImplementation(libs.compose.ui.tooling)

    // Navigation
    implementation(libs.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // Room
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    // CameraX (dep only for Phase 1)
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)

    // ML Kit Face (dep only)
    implementation(libs.mlkit.face)

    // ML Kit Barcode scanning (QR provisioning)
    implementation(libs.mlkit.barcode)

    // Security - EncryptedSharedPreferences
    implementation(libs.security.crypto)

    // MQTT - HiveMQ MQTT 5.0 client
    implementation(libs.hivemq.mqtt)

    // WorkManager
    implementation(libs.work.runtime)
    implementation(libs.hilt.work)
    ksp(libs.hilt.work.compiler)

    // DF970 Hardware SDK
    implementation(files("libs/HWControl-release.aar"))
    implementation(files("libs/FacePassAndroidSDK-year-release.aar"))

    // JNI modules
    implementation(project(":rf"))
    implementation(project(":wiegand"))
    implementation(project(":serial_port"))
    implementation(project(":sam_uart"))
    implementation(project(":thermal"))
    implementation(project(":tof"))

    // Coroutines (for hardware wrappers)
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
