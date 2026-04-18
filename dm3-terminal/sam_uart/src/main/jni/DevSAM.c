#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <fcntl.h>

#include <stdlib.h>

#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

#include "apifunc.h"
#include "apidef.h"

#include "sysfunc.h"
#include "sysdef.h"
#include "hw_config.h"
#include "type_def.h"
#include <android/log.h>
int EXBAUD=10752;
int com_id = -1;
int HwSamDev = -1;
#define TRUE	1
#define	ON	1
#define	OFF	0


int SAMDEBUG_Control(int control)
{	
	int ret,len,sam;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	sam = open("/dev/drvSam", O_RDWR|O_NDELAY );
	if(sam <0) return -1;
	sprintf(buf,"debug%d",control);
	len = strlen(buf); 	
	ret = write(sam, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(sam);  
	if(ret < 0)	return -1;	
	return 0;	
}

int SAMSlot_Set(int slot)
{
    int ret,len,sam;
    char buf[100];
    memset(buf,0x00,sizeof(buf));
    sam = open("/dev/drvSam", O_RDWR|O_NDELAY );
    if(sam <0) return -1;
    sprintf(buf,"SLOTSEL%d",slot);
    len = strlen(buf);
    ret = write(sam, buf, len);
    if(ret < 0)	return -1;
    ret = close(sam);
    if(ret < 0)	return -1;
    return 0;
}

int SAMPWR_Control_3V3(int control)
{	
	int ret,len,sam;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	sam = open("/dev/drvSam", O_RDWR|O_NDELAY );
	if(sam <0) return -1;
	sprintf(buf,"SAMPWR3%d",control);
	len = strlen(buf); 	
	ret = write(sam, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(sam);  
	if(ret < 0)	return -1;	
	return 0;	
}

int SAMPWR_Control_5V(int control)
{
	int ret,len,sam;
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	sam = open("/dev/drvSam", O_RDWR|O_NDELAY );
	if(sam <0) return -1;
	sprintf(buf,"SAMPWR5%d",control);
	len = strlen(buf);
	ret = write(sam, buf, len);
	if(ret < 0)	return -1;
	ret = close(sam);
	if(ret < 0)	return -1;
	return 0;
}

int SAMRST_Control(int control)
{	
	int ret,len,sam;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	sam = open("/dev/drvSam", O_RDWR|O_NDELAY );
	if(sam <0) return -1;
	sprintf(buf,"SAMRST%d",control);
	len = strlen(buf); 	
	ret = write(sam, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(sam);  
	if(ret < 0)	return -1;	
	return 0;	
}

int SAMCLK_Control(int control)
{	
	int ret,len,sam;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	sam = open("/dev/drvSam", O_RDWR|O_NDELAY );
	if(sam <0) return -1;
	sprintf(buf,"SAMCLK%d",control);
	len = strlen(buf); 	
	ret = write(sam, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(sam);  
	if(ret < 0)	return -1;	
	return 0;	
}

static int iso7816_send_char(unsigned char uc_char)
{
//	usleep(1*1000);
	if(ApiUartPutByte(com_id, uc_char) < 0){
		printf("uart %d is busy\n",com_id);
		return -1;
	}
	//tcdrain(com_id);
	//ApiUartInitBuffer(com_id);
	//return 0;
	return(apiUart_tcdrain(com_id));
}
void DumpOldData(void)
{
	int val;
	printf("Dump Send Data: ");
	for(;;){
		val = ApiUartGetRxDataInt(com_id);
		if(val != -1){
			printf("[%02X]",val);
		}else{
			printf("\n\n");
			break;
		}
	}
}

int Linux_USam_IC_PowerOff(int slotno) 
{
	int status = 0;
	if (HwSamDev < 0)
		return HwSamDev;
	ApiUartInitBuffer(com_id);
	if(SAMPWR_Control_3V3(OFF)< 0) printf("apiGpio_SamPower_Control %d-->fail\n",status);
	if(SAMPWR_Control_5V(OFF)< 0) printf("apiGpio_SamPower_Control %d-->fail\n",status);
	//usleep(1 * 1000);
	/*if(SAMPWR_Control_3V3(OFF)< 0) printf("apiGpio_SamReset_Control %d-->fail\n",status);
	if(SAMPWR_Control_5V(OFF)< 0) printf("apiGpio_SamPower_Control %d-->fail\n",status);
	//usleep(1 * 1000);
	if(SAMPWR_Control_3V3(OFF)< 0) printf("apiGpio_Samclk_Control %d-->fail\n",status);
	if(SAMPWR_Control_5V(OFF)< 0) printf("apiGpio_SamPower_Control %d-->fail\n",status);
	//usleep(1 * 1000);*/
	DumpOldData();
	return 0;
}

int DevUSAMConfig(int uart_id, int baud, int parity, int stop) 
{
	int rv = -1;
	ApiUartConfigXClear(uart_id);
	rv = ApiUartConfigXBaud(uart_id,baud);
	if (rv < 0){
		printf("ApiUartConfigXBaud() Failed\n");
		return -1;
	}	
	rv = ApiUartConfigXParity(uart_id,parity);
	if (rv < 0){
		printf("ApiUartConfigXParity() Failed\n");
		return -1;
	}	
	rv = ApiUartConfigXStop(uart_id,stop);	
	if (rv < 0){
		printf("ApiUartConfigXStop() Failed\n");
		return -1;
	}	
	rv = ApiUartConfigXSetup(uart_id);
	if (rv < 0){
		printf("ApiUartConfigXSetup() Failed\n");
		return -1;
	}	
		
	return 0;
}
//#define SAM_DEVICE_PATH "/dev/drvGpio"
unsigned char Find_UARTSAM_Channel(void)
{
	char prop_name[128];
	char find[] = "ttyS";
	unsigned char samid = 0;
	memset(prop_name,0x00,sizeof(prop_name));
	__system_property_get("Duali.UARTSAM.Channel", prop_name);
	printf("UARTSAM Channel %s\n",prop_name);
	samid = (prop_name[4] - 0x30);
	__android_log_print(ANDROID_LOG_DEBUG,"UARTSAM Channel ==>", "%d",samid);
	return samid;
}

unsigned char Get_UARTSAM_Num(void)
{
	return com_id;
}

int DevUSAMOpen(int uart_id, int baud, int parity, int stop) 
{
	
	int rv;
#if 0
	HwSamDev = apiGpio_getFd();
	if (HwSamDev < 0) {
		printf("apiGpio_getFd Open Error\n");
		HwSamDev = open(SAM_DEVICE_PATH, O_RDWR);
		if (HwSamDev < 0) {
			printf("drvGpio Open Error\n");
		}
	}
#endif
	HwSamDev = ApiUartOpen(uart_id);
	/*if(ApiUartConfigXbaud(uart_id,EXBAUD,0) < 0){
		printf("%s - HOST_Open error \n", __func__);
		return -1;
	}*/
	DevUSAMConfig(uart_id,baud,parity,stop);
	rv = ApiUartInitBuffer(uart_id);
	if (rv < 0)	printf("ApiUartInitBuffer() Failed\n");
	com_id = uart_id;
	return HwSamDev;
}



void DevUSAMClose(void) 
{
//	if (HwSamDev < 0)
//		return;
//	close(HwSamDev);   //O_RDWR
	ApiUartClose(com_id);
	com_id = HwSamDev = -1;
}

void DevUSAMPOWEROFF(void)
{
	Linux_USam_IC_PowerOff(0);
}
int USamDriver_Version(unsigned char *version) 
{
	memcpy(version,"UART-SAM_V1.0",sizeof("UART-SAM_V1.0"));
	return 0;
}
int USamDriver_setDebug(int flag) 
{
	printf("SamDriver_setDebug is not supported in UART SAM!!\n");
	return 0;
}


void DEBUG_Printf(s8 *fmt,...)
{
	char tempStr[2048 + 1];
	int cnt;
	va_list argptr;
	va_start(argptr, fmt);
	cnt = vsprintf(tempStr, fmt, argptr);
	va_end(argptr);

	printf("%s", tempStr);
	fflush(stdout);
}

void DebugUSBMsg(int level, char *fmt, ...) {
	char tempStr[2048 + 1];
	int cnt;
	if (1 <= level)	return;

	va_list argptr;
	va_start(argptr, fmt);
	cnt = vsprintf(tempStr, fmt, argptr);
	va_end(argptr);

	printf("%s", tempStr);
	fflush(stdout);
}
