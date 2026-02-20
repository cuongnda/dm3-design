package com.duali.dm3terminal.ui.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.duali.dm3terminal.mqtt.MqttConnectionState
import com.duali.dm3terminal.mqtt.MqttService
import com.duali.dm3terminal.ui.screens.*

object Routes {
    const val IDLE = "idle"
    const val CAMERA_READY = "camera_ready"
    const val FACE_SCAN = "face_scan"
    const val GRANTED = "granted/{personName}"
    const val DENIED = "denied/{reason}"
    const val QR_SCAN = "qr_scan"
    const val NFC = "nfc"
    const val PIN = "pin"
    const val SETTINGS_MENU = "settings_menu"
    const val DEVICE_CONFIG = "device_config"
    const val FACE_RECOGNITION_SETTINGS = "face_recognition_settings"
    const val USER_MANAGEMENT = "user_management"
    const val FACE_ENROLLMENT = "face_enrollment"
    const val ACTIVATE_DEVICE = "activate_device"

    fun granted(personName: String) = "granted/${java.net.URLEncoder.encode(personName, "UTF-8")}"
    fun denied(reason: String) = "denied/${java.net.URLEncoder.encode(reason, "UTF-8")}"
}

@Composable
fun DM3NavHost(
    mqttService: MqttService? = null,
    recognitionViewModel: RecognitionViewModel? = null,
    accessControlManager: com.duali.dm3terminal.hardware.AccessControlManager? = null,
) {
    val navController = rememberNavController()

    fun navigateClean(route: String) {
        navController.navigate(route) {
            popUpTo(Routes.IDLE) { inclusive = false }
        }
    }

    fun navigateToIdle() {
        navController.navigate(Routes.IDLE) {
            popUpTo(Routes.IDLE) { inclusive = true }
        }
    }

    // Observe recognition events to auto-navigate
    if (recognitionViewModel != null) {
        val uiState by recognitionViewModel.uiState.collectAsState()

        LaunchedEffect(uiState) {
            when (val state = uiState) {
                is RecognitionUiState.Granted -> {
                    navigateClean(Routes.granted(state.personName))
                    recognitionViewModel.resetToIdle()
                }
                is RecognitionUiState.Denied -> {
                    navigateClean(Routes.denied(state.reason))
                    recognitionViewModel.resetToIdle()
                }
                is RecognitionUiState.FaceDetected -> {
                    // Face detected — recognition happens on idle screen directly
                }
                else -> {}
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = Routes.IDLE,
        enterTransition = { fadeIn(tween(300)) },
        exitTransition = { fadeOut(tween(300)) },
    ) {
        composable(Routes.IDLE) {
            val mqttState = mqttService?.connectionState
                ?.collectAsStateWithLifecycle()?.value
                ?: MqttConnectionState.DISCONNECTED
            IdleScreen(
                onTap = { /* Face recognition runs directly on idle */ },
                onLongPress = { navController.navigate(Routes.PIN) },
                mqttState = mqttState,
                accessControlManager = accessControlManager,
            )
        }

        composable(Routes.CAMERA_READY) {
            CameraReadyScreen(
                onFaceDetected = { navigateClean(Routes.FACE_SCAN) },
                onCancel = { navController.popBackStack() },
            )
        }

        composable(Routes.FACE_SCAN) {
            FaceScanScreen(
                onResult = { granted, personName, reason ->
                    if (granted) {
                        navigateClean(Routes.granted(personName))
                    } else {
                        navigateClean(Routes.denied(reason))
                    }
                },
                onCancel = { navigateToIdle() },
                accessControlManager = accessControlManager,
            )
        }

        composable(
            Routes.GRANTED,
            arguments = listOf(navArgument("personName") { type = NavType.StringType }),
        ) { entry ->
            val personName = entry.arguments?.getString("personName") ?: ""
            GrantedScreen(
                personName = java.net.URLDecoder.decode(personName, "UTF-8"),
                onTimeout = { navigateToIdle() },
            )
        }

        composable(
            Routes.DENIED,
            arguments = listOf(navArgument("reason") { type = NavType.StringType }),
        ) { entry ->
            val reason = entry.arguments?.getString("reason") ?: "Face not recognized"
            DeniedScreen(
                reason = java.net.URLDecoder.decode(reason, "UTF-8"),
                onTimeout = { navigateToIdle() },
            )
        }

        composable(Routes.QR_SCAN) {
            QrScanScreen(
                onResult = { granted, personName, reason ->
                    if (granted) {
                        navigateClean(Routes.granted(personName))
                    } else {
                        navigateClean(Routes.denied(reason))
                    }
                },
                onCancel = { navigateToIdle() },
            )
        }

        composable(Routes.NFC) {
            NfcScreen(
                onNfcDetected = { granted, personName, reason ->
                    if (granted) {
                        navigateClean(Routes.granted(personName))
                    } else {
                        navigateClean(Routes.denied(reason))
                    }
                },
                onCancel = { navigateToIdle() },
            )
        }

        composable(Routes.PIN) {
            PinScreen(
                onPinVerified = { navigateClean(Routes.SETTINGS_MENU) },
                onCancel = { navController.popBackStack() },
            )
        }

        composable(Routes.SETTINGS_MENU) {
            SettingsMenuScreen(
                onDeviceConfig = { navController.navigate(Routes.DEVICE_CONFIG) },
                onFaceRecognition = { navController.navigate(Routes.FACE_RECOGNITION_SETTINGS) },
                onUserManagement = { navController.navigate(Routes.USER_MANAGEMENT) },
                onActivateDevice = { navController.navigate(Routes.ACTIVATE_DEVICE) },
                onBack = { navigateToIdle() },
            )
        }

        composable(Routes.DEVICE_CONFIG) {
            DeviceConfigScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.FACE_RECOGNITION_SETTINGS) {
            FaceRecognitionSettingsScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.USER_MANAGEMENT) {
            UserManagementScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.FACE_ENROLLMENT) {
            FaceEnrollmentScreen(onBack = { navController.popBackStack() })
        }

        composable(Routes.ACTIVATE_DEVICE) {
            ActivateDeviceScreen(
                onBack = { navController.popBackStack() },
                onActivated = { navigateToIdle() },
            )
        }
    }
}
