#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <errno.h>
#include <sys/types.h>
#include <sys/ioctl.h>
#include <sys/time.h>


#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>

#include "sysdef.h"
#include "sysfunc.h"

typedef enum _IOCTRL_TYPE
{
	HWWND_VERSION=54,
	CTRL_WIEGAND_DEBUG_ON,
	CTRL_WIEGAND_DEBUG_OFF,
	IOCTL_W1D0_BIT,
	IOCTL_W1D1_BIT,
	CTRL_WIEGAND_SEND_START,
	CTRL_WIEGAND_SEND_FINISH,
	GET_LAST_WIEGAND_RCV_DATA,
	IOCTL_W1D0_CONTROL,
	IOCTL_W1D1_CONTROL,
	IOCTL_W1D0_STATUS,
	IOCTL_W1D1_STATUS,
} IOCTRL_TYPE;

static int  PopxWiegandDev = -1;
static int apiWiegand_open(void)
{
	if(PopxWiegandDev < 0) 
	{
		PopxWiegandDev = open(WIEGAND_DEVICE_PATH, O_RDWR | O_NONBLOCK);
		
		if(PopxWiegandDev <= 0)
		{
			printf("Failed to open Wiegand device[%d] WIEGAND_DEVICE_PATH = %s\n",PopxWiegandDev,WIEGAND_DEVICE_PATH);			
		}
	}
	return PopxWiegandDev;
}


static void apiWiegand_close(void)
{
	if( PopxWiegandDev < 0 )
	{
		printf("Failed to close Wiegand device(already closed!)[%d]\n",PopxWiegandDev);			
		return;
	}

   	close(PopxWiegandDev);
   	PopxWiegandDev = -1;
}


static int apiWIEGAND_version(char *version)
{
	char DRIVER_Version[20];
	int ret = -1;
	if(PopxWiegandDev < 0) return ret;
	memset(DRIVER_Version,0,sizeof(DRIVER_Version));
	ret = ioctl(PopxWiegandDev,HWWND_VERSION,&DRIVER_Version);
	if(ret < 0){
		memcpy(DRIVER_Version,"Version fail",sizeof("Version fail"));
	}
	memcpy(version,DRIVER_Version,sizeof(DRIVER_Version));
	return ret;
}
static int apiWiegand_setDebug(int flag)
{
	int ret = -1;
	if(PopxWiegandDev < 0) return ret;

	if( flag>0 ) ret = ioctl(PopxWiegandDev,CTRL_WIEGAND_DEBUG_ON,NULL);
	else 	ret = ioctl(PopxWiegandDev,CTRL_WIEGAND_DEBUG_OFF,NULL);
	return ret;
}

static int apiWiegand_SendSetStart(void)
{
	int ret = -1,i;
	if(PopxWiegandDev < 0) return ret;
	for(i=0;i<1000;i++){
		usleep(1*1000);
		ret = ioctl(PopxWiegandDev,CTRL_WIEGAND_SEND_START,NULL);
		if(ret==0) break;
	}
	if(i==1000) return ret;
	return 0;
}

static int apiWiegand_SendSetFinish(void)
{
	int ret = -1;
	if(PopxWiegandDev < 0) return ret;
	ret = ioctl(PopxWiegandDev,CTRL_WIEGAND_SEND_FINISH,NULL);
	return ret;
}

#define MAX_WIEGAND_BYTES 100

typedef struct 
{
	int  lastreadNum;
	char lastBitsCount;
	char lastbuffer[MAX_WIEGAND_BYTES];
} WiegandFrame;

static int apiWiegand_GetLastFrame(int *readNum,int *lastBitsCount,char *bitstream)
{
	WiegandFrame myWiegandFrame;
	int ret = -1;
	if(PopxWiegandDev < 0) return ret;
	ret = ioctl(PopxWiegandDev,GET_LAST_WIEGAND_RCV_DATA,&myWiegandFrame);
	if(ret < 0) return ret;
	*readNum = myWiegandFrame.lastreadNum;
	*lastBitsCount = myWiegandFrame.lastBitsCount;
	memcpy(bitstream,myWiegandFrame.lastbuffer,myWiegandFrame.lastBitsCount);
	bitstream[myWiegandFrame.lastBitsCount] = 0;
	return 0;
}

static int Wiegand_SendBit(char wbit) 
{
	int ret = -1;
	if(PopxWiegandDev < 0) return ret;

	if( wbit== 0 ) ret = ioctl(PopxWiegandDev,IOCTL_W1D0_BIT,NULL);
	else 	ret = ioctl(PopxWiegandDev,IOCTL_W1D1_BIT,NULL);
	return ret;
}

static void Wiegand_SendByte(char wbyte)
{
	char i;
	char wbit[8];
	for(i=0;i<8;i++)
	{
		wbit[i]=wbyte&0x01;
		wbyte>>=1;
	}
	for(i=0;i<8;i++) 
	{
		Wiegand_SendBit(wbit[7-i]);
	}
}

static void Send_WGD1_24bit(char *ids)
{
	Wiegand_SendByte(ids[0]);
	Wiegand_SendByte(ids[1]);
	Wiegand_SendByte(ids[2]);
}

static void Send_WGD1_26bit(char *ids)
{
	char p1,p2,c,d,i;
	p1 = p2 = 0;

	c=ids[0];
	d=ids[1];	d >>= 4;
	for(i=0;i<8;i++)
	{
		p1^=c&0x01;
		c>>=1;	
	}
	for(i=0;i<4;i++)
	{
		p1^=d&0x01;
		d>>=1;		
	}

	c=ids[1];	//c >>= 4;
	d=ids[2];
	for(i=0;i<4;i++)
	{
		p2^=c&0x01;
		c>>=1;		
	}
	for(i=0;i<8;i++)
	{
		p2^=d&0x01;
		d>>=1;		
	}

	Wiegand_SendBit(p1);	//even parity
	Wiegand_SendByte(ids[0]);
	Wiegand_SendByte(ids[1]);
	Wiegand_SendByte(ids[2]);
	Wiegand_SendBit(p2^1);	//odd parity
}

static void Send_WGD1_32bit(char *ids)
{
	Wiegand_SendByte(ids[0]);
	Wiegand_SendByte(ids[1]);
	Wiegand_SendByte(ids[2]);
	Wiegand_SendByte(ids[3]);	
}

static void Send_WGD1_34bit(char *ids)
{
	char p1,p2,c,d,i;
	p1 = p2 = 0;
	
	c=ids[0];
	d=ids[1];
	for(i=0;i<8;i++)
	{
		p1^=c&0x01;
		c>>=1;	
		p1^=d&0x01;
		d>>=1;		
	}
	c=ids[2];
	d=ids[3];
	for(i=0;i<8;i++)
	{
		p2^=c&0x01;
		c>>=1;	
		p2^=d&0x01;
		d>>=1;		
	}

	Wiegand_SendBit(p1);	//even parity
	Wiegand_SendByte(ids[0]);
	Wiegand_SendByte(ids[1]);
	Wiegand_SendByte(ids[2]);
	Wiegand_SendByte(ids[3]);
	Wiegand_SendBit(p2^1);	//odd parity
	
}

static void Send_WGD1_64bit(char *ids)		
{
	Wiegand_SendByte(ids[0]);
	Wiegand_SendByte(ids[1]);
	Wiegand_SendByte(ids[2]);
	Wiegand_SendByte(ids[3]);
	Wiegand_SendByte(ids[4]);
	Wiegand_SendByte(ids[5]);
	Wiegand_SendByte(ids[6]);
	Wiegand_SendByte(ids[7]);	
}

static void Send_WGD1_66bit(char *ids)		
{
	char p1,p2,c,d,e,f,i;
	p1 = p2 = 0;
	
	c=ids[0];
	d=ids[1];
	e=ids[2];
	f=ids[3];
	for(i=0;i<8;i++)
	{
		p1^=c&0x01;
		c>>=1;	
		p1^=d&0x01;
		d>>=1;
		p1^=e&0x01;
		e>>=1;	
		p1^=f&0x01;
		f>>=1;		
	}
	c=ids[4];
	d=ids[5];
	e=ids[6];
	f=ids[7];
	for(i=0;i<8;i++)
	{
		p2^=c&0x01;
		c>>=1;	
		p2^=d&0x01;
		d>>=1;
		p2^=e&0x01;
		e>>=1;	
		p2^=f&0x01;
		f>>=1;		
	}
	Wiegand_SendBit(p1);
	Wiegand_SendByte(ids[0]);
	Wiegand_SendByte(ids[1]);
	Wiegand_SendByte(ids[2]);
	Wiegand_SendByte(ids[3]);
	Wiegand_SendByte(ids[4]);
	Wiegand_SendByte(ids[5]);
	Wiegand_SendByte(ids[6]);
	Wiegand_SendByte(ids[7]);
	Wiegand_SendBit(p2^1);	
}

static unsigned char getEvenParity(unsigned char* data, int len)
{
	int cnt = 0;
	for(int i = 0 ; i < len ; i++)
	{
		for(int j = 0 ; j < 8 ; j++)
		{
			if((data[i] >> j) & 0x01)
				cnt++;
		}
	}
	return cnt % 2 ? 1 : 0;
}

static unsigned char getOddParity(unsigned char* data, int len)
{
	int cnt = 0;
	for(int i = 0 ; i < len ; i++)
	{
		for(int j = 0 ; j < 8 ; j++)
		{
			if((data[i] >> j) & 0x01)
				cnt++;
		}
	}
	return cnt % 2 ? 0 : 1;
}

int DevWiegandSend(unsigned char* data, int len, int parity)
{
	if(PopxWiegandDev < 0)
		return -1;
		
	if(apiWiegand_SendSetStart() < 0) return -1;
	int half = len / 2;

	unsigned char even = getEvenParity(data, half);
	unsigned char odd = getOddParity(data + half, half);

	Wiegand_SendBit(even);
	for(int i = 0 ; i < len ; i++) {
		Wiegand_SendByte(data[i]);	
	}
	Wiegand_SendBit(odd);	

	return apiWiegand_SendSetFinish();
}

static int apiWiegand_WGD0_Control(int control)
{
	if(PopxWiegandDev < 0) return -1;
	return(ioctl(PopxWiegandDev,IOCTL_W1D0_CONTROL,&control));
}

static int apiWiegand_WGD1_Control(int control)
{
	if(PopxWiegandDev < 0) return -1;
	return(ioctl(PopxWiegandDev,IOCTL_W1D1_CONTROL,&control));
}

static int apiWiegand_WGD0_Status(int *status)
{
	if(PopxWiegandDev < 0) return -1;
	return(ioctl(PopxWiegandDev,IOCTL_W1D0_STATUS,status));
}

static int apiWiegand_WGD1_Status(int *status)
{
	if(PopxWiegandDev < 0) return -1;
	return(ioctl(PopxWiegandDev,IOCTL_W1D1_STATUS,status));
}

int DevWiegandOpen(void)
{
	return(apiWiegand_open());
}

int DevWiegandClose(void)
{
	apiWiegand_close();
	return 0;
}

int DevWiegandVerion(char *version)
{
	return(apiWIEGAND_version(version));
}
int DevWiegandDebug(int flag)
{
	return(apiWiegand_setDebug(flag));
}

int Send_WGD(char *ids, char parity, int len)
{
	int i;
	if(apiWiegand_SendSetStart() < 0) return -1;
	if(parity == 0)	
	{
		printf("Send %dbit", (len * 8) + 2);
		printf("Parity : Yes\n");
		printf("Data : ");
		for(i = 0; i < len; i++)
		{
			printf("%02X", ids[i]);
		}
		printf("\n");
		
		switch(len)
		{
		case 3:	
			Send_WGD1_26bit(ids);
			break;
		case 4:	
			Send_WGD1_34bit(ids);
			break;
		case 8:	
			Send_WGD1_66bit(ids);
			break;
		default:
			printf("Wrong bit : %d\n", (len * 8) + 2);
			return -1;
		}	
	}	
	else if(parity == 1)	
	{
		printf("Send %dbit\n", len * 8);
		printf("Parity : No\n");
		printf("Data : ");
		for(i = 0; i < len; i++)
		{
			printf("%02x", ids[i]);
		}
		printf("\n");
		
		switch(len)
		{
		case 3:	
			Send_WGD1_24bit(ids);
			break;
		case 4:
			Send_WGD1_32bit(ids);
			break;
		case 8:	
			Send_WGD1_64bit(ids);
			break;
		default:
			printf("Wrong bit : %d\n", len * 8);
			return -1;
		}	
	}	
	return(apiWiegand_SendSetFinish());
} 

int WiegandGetLastData(int *readNum,	int *lastBitsCount,	char *bitstream)
{
	return(apiWiegand_GetLastFrame(readNum,lastBitsCount,bitstream));
}

int DevWGD0_Control(int control)
{
	return(apiWiegand_WGD0_Control(control));
}
int DevWGD1_Control(int control)
{
	return(apiWiegand_WGD1_Control(control));
}
int DevWGD0_Status(void)
{
	int status=-1;
	if(apiWiegand_WGD0_Status(&status) < 0) return -1;
	return status;
}
int DevWGD1_Status(void)
{
	int status=-1;
	if(apiWiegand_WGD1_Status(&status) < 0) return -1;
	return status;
}


