package com.duali.dm3terminal.ui.screens

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.duali.dm3terminal.data.local.dao.FaceTemplateDao
import com.duali.dm3terminal.data.local.entities.FaceTemplateEntity
import com.duali.dm3terminal.hardware.FacePassManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class EnrollmentStep(
    val index: Int,
    val instruction: String,
    val captured: Boolean = false,
    val faceToken: String? = null,
)

sealed class EnrollmentUiState {
    data object Idle : EnrollmentUiState()
    data class Capturing(
        val personId: String,
        val personName: String,
        val steps: List<EnrollmentStep>,
        val currentStep: Int,
    ) : EnrollmentUiState()
    data class Processing(val step: Int) : EnrollmentUiState()
    data class Error(val message: String) : EnrollmentUiState()
    data object Complete : EnrollmentUiState()
}

@HiltViewModel
class FaceEnrollmentViewModel @Inject constructor(
    private val facePassManager: FacePassManager,
    private val faceTemplateDao: FaceTemplateDao,
) : ViewModel() {

    companion object {
        private val STEPS = listOf(
            EnrollmentStep(0, "Look straight at the camera"),
            EnrollmentStep(1, "Turn head slightly left"),
            EnrollmentStep(2, "Turn head slightly right"),
        )
    }

    private val _uiState = MutableStateFlow<EnrollmentUiState>(EnrollmentUiState.Idle)
    val uiState: StateFlow<EnrollmentUiState> = _uiState

    private var enrollPersonId: String = ""
    private var enrollPersonName: String = ""

    fun startEnrollment(personId: String, personName: String) {
        enrollPersonId = personId
        enrollPersonName = personName
        _uiState.value = EnrollmentUiState.Capturing(
            personId = personId,
            personName = personName,
            steps = STEPS,
            currentStep = 0,
        )
    }

    fun captureFrame(bitmap: Bitmap) {
        val state = _uiState.value as? EnrollmentUiState.Capturing ?: return
        val stepIndex = state.currentStep

        _uiState.value = EnrollmentUiState.Processing(stepIndex)

        viewModelScope.launch {
            val faceToken = facePassManager.enrollFace(enrollPersonId, bitmap)
            if (faceToken == null) {
                _uiState.value = EnrollmentUiState.Error("Failed to capture face. Please try again.")
                // Revert to capturing
                kotlinx.coroutines.delay(2000)
                _uiState.value = EnrollmentUiState.Capturing(
                    personId = enrollPersonId,
                    personName = enrollPersonName,
                    steps = state.steps,
                    currentStep = stepIndex,
                )
                return@launch
            }

            // Save template to Room
            faceTemplateDao.insert(
                FaceTemplateEntity(
                    id = UUID.randomUUID().toString(),
                    personId = enrollPersonId,
                    faceToken = faceToken,
                    quality = 1.0f,
                )
            )

            val updatedSteps = state.steps.toMutableList()
            updatedSteps[stepIndex] = updatedSteps[stepIndex].copy(captured = true, faceToken = faceToken)

            val nextStep = stepIndex + 1
            if (nextStep >= STEPS.size) {
                _uiState.value = EnrollmentUiState.Complete
            } else {
                _uiState.value = EnrollmentUiState.Capturing(
                    personId = enrollPersonId,
                    personName = enrollPersonName,
                    steps = updatedSteps,
                    currentStep = nextStep,
                )
            }
        }
    }

    fun reset() {
        _uiState.value = EnrollmentUiState.Idle
    }
}
