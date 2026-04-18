#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <asm/termbits.h>
#include <sys/ioctl.h>
#include <asm/ioctls.h>
#include <stdarg.h>
#include <errno.h>
#include <linux/serial.h>

#include "apifunc.h"
#include "apidef.h"

extern int devUART[16];
#define MAX_UART_ID	15
struct termios2 ttyS_Config;
struct serial_icounter_struct icount;
static int parity_err_cnt = 0;
#if 0
int ApiUartConfigXbaud(int uartCh,int baud_rate,int parity)
{
	struct termios2 ttyS_Config;
	
	int rv;
	if((uartCh > MAX_UART_ID)||(uartCh < 0)) return -2;

	if(devUART[uartCh] < 0) return -1;
	if(parity==1){
		ttyS_Config.c_iflag = IGNPAR; // //Odd parity
		ttyS_Config.c_cflag = CLOCAL|CREAD;
		ttyS_Config.c_cflag |= (CS8|CSTOPB|PARENB); 
	}else if(parity==0){
		ttyS_Config.c_iflag = INPCK ; // //Even parity
		ttyS_Config.c_cflag = CLOCAL|CREAD;
		//ttyS_Config.c_cflag |= (CS8|CSTOPB|PARENB); 
		ttyS_Config.c_cflag |= (CS8|PARENB); 
		ttyS_Config.c_cflag &= ~CSTOPB;	/* 1 stop bit */
		ttyS_Config.c_cflag &= ~PARODD;	
	}else{
		ttyS_Config.c_iflag = IGNPAR; //No parity
		ttyS_Config.c_cflag = CLOCAL|CREAD;
		ttyS_Config.c_cflag &= ~(CSIZE|CSTOPB|PARENB);
		ttyS_Config.c_cflag |= CS8;
	}	
	ttyS_Config.c_cflag &= ~CBAUD;
	ttyS_Config.c_cflag |= BOTHER;
	ttyS_Config.c_ispeed = baud_rate;
	ttyS_Config.c_ospeed = baud_rate;

	rv = ioctl(devUART[uartCh], TCSETS2, &ttyS_Config);
	if(rv<0)
	{
		printf("devUART%d set Error = %d\n",uartCh,errno);
		close(devUART[uartCh]);
		devUART[uartCh] = -1;
		return -3;
	}
	
	return 0;
}
#endif

void ApiUartConfigXClear(int uartCh)
{
	int rv = 0;
	memset(&ttyS_Config, 0, sizeof(struct termios2));
	memset(&icount, 0, sizeof(struct serial_icounter_struct));
	rv = ioctl(devUART[uartCh], TIOCGICOUNT, &icount);
	if(rv<0)
	{
		printf("TIOCGICOUNT Error\n");
		close(devUART[uartCh]);
		devUART[uartCh] = -1;
		return;
	}	
	parity_err_cnt = icount.parity;
}

int ApiUartConfigXBaud(int uartCh,int baud_rate)
{
	if((uartCh > MAX_UART_ID)||(uartCh < 0)) return -2;

	if(devUART[uartCh] < 0) return -1;	
	
	ttyS_Config.c_cflag &= ~CBAUD;
	ttyS_Config.c_cflag &= ~BOTHER;
	
	ttyS_Config.c_cflag &= ~CBAUD;
	ttyS_Config.c_cflag |= BOTHER;
	ttyS_Config.c_ispeed = baud_rate;
	ttyS_Config.c_ospeed = baud_rate;
	
	return 0;
}

int ApiUartConfigXParity(int uartCh,int parity)
{	
	if((uartCh > MAX_UART_ID)||(uartCh < 0)) return -2;
		
	if(devUART[uartCh] < 0) return -1;	
	ttyS_Config.c_iflag &= ~IGNPAR;
	ttyS_Config.c_iflag &= ~INPCK;
	ttyS_Config.c_cflag &= ~CLOCAL|CREAD;
	ttyS_Config.c_cflag &= ~(CS8|PARENB); 
	ttyS_Config.c_cflag &= ~PARODD;	
	if(parity==1){	
		ttyS_Config.c_iflag |= INPCK; // //Odd parity
		ttyS_Config.c_cflag |= CLOCAL|CREAD;
		ttyS_Config.c_cflag |= (CS8|PARENB); 
		ttyS_Config.c_cflag |= PARODD;	
		//ttyS_Config.c_cflag &= ~CSTOPB;	/* 1 stop bit */
	}else if(parity==0){
		ttyS_Config.c_iflag |= INPCK ; // //Even parity
		ttyS_Config.c_cflag |= CLOCAL|CREAD;
		//ttyS_Config.c_cflag |= (CS8|CSTOPB|PARENB); 
		ttyS_Config.c_cflag |= (CS8|PARENB); 
		//ttyS_Config.c_cflag &= ~CSTOPB;	/* 1 stop bit */
		ttyS_Config.c_cflag &= ~PARODD;	
	}else{
		ttyS_Config.c_iflag |= IGNPAR; //No parity
		ttyS_Config.c_cflag |= CLOCAL|CREAD;
		ttyS_Config.c_cflag &= ~(CSIZE|CSTOPB|PARENB);
		ttyS_Config.c_cflag |= CS8;
	}
	return 0;
}

int ApiUartConfigXStop(int uartCh,int stop)
{	
	if((uartCh > MAX_UART_ID)||(uartCh < 0)) return -2;

	if(devUART[uartCh] < 0) return -1;	
	ttyS_Config.c_cflag &= ~CSTOPB;	/* 1 stop bit */
	
	if(stop==1){
		ttyS_Config.c_cflag &= ~CSTOPB;	/* 1 stop bit */
	}else{
		ttyS_Config.c_cflag |= CSTOPB;	/* 2 stop bit */
	}
	return 0;
}

int ApiUartConfigXSetup(int uartCh)
{
	int rv;
	rv = ioctl(devUART[uartCh], TCSETS2, &ttyS_Config);
	if(rv<0)
	{
		printf("devUART%d ApiUartConfigXSetup Error\n",uartCh);
		close(devUART[uartCh]);
		devUART[uartCh] = -1;
		return -1;
	}
	return 0;
}

int ApiUartConfigXParityCheck(int uartCh)
{
	
	int rv;
	
	rv = ioctl(devUART[uartCh], TIOCGICOUNT, &icount);
	if(rv<0)
	{
		printf("devUART%d ApiUartConfigXParityCheck Error\n",uartCh);
		close(devUART[uartCh]);
		devUART[uartCh] = -1;
		return -1;
	}	
	if(parity_err_cnt != icount.parity){
		parity_err_cnt = icount.parity;
		printf("parity Error Occur, Count[%d]\n",icount.parity);
		return -2;
	}
	return 0;
}

int tcdrain(int uartCh)
{
	int ret;
	//ioctl(devUART[uartCh], TIOCOUTQ, &ret);
	//if(ret) printf("txQ  %d bytes are not txed!!\n",ret);
	ret = ioctl(devUART[uartCh], TCSBRK, 1);
	if(ret  < 0)
	{
		printf("tcdrain fail !!\n");
	}
	return ret;
}


