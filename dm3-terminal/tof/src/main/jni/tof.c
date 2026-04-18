//#include <stdio.h>
//#include "global.h"
//#include "libLcd.h"
//#include "sysdef.h"
//#include "sysfunc.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <stdint.h>
#include <sys/stat.h>
#include <sys/ioctl.h>
#include <jni.h>
#include <android/log.h>
#include "tmf8801.h"
JNIEnv* g_env;
jobject setResponseData(JNIEnv* env, jobject jobj, int retCode, int nLength, unsigned char* lpRes) {
	jobject retObj;
	jbyteArray retData;
	jclass cls;
	jmethodID cls_constructor;
	jmethodID midSetResponseCode;
	jmethodID midSetResponseData;
	g_env = env;

	cls = (*env)->FindClass(env, "com/duali/tof/jni/DualCardResponse");
	cls_constructor = (*env)->GetMethodID(env, cls, "<init>", "()V");

	retObj = (*env)->NewObject(env, cls, cls_constructor, "()V");

	midSetResponseCode = (*env)->GetMethodID(env, cls, "setResponseCode", "(I)V");
	(*env)->CallVoidMethod(env, retObj, midSetResponseCode, retCode);

	if(nLength > 0) {
		retData = (jbyteArray) (*env)->NewByteArray(env, nLength);
		(*env)->SetByteArrayRegion(env, retData, 0, nLength, (jbyte *) lpRes);

		midSetResponseData = (*env)->GetMethodID(env, cls, "setResponseData", "([B)V");

		(*env)->CallVoidMethod(env, retObj, midSetResponseData, retData);
	}

//    if((*env)->ExceptionOccurred(env)) {
//        if(debugflag >= 1) LOGE("error occured copying array back");
//
//        (*env)->ExceptionDescribe(env);
//        (*env)->ExceptionClear(env);
//    }
	return retObj;
}

jint Java_com_duali_tof_jni_DualTOFJni_DE_1TOF_1Open
		(JNIEnv * env, jobject jobj)
{
	int nRet = -1;
	nRet = TOF_Init();
	return nRet;
}
jint Java_com_duali_tof_jni_DualTOFJni_DE_1TOF_1Close
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
	//nRet = DevThermal_close();
	return nRet;
}

jint Java_com_duali_tof_jni_DualTOFJni_DE_1TOF_1GetData
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
    nRet = getresult();
	return nRet;
}
