#include <stdlib.h>
#include "com_duali_subscreen_SubScreen.h"
#include "log.h"
#include "apiTouch.h"
#include "libLcd.h"
#include "AndroidResources.h"
#include "DevRGBLED.h"
#include "test.h"
#include "apiQr.h"
#include "libQr.h"
#include "sysfunc.h"
#include "apiLcd.h"

#define TAG "SubScreen"
extern void setText(const char* msg);

extern "C" JNIEXPORT void JNICALL Java_com_duali_subscreen_SubScreen_init
        (JNIEnv *env, jclass clazz)
{
//    JavaVM* javaVm;
//    env->GetJavaVM(&javaVm);
//    AndroidResources::init(javaVm);
    LOGI("hello world");
    system("killall hwtest");

    int fd_lcd;
    fd_lcd = devLCD_open();
    if (fd_lcd < 0) {
        LOGE("LCD driver open fail\n");
    }

    int fd_qr, qr_init;
    fd_qr = DevQrOpen();
    LOGD("fd_qr : %d",fd_qr);
    if (fd_qr < 0)
    {
        LOGE("QR open fail\n");
    }
    else {
        LOGD("\nQR open OK\n");
        qr_init = apiQr_init();
        if (qr_init < 0)
            perror("qr init error : ");
        else
            qr_control('N');
    }

    if (HOST_Open(3,115200) < 0)
    {
        LOGE("HOST3 open fail\n");
    }else{
        LOGD("HOST3 open OK\n");
        //HOST_Close(3);
    }

    if (HOST_Open(4,115200) < 0)
    {
        LOGE("HOST4 open fail\n");
    }else{
        LOGD("HOST4 open OK\n");
        //HOST_Close(4);
    }

    if (HOST_Open(5,115200) < 0)
    {
        LOGE("HOST5 open fail\n");
    }else{
        LOGD("HOST5 open OK\n");
        //HOST_Close(5);
    }

    int thr_id = sysIE_open();
    if (thr_id < 0) {
        perror("thread create error : ");
        exit(0);
    }

    setting_main();
}

extern "C" JNIEXPORT void JNICALL Java_com_duali_subscreen_SubScreen_led
        (JNIEnv *env, jclass clazz, int direct, int color)
{
    RGB_LED_Control(direct, color);
}

extern "C" JNIEXPORT void JNICALL Java_com_duali_subscreen_SubScreen_setText
        (JNIEnv *env, jclass clazz, jstring msg)
{
    const char* strMsg= env->GetStringUTFChars(msg, JNI_FALSE);
    setText(strMsg);
    env->ReleaseStringUTFChars(msg, strMsg);
}

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* javaVm, void *reserved) {
    //replace with one of your classes in the line below

    AndroidResources::init(javaVm);

    return JNI_VERSION_1_6;
}

extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_signpad
        (JNIEnv *, jclass clazz) {
    return setting_signTest();
}

extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_ledTest
        (JNIEnv *, jclass clazz) {
    return setting_ledTest();
}

extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_COMTest
        (JNIEnv *, jclass clazz) {
    return setting_COMTest();
}


extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_CASHBOXTest
        (JNIEnv *, jclass clazz) {
    return setting_CASHBOXTest();
}

extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_QRTest
        (JNIEnv *, jclass clazz) {
    return setting_QRTest();
}
extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_QRTestAging
        (JNIEnv *, jclass clazz) {
    return setting_QRTest_aging();
}

extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_QRClose
        (JNIEnv *, jclass clazz) {
    return QR_CLOSE();
}

extern "C" JNIEXPORT void JNICALL Java_com_duali_subscreen_SubScreen_LCDclose
        (JNIEnv *, jclass clazz) {
    apiLCD_clear(cBlack);
    devLCD_close();
    QR_CLOSE();
}

extern "C" JNIEXPORT int JNICALL Java_com_duali_subscreen_SubScreen_relayTest
        (JNIEnv *, jclass clazz) {
    return setting_relayTest();
}
