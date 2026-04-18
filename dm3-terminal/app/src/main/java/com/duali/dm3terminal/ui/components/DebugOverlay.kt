package com.duali.dm3terminal.ui.components

import android.app.ActivityManager
import android.content.Context
import android.os.Debug
import android.os.Process
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.io.File
import java.io.RandomAccessFile

data class DeviceStats(
    val cpuUsage: Float = 0f,
    val memUsedMb: Int = 0,
    val memTotalMb: Int = 0,
    val nativeHeapMb: Int = 0,
    val socTempC: Float = 0f,
    val gpuTempC: Float = 0f,
    val fps: Int = 0,
)

@Composable
fun DebugOverlay(
    fps: Int = 0,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var stats by remember { mutableStateOf(DeviceStats()) }

    LaunchedEffect(Unit) {
        var prevCpuTotal = 0L
        var prevCpuIdle = 0L
        while (true) {
            val (cpuUsage, newTotal, newIdle) = readCpuUsage(prevCpuTotal, prevCpuIdle)
            prevCpuTotal = newTotal
            prevCpuIdle = newIdle

            val memInfo = readMemInfo(context)
            val temps = readThermalZones()

            stats = DeviceStats(
                cpuUsage = cpuUsage,
                memUsedMb = memInfo.first,
                memTotalMb = memInfo.second,
                nativeHeapMb = (Debug.getNativeHeapAllocatedSize() / 1024 / 1024).toInt(),
                socTempC = temps.first,
                gpuTempC = temps.second,
                fps = fps,
            )
            delay(1000)
        }
    }

    val socColor = when {
        stats.socTempC >= 85 -> Color(0xFFFF4444)
        stats.socTempC >= 70 -> Color(0xFFFFAA00)
        else -> Color(0xFF44FF44)
    }
    val cpuColor = when {
        stats.cpuUsage >= 80 -> Color(0xFFFF4444)
        stats.cpuUsage >= 50 -> Color(0xFFFFAA00)
        else -> Color(0xFF44FF44)
    }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Color.Black.copy(alpha = 0.7f))
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        Text(
            text = "DEBUG",
            color = Color(0xFF00AAFF),
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 1.sp,
        )
        Spacer(modifier = Modifier.height(2.dp))
        DebugLine("CPU", "${stats.cpuUsage.toInt()}%", cpuColor)
        DebugLine("RAM", "${stats.memUsedMb}/${stats.memTotalMb}MB", Color(0xFFCCCCCC))
        DebugLine("HEAP", "${stats.nativeHeapMb}MB", Color(0xFFCCCCCC))
        DebugLine("SoC", "${String.format("%.1f", stats.socTempC)}°C", socColor)
        DebugLine("GPU", "${String.format("%.1f", stats.gpuTempC)}°C", Color(0xFFCCCCCC))
        if (fps > 0) {
            DebugLine("FPS", "$fps", if (fps < 5) Color(0xFFFF4444) else Color(0xFF44FF44))
        }
    }
}

@Composable
private fun DebugLine(label: String, value: String, valueColor: Color) {
    Row {
        Text(
            text = "$label ",
            color = Color(0xFF888888),
            fontSize = 9.sp,
            fontFamily = FontFamily.Monospace,
        )
        Text(
            text = value,
            color = valueColor,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
        )
    }
}

private fun readCpuUsage(prevTotal: Long, prevIdle: Long): Triple<Float, Long, Long> {
    return try {
        val line = File("/proc/stat").readLines().first()
        val parts = line.split("\\s+".toRegex()).drop(1).map { it.toLong() }
        val idle = parts[3] + parts.getOrElse(4) { 0L }
        val total = parts.sum()
        val diffTotal = total - prevTotal
        val diffIdle = idle - prevIdle
        val usage = if (diffTotal > 0 && prevTotal > 0) {
            ((diffTotal - diffIdle).toFloat() / diffTotal * 100f)
        } else 0f
        Triple(usage.coerceIn(0f, 100f), total, idle)
    } catch (e: Exception) {
        Triple(0f, prevTotal, prevIdle)
    }
}

private fun readMemInfo(context: Context): Pair<Int, Int> {
    return try {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        am.getMemoryInfo(memInfo)
        val totalMb = (memInfo.totalMem / 1024 / 1024).toInt()
        val usedMb = ((memInfo.totalMem - memInfo.availMem) / 1024 / 1024).toInt()
        Pair(usedMb, totalMb)
    } catch (e: Exception) {
        Pair(0, 0)
    }
}

private fun readThermalZones(): Pair<Float, Float> {
    var socTemp = 0f
    var gpuTemp = 0f
    try {
        // DF-970: zone0=soc-thermal, zone1=gpu-thermal, zone2=test_battery
        val soc = File("/sys/class/thermal/thermal_zone0/temp").readText().trim().toFloatOrNull()
        if (soc != null) socTemp = soc / 1000f

        val gpu = File("/sys/class/thermal/thermal_zone1/temp").readText().trim().toFloatOrNull()
        if (gpu != null) gpuTemp = gpu / 1000f
    } catch (_: Exception) {}
    return Pair(socTemp, gpuTemp)
}
