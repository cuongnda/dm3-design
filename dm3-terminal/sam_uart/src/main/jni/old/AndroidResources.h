#ifndef ANDROID_RESOURCES_H
#define ANDROID_RESOURCES_H

#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

namespace AndroidResources {
//    void setEnv(JNIEnv *env);
//    JNIEnv *getEnv();
//    void init(JNIEnv* env);
    void init(JavaVM* javaVm);
    JNIEnv* getJniEnv();
    void releaseEnv();
}
#ifdef __cplusplus
}
#endif
#endif // ANDROID_RESOURCES_H
