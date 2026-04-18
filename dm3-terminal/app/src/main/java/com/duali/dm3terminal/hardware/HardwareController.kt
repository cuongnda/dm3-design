package com.duali.dm3terminal.hardware

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileReader
import java.io.FileWriter

/**
 * Controls DF970 hardware: relay (door lock), LEDs, GPIO sensors, IR LED.
 * All file I/O targets sysfs/devfs nodes on the DF970 device.
 */
object HardwareController {

    private const val TAG = "HardwareController"

    // Device paths
    private const val PATH_RELAY = "/dev/drvRLY"
    private const val PATH_PDU_CLOCK = "/dev/drvPduCLK"
    private const val PATH_TAMPER = "/dev/drvTAMP"
    private const val PATH_LED_RED = "/sys/class/leds/red/brightness"
    private const val PATH_LED_GREEN = "/sys/class/leds/green/brightness"
    private const val PATH_LED_BLUE = "/sys/class/leds/blue/brightness"
    private const val PATH_LED_IR = "/sys/class/leds/ir/brightness"
    private const val PATH_DOOR_CHECK = "/sys/kernel/drvInput/doorcheck"
    private const val PATH_CASE_CHECK = "/sys/kernel/drvInput/casecheck"
    private const val PATH_OPEN_CHECK = "/sys/kernel/drvInput/opencheck"

    private val hardwareScope = CoroutineScope(Dispatchers.IO)

    // ---- Relay (Door Lock) ----

    fun openDoor() {
        writeFile(PATH_RELAY, "RLY1")
    }

    fun closeDoor() {
        writeFile(PATH_RELAY, "RLY0")
    }

    fun openDoorTimed(durationMs: Long = 3000) {
        hardwareScope.launch {
            openDoor()
            delay(durationMs)
            closeDoor()
        }
    }

    // ---- PDU Clock ----

    fun pduClockOn() {
        writeFile(PATH_PDU_CLOCK, "PDUCLK1")
    }

    fun pduClockOff() {
        writeFile(PATH_PDU_CLOCK, "PDUCLK0")
    }

    // ---- Tamper ----

    fun tamperOn() {
        writeFile(PATH_TAMPER, "TAMP1")
    }

    fun tamperOff() {
        writeFile(PATH_TAMPER, "TAMP0")
    }

    // ---- LED Control ----

    fun setLed(red: Boolean, green: Boolean, blue: Boolean) {
        writeFile(PATH_LED_RED, if (red) "1" else "0")
        writeFile(PATH_LED_GREEN, if (green) "1" else "0")
        writeFile(PATH_LED_BLUE, if (blue) "1" else "0")
    }

    fun ledGranted() = setLed(red = false, green = true, blue = false)
    fun ledDenied() = setLed(red = true, green = false, blue = false)
    fun ledScanning() = setLed(red = false, green = false, blue = true)
    fun ledOff() = setLed(red = false, green = false, blue = false)

    // ---- IR LED (for face recognition) ----

    fun irOn() {
        writeFile(PATH_LED_IR, "1")
    }

    fun irOff() {
        writeFile(PATH_LED_IR, "0")
    }

    // ---- GPIO Sensors ----

    fun isDoorOpen(): Boolean = readFileChar(PATH_DOOR_CHECK) == '0'

    fun isCaseOpen(): Boolean = readFileChar(PATH_CASE_CHECK) == '1'

    fun isOpenSensor(): Boolean = readFileChar(PATH_OPEN_CHECK) == '0'

    // ---- Access Control Flow ----

    fun grantAccess(durationMs: Long = 3000) {
        ledGranted()
        openDoorTimed(durationMs)
        hardwareScope.launch {
            delay(durationMs)
            ledOff()
        }
    }

    fun denyAccess() {
        ledDenied()
        hardwareScope.launch {
            delay(2000)
            ledOff()
        }
    }

    // ---- File I/O Helpers ----

    private fun writeFile(path: String, value: String) {
        try {
            FileWriter(File(path)).use { it.write(value) }
        } catch (e: Exception) {
            Log.w(TAG, "writeFile($path, $value) failed: ${e.message}")
        }
    }

    private fun readFileChar(path: String): Char {
        return try {
            FileReader(File(path)).use { it.read().toChar() }
        } catch (e: Exception) {
            Log.w(TAG, "readFile($path) failed: ${e.message}")
            '\u0000'
        }
    }
}
