
#include "sysdef.h"
#include "sysfunc.h"
#include "global.h"

#include <stdio.h>
#include <string.h>
#include <jni.h>
#include <android/log.h>

JNIEnv* g_env;
jobject setResponseData(JNIEnv* env, jobject jobj, int retCode, int nLength, unsigned char* lpRes) {
	jobject retObj;
	jbyteArray retData;
	jclass cls;
	jmethodID cls_constructor;
	jmethodID midSetResponseCode;
	jmethodID midSetResponseData;
	g_env = env;

	cls = (*env)->FindClass(env, "com/duali/wiegand/jni/DualCardResponse");
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

jint Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1Open
		(JNIEnv * env, jobject jobj)
{
	int nRet = -1;
	nRet = DevWiegandOpen();
	return nRet;
}
void Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1Close
		(JNIEnv * env, jobject jobj)
{
	DevWiegandClose();
}

jobject Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1Version
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
	int realPort;

	// send
	//	jsize n;
	jbyte *pbyte;
	g_env = env;

	// receive
	int nOutLength;
	//unsigned char lpRes[32*24*2];
	unsigned char lpRes[512];
	//unsigned char data[32*24*3];
	nRet = DevWiegandVerion(lpRes);
	nOutLength = strlen(lpRes);
	//for(int i=0;i<(32*24*2);i++)   sprintf(data+i,"%02x",lpRes[i]);
	//__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data3[%d] => %s",nOutLength,data);
	//__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data Length => %d",nOutLength);
	//for(int i = 0 ; i< nOutLength ; i++)
	//{
	//for(int i = 0 ; i< nOutLength ; i++)	sprintf(data+i,"%02x",lpRes[i]);
	//	__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data2[%d] => %s",nOutLength,data);
	//}

	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}

//jint Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1Send_Data
//		(JNIEnv * env, jobject jobj, jint parity, jint dataLen, jbyteArray data)
//{
//	int nRet = 0;
//	int realPort;
//
//	// send
//	//	jsize n;
//	jbyte *pbyte;
//	unsigned char pSendData[1000];
//	g_env = env;
//
//	pbyte = (*env)->GetByteArrayElements(env, data, 0);
//
//	memcpy(pSendData, pbyte, dataLen);
//	nRet = Send_WGD(pSendData,parity,dataLen);
//
//	(*env)->ReleaseByteArrayElements(env, data, pbyte, 0);
//
//	return nRet;
//}

jint Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1SendData
		(JNIEnv * env, jobject jobj, jint parity, jint dataLen, jbyteArray data)
{
	int nRet = 0;
	int realPort;

	// send
	//	jsize n;
	jbyte *pbyte;
	g_env = env;

	unsigned char pSendData[1000];

	pbyte = (*env)->GetByteArrayElements(env, data, 0);

	memcpy(pSendData, pbyte, dataLen);
	nRet = Send_WGD(pSendData,parity,dataLen);

	(*env)->ReleaseByteArrayElements(env, data, pbyte, 0);

	return nRet;
}

jobject Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1ReadData
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
	int sta = 0;
	int realPort;

	// send
	//	jsize n;
	jbyte *pbyte;
	g_env = env;

	// receive
	int nOutLength;
	unsigned char lpRes[512];
	//nRet = ISO7816_ActivationFlow(slot, &nOutLength, lpRes);
	sta = WiegandGetLastData(&nRet,&nOutLength,lpRes);
	if(sta != 0){
		nRet = -1;
	}

//	for(int i = 0 ; i< nOutLength ; i++)
//	{
//		__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data => %02x",lpRes[i]);
//	}

	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}

jint Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1WGD0Control
		(JNIEnv * env, jobject jobj, jint gpio)
{
	int nRet = -1;
	nRet = DevWGD0_Control(gpio);
	return nRet;
}

jint Java_com_duali_wiegand_jni_DualWiegandJni_DE_1Wiegand_1WGD1Control
		(JNIEnv * env, jobject jobj, jint gpio)
{
	int nRet = -1;
	nRet = DevWGD1_Control(gpio);
	return nRet;
}


