
#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/time.h>
#include <termios.h>
#include <signal.h>  
#include <pthread.h>
#include <jni.h>
#include <android/log.h>

#include "sysdef.h"
#include "sysfunc.h"


JNIEnv* g_env;
jobject setResponseData(JNIEnv* env, jobject jobj, int retCode, int nLength, unsigned char* lpRes) {
	jobject retObj;
	jbyteArray retData;
	jclass cls;
	jmethodID cls_constructor;
	jmethodID midSetResponseCode;
	jmethodID midSetResponseData;
	g_env = env;

	cls = (*env)->FindClass(env, "com/duali/rf/jni/DualCardResponse");
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

void Java_com_duali_rf_jni_DualRFJni_DE_1RF_1Close
		(JNIEnv * env, jobject jobj)
{
	DevRFClose();
}


void Java_com_duali_rf_jni_DualRFJni_DE_1RF_1Open
		(JNIEnv * env, jobject jobj)
{
	DevRFOpen();
}

jobject Java_com_duali_rf_jni_DualRFJni_DE_1Polling
		(JNIEnv * env, jobject jobj, jint dataLen, jbyteArray data, jint timeout)
{
	int nRet = 0;
	int realPort;

	// send
	//	jsize n;
	jbyte *pbyte;
	unsigned char pSendData[1024];
	g_env = env;


	// receive
	int nOutLength = 0;
	unsigned char lpRes[1024];

	//	n = (*env)->GetArrayLength(env, data);
	pbyte = (*env)->GetByteArrayElements(env, data, 0);

	memcpy(pSendData, pbyte, dataLen);


    nRet = Linux_Rf_Polling( dataLen, pSendData, &nOutLength, lpRes, timeout);

	(*env)->ReleaseByteArrayElements(env, data, pbyte, 0);

	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}

