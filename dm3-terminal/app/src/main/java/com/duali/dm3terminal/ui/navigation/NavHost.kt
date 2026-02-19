package com.duali.dm3terminal.ui.navigation

import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.duali.dm3terminal.ui.screens.*

object Routes {
    const val STANDBY = "standby"
    const val RECOGNITION = "recognition"
    const val RESULT = "result/{granted}/{personName}/{reason}"
    const val PIN = "pin"
    const val ADMIN = "admin"

    fun result(granted: Boolean, personName: String, reason: String) =
        "result/$granted/$personName/$reason"
}

@Composable
fun DM3NavHost() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Routes.STANDBY) {
        composable(Routes.STANDBY) {
            StandbyScreen(
                onTap = { navController.navigate(Routes.RECOGNITION) },
                onLongPress = { navController.navigate(Routes.PIN) },
            )
        }

        composable(Routes.RECOGNITION) {
            RecognitionScreen(
                onResult = { granted, name, reason ->
                    navController.navigate(Routes.result(granted, name, reason)) {
                        popUpTo(Routes.STANDBY)
                    }
                },
                onCancel = { navController.popBackStack() },
            )
        }

        composable(
            Routes.RESULT,
            arguments = listOf(
                navArgument("granted") { type = NavType.BoolType },
                navArgument("personName") { type = NavType.StringType },
                navArgument("reason") { type = NavType.StringType },
            ),
            enterTransition = { slideInVertically { it } },
            exitTransition = { slideOutVertically { it } },
        ) { backStackEntry ->
            val granted = backStackEntry.arguments?.getBoolean("granted") ?: false
            val personName = backStackEntry.arguments?.getString("personName") ?: ""
            val reason = backStackEntry.arguments?.getString("reason") ?: ""
            ResultScreen(
                granted = granted,
                personName = personName,
                reason = reason,
                onTimeout = {
                    navController.navigate(Routes.STANDBY) {
                        popUpTo(Routes.STANDBY) { inclusive = true }
                    }
                },
            )
        }

        composable(Routes.PIN) {
            PinScreen(
                onPinVerified = {
                    navController.navigate(Routes.ADMIN) {
                        popUpTo(Routes.STANDBY)
                    }
                },
                onCancel = { navController.popBackStack() },
            )
        }

        composable(Routes.ADMIN) {
            AdminScreen(
                onBack = {
                    navController.navigate(Routes.STANDBY) {
                        popUpTo(Routes.STANDBY) { inclusive = true }
                    }
                },
            )
        }
    }
}
