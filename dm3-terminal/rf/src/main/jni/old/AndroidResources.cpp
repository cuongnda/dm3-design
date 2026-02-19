#include "AndroidResources.h"
#include "log.h"

static JavaVM* g_javaVm = nullptr;
jobject g_objClassLoader = nullptr;

void AndroidResources::init(JavaVM* javaVm)
{
    g_javaVm = javaVm;
    JNIEnv* env = getJniEnv();
    jclass clsClass = env->FindClass("com/duali/subscreen/SubScreen");
    jmethodID mid = env->GetStaticMethodID(clsClass, "getClassLoader",
                                           "()Ljava/lang/ClassLoader;");
    jobject objClass = env->CallStaticObjectMethod(clsClass, mid);
    g_objClassLoader = env->NewGlobalRef(objClass);

    env->DeleteLocalRef(objClass);
    env->DeleteLocalRef(clsClass);
}

JNIEnv* AndroidResources::getJniEnv()
{
    if (nullptr == g_javaVm)
    {
        LOGD("Failed to get JNIEnv. JniHelper::getJavaVM() is NULL");
        return nullptr;
    }

    JNIEnv *env = nullptr;
    // get jni environment
    jint ret = g_javaVm->GetEnv((void **) &env, JNI_VERSION_1_6);

    switch (ret) {
        case JNI_OK :
            // Success!
            return env;
        case JNI_EDETACHED :
            // Thread not attached
            // TODO : If calling AttachCurrentThread() on a native thread
            // must call DetachCurrentThread() in future.
            // see: http://developer.android.com/guide/practices/design/jni.html
            if (g_javaVm->AttachCurrentThread(&env, nullptr) < 0) {
                LOGD("Failed to get the environment using AttachCurrentThread()");
                return nullptr;
            } else {
                // Success : Attached and obtained JNIEnv!
                return env;
            }
        case JNI_EVERSION :
            // Cannot recover from this error
            LOGD("JNI interface version 1.4 not supported");
        default :
            LOGD("Failed to get the environment using GetEnv()");
            return nullptr;
    }
}

void AndroidResources::releaseEnv()
{
    g_javaVm->DetachCurrentThread();
}