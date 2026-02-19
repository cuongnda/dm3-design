package com.duali.dm3terminal.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.duali.dm3terminal.domain.AccessEngine
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class RecognitionUiState {
    data object Scanning : RecognitionUiState()
    data class Result(val granted: Boolean, val personName: String, val reason: String) : RecognitionUiState()
}

@HiltViewModel
class RecognitionViewModel @Inject constructor(
    private val accessEngine: AccessEngine,
) : ViewModel() {

    private val _uiState = MutableStateFlow<RecognitionUiState>(RecognitionUiState.Scanning)
    val uiState: StateFlow<RecognitionUiState> = _uiState

    fun simulateRecognition() {
        viewModelScope.launch {
            // Simulate a card tap with a known credential
            val decision = accessEngine.evaluate(
                credentialType = "card",
                credentialValue = "A1B2C3D4", // First seeded card
                doorId = "door-main-entrance",
            )
            _uiState.value = RecognitionUiState.Result(
                granted = decision.granted,
                personName = decision.personName ?: "Không xác định",
                reason = decision.reason,
            )
        }
    }
}
