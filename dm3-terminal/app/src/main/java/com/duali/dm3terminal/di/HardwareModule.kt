package com.duali.dm3terminal.di

import com.duali.dm3terminal.hardware.FaceCamera
import com.duali.dm3terminal.hardware.NfcReader
import com.duali.dm3terminal.hardware.WiegandReader
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
}
