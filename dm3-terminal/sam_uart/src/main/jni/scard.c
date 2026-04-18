#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <fcntl.h>
#include "type_def.h"
#include "hw_config.h"
#include "scard.h"
#include "sysfunc.h"
#include "sysdef.h"
#include "iso7816.h"
#include "apifunc.h"
#include "apidef.h"

#include <stdlib.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/time.h>
#include <termios.h>
#include <signal.h>  
#include <pthread.h>
#include "MfErrNo.h"
#include "hw_config.h"
#include "type_def.h"

#define T0_RETRY	3

#define SC_MCU_CLOCK	0

#define PARITY_ERROR_TEST		0  //check it with 00a40000021122, when tx 11(when data length is 2) parity errro occur 
                               //check error signal from card.
#define PARITY_SINGAL_TEST	0  //make parity error singnal at reader

// 2021.08.24
#define SCARD_SLOT	0


unsigned char SC_Inv_Byte(unsigned char inv_data);
unsigned int sc_speed = 0;
unsigned char sc_activate[2];
unsigned short g_etu;
unsigned char sc_rx_retry;
void SC_CGT_Wait(u8 slot);

extern u8 icrx_buffer[ISO7816_BUFF_SIZE];

extern u8 sc_inv_flag[ISO7816_SLOT];
extern u8 pps_flag[ISO7816_SLOT];
extern u8 sc_protocol[ISO7816_SLOT];
extern u8 *icrcv_ptr;	 

// 2021.08.23
extern u32 sc_CWT,sc_BWT;
extern vu32 icc_CWT_cnt,icc_BWT_cnt;
extern vu8 CWTint_Flag, BWTint_Flag;
// 2021.08.24
extern vu8 PARITYint_flag;

vu16  icrcv_len=0;
int thread_running = 50;
pthread_t thread_tick;
#if PARITY_SINGAL_TEST
u8 er_test_flag = 1;
#endif
void SC_Check_Time_xINT(void);
void SC_SetSlot(u8 slot);
unsigned long long GET_1Ms_Tick(void)
{	
	int ret = -1;
	struct  stat    file_stat;
	FILE *fp;
	char buf[64];
	unsigned long long value = 0;
	
	memset(buf,0x00,sizeof(buf));

	ret = lstat("/sys/class/hrtimer/hrtimer", &file_stat);
	if(ret == 0) {	
		fp = fopen("/sys/class/hrtimer/hrtimer", "r");
		if(fp == NULL){
			printf("%s is not exist\n","/sys/class/hrtimer/hrtimer");
			return -1;
		}
		fgets(buf, sizeof(buf), fp);
		value = atoll(buf);
		//printf("\nGet %s ---> %lld\n","/sys/class/hrtimer/hrtimer",value);
		fclose(fp);
		return value;
	}else	return -1;	
}
struct timeval t0, t1;
void *tick_thread()
{
	int tcheck;
	//gettimeofday(&t0, NULL);
	long            ms; // Milliseconds
    time_t          s;  // Seconds
    struct timespec spec;
	icc_CWT_cnt = 0;
	icc_BWT_cnt = 0;
	//for (thread_running = 0; thread_running != 99; )
	for(;;)	{
		if(thread_running == 0){
			gettimeofday(&t1, NULL);
			tcheck = (1000*(t1.tv_sec-t0.tv_sec)) + ((t1.tv_usec-t0.tv_usec)/1000);
			//icc_BWT_cnt = GET_1Ms_Tick();
			//icc_CWT_cnt = icc_BWT_cnt;
			icc_CWT_cnt = tcheck;
			icc_BWT_cnt = tcheck;
			SC_Check_Time_xINT();	
		}else{
			usleep(1);
			continue;
		}
		//printf("[%lld]",icc_BWT_cnt);
		usleep(1);	
	}
}

int Start_Tick_1Ms(void)
{
	long tcheck;
	gettimeofday(&t1, NULL);
	tcheck = (1000*(t1.tv_sec-t0.tv_sec)) + ((t1.tv_usec-t0.tv_usec)/1000);
	icc_CWT_cnt = tcheck;
	icc_BWT_cnt = tcheck;
	SC_Check_Time_xINT();	
	//printf("CWT[%lld],BWT[%lld]\n",icc_CWT_cnt,icc_BWT_cnt);
	return 0;
}

int Init_Tick_Start(void)
{
	gettimeofday(&t0, NULL);
	thread_running = 0;
	return 0;
}

int Init_Tick_Stop(void)
{
	icrcv_len = 0;
	icc_CWT_cnt = 0;
	icc_BWT_cnt = 0;
	thread_running = 50;
	return 0;
}

int GET_Tick_Init(void)
{	
	int ret,len,sam;  
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	sam = open("/sys/class/hrtimer/hrtimer", O_RDWR|O_NDELAY );
	if(sam <0) return -1;
	sprintf(buf,"0");
	len = strlen(buf); 	
	ret = write(sam, buf, len);	
	if(ret < 0)	return -1;	
	ret = close(sam);  
	if(ret < 0)	return -1;	
	return 0;	
}



void Delay_1us(int time)
{
	usleep(time);
}

void Delay_ms(int time)
{
	usleep(time*1000);
}

void SC_Tx_Complete(unsigned char slot)
{
	return;
}

int Uartx_GetKey(int uartCh)
{
	int rxchar = -1;
	int ret = -1;
	rxchar = ApiUartGetRxDataInt(uartCh);
	ret = ApiUartConfigXParityCheck(uartCh);
	if(ret == -2)	{
		printf("PPP\n");
		return -2;
	}	
	return rxchar;
}

void SC_Disable_Rx(void)
{
	ApiUartConfigXDisableRx(Get_UARTSAM_Num());
}

void SC_Enable_Rx(void)
{
	ApiUartConfigXEnableRx(Get_UARTSAM_Num());
}

void SC_Init_Ports(void)
{
	static int thr_id = 0;
	thread_running = 0;
	if(thr_id != 0 )	return;
	thr_id = pthread_create(&thread_tick, NULL, tick_thread, NULL);
	if (thr_id < 0)
	{
		fprintf(stderr,"%s : thread create error : \n",__func__);
	}
}
void SC_Close_Ports(void)
{
	thread_running = 99;
	DevUSAMClose();
	//pthread_join(thread_tick, NULL);
}

void AntiTearing_Clear(void)
{
	
}

void SC_VccSel(unsigned char vlevel)
{
	//printf("\n\rvoltage=%d.", vlevel);
}

void SC_SetPower_Port(u8 slot,u8 vlevel,u8 sta)
{
	if(sta==ON){
		if(vlevel==COLD_3V){
			//DebugUSBMsg(DBG_LV,"\n\r*** SC_SetPower -> 3V");
			SAMPWR_Control_5V(0); //PORT->Set=> SAM POWER OFF
			SAMPWR_Control_3V3(1); //PORT->Reset => SAM POWER ON
			//Uart_Printf("\n\rSAM PWR 3V(slot=%d)\n",slot);
		}else{
			//DebugUSBMsg(DBG_LV,"\n*** SC_SetPower -> 5V");
			SAMPWR_Control_3V3(0); //PORT->Set=> SAM POWER OFF
			SAMPWR_Control_5V(1); //PORT->Reset => SAM POWER ON
			//Uart_Printf("\n\rSAM PWR 5V(slot=%d)\n",slot);
		}
	}
	else
	{
		SAMPWR_Control_3V3(0); //PORT->Set=> SAM POWER OFF
		SAMPWR_Control_5V(0); //PORT->Set=> SAM POWER OFF
		//Uart_Printf("\n\rSAM PWR Off(slot=%d)\n",slot);
	}
}
void SC_SetPower(u8 slot,u8 vlevel,u8 sta)
{
	//SC_Setslot(slot);
#if 0
	//SC_VccSel(vlevel);
	if(sta==ON){
		SC_VccSel(vlevel);
		SAMPWR_Control(1);
	}
	else{
		SAMPWR_Control(0);	
	}
#endif
	SC_SetPower_Port(slot,vlevel,sta);
}

void SC_SetReset(u8 slot,u8 sta)
{
	if(sta == 1){
		SAMRST_Control(1);
	}
	else{
		SAMRST_Control(0);
	}
}

void SC_SetClock(u8 slot,u8 sta)
{
	if(sta == 1){
		SAMCLK_Control(1);
	}
	else{
		SAMCLK_Control(0);
	}
}




u32 SC_Get_FCLK(u8 slot)
{
	return 4000000L;
}


u8 SC_SlotCheck(u8 slot)
{
	unsigned char sta=MI_OK;
	return sta;
}

u8 SC_SlotSta_Set(u8 sta)
{
	return 0;
}

//u8 g_parity = 3; //defined at api_micro.c
void SC_Parity_Set(u8 slot,u8 parity)
{
	//if(parity != g_parity){
		ApiUartConfigXParity(Get_UARTSAM_Num(),parity);
	//	g_parity = parity;
	//}
}


void SC_RxIntControl_Enable(u8 slot)
{

}

void SC_RxIntControl_Disable(u8 slot)
{

}

void Delay_1us_GT(int t)
{
	volatile int i;
	//for(i=0;i<95;i++); //1ms
	
	//for(i=0;i<t/10;i++){
	//	if(SC_GuardTime_Escape()) return;
	//}
	Delay_1us(t);
}


void SC_SetIO(u8 slot, u8 sta)
{
	if(sta == 0){
		ApiUartInitBuffer(Get_UARTSAM_Num());
		//DevUSAMClose();
		sc_speed = 0;
	}
	else{
		//SC_USART_IO_Set();
		SC_SetBaudRate(0, 0x11);
		ApiUartConfigXSetup(Get_UARTSAM_Num());
	}
}

void SC_ParityError_Singnal(void)
{
	return;
}


void SC_Deactivation(u8 slot)
{
	//if(Check_SlotSet(slot)) return; 
	SC_SetReset(slot,0);
	SC_SetIO(slot,0);//2017.01.05
	Delay_1us(10);
	SC_SetClock(slot,0);
	Delay_1us(10);
	SC_SetPower(slot,0,0);
	sc_activate[slot]=0;	
	//printf("\n\rOFF...");
	//sc_slot = 0xff;	
}

u8 SC_Inv_Byte(u8 inv_data)
{
	u8 a,b;
	for(b=0;b<8;b++)
	{
		a<<=1;
		a|=(inv_data&0x01);
		inv_data>>=1;
	}
	a=~a;
	return a;	
}

void SC_SetBaudRate(u8 slot,u8 fidi)
{
	u32 baud,fd;
			
	fd = ISO7816_Get_ETU(fidi);
	baud = SC_Get_FCLK(slot)/fd; 
	g_etu = 1000000L/baud;
	if(sc_speed != baud)
	{
		//printf("s=%d,FiDi=0x%2x,baud = %d,etu=%d",slot,fidi,baud,g_etu);
		ApiUartConfigXBaud(Get_UARTSAM_Num(),baud);
		ApiUartConfigXSetup(Get_UARTSAM_Num());
		sc_speed = baud;
	}
}

void SC_t0_retry(u8 t0r)
{
	//t0_retry = t0r;
}


void SC_SetSlot(u8 slot)
{
	//nothing to do HTY
}

void SC_Clear_RX(u8 slot)
{
	ApiUartInitBuffer(Get_UARTSAM_Num());
}


extern u8 EGT[ISO7816_SLOT];	
u8 SC_Send_Data(u8 slot,u16 tlen, u8 *tbuf)
{
/*	int i;
	for(i=0;i<tlen;i++){
		Uart_Send_Byte(UART_ICC,(s32)tbuf[i]);
	}
*/

	u16 i,wt,j;
	u8 chr;//,c,p;
	u8 retry;
	int ret;
	Init_Tick_Stop();
	SC_Clear_RX(slot);
	//printf("Send Data[%d] => ",sc_speed);
	//for(i=0;i<tlen;i++){
	//	printf("%02x ",tbuf[i]);
	//}
	//printf("\n");
	//guard time 1etu 동안 기다려야 한다.  
	//USART_SmartCardNACKCmd(UARTx, DISABLE);
	//USART_ITConfig(UARTx, USART_IT_ERR, DISABLE);
#if 1	
	if(sc_inv_flag[slot]==0) ApiUartConfigXParity(Get_UARTSAM_Num(),EVEN_PARITY);
	else ApiUartConfigXParity(Get_UARTSAM_Num(),ODD_PARITY);
	
	if(sc_protocol[slot] == T1_PROTOCOL)	ApiUartConfigXStop(Get_UARTSAM_Num(),10);
	else									ApiUartConfigXStop(Get_UARTSAM_Num(),15);
	ApiUartConfigXSetup(Get_UARTSAM_Num());
	//printf("\n\r parity = %d.\n\r", SC_USART_Get_Parity());			
#endif	
//	SC_Disable_Rx();

//2021.07.21 for test
#if PARITY_ERROR_TEST
	if(tlen == 2)	SC_USART_Set_Parity(ODD_PARITY);
#endif
	
#if 1  //send bytes one by one
	for(i=0;i<tlen;i++)
	{
		retry = 0;
		
		if(sc_inv_flag[slot] == 0){
			chr = tbuf[i];
			
		
			
		
		//1705 test I/O 카드랑 장치 한번씩 정보교환 여길 수정해야하는지 확인 필요. 2021.08.13 이종범

		}
		else{
			chr = SC_Inv_Byte(tbuf[i]);
		}
#if 0 //TRX_DISP
		printf("%02x-",chr); //makes delay(gap between bytes)
#endif
sc_tx_retry:	
		//Uart_Send_Byte(slot, (s32)chr);
		//2021.08.23 HTY
		if(sc_protocol[slot] == T1_PROTOCOL)		{
			//ApiPutData(0,tbuf,tlen);
			ApiUartPutChar(Get_UARTSAM_Num(), (s32)chr);
			//tcdrain(0);
			//break;
		}	
		else	ApiUartPutChar(Get_UARTSAM_Num(), (s32)chr);
		
		if((sc_protocol[slot] == T0_PROTOCOL) || (pps_flag[slot]!= 0)){
			//retry check
	  	//1etu 동안 IO가 Low로 떨어지는 지 확인 필요 ... 2021.07.13 HTY
			//Delay_1p1us(g_etu*9);           // |______+__| check at 70%
			//Delay_1p1us(g_etu*8 + g_etu/2); // |__+______| check at 20%
			
			//2021.08.20 Moon
			//마지막 바이트는 가드타임최솟값으로 딜레이를 준다.
			//마지막 바이트에도 같은 시간으로 기다리면 응답을 받지 못함.
			if((EGT[slot] > 0x00) && (EGT[slot] != 0xFF)){
				if(i != (tlen -1)){
					Delay_1us(((g_etu*12) + (g_etu*EGT[slot])));
				}
				else	Delay_1us(g_etu*8 + g_etu*2/3);
			}	
			else	Delay_1us(g_etu*8 + g_etu*2/3); // |___+_____| check at 40%
			//Delay_1p1us(g_etu*8 + g_etu*2/3); // |___+_____| check at 40%
			

#if 0			
#if PARITY_ERROR_TEST
			//port_pin_set_output_level(SC_ERROR_CHK, 0); //to check exact error checking point(timing)
#endif
			if(SC_ParityErrorBit(0) == 0){
				printf("\n\rE=%d.",SC_ParityErrorBit(0)); 	
				Delay_1us(g_etu);
				
				//2021.07.21 for parity error test
#if PARITY_ERROR_TEST
				//SC_USART_Set_Parity(EVEN_PARITY);
				//port_pin_set_output_level(SC_ERROR_CHK, 1);
#endif

	    	if(++retry > T0_RETRY){ //t0_retry){
	    			SC_Clear_RX(slot);
					return 0x01;//MI_ERROR;
				}
	      else{
					goto sc_tx_retry;
				}
			}
			else{
				Delay_1us(g_etu);
#if PARITY_ERROR_TEST
				SC_USART_Set_Parity(EVEN_PARITY);
				port_pin_set_output_level(SC_ERROR_CHK, 1);
#endif
			}
#else
			Delay_1us(g_etu);
#endif	
  	
	  	
		}	//for test	, if(sc_protocol[slot] == T0_PROTOCOL)

  	else if(sc_protocol[slot] == T1_PROTOCOL){

			if(g_etu > 50){
				wt = 12*g_etu;
				//wt = 11*g_etu; //error,TCN049 PPS(FF1111FF)
			}
			else{
				wt = 8*g_etu;
			}
			if(SC_CGT_State(slot) == 0){
				Delay_1us(wt);
			}

			if(i >= (tlen-1)){
				//while(USART_GetFlagStatus(UARTx, USART_FLAG_TC) == RESET);
				//if(sc_protocol[slot] == T1_PROTOCOL)	SC_SetStopBit(slot,5);
				//else									SC_SetStopBit(slot,10);
			}
			else{
				SC_CGT_Wait(slot);
			}

		}	
		//USB_Printf("[%d]",i);	
	}
#else	

	Uart_Send_Bytes(UART_ICC, tbuf, tlen);

#endif
	i = 0;
	while(1) 
	{
		/*if(chk_apptimer(tid)==TRUE) {
			printf("%s : timeout 0\n",__func__);
			ret = 0;
			break;
		}*/
		//i++;
		ret = ApiUartGetRxDataInt(Get_UARTSAM_Num());
		if(ret >= 0){
			i++;
			//printf("%02x\n",ret);
		}
		if(i == tlen){
			//printf("%s : data in [%d]\n",__func__,i);
			break;
		}
	}
	

	sc_rx_retry = 0;
	//if((sc_protocol[slot] == T0_PROTOCOL)&&(pps_flag[slot]==0)) USART_SmartCardNACKCmd(UARTx, ENABLE);

	//SC_Clear_RX(slot);
	
	//SC_Enable_Rx();
	Init_Tick_Start();
	return MI_OK;

}




void SC_ActiveInit(u8 slot,u8 reset)
{

#if PARITY_SINGAL_TEST
	er_test_flag = 1;
#endif
	Init_Tick_Stop();
	if(reset!=WARM){
		if(sc_activate[slot]==1){
			SC_Deactivation(slot);
			sc_activate[slot] = 0x00;
			Delay_ms(50);
		}
	}
	
	SC_SetSlot(slot);

	if(reset!=WARM)
	{
		if(sc_activate[slot])
		{
			SC_Deactivation(slot);
			Delay_ms(10);
			//sc_slot = slot;
		}
		sc_activate[slot]=1;
		
		SC_SetPower(slot,reset,1);
		SC_SetIO(slot,1);//2017.01.05
		//2018.06.07 Giga device CPU의 경우 usart 설정 후 추가로 Delay가 필요함.   
		Delay_1us(400);		//minimum 200/f = 45us (when f=4.5MHz)
		SC_SetClock(slot,1);
		//Delay_1us(500);		//minimum 400/f = 90us
		Delay_1us(800);
		//2021.08.06
		Delay_ms(3);
		SC_Clear_RX(slot);		

		SC_SetReset(slot,1);
//		SC_Clear_RX(slot);		
	}
	else
	{
		printf("\n warm reset!!!!!!!");
		SC_SetReset(slot,0);
		Delay_ms(10);
		SC_SetReset(slot,1);		
	}
	Init_Tick_Start();
}

extern u8 parity_flag; //2021.08.20 Moon, Case 1726: ATR T0 Parity error 
extern uint64_t Get_Tick(void);
u16 SC_Rcv_Len_Get(void)
{
	int i;
	int cnt = 0;
	retry:
	i = Uartx_GetKey(Get_UARTSAM_Num());
	if(i >= 0){
#if PARITY_SINGAL_TEST
		if((er_test_flag == 1) && (icrcv_len == 1) && ((i&0x82) == 0x82)){
			SC_ParityError_Singnal();
			er_test_flag = 0;
		}
		else{
			icrcv_ptr[icrcv_len++] = (u8)i;
			//printf("%d<%2x>",icrcv_len,(u8)i); 
		}
#else
		//icrcv_ptr[icrcv_len++] = (u8)i;
		//if(sc_protocol[SCARD_SLOT] == T1_PROTOCOL)	
		//	printf("get byte = (%x)\n", i);
		//2021.08.13 moon
		if(sc_inv_flag[0]==1)	{
			icrcv_ptr[icrcv_len++] = SC_Inv_Byte(i);
			//printf("get inverse byte = %x \n", SC_Inv_Byte(i));
		}//printf("!!!!! i = %x \n", i);

		else{	
			icrcv_ptr[icrcv_len++] = (u8)i;
		}
		
		//if(BWI[slot]==10)
		//{
		//	SC_Deactivation(slot);
		//}
		//icrcv_ptr[icrcv_len++] = (u8)i;
		//printf("num: %d<%2x>\n",icrcv_len,(u8)i);
#endif
		//printf("%d<%2x>",icrcv_len,(u8)i);
	}
	//2021.07.13
	//Need to check parity error HTY
	else if(i == -2){
		// 2021.08.24 NJS Case 1785
		if(sc_protocol[SCARD_SLOT] == T1_PROTOCOL) {
			PARITYint_flag = 1;
		}
		//2021.08.13 Moon Case 1702: WARM Inverse 인 경우 바이트 읽을시 한번에 못읽는 경우 발견 
		cnt ++;
		//if(cnt < 2) {
		//2021.08.20 Moon, Case 1726: ATR Only T0 Parity error 
		//if((cnt < 2) && (icrcv_len == 0)) {
		if(cnt < 2) {
			if((sc_inv_flag[0] == 0) && icrcv_len > 0)	parity_flag = 1;
			goto retry;
		}	
		//2021.08.20 Moon, Case 1726: ATR T0 Parity error 
		/*if(icrcv_len > 0)	{
			icrcv_len = 0;	
			parity_flag = 1;
			return icrcv_len;
		}*/
		//SC_ParityError_Singnal();
		// 2021.08.24
		if(sc_protocol[SCARD_SLOT] == T0_PROTOCOL) {
			SC_ParityError_Singnal();
		}
		
	}	
	
	return icrcv_len;
}

void SC_Check_Time_xINT(void)
{
	u32 cwt_dummy = 0;
	//if(++icc_CWT_cnt>sc_CWT) 
	if(icc_CWT_cnt>sc_CWT) 
	{
	
		if((icrcv_len!=0)&&!CWTint_Flag)
		{		
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\nCWT_int.\n");
#endif
			printf("\nCWT_timeout[%d].\n",icc_CWT_cnt);
			CWTint_Flag=1;
			
		}
	}
	//if(++icc_BWT_cnt>sc_BWT) 
	if(icc_BWT_cnt>sc_BWT) 	
	{
		if((icrcv_len==0)&& (!BWTint_Flag)) 
		{	u8 slot;
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\nBWT_int[%d].\n",icc_BWT_cnt);
#endif
			printf("\nBWT_int[%ld].\n",icc_BWT_cnt);
			BWTint_Flag=1;
		}		
	}
}

/*
u16 SC_Rcv_Len_Get_ATR(void)
{
	int i;
	
	i = Uartx_GetKey(UART_ICC);
	if(i >= 0){
		icrcv_ptr[icrcv_len++] = (u8)i;
		//printf("<%2x>",(u8)i);
	}

	return icrcv_len;
}*/




