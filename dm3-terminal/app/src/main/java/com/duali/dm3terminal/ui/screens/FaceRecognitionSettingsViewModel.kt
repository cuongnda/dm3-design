package com.duali.dm3terminal.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.duali.dm3terminal.hardware.AccessControlManager
import com.duali.dm3terminal.domain.RecognitionConfig
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class FaceRecognitionSettingsViewModel @Inject constructor(
    private val accessControlManager: AccessControlManager,
) : ViewModel() {

    private val _config = MutableStateFlow(accessControlManager.getConfig())
    val config: StateFlow<RecognitionConfig> = _config

    private val _saved = MutableStateFlow(false)
    val saved: StateFlow<Boolean> = _saved

    fun updateThreshold(value: Float) {
        _config.value = _config.value.copy(matchThreshold = value)
    }

    fun updateLivenessEnabled(enabled: Boolean) {
        _config.value = _config.value.copy(livenessEnabled = enabled)
    }

    fun updateLivenessThreshold(value: Float) {
        _config.value = _config.value.copy(livenessThreshold = value)
    }

    fun updateCooldown(ms: Long) {
        _config.value = _config.value.copy(cooldownMs = ms)
    }

    fun save() {
        viewModelScope.launch {
            accessControlManager.updateConfig(_config.value)
            _saved.value = true
        }
    }
}
