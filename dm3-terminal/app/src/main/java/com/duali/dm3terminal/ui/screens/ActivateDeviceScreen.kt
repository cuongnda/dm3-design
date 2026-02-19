package com.duali.dm3terminal.ui.screens

import android.Manifest
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.duali.dm3terminal.data.DeviceCredentials
import com.duali.dm3terminal.data.ProvisioningCredentials
import com.duali.dm3terminal.network.ApiResult
import com.duali.dm3terminal.network.ProvisioningApi
import com.duali.dm3terminal.ui.components.*
import com.duali.dm3terminal.ui.theme.*
import com.duali.dm3terminal.util.HardwareFingerprint
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ActivationState {
    data object Scanning : ActivationState()
    data object Activating : ActivationState()
    data class Success(val companyName: String) : ActivationState()
    data class Error(val message: String) : ActivationState()
}

@HiltViewModel
class ActivateDeviceViewModel @Inject constructor(
    @ApplicationContext private val appContext: android.content.Context,
    private val api: ProvisioningApi,
    private val provisioningCredentials: ProvisioningCredentials,
) : ViewModel() {

    private val _state = MutableStateFlow<ActivationState>(ActivationState.Scanning)
    val state: StateFlow<ActivationState> = _state.asStateFlow()

    private var processing = false

    fun onQrScanned(rawValue: String) {
        if (processing) return
        if (!rawValue.startsWith("dm3_qr_v1.") && !rawValue.contains("t=dm3_qr_v1.")) return
        processing = true

        val token = if (rawValue.contains("t=")) {
            rawValue.substringAfter("t=")
        } else {
            rawValue
        }

        _state.value = ActivationState.Activating

        viewModelScope.launch {
            val fingerprint = HardwareFingerprint.toJson(appContext)
            // Use localhost since ADB reverse is set up
            val result = api.activate("http://localhost:8002", token, fingerprint)
            when (result) {
                is ApiResult.Success -> {
                    val r = result.data
                    provisioningCredentials.save(
                        DeviceCredentials(
                            mqttBrokerUrl = r.mqttBroker,
                            mqttUsername = r.mqttUsername,
                            mqttToken = r.mqttToken,
                            tokenExpiresAt = r.tokenExpiresAt,
                            refreshUrl = r.refreshUrl,
                            companyId = r.companyId,
                            companyName = r.companyName,
                            companyCode = r.companyCode,
                            isProvisioned = true,
                        )
                    )
                    _state.value = ActivationState.Success(r.companyName)
                }
                is ApiResult.Error -> {
                    _state.value = ActivationState.Error(result.message)
                    processing = false
                }
            }
        }
    }

    fun retry() {
        processing = false
        _state.value = ActivationState.Scanning
    }
}

@Composable
fun ActivateDeviceScreen(
    onBack: () -> Unit,
    onActivated: () -> Unit,
    viewModel: ActivateDeviceViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Auto-navigate on success after delay
    LaunchedEffect(state) {
        if (state is ActivationState.Success) {
            kotlinx.coroutines.delay(2000)
            onActivated()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DM3Background),
    ) {
        DeviceStatusBar()
        DuallPassHeader(subtitle = "Activate Device")

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(modifier = Modifier.height(12.dp))

            when (val s = state) {
                is ActivationState.Scanning -> {
                    GlassCard(title = "SCAN QR CODE") {
                        Text(
                            text = "Point the camera at the provisioning QR code",
                            color = DM3Gray,
                            fontSize = 13.sp,
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Camera preview
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .clip(RoundedCornerShape(16.dp))
                            .background(DM3Surface),
                    ) {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                val previewView = PreviewView(ctx)
                                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                                cameraProviderFuture.addListener({
                                    val cameraProvider = cameraProviderFuture.get()
                                    val preview = Preview.Builder().build().also {
                                        it.surfaceProvider = previewView.surfaceProvider
                                    }

                                    val barcodeScanner = BarcodeScanning.getClient()
                                    val imageAnalysis = ImageAnalysis.Builder()
                                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                        .build()

                                    imageAnalysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { imageProxy ->
                                        val mediaImage = imageProxy.image
                                        if (mediaImage != null) {
                                            val inputImage = InputImage.fromMediaImage(
                                                mediaImage, imageProxy.imageInfo.rotationDegrees
                                            )
                                            barcodeScanner.process(inputImage)
                                                .addOnSuccessListener { barcodes ->
                                                    for (barcode in barcodes) {
                                                        barcode.rawValue?.let { viewModel.onQrScanned(it) }
                                                    }
                                                }
                                                .addOnCompleteListener { imageProxy.close() }
                                        } else {
                                            imageProxy.close()
                                        }
                                    }

                                    try {
                                        cameraProvider.unbindAll()
                                        cameraProvider.bindToLifecycle(
                                            lifecycleOwner,
                                            CameraSelector.DEFAULT_BACK_CAMERA,
                                            preview,
                                            imageAnalysis,
                                        )
                                    } catch (e: Exception) {
                                        Log.e("ActivateDevice", "Camera bind failed", e)
                                    }
                                }, ContextCompat.getMainExecutor(ctx))
                                previewView
                            },
                        )
                    }
                }

                is ActivationState.Activating -> {
                    Spacer(modifier = Modifier.weight(1f))
                    CircularProgressIndicator(color = DM3AccentPurple)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Activating device...", color = DM3White, fontSize = 18.sp)
                    Spacer(modifier = Modifier.weight(1f))
                }

                is ActivationState.Success -> {
                    Spacer(modifier = Modifier.weight(1f))
                    Text("✅", fontSize = 64.sp)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Activated",
                        color = DM3Green,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = s.companyName,
                        color = DM3White,
                        fontSize = 18.sp,
                    )
                    Spacer(modifier = Modifier.weight(1f))
                }

                is ActivationState.Error -> {
                    Spacer(modifier = Modifier.weight(1f))
                    Text("❌", fontSize = 64.sp)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Activation Failed",
                        color = DM3Red,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = s.message,
                        color = DM3Gray,
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 32.dp),
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Surface(
                        onClick = { viewModel.retry() },
                        color = DM3AccentPurple,
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text(
                            text = "Retry",
                            color = DM3White,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 32.dp, vertical = 12.dp),
                        )
                    }
                    Spacer(modifier = Modifier.weight(1f))
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }

        // Back button
        Surface(
            onClick = onBack,
            color = DM3Surface,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            Text(
                text = "← Back to Settings",
                color = DM3Gray,
                fontSize = 14.sp,
                modifier = Modifier.padding(12.dp),
                textAlign = TextAlign.Center,
            )
        }

        DuallPassFooter(leftText = "← Settings", rightText = "QR Activation")
    }
}
