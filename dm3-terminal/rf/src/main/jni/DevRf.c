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
#include <pthread.h>

#include "sysfunc.h"
#include "sysdef.h"
static int RfDev=-1;
static int rf_type= -1;
static int pn5180_dev=-1; 
      
#define STX		0x02 
#define RF_UART_ID	4  

typedef struct {
    u16 len;
    u8 cmd;
    u8 pdata[512];
}__attribute__((packed))rf_control;

typedef struct
{
	int wlen; // 쓸 데이터 길이
	int rlen; // 읽을 데이터 길이
	unsigned char cmd; // 커맨드
	unsigned char buf[512]; // 데이터 버퍼
}ioctl_arg;

typedef enum _IOCTRL_TYPE
{
	IOCTL_CMD=90,
	IOCTL_HW_RESET, 
	IOCTL_DEBUG_ON,
	IOCTL_DEBUG_OFF,
	IOCTL_GET_VERSION=99,
	IOCTL_HWRESET_CONTROL,
} IOCTRL_TYPE;

static int apipn5180OpenDevice(void)
{
	pn5180_dev =  open(RF_DEVICE_PATH, O_RDWR|O_NOCTTY | O_NDELAY);
	return pn5180_dev;
}
static int apipn5180CloseDevice(void)
{
	if(pn5180_dev < 0) return 0;
	close(pn5180_dev);
	pn5180_dev = -1;
	return 0;
}
pthread_mutex_t  mutex = PTHREAD_MUTEX_INITIALIZER;
static int apipn5180DataExchange( ioctl_arg *arg )
{
	rf_control dualiio_protocol;
	//unsigned char Line_Buffer[512];
	int nReturn=-1;
	if(pn5180_dev < 0) return pn5180_dev;
	pthread_mutex_lock(&mutex);
	//dualiio_protocol.len = arg->wlen + 1;
	dualiio_protocol.len = arg->wlen; //2019.08.07
	dualiio_protocol.cmd = arg->cmd;
	//if (arg->wlen > 1)	memcpy(Line_Buffer, arg->buf, arg->wlen - 1); 
	if (arg->wlen >= 1)	memcpy(dualiio_protocol.pdata, arg->buf, arg->wlen - 1);//2019.08.07
	//dualiio_protocol.pdata = Line_Buffer;
	nReturn = ioctl(pn5180_dev, IOCTL_CMD, &dualiio_protocol);
	if (nReturn >= 0) {
		arg->rlen = dualiio_protocol.len - 1;
		if (dualiio_protocol.len > 1)
			memcpy(arg->buf, dualiio_protocol.pdata, dualiio_protocol.len - 1);
	
		nReturn = arg->cmd = dualiio_protocol.cmd;
	}
	pthread_mutex_unlock(&mutex); 
	return nReturn;		
}
static int apipn5180ResetControl( int onoff)
{
	if(pn5180_dev < 0) return pn5180_dev;
	return(ioctl(pn5180_dev, IOCTL_HWRESET_CONTROL, &onoff));
}

static int apipn5180Reset( void)
{
	if(pn5180_dev < 0) return pn5180_dev;
	return(ioctl(pn5180_dev, IOCTL_HW_RESET, NULL));
}
static int apipn5180_version(unsigned char *version)
{
	unsigned char DRIVER_Version[20];
	int ret = 0;
	if(pn5180_dev < 0) return pn5180_dev;
	memset(DRIVER_Version,0,sizeof(DRIVER_Version));
	ret = ioctl(pn5180_dev,IOCTL_GET_VERSION,&DRIVER_Version);
	if(ret < 0){
		memcpy(DRIVER_Version,"Version fail",sizeof("Version fail"));
	}
	memcpy(version,DRIVER_Version,sizeof(DRIVER_Version));
	return ret;
}
   
int DevRFOpen(void)
{
	int rv;
	RfDev = apipn5180OpenDevice();
	if(RfDev < 0) {
		RfDev = ApiUartOpen(RF_UART_ID);
		if (RfDev <= 0)
			fprintf(stderr,"ApiUartOpen(%d) Failed\n", RF_UART_ID);
		rf_type = 1;

		rv = ApiUartConfig(RF_UART_ID, B115200);
		if (rv != 0)
			fprintf(stderr,"ApiUartConfig(B9600) Failed\n");

		rv = ApiUartInitBuffer(RF_UART_ID);
		if (rv != 0)
			fprintf(stderr,"ApiUartInitBuffer() Failed\n");
	}else{
		rf_type = 0;
	}
	return RfDev;
}

void DevRFClose(void)
{
	if(rf_type == 0) apipn5180CloseDevice();
	else if(rf_type == 1) ApiUartClose(RF_UART_ID);
}
int DevRfDriver_Version(unsigned char *version)
{
	if(rf_type == 1){
		memcpy(version,"Dp680_TTY",sizeof("Dp680_TTY"));
		return 0;
	}
	return(apipn5180_version(version));
}

int Linux_Rf_Reset(void)
{
	if(rf_type == 1){
		printf("%s : not supported\n",__func__);
		return 0;
	}
	return (apipn5180Reset());
}
u8 CalcLRC(u8* lpData, short nCnt)
{
	u8 ret = 0;

	while (nCnt) {
		ret ^= *(lpData + nCnt -1);
		nCnt--;
	}

	return ret;
}
int ApiUartGetRxDataDummy(int virtualPort)
{
	int realPort = -1;
	unsigned char inbuffer=0;   					// Input buffer
	int inbyte=0;
	int len=0;
	realPort = ApiUartGetFd(virtualPort);
	if(realPort < 0) {
		fprintf(stderr,"ApiUartGetRxDataDummy : comport %d open error!!\n",RF_UART_ID);
		return -1;
	}
	inbyte = ApiUartCheckRxCnt(virtualPort);

	while(1){
		len = ApiUartGetRxDataInt(virtualPort);
		if(len < 0) break;
		//printf("Dummy character : %02X \n", (char)len);
		usleep(1*1000);
	}
	return inbyte;
}
int Uartx_GetKey(int COM)
{
	return(ApiUartGetRxDataInt(COM));
}

int ReceiveString(int virtualPort,u8 *recvbuf,int *recvlen,int timeout) {
//	int i;
	u8		c;
	int		cnt, nLen;
	u8		bLoop;
	long long	stime,etime;
	int		chr;
	int nreturn = -1;
	long long tcheck;
	int realPort = -1;

	cnt = chr = 0;
	bLoop = 1;
#ifdef ANDROID_DEVICE
	struct timeval t0, t1;
	gettimeofday(&t0, NULL);
#else
	stime = HWGet_Tick();
#endif
	nLen = 0;
	nreturn = -1;	
	usleep(1000); 
//printf("FROM UART_RF:\n");

	while(bLoop){
		chr = Uartx_GetKey(virtualPort);

		if(chr < 0)
		{
#ifdef ANDROID_DEVICE
			gettimeofday(&t1, NULL);
			tcheck = (1000*(t1.tv_sec-t0.tv_sec)) + ((t1.tv_usec-t0.tv_usec)/1000);
#else
			etime = HWGet_Tick();
			if(etime < stime) etime = stime = HWGet_Tick();
			tcheck = etime-stime;
#endif
			usleep(5*1000);
			if(tcheck  >  timeout)
			{
				fprintf(stderr,"====TIME OUT rcved cnt=%d, stime=%lld, etime=%lld, timeout=%d\n",cnt, stime, etime, timeout);
				bLoop = 0;
			}
		}
		else 
		{
			c = (u8)chr;
//			printf("%02X ",c);
			switch(cnt)
			{
			case 0:
				if (c != STX)
				{
					fprintf(stderr,"Not STX in %02x\n",c);
					cnt = -1;
				}
				else
					recvbuf[cnt] = c;
				break;
			case 1:
				recvbuf[cnt] = c;
				nLen = c*256;
				break;
			case 2:
				recvbuf[cnt] = c;
				nLen += c;
//				if(debugflag >= 1) LOGD("RECV len:[%d]",nLen);
				break;
			default :
				if(cnt == nLen + 3)
				{
					if(CalcLRC(recvbuf+1, nLen+2) != c)
					{
						fprintf(stderr,"LRC error\n");
						bLoop = 0;
					}
					else
					{
						*recvlen = nLen;
						nreturn = recvbuf[3];
						bLoop = 0;
//printf("\n");
//						if(debugflag >= 1) LOGD("LRC OK");
					}
#if 0
					if(debugflag >= 1) {
						int j;
						char dump[1024],chhex[4];

						//debugflag 값에 따라 남기도록 변경 2017_04_25 hjs
//#ifdef DEBUG_ENABLE

						if (debugflag > 0){
							sprintf(dump,"ReadPort:cnt [%d] -->",cnt);
							for(j=0;j<cnt;j++){
								sprintf(chhex,"%02x,",recvbuf[j]);
								chhex[3] = 0;
								strcat(dump,chhex);
							}
							printf("%s\n",dump);
						}
//#endif
					}
#endif
				}
				else
				{
					recvbuf[cnt] = c;
				}
				break;
			}
			cnt++;
		}
	}
//#ifdef DEBUG_ENABLE
//printf("\n");

//	if((nreturn != 0) && (nreturn != 2)) printf( "ReceiveString end[%d]\n",nreturn);
//#endif
	return nreturn;
}

int XmitString(int virtualPort,u8 *sendbuf,int sendlen,u8 *recvbuf,int *recvlen,int timeout)
{
int i;
	if(	ApiUartGetRxDataDummy(virtualPort) < 0){
		fprintf(stderr,"Dummy err\n");
		return -1;
	}
//printf("To UART_RF:");
//for(i=0;i<sendlen;i++) printf("%02X ",sendbuf[i]);
//printf("\n");
	if(ApiPutData(virtualPort,sendbuf,sendlen) != sendlen) {
		fprintf(stderr,"Write err\n");
		return -1;
	}
	*recvlen = 0;
	return ReceiveString(virtualPort,recvbuf,recvlen,timeout);

}


int SendToSerialTimeout(ioctl_arg* arg, int virtualPort,int timeout)
{
u8 sendbuf[4096];
u8 recvbuf[4096];
int sendlen;
int recvlen;
	int nReturn;
	sendlen = 0;

	sendbuf[sendlen++] = STX;
	sendbuf[sendlen++] = (arg->wlen+1)/256;
	sendbuf[sendlen++] = (arg->wlen+1)%256;
	sendbuf[sendlen++] = arg->cmd;


	if (arg->wlen >= 1)
		memcpy(sendbuf+sendlen, arg->buf, arg->wlen);

	sendlen += arg->wlen;
	sendbuf[sendlen++] = CalcLRC(sendbuf+1, arg->wlen+3);

	nReturn = XmitString(virtualPort,sendbuf,sendlen,recvbuf,&recvlen,timeout);
	if(nReturn >= 0) {
		arg->rlen = recvlen-1;
		memcpy(arg->buf,recvbuf+4,recvlen-1);
		arg->cmd = (char)nReturn;
	}
	return nReturn;
}


int Linux_Rf_Polling(int datalen, unsigned char* data, int* outlen, unsigned char* lpRes, int timeout)
{
	int retPort=-1;

	ioctl_arg arg;

	arg.wlen = datalen;
	arg.cmd = data[0];
	if (datalen)	memcpy(arg.buf, data + 1, datalen - 1); //2019.08.10  MJW

	if(rf_type == 0) {
		retPort = apipn5180DataExchange(&arg);
	}else{
		if(timeout == 0) timeout = 4000;
		retPort = SendToSerialTimeout(&arg,RF_UART_ID, timeout);
	}

	if(retPort < 0) return retPort;
	retPort = arg.cmd;
	if(arg.rlen > 0) memcpy(lpRes,arg.buf, arg.rlen);

	*outlen = arg.rlen;
	return retPort;
}

int Linux_Rf_RFOn(void)
{
	int nSLen;
	int nRlen = 0;
	unsigned char pSBuf[10];
	unsigned char pRBuf[50];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	memset(pRBuf, 0x00, sizeof(pRBuf));
	pSBuf[nSLen++] = 0x10;

	res = Linux_Rf_Polling( nSLen, pSBuf, &nRlen, pRBuf, 0);

	return res;
}

int Linux_Rf_RFOff(void)
{
	int nSLen;
	int nRlen = 0;
	unsigned char pSBuf[10];
	unsigned char pRBuf[50];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	memset(pRBuf, 0x00, sizeof(pRBuf));
	pSBuf[nSLen++] = 0x11;

	res = Linux_Rf_Polling( nSLen, pSBuf, &nRlen, pRBuf, 0);

	return res;
}

int Linux_Rf_RF_VERSION(int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x16;

	res = Linux_Rf_Polling( nSLen, pSBuf,outlen, lpRes, 0);

	return res;
}

// HAK (17.04.28) RF Gear Check
int Linux_Rf_GearCheck(int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0xE0;
	pSBuf[nSLen++] = 0x01;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_Rf_FindCard(unsigned char baud, unsigned char cid, unsigned char nad, unsigned char option, int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x4C;
	pSBuf[nSLen++] = baud;
	pSBuf[nSLen++] = cid;
	pSBuf[nSLen++] = nad;
	pSBuf[nSLen++] = option;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

// HAK (17.04.26)
int Linux_Rf_APDU(int datalen, unsigned char* data, int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[1024];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x61;
	memcpy(pSBuf+nSLen, data, datalen);
	nSLen += datalen;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	memset(pSBuf, 0x00, sizeof(pSBuf));

	return res;
}

int Linux_RfA_Idle_Req(int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x21;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_RfA_Wakeup_Req(int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x22;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_RfA_AntiSelLevel(int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x3D;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_RfA_Req_Select(unsigned char requestmode, int* outlen, unsigned char* lpRes)
{
	unsigned char ch;

	if(requestmode == 0x00)	ch = Linux_RfA_Idle_Req( outlen, lpRes);
	else					ch = Linux_RfA_Wakeup_Req( outlen, lpRes);

	if(ch == 0x02){
#ifdef ANDROID_DEVICE
		usleep(5*1000);
#else
		DevDelay_ms(5);
#endif
		if(requestmode == 0x00)	ch = Linux_RfA_Idle_Req( outlen, lpRes);
		else					ch = Linux_RfA_Wakeup_Req( outlen, lpRes);
	}

	if(ch == 0x02){
#ifdef ANDROID_DEVICE
		usleep(5*1000);
#else
		DevDelay_ms(5);
#endif
		if(requestmode == 0x00)	ch = Linux_RfA_Idle_Req( outlen, lpRes);
		else					ch = Linux_RfA_Wakeup_Req( outlen, lpRes);
	}

	if(ch != 0x00)
		return ch;

	ch = Linux_RfA_AntiSelLevel( outlen, lpRes);

	return ch;
}

int Linux_RfA_Authkey(unsigned char mode, unsigned char* keydata, unsigned char blockno)
{
	int nSLen;
	int nRlen = 0;
	unsigned char pSBuf[10];
	unsigned char pRBuf[50];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	memset(pRBuf, 0x00, sizeof(pRBuf));
	pSBuf[nSLen++] = 0x30;
	pSBuf[nSLen++] = mode;
	memcpy(pSBuf+nSLen, keydata, 6);
	nSLen += 6;
	pSBuf[nSLen++] = blockno;

	res = Linux_Rf_Polling( nSLen, pSBuf, &nRlen, pRBuf, 0);

	return res;
}

int Linux_RfA_Read(unsigned char blockno, int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x27;
	pSBuf[nSLen++] = blockno;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_RfA_Write(unsigned char blockno, int datalen, unsigned char* data)
{
	int nSLen;
	int nRlen = 0;
	unsigned char pSBuf[10];
	unsigned char pRBuf[50];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	memset(pRBuf, 0x00, sizeof(pRBuf));
	pSBuf[nSLen++] = 0x28;
	pSBuf[nSLen++] = blockno;
	memcpy(pSBuf+nSLen, data, datalen);
	nSLen += datalen;

	res = Linux_Rf_Polling( nSLen, pSBuf, &nRlen, pRBuf, 0);

	return res;
}

int Linux_RfA_Halt(void)
{
	int nSLen;
	int nRlen = 0;
	unsigned char pSBuf[10];
	unsigned char pRBuf[50];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	memset(pRBuf, 0x00, sizeof(pRBuf));
	pSBuf[nSLen++] = 0x26;

	res = Linux_Rf_Polling( nSLen, pSBuf, &nRlen, pRBuf, 0);

	return res;
}

int Linux_RfB_Wakeup_Req(int* outlen, unsigned char* lpRes)
{
	int nSLen;
	unsigned char pSBuf[10];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = 0x60;
	pSBuf[nSLen++] = 0x05;
	pSBuf[nSLen++] = 0x00;
	pSBuf[nSLen++] = 0x08;
	pSBuf[nSLen++] = 0x05;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}
/////////////////////////////////////////////////////////////////////////////////////////
//Type C
/////////////////////////////////////////////////////////////////////////////////////////
int Linux_DEC_Transparent(int datalen, unsigned char* data, int* outlen,
		unsigned char* lpRes, unsigned char tout)
{
	int nSLen;
	unsigned char pSBuf[260];
	int res;

	nSLen = 0;
	memset(pSBuf, 0x00, sizeof(pSBuf));
	pSBuf[nSLen++] = _DEC_TRANSPARENT;
	memcpy(pSBuf+nSLen, data, datalen);
	nSLen += datalen;
	pSBuf[nSLen++] = tout;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_DEC_Polling_NoENC(unsigned char* systemcode, unsigned char requestsyscode,
		unsigned char timeslot, int* outlen, unsigned char* lpRes, unsigned char tout)
{
	int nSLen;
	unsigned char pSBuf[260];
	int res;

	pSBuf[nSLen++] = _DEC_POLLING_NOENC;

	pSBuf[nSLen++] = systemcode[0];
	pSBuf[nSLen++] = systemcode[1];
	pSBuf[nSLen++] = requestsyscode;
	pSBuf[nSLen++] = timeslot;
	pSBuf[nSLen++] = tout;

	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_DEC_Read_NoENC(unsigned char* IDm, unsigned char* servicecode,
		unsigned char block, int* outlen, unsigned char* lpRes, unsigned char tout)
{
	int nSLen;
	unsigned char pSBuf[260];
	int res;

	pSBuf[nSLen++] = _DEC_READ_NOENC;
	memcpy(pSBuf+nSLen, IDm, 8);
	nSLen += 8;
	memcpy(pSBuf+nSLen, servicecode, 2);
	nSLen += 2;
	pSBuf[nSLen++] = block;
	pSBuf[nSLen++] = tout;
	
	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;
}

int Linux_DEC_Write_NoENC(unsigned char* IDm, unsigned char* servicecode,
		unsigned char block, unsigned char* blockdata, int* outlen, unsigned char* lpRes, unsigned char tout)
{
	int nSLen;
	unsigned char pSBuf[260];
	int res;

	pSBuf[nSLen++] = _DEC_WRITE_NOENC;
	memcpy(pSBuf+nSLen, IDm, 8);
	nSLen += 8;
	memcpy(pSBuf+nSLen, servicecode, 2);
	nSLen += 2;
	pSBuf[nSLen++] = block;
	memcpy(pSBuf+nSLen, blockdata, 16);
	nSLen += 16;
	pSBuf[nSLen++] = tout;
	res = Linux_Rf_Polling( nSLen, pSBuf, outlen, lpRes, 0);

	return res;

}

