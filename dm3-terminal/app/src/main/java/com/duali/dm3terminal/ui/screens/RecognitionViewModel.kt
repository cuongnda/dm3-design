package com.duali.dm3terminal.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.duali.dm3terminal.hardware.AccessControlManager
import com.duali.dm3terminal.hardware.AccessEvent
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class RecognitionUiState {
    data object Idle : RecognitionUiState()
    data object Scanning : RecognitionUiState()
    data object FaceDetected : RecognitionUiState()
    data class Granted(val personId: String, val personName: String) : RecognitionUiState()
    data class Denied(val reason: String) : RecognitionUiState()
}

@HiltViewModel
class RecognitionViewModel @Inject constructor(
    private val accessControlManager: AccessControlManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow<RecognitionUiState>(RecognitionUiState.Idle)
    val uiState: StateFlow<RecognitionUiState> = _uiState

    init {
        viewModelScope.launch {
            accessControlManager.events.collect { event ->
                when (event) {
                    is AccessEvent.FaceDetected -> {
                        _uiState.value = RecognitionUiState.FaceDetected
                    }
                    is AccessEvent.FaceGranted -> {
                        _uiState.value = RecognitionUiState.Granted(
                            personId = event.personId,
                            personName = event.personName ?: "Unknown",
                        )
                    }
                    is AccessEvent.FaceDenied -> {
                        _uiState.value = RecognitionUiState.Denied(event.reason)
                    }
                    is AccessEvent.NfcGranted -> {
                        _uiState.value = RecognitionUiState.Granted(
                            personId = event.personId,
                            personName = event.personName ?: "Unknown",
                        )
                    }
                    is AccessEvent.NfcDenied -> {
                        _uiState.value = RecognitionUiState.Denied(event.reason)
                    }
                    is AccessEvent.WiegandGranted -> {
                        _uiState.value = RecognitionUiState.Granted(
                            personId = event.personId,
                            personName = event.personName ?: "Unknown",
                        )
                    }
                    is AccessEvent.WiegandDenied -> {
                        _uiState.value = RecognitionUiState.Denied(event.reason)
                    }
                    is AccessEvent.Idle -> {
                        _uiState.value = RecognitionUiState.Idle
                    }
                }
            }
        }
    }

    fun resetToIdle() {
        _uiState.value = RecognitionUiState.Idle
    }

    fun resetToScanning() {
        _uiState.value = RecognitionUiState.Scanning
    }
}
