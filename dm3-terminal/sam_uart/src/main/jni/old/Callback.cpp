#include "Callback.h"
#include "AndroidResources.h"
#include "log.h"

extern jobject g_objClassLoader;
void startActivity()
{
    JNIEnv* env = AndroidResources::getJniEnv();
    jclass clsClassLoader = env->GetObjectClass(g_objClassLoader);

    jmethodID mid = env->GetMethodID(clsClassLoader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;");
    jstring strClassName = env->NewStringUTF("com.duali.subscreen.SubScreen");
    jclass clsSubScreen = jclass(env->CallObjectMethod(g_objClassLoader, mid, strClassName));

    mid = env->GetStaticMethodID(clsSubScreen, "onCallback", "()V");
    env->CallStaticVoidMethod(clsSubScreen, mid);

    env->DeleteLocalRef(strClassName);
    env->DeleteLocalRef(clsSubScreen);

    AndroidResources::releaseEnv();
}


void recvQrData()
{
    JNIEnv* env = AndroidResources::getJniEnv();
    jclass clsClassLoader = env->GetObjectClass(g_objClassLoader);

    jmethodID mid = env->GetMethodID(clsClassLoader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;");
    jstring strClassName = env->NewStringUTF("com.duali.itouchpop2_test.MainActivity");
    jclass clsMain = jclass(env->CallObjectMethod(g_objClassLoader, mid, strClassName));

    mid = env->GetStaticMethodID(clsMain, "onRecvQr", "()V");
    env->CallStaticVoidMethod(clsMain, mid);

    env->DeleteLocalRef(strClassName);
    env->DeleteLocalRef(clsMain);

    AndroidResources::releaseEnv();
}

void recvQrData_aging()
{
    JNIEnv* env = AndroidResources::getJniEnv();
    jclass clsClassLoader = env->GetObjectClass(g_objClassLoader);

    jmethodID mid = env->GetMethodID(clsClassLoader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;");
    jstring strClassName = env->NewStringUTF("com.duali.itouchpop2_test.AgingActivity");
    jclass clsMain = jclass(env->CallObjectMethod(g_objClassLoader, mid, strClassName));

    mid = env->GetStaticMethodID(clsMain, "onRecvQr_aging", "()V");
    env->CallStaticVoidMethod(clsMain, mid);

    env->DeleteLocalRef(strClassName);
    env->DeleteLocalRef(clsMain);

    AndroidResources::releaseEnv();
}

void recvQrData_aging_none()
{
    JNIEnv* env = AndroidResources::getJniEnv();
    jclass clsClassLoader = env->GetObjectClass(g_objClassLoader);

    jmethodID mid = env->GetMethodID(clsClassLoader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;");
    jstring strClassName = env->NewStringUTF("com.duali.itouchpop2_test.AgingActivity");
    jclass clsMain = jclass(env->CallObjectMethod(g_objClassLoader, mid, strClassName));

    mid = env->GetStaticMethodID(clsMain, "onRecvQrNone", "()V");
    env->CallStaticVoidMethod(clsMain, mid);

    env->DeleteLocalRef(strClassName);
    env->DeleteLocalRef(clsMain);

    AndroidResources::releaseEnv();
}
