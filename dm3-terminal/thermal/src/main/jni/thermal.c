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
#include "MLX90640_API.h"
#ifdef SHOW_LCD	
#include "apiLcd.h"
#include "libLcd.h"
#include "apiColor.h"
#endif
#include <jni.h>
#include <android/log.h>

paramsMLX90640 mlx90640;


JNIEnv* g_env;
jobject setResponseData(JNIEnv* env, jobject jobj, int retCode, int nLength, unsigned char* lpRes) {
	jobject retObj;
	jbyteArray retData;
	jclass cls;
	jmethodID cls_constructor;
	jmethodID midSetResponseCode;
	jmethodID midSetResponseData;
	g_env = env;

	cls = (*env)->FindClass(env, "com/duali/thermal/jni/DualCardResponse");
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

jint Java_com_duali_thermal_jni_DualThermalJni_DE_1Thermal_1Open
		(JNIEnv * env, jobject jobj)
{
	int nRet = -1;
	nRet = Thermal_Init();
	return nRet;
}
jint Java_com_duali_thermal_jni_DualThermalJni_DE_1Thermal_1Close
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
	nRet = DevThermal_close();
	return nRet;
}

jobject Java_com_duali_thermal_jni_DualThermalJni_DE_1Thermal_1Start
		(JNIEnv * env, jobject jobj, jint rotate, jint flip)
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
	unsigned char lpRes[O_WIDTH*O_HEIGHT*2];
	//unsigned char data[32*24*3];
	nRet = Thermal_Start(lpRes, &nOutLength,rotate,flip);
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

jobject Java_com_duali_thermal_jni_DualThermalJni_DE_1Thermal_1MinTemp
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
	int realPort;
	float temp;

	// send
	//	jsize n;
	jbyte *pbyte;
	g_env = env;

	// receive
	int nOutLength;
	//unsigned char lpRes[32*24*2];
	unsigned char lpRes[10];
	//unsigned char data[32*24*3];
	nRet = GetMinTemp(&temp);
	sprintf(lpRes,"%.2f", temp);
	nOutLength = strlen(lpRes);
	//__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Temp[%d] : %s",nOutLength,lpRes);
	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}

jobject Java_com_duali_thermal_jni_DualThermalJni_DE_1Thermal_1MaxTemp
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
	int realPort;
	float temp;

	// send
	//	jsize n;
	jbyte *pbyte;
	g_env = env;

	// receive
	int nOutLength;
	//unsigned char lpRes[32*24*2];
	unsigned char lpRes[10];
	//unsigned char data[32*24*3];
	nRet = GetMaxTemp(&temp);
	sprintf(lpRes,"%.2f", temp);
	nOutLength = strlen(lpRes);
	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}

jobject Java_com_duali_thermal_jni_DualThermalJni_DE_1Thermal_1CentTemp
		(JNIEnv * env, jobject jobj)
{
	int nRet = 0;
	int realPort;
	float temp;

	// send
	//	jsize n;
	jbyte *pbyte;
	g_env = env;

	// receive
	int nOutLength;
	//unsigned char lpRes[32*24*2];
	unsigned char lpRes[10];
	//unsigned char data[32*24*3];
	nRet = GetCenterTemp(&temp);
	sprintf(lpRes,"%.2f", temp);
	nOutLength = strlen(lpRes);
	return setResponseData(env, jobj, nRet, nOutLength, lpRes);
}