#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include <pthread.h>
#include <linux/input.h>
#include <sys/types.h>
#include <unistd.h>
#include <sys/stat.h>
#include <fcntl.h>
#include "libLcd.h"
#include "log.h"

#define OUTPUTDEV_CNT	5
#define DRVPDUCLK	0
#define DRVUSB		1
#define DRVRLY		2
#define DRVTAMP		3
#define DRVCASH		4

static char output_file[OUTPUTDEV_CNT][30] =
{
	"/dev/drvPduCLK",
	"/dev/drvUSB",
	"/dev/drvRLY",
	"/dev/drvTAMP",
	"/dev/drvCASHBOX"
};
static char debugoutput_file[OUTPUTDEV_CNT][40] =
{
	"/sys/kernel/drvOutput/pduclkdebug",
	"/sys/kernel/drvOutput/usbdebug",
	"/sys/kernel/drvOutput/relaydebug",
	"/sys/kernel/drvOutput/tampdebug",
};	


int Relaylock_Period_get(void)
{
	int lock_period_value = 1000;
	int ret,len,pdupwmDev;  
	char buf[100];
	pdupwmDev = open("/sys/kernel/drvOutput/pdupwm", O_RDWR|O_NDELAY );
	if(pdupwmDev <0) return -1;
	ret = read(pdupwmDev, buf, 80);	
	if(ret < 0)	return -1;	
	ret = close(pdupwmDev);  
	if(buf[strlen(buf)-1] == 0x0a) buf[strlen(buf)-1] = 0; 
 
	lock_period_value = atoi(buf);
	return lock_period_value;
}
int Relaylock_Period_set(int microsec)
{
	int ret,len,pdupwmDev;  
	char buf[100];
	pdupwmDev = open("/sys/kernel/drvOutput/pdupwm", O_RDWR|O_NDELAY );
	if(pdupwmDev <0) return -1;
	sprintf(buf,"%d",microsec);
	len = strlen(buf); 	
	ret = write(pdupwmDev, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(pdupwmDev);  
	if(ret < 0)	return -1;	
	return microsec;
}
int Relaylock_Control(int control)
{
	int ret,len,clkDev;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	clkDev = open(output_file[DRVPDUCLK], O_RDWR|O_NDELAY );
	if(clkDev <0) return -1;
	sprintf(buf,"PDUCLK%d",control);
	len = strlen(buf); 	
	ret = write(clkDev, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(clkDev);  
	if(ret < 0)	return -1;	
	return 0;
}

int DevGpioPWM(int control)
{
	return Relaylock_Control(control);
}


int Relay_Control(int control)
{
	int ret,len,rlyDev;
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	rlyDev = open(output_file[DRVRLY], O_RDWR|O_NDELAY );
	if(rlyDev <0) return -1;
	sprintf(buf,"RLY%d",control);
	LOGD("%s",buf);
	len = strlen(buf);
	ret = write(rlyDev, buf, len);
	if(ret < 0)	return -1;
	ret = close(rlyDev);
	if(ret < 0)	return -1;
	return 0;	
}

int Tamper_Control(int control)
{
	int ret,len,tampDev;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	tampDev = open(output_file[DRVTAMP], O_RDWR|O_NDELAY );
	if(tampDev <0) return -1;
	sprintf(buf,"TAMP%d",control);
	len = strlen(buf); 	
	ret = write(tampDev, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(tampDev);  
	if(ret < 0)	return -1;	
	return 0;
}

int UsbOtg_Mode_Control(int flag)
{
	int ret,len,usbDev;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	usbDev = open(output_file[DRVUSB], O_RDWR|O_NDELAY );
	if(usbDev <0) return -1;
	sprintf(buf,"USBMODE%d",flag);
	len = strlen(buf); 	
	ret = write(usbDev, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(usbDev);  
	if(ret < 0)	return -1;	
	return 0;
}

int CASHBOX_Open(int flag)
{
	int ret,len,cashDev;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	cashDev = open(output_file[DRVCASH], O_RDWR|O_NDELAY );
	if(cashDev <0) {
		LOGD("CASH Fail");
	    return -1;
	}
	sprintf(buf,"CASH%d", flag);
    LOGD(buf);
	len = strlen(buf); 	
	ret = write(cashDev, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(cashDev);  
	if(ret < 0)	return -1;	
	return 0;
}

int PDUCLK_Read(char *buf)
{
	int ret,clkDev;
	char rbuf[100];
	memset(rbuf,0x00,sizeof(rbuf));
	clkDev = open(output_file[DRVPDUCLK], O_RDWR|O_NDELAY );
	if(clkDev <0)	return -1;
	ret = read(clkDev, rbuf, sizeof(rbuf));
	if(ret > 0)	memcpy(buf, rbuf, sizeof(rbuf));
	else return -1;
	ret = close(clkDev);  
    if(ret < 0)	return -1; 	  	
	return 0;
}

int RELAY_Read(char *buf)
{
	int ret,rlyDev;
	char rbuf[100];
	memset(rbuf,0x00,sizeof(rbuf));
	rlyDev = open(output_file[DRVRLY], O_RDWR|O_NDELAY );
	if(rlyDev <0)	return -1;
	ret = read(rlyDev, rbuf, sizeof(rbuf));
	if(ret > 0)	memcpy(buf, rbuf, sizeof(rbuf));
	else return -1;
	ret = close(rlyDev);  
    if(ret < 0)	return -1; 	  	
	return 0;
}

int TAMP_Read(char *buf)
{
	int ret,tmpDev;
	char rbuf[100];
	memset(rbuf,0x00,sizeof(rbuf));
	tmpDev = open(output_file[DRVTAMP], O_RDWR|O_NDELAY );
	if(tmpDev <0)	return -1;
	ret = read(tmpDev, rbuf, sizeof(rbuf));
	if(ret > 0)	memcpy(buf, rbuf, sizeof(rbuf));
	else return -1;
	ret = close(tmpDev);  
    if(ret < 0)	return -1; 	  	
	return 0;
}

int USB_Read(char *buf)
{
	int ret,usbDev;
	char rbuf[100];
	memset(rbuf,0x00,sizeof(rbuf));
	usbDev = open(output_file[DRVUSB], O_RDWR|O_NDELAY );
	if(usbDev <0)	return -1;
	ret = read(usbDev, rbuf, sizeof(rbuf));
	if(ret > 0)	memcpy(buf, rbuf, sizeof(rbuf));
	else return -1;
	ret = close(usbDev);  
    if(ret < 0)	return -1; 	  	
	return 0;
}

static int gpiofd = -1;
int DevGpioGetFd(void)
{
	return(gpiofd);
}


#define GPVER "GpioVerion1.0"
int DevGpioVerion(unsigned char *version)
{
	memcpy(version,GPVER,sizeof(GPVER));
	return(0);
}
int DevGpioDebug(int flag)
{
	return(0);
}

int relay_test()
{
	int ret;
	ret = Relay_Control(1);
	if (ret < 0)
		return 1;
	usleep(500*1000);
	ret = Relay_Control(0);
	if (ret < 0)
		return 1;
	return 0;
}
