
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
#include "iso7816.h"


JNIEnv* g_env;
jobject setResponseData(JNIEnv* env, jobject jobj, int retCode, int nLength, unsigned char* lpRes) {
	jobject retObj;
	jbyteArray retData;
	jclass cls;
	jmethodID cls_constructor;
	jmethodID midSetResponseCode;
	jmethodID midSetResponseData;
	g_env = env;

	cls = (*env)->FindClass(env, "com/duali/sam/jni/DualCardResponse");
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

jint Java_com_duali_sam_jni_DualSAMJni_DE_1SAM_1Close
		(JNIEnv * env, jobject jobj, jint port)
{
	SC_Close_Ports();
	return 0;
}

jint Java_com_duali_sam_jni_DualSAMJni_DE_1SAM_1PWR_1OFF
		(JNIEnv * env, jobject jobj)
{
	DevUSAMPOWEROFF();
	return 0;
}

jint Java_com_duali_sam_jni_DualSAMJni_DE_1SAM_1Open
		(JNIEnv * env, jobject jobj)
{
	if(DevUSAMOpen(Find_UARTSAM_Channel(),10752,0,1) <0)
	{
		printf("DevUSAMOpen  driver open fail\n");
		return -1;
	}
	SC_Init_Ports();

	return 0;
}

int DE_IC_PowerOn1(int virtualPort, unsigned char slotno, unsigned char pps, int* outlen, unsigned char* lpRes)
{
	int retPort=-1;
	retPort = ISO7816_ActivationFlow(slotno, lpRes, outlen);

	return retPort;
}

jobject Java_com_duali_sam_jni_DualSAMJni_DE_1SAM_1ActivationFlow
		(JNIEnv * env, jobject jobj, jint slot)
{
	int nRet = 0;
	int realPort;

	// send
	//	jsize n;
	jbyte *pbyte;
	g_env = env;

	// receive
	int nOutLength;
	unsigned char lpRes[512];
	SAMSlot_Set(slot);
	//nRet = ISO7816_ActivationFlow(slot, &nOutLength, lpRes);
	nRet = ISO7816_ActivationFlow(slot, lpRes, &nOutLength);
//	for(int i = 0 ; i< nOutLength ; i++)
//	{
//		__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data => %02x",lpRes[i]);
//	}

	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}

jobject Java_com_duali_sam_jni_DualSAMJni_DE_1SAM_1CaseProcess
		(JNIEnv * env, jobject jobj, jint slot, jint dataLen, jbyteArray data)
{
	int nRet = 0;
	int realPort;

	// send
	//	jsize n;
	jbyte *pbyte;
	unsigned char pSendData[1000];
	g_env = env;


	// receive
	int nOutLength = 0;
	unsigned char lpRes[512];
	SAMSlot_Set(slot);

	pbyte = (*env)->GetByteArrayElements(env, data, 0);

	memcpy(pSendData, pbyte, dataLen);
	//__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data => %02x %02x %02x %02x %02x",pSendData[0],pSendData[1],pSendData[2],pSendData[3],pSendData[4]);
	nRet = ISO7816_CaseProcess(slot,dataLen,pSendData,&nOutLength,lpRes);

	(*env)->ReleaseByteArrayElements(env, data, pbyte, 0);

	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}

//ret = ISO7816_ActivationFlow(0, resp, &rlen);
//ret = ISO7816_CaseProcess(0,5,sbuf,&rlen,resp);