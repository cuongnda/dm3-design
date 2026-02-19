#include <stdio.h>
#include <string.h>
#include <stdarg.h>
#include <termios.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/ioctl.h>
#include <fcntl.h>
#include <errno.h>

#include "libQr.h"
#include "test.h"
#include "sysdef.h"
#include "sysfunc.h"

int HOST_Open(int uartCh, int Baud)
{
	int rv;
	int devHOST;
	speed_t SetBaud;

	devHOST = ApiUartOpen(uartCh);
	if (devHOST < 0){
		printf("ApiUartOpen(%d) Failed\n", uartCh);
		return devHOST;
	}

	switch(Baud)
	{
		case B2400:
		case 2400:
			SetBaud =  B2400;
			break;

		case B4800:
		case 4800:
			SetBaud =  B4800;
			break;

		case B9600:
		case 9600:
			SetBaud =  B9600;
			break;

		case B19200:
		case 19200:
			SetBaud =  B19200;
			break;

		case B38400:
		case 38400:
			SetBaud =  B38400;
			break;

		case B57600:
		case 57600:
			SetBaud =  B57600;
			break;

		case B115200:
		case 115200:
			SetBaud =  B115200;
			break;

		case B230400:
		case 230400:
			SetBaud =  B230400;
			break;
		default:
			SetBaud = -1;
			break;

	}
	if(SetBaud > 0)	rv = ApiUartConfig(uartCh, SetBaud);
	//else rv = ApiUartConfigXbaud(uartCh, Baud,2);
	if (rv != 0)
		printf("ApiUartConfig(%d) Failed\n",Baud);
	rv = ApiUartInitBuffer(uartCh);
	if (rv != 0)
		printf("ApiUartInitBuffer() Failed\n");
	return devHOST;
}
void HOST_Close(int uartCh)
{
	ApiUartClose(uartCh);
}
int HOST_SendString(int uartCh, char *s)
{
	return(ApiUartPutString(uartCh, s));
}
void HOST_printf(int uartCh, const char * const format, ...)
{
	char tempStr[2048+1];
	va_list argptr;
	va_start (argptr, format);
	vsprintf (tempStr, format, argptr);
	va_end (argptr);
	HOST_SendString(uartCh, tempStr);
}
int HOST_SendByte(int uartCh,unsigned char send_data)
{
	return(ApiUartPutChar(uartCh, send_data));

}
int HOST_SendDataN(int uartCh, unsigned char *data, int len)
{
	ApiPutData(uartCh, data,len);
	return len;
}
int HOST_GetByte(int uartCh)
{
	return(ApiUartGetRxDataInt(uartCh));
}
int HOST_CheckRxCnt(int uartCh)
{
	return(ApiUartCheckRxCnt(uartCh));
}