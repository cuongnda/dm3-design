pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://repo.eclipse.org/content/repositories/paho-releases/") }
    }
}

rootProject.name = "dm3-terminal"
include(":app")
include(":rf")
include(":wiegand")
include(":serial_port")
include(":sam_uart")
include(":thermal")
include(":tof")
