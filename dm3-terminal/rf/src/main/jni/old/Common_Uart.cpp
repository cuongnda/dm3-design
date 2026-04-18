#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <termios.h>
#include <sys/ioctl.h>
#include <asm/ioctls.h>
#include <stdarg.h>
#include <errno.h>
#include "libQr.h"
#include "log.h"
#include "sysfunc.h"

int devUART[16]={ -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1};
#define MAX_UART_ID	15

/*******************************************************************************
* Function              : ApiUartOpen
* Argument              : None
* Return                : None
* Description           : is used to open the Uart device.
* Example               : ApiUartOpen(UART2);
*******************************************************************************/
int ApiUartOpen(int uartCh)
{
	char DEVICE_FILE_NAME[20];

	if((uartCh > MAX_UART_ID)||(uartCh < 0)) return -1;
	if(devUART[uartCh] < 0 ) {
		sprintf(DEVICE_FILE_NAME,"/dev/ttyS%d",uartCh); 	
		devUART[uartCh] = open(DEVICE_FILE_NAME, O_RDWR|O_NOCTTY);
		if(devUART[uartCh] < 0 )
			LOGD("Uart[%d] %s Open Error[%x]\n",uartCh,DEVICE_FILE_NAME,uartCh,devUART[uartCh]);
		return devUART[uartCh];
	}
	return -1;
}
int ApiUartExtraOpen(int uartCh,char *path)
{
	printf("%s: uartCh%d is try open %s\n",__func__,uartCh,path);
	if((uartCh > MAX_UART_ID)||(uartCh < 0)){
		printf("%s: uartCh%d invalid path %s\n",__func__,uartCh,path);
		return -1;
	}
 
	if(devUART[uartCh] < 0 ) {
		devUART[uartCh] = open(path, O_RDWR|O_NOCTTY | O_NDELAY);

		if(devUART[uartCh] < 0 )
		{
			printf("extra-Uart%d Open Error[0x%.4x]\r\n", uartCh, devUART[uartCh]);
		}
	}
	return devUART[uartCh];

}
/*******************************************************************************
* Function              : ApiUartClose
* Argument              : 
* Return                : None
* Description           : is used to close the Uart device.
* Example               : ApiUartClose(UART2);
*******************************************************************************/
void ApiUartClose(int uartCh)
{
	
	if((uartCh > MAX_UART_ID)||(uartCh < 0)) return;
	if(devUART[uartCh] < 0) {
		printf("Uart[%d] is already closed%d!!\n",uartCh,devUART[uartCh]);
	
	}
	close(devUART[uartCh]);
	devUART[uartCh] = -1;
	return;
}


/*******************************************************************************
* Function			: ApiUartConfig
* Argument	baud	: Baud Rate(B38400,B57600,B115200)
* 			bits   	: 8 (bits)
* 			parity	: UART_PARNONE
* 			stops  	: 2
* 						
* Return			: None
* Description		: This function is used to set the initial information
* 				  	  for UART channel.
* Example			: ApiUartConfig(UART2,B57600);
*******************************************************************************/
int ApiUartConfig(int uartCh,speed_t baud_rate)
{
	struct termios ttyS_Config = {
		.c_cc[VMIN] = 0,
		.c_cc[VTIME] = 0,
		.c_iflag = 0,
		.c_oflag = 0,
		.c_lflag = 0,
		.c_cflag = 0,
	};
	int rv;
	if((uartCh > MAX_UART_ID)||(uartCh < 0)) return -2;

	if(devUART[uartCh] < 0) return -1;

	ttyS_Config.c_iflag = IGNPAR;
	ttyS_Config.c_cflag = CLOCAL|CREAD;
	ttyS_Config.c_cflag &= ~(CSIZE|CSTOPB|PARENB);
	ttyS_Config.c_cflag |= CS8;
		
	cfsetispeed(&ttyS_Config, (speed_t) baud_rate);
	cfsetospeed(&ttyS_Config, (speed_t) baud_rate);

	ttyS_Config.c_cflag &= ~PARENB;
	ttyS_Config.c_cflag &= ~CSTOPB;

	rv = tcsetattr(devUART[uartCh], TCSAFLUSH, &ttyS_Config);
	if(rv<0)
	{
		LOGD("devUART%d Error = %d\n",uartCh,errno);
		close(devUART[uartCh]);
		devUART[uartCh] = -1;
		return -3;
	}
	return 0;
}

/******************************************************************************
* Function				 : ApiUartPutChar
* Argument uartDevHandle : Uart Device Handeller (UART0~3)
* 		   ch		  	 : tx data(one byte)
* Return				 : none
* Description			 : This functions is used to transfer the data via Uart. 
* Example				 : ApiUartPutChar(devUART2, 0x30);
*******************************************************************************/
int ApiUartPutByte(int uartCh, unsigned char ch)
{
	unsigned char buffer=0;                // Buffer for write 
	buffer = ch;

	if( write(devUART[uartCh],&buffer,1) < 1 ) 
	{	
		LOGD("Uart Write err[%d]\n",devUART[uartCh]);
		return -1;
	}
	else
	{
		return 0;
	}
}

int ApiUartPutChar(int uartCh, unsigned char ch)
{
	return ApiUartPutByte(uartCh, ch);
}

/******************************************************************************
* Function				: ApiPutData
* Argument uartDevHandle: Uart Device Handller
*          *data		: Writing buffer data pointer
*          len          : length to write
* Return				: None
* Description			: Write hexadecimal data. 
* Example				: ApiPutData(devUART2, buffer,len);
*******************************************************************************/
int ApiPutData(int uartCh, unsigned char *data, int len)
{
	int i;
	int ret;

	for(i=0;i<len;i++)
	{
		ret = ApiUartPutByte(uartCh, data[i]);		//2018.07.17 KSJ
		if(ret < 0)	return ret;						//2018.12.28 KSJ
	}
	return len;
}

/******************************************************************************
* Function				: ApiUartPutString
* Argument 		ch		: Uart Channel Number(UART0~3)
* 				*s		: string address
* Return				: none
* Description			: This functions is used to transfer the string via Uart. 
* Example				: ApiUartPutString(devUART2, "UART0 TEST");
*******************************************************************************/
int ApiUartPutString(int uartCh, char *s)
{
	int rv;
	int i;

	i = 0;
  	while(*s){
		rv = ApiUartPutByte(uartCh,*s);		//2018.07.17 KSJ
		if(rv < 0)
			return -1;
		s++;
		i++;
		if(i > 2048)
			break;
		if(!*s) break;
  	}
	return 0;
  	//ApiUartPutChar(uartDevHandle,'\r');
}

/*******************************************************************************
* Function				: ApiUartPrintf
* Argument 		ch		: Uart Channel Number(UART0~3)
* 				format  : printf format(ex; "example %c \r\n",char )
* Return				: none
* Description			: This functions is used to transfer the printf format
* 						  via Uart. 
* Example				: ApiUartPrintf(devUART2, "\r\n UART%d TEST", uartNo); 
*******************************************************************************/
void ApiUartPrintf(int uartCh, const char * const format, ...)
{
	char tempStr[2048+1];

	va_list argptr;
	va_start (argptr, format);
	vsprintf (tempStr, format, argptr);
	va_end (argptr);
	ApiUartPutString(uartCh,tempStr);
}

/******************************************************************************
* Function          	: ApiUartGetRxDataInt
* Argument uartDevHandle: Uart Device Handller
* Return  				: Receive Data or -1(no data)
*         		 	  
* Description			: This function is used to receive data from Uart through serial port
* Example				: ApiUartGetRxData(devUART2);
*******************************************************************************/              
int ApiUartGetRxDataInt(int uartCh)
{
	unsigned char inbuffer=0;   					// Input buffer 
	int inbyte=-1;

	ioctl(devUART[uartCh],FIONREAD,&inbyte);			// Input Data Count
//	usleep(1*1000);

	if(inbyte > 0){
		read(devUART[uartCh],&inbuffer,1);
//		usleep(1*1000);
	}else return -1;
	return (int)inbuffer;
}

/******************************************************************************
* Function				: ApiUartGetString
* Argument uartDevHandle: Uart Device Handller
*          *pData		: Receive buffer data pointer
* Return				: receive buffer length
* Description			: get a rx data from Rx Ring Buffer. 
* Example				: ApiUartGetString(devUART2, buffer);
*******************************************************************************/
int ApiUartGetData(int uartCh, char *pData)
{
	char inbuffer[2048+1];
	int inbyte=0;
	int len=0;
	
	ioctl(devUART[uartCh], FIONREAD, &inbyte);		// Input Data Count
	
	if(inbyte > 0){
		len = read(devUART[uartCh],inbuffer,inbyte);
	}else {
	 	len = 0;
	 	return 0;
	}
	memcpy(pData,inbuffer,len);

	return len;
}
#define TX_EMPTY_CHECK	0x0650
int ApiUart_tcdrain(int uartCh)
{
	int ret,rv;
	unsigned long status;
	
	for(;;){
		rv = ioctl(devUART[uartCh], TX_EMPTY_CHECK, &status);
		if(rv < 0){
			printf("IOCTL TIOCOUTQ ERR!!\n");
			break;
		}	
		if(status != 0)	break;
	}
	return ret;
}

/******************************************************************************
* Function              : ApiUartInit
* Argument              : Uart Device Handller
* Return                : None
* Description           : is used to initialize the Uart Device.
* Example               : ApiUartInitBuffer(devUART2);
******************************************************************************/
int ApiUartInitBuffer(int uartCh)
{
	int result;
	
	result = tcflush(devUART[uartCh], TCIFLUSH);
	if(result < 0) {
		LOGD("Uart Init Buffer FAILURE [%d]\n", result);
		return result;
	}
	else {
		return result;
	}
}

/******************************************************************************
* Function				: ApiUartCheckRxCnt
* Argument uartDevHandle: Uart Device Handller
* Return				: RxCnt
* Description			: is used to update the RxCnt of Uart Ring buffer.
* Example				: int = cnt;
						  cnt =	ApiUartCheckRxCnt(devUART2);
*******************************************************************************/
int ApiUartCheckRxCnt(int uartCh)
{
	int result;
	int inbyte;
	
	result = ioctl(devUART[uartCh], FIONREAD, &inbyte);
	if(result < 0) {
		return result;
	}
	return inbyte;
}

int ApiUartGetFd(int uartCh)
{
	return devUART[uartCh];
}

