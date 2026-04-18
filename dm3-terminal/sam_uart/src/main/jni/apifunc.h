
#ifndef APIFUNC_H_
#define APIFUNC_H_
#include <stdint.h>

int apiGpio_getFd(void);
int apiGPIO_version(unsigned char *version);
int apiGpio_setDebug(int control);
int apiGpio_QRPower_Control(int control);
int apiGpio_QrTriggerLevel(int control);
int apiGpio_Tamper_Control(int control);
int apiGpio_Rs485Dir_Control(int control);
int apiGpio_Relay_Control(int control);
int apiGpio_Relaylock_Control(int mdelay);
int apiGpio_GET_RELAYCLK_INFO(int *period_us);
int apiGpio_SET_RELAYCLK_INFO(int period_us);
int apiGpio_UsbOtgMode_Control(int control);
int apiGpio_SamPower_Control(int control);
int apiGpio_SamReset_Control(int control);
int apiGpio_SamClock_Control(int control);
int apiGpio_OPEN_SW_Status(int *status);
int apiGpio_DOOR_STA_Status(int *status);
int apiGpio_CASE_SENSOR_Status(int *status);
int apiGpio_KEY_LEFT_Status(int *status);
int apiGpio_KEY_RIGHT_Status(int *status);
int apiGpio_BLE_STATUS_Status(int *status);
int apiGpio_GetAll_Status(int *status);
int apiGpio_open(void);
void apiGpio_close(void);

int apiTimer_set(int id, int time_ms);
int apiTimer_get(int id);
int apiTimer_isTimeout(int id);
int apiTimer_alloc(void);
int apiTimer_release(int id);

int apiTimer_open(void);
int apiTimer_close(void);
int apiTimer_setDebug(int flag);
long long apiTimer_getJiffies(void);
void apiTimer_delay(int msec);
int apiTimer_version(unsigned char *version);

int apirtc_Open(void);
void  apirtc_Close(void);
int apirtc_GetTime(char *out);
int apirtc_SetTime(char *in);

typedef struct
{
	int wlen; // 쓸 데이터 길이
	int rlen; // 읽을 데이터 길이
	unsigned char cmd; // 커맨드
	unsigned char buf[512]; // 데이터 버퍼
}ioctl_arg;

int apipn5180OpenDevice(void);
int apipn5180CloseDevice(void);
int apipn5180DataExchange( ioctl_arg *arg );
int apipn5180Reset( void);
int apipn5180_version(unsigned char *version);
int apipn5180_setDebug(int flag);


int ApiUartConfigXbaud(int uartCh,int baud_rate,int parity);
int ApiUartExtraOpen(int uartCh,char *path);
int ApiUartOpen(int uartCh);
void ApiUartClose(int uartCh);
int ApiUartConfig(int uartCh,unsigned int baud_rate);
int ApiUartPutChar(int uartCh, unsigned char ch);
int ApiPutData(int uartCh, unsigned char *data, int len);
int ApiUartPutString(int uartCh, char *s);
void ApiUartPrintf(int uartCh, const char * const format, ...);
int ApiUartGetRxDataInt(int uartCh);
int ApiUartGetData(int uartCh, char *pData);
int ApiUartInitBuffer(int uartCh);
int ApiUartCheckRxCnt(int uartCh);
//void DbgPrintf(const char * const format, ...);
//int ApiUartConfigXbaud(int uartCh,int baud_rate);
int ApiUartGetFd(int uartCh);
int apiUart_tcdrain(int uartCh);
int ApiUartPutByte(int uartCh, unsigned char ch);

int ApiAudioOpen(void);
int ApiMixerInit(void);
int ApiAudioInit(void);
void ApiAudioClose(void);
int ApiAudioReset(void);
int ApiAudioSetChannels(int chs);
int ApiAudioSync(void);
int ApiAudioSetRate(int sample_rate);
int ApiAudioVolume(int vol);
int ApiAudioVolumeDirect(int vol);
int ApiAudioVolumeSet(int vol);
int ApiAudioVolumeGet(void);
int ApiAudioPlay(unsigned char *s, int length);
int ApiAudioStart(void);
int ApiAudioStop(void);

int apiWiegand_open(void);
void apiWiegand_close(void);
int apiWIEGAND_version(char *version);
int apiWiegand_setDebug(int flag);
int apiWiegand_SendSetStart(void);
int apiWiegand_SendSetFinish(void);
int apiWiegand_GetLastFrame(int *readNum,int *lastBitsCount,char *bitstream);
int Wiegand_SendBit(char wbit);
void Wiegand_SendByte(char wbyte);
void Send_WGD1_24bit(char *ids);
void Send_WGD1_26bit(char *ids);
void Send_WGD1_32bit(char *ids);
void Send_WGD1_34bit(char *ids);
void Send_WGD1_64bit(char *ids);
void Send_WGD1_66bit(char *ids);	


#endif /* APILCD_H_ */
