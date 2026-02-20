package com.duali.dm3terminal.di

import com.duali.dm3terminal.hardware.FaceCamera
import com.duali.dm3terminal.hardware.NfcCardService
import com.duali.dm3terminal.hardware.NfcReader
import com.duali.dm3terminal.hardware.WiegandOutput
import com.duali.dm3terminal.hardware.WiegandReader
import com.duali.dm3terminal.hardware.MultiFactorManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object HardwareModule {

    @Provides
    @Singleton
    fun provideNfcReader(): NfcReader = NfcReader()

    @Provides
    @Singleton
    fun provideWiegandReader(): WiegandReader = WiegandReader()

    @Provides
    @Singleton
    fun provideFaceCamera(): FaceCamera = FaceCamera()

    @Provides
    @Singleton
    fun provideNfcCardService(): NfcCardService = NfcCardService()

    @Provides
    @Singleton
    fun provideMultiFactorManager(): MultiFactorManager = MultiFactorManager()
}
