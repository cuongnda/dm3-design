package com.duali.dm3terminal.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.duali.dm3terminal.data.DevicePreferences
import com.duali.dm3terminal.data.repository.DM3Repository
import com.duali.dm3terminal.domain.MockDataSeeder
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AdminStats(
    val lastSyncTime: String = "Chưa đồng bộ",
    val personCount: Int = 0,
    val ruleCount: Int = 0,
)

@HiltViewModel
class AdminViewModel @Inject constructor(
    private val repository: DM3Repository,
    private val seeder: MockDataSeeder,
    private val devicePreferences: DevicePreferences,
) : ViewModel() {

    private val _stats = MutableStateFlow(AdminStats())
    val stats: StateFlow<AdminStats> = _stats
    val deviceConfig = devicePreferences.config

    fun toggleDebugOverlay() {
        val current = devicePreferences.config.value
        devicePreferences.save(current.copy(debugOverlay = !current.debugOverlay))
    }

    init {
        refreshStats()
    }

    private fun refreshStats() {
        viewModelScope.launch {
            _stats.value = AdminStats(
                personCount = repository.getPersonCount(),
                ruleCount = repository.getRuleCount(),
            )
        }
    }

    fun seedData() {
        viewModelScope.launch {
            seeder.seed()
            refreshStats()
        }
    }

    fun clearData() {
        viewModelScope.launch {
            repository.clearAll()
            refreshStats()
        }
    }
}
