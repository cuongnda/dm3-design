
/* Includes ------------------------------------------------------------------*/

#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <unistd.h>
#include <fcntl.h>
#include <android/log.h>

#include "iso7816.h"
#include "MfErrNo.h"
#include "hw_config.h"
#include "type_def.h"
//2021.07.06
#include "scard.h" //2021.07.06
#include "sysfunc.h"
#include "sysdef.h"
#undef ANDROID_NDK

#ifdef ANDROID_NDK
#include <sys/time.h>
#include <jni.h>
#include <android/log.h>
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, "iso7816-JNI", __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, "iso7816-JNI", __VA_ARGS__)
#endif

u8 *icrcv_ptr;	//2011.06.29 HTY moved to here
#ifdef CONTACT_ICC

#ifdef DISABLE_ALL_DEBUG
#define DEBUG_TEST	0//do not change
#else
#define DEBUG_TEST	1
#endif
//#define DEBUG_TIME


//extern void printf(s8 *fmt,...);


#define EMV

//#define T1_TRY_CNT	10
// 2021.08.24 NJS Case 1785
#define T1_TRY_CNT	3
u8 *icsend_ptr;
//u8 *icrcv_ptr;
vu16 	icsend_len;
//vu16  icrcv_len;
u8 lastsend_block;		//20
u8 ifsd_size_flag=0;	//2010.08.27


//u8act_buff[2];
u8 sc_inv_flag[ISO7816_SLOT]; //2019.11.25
u8 pps_flag[ISO7816_SLOT];    //2019.11.25
u8 sc_protocol[ISO7816_SLOT]; //2019.11.25

u8 IFSC_buff[ISO7816_SLOT];
u8 SPCBI_buff[ISO7816_SLOT];
u8 SPCBR_buff[ISO7816_SLOT];
u8 RPCBI_buff[ISO7816_SLOT];
u8 RPCBR_buff[ISO7816_SLOT];
u8 SSPCB_buff[ISO7816_SLOT];		//26
u8 BWI[ISO7816_SLOT];
u8 CWI[ISO7816_SLOT];	
u8 FIDI[ISO7816_SLOT];
#ifndef STM32F4XX
u8 FIDI_ACT[ISO7816_SLOT];	//2017.01.06
#endif
u8 EGT[ISO7816_SLOT];	//2011.11.09 extra guard time
u8 CGT[ISO7816_SLOT];	//2011.11.09 extra guard time
u8 ATRlength;

u8 ictx_buffer[ISO7816_BUFF_SIZE];
u8 icrx_buffer[ISO7816_BUFF_SIZE];

u8 T1prostart_flag;
u8 T1resynch_flag;
u8 T1abort_flag;
u8 T1sends_flag;
u8 T1sendr_flag;
u8 PCBI_byte;
u8 PCBR_byte;
//2019.11.27
u8 T1_Supportable[ISO7816_SLOT] = {0,};

u8 TAX_flag;       
u8 TBX_flag;       
u8 TCX_flag;
u8 TDX_flag;     
u8 TDi_byte;

u8 T0_flag;
#define T_DEPTH	10 //2019.07.01
u8 TA[T_DEPTH],TB[T_DEPTH],TC[T_DEPTH],TD[T_DEPTH];
u8 TA_flag[T_DEPTH],TB_flag[T_DEPTH],TC_flag[T_DEPTH],TD_flag[T_DEPTH];

u8 ATRover_flag;
u8 parity_retry;

vu8 NATRint_flag;
vu8 RBUFint_flag;
vu8 PARITYint_flag;
vu8 TEMPint_flag;
vu8 ATROVERint_flag;
vu8 DBDEACTint_flag;

vu8 CWTint_Flag; //scard.c에 소문자 CWTint_flag로 선언되면 문제 된다.  
vu8 BWTint_Flag;
//u8 CWTint_Flag;
//u8 BWTint_Flag;

u32 gBWT[ISO7816_SLOT];	
u32 gCWT[ISO7816_SLOT];
vu32 icc_CWT_cnt,icc_BWT_cnt;
u32 sc_CWT,sc_BWT;
//2016.11.14
u8 last_slot=0;

u8 g_cnt = 0;

//u8 ic_ts_flag=0;
extern u8 sc_protocol[ISO7816_SLOT];

u16 ISO7816_SblockRequest(u8 slot,u8 pcb,u8 para);
void Set_BWTX(u8 slot, u8 val);
void SC_Set_CWT(u8 slot,u8 cwi);
void SC_Load_CWT(u8 slot);
void SC_Set_BWT(u8 slot,u8 bwi);
void SC_Load_BWT(u8 slot);
void SC_BWT_CWT_Clear(void);

//2019.09.25
extern void SC_RxIntControl(u8 slot,u8 con);
extern void SC_ParityError_Singnal(void);
extern int Uartx_GetKey(unsigned char up);
extern void Delay_1us(int t);
extern void Delay_ms(int t);
extern void SC_Tx_Complete(unsigned char slot);
extern void DEBUG_Printf(s8 *fmt,...);
extern void DebugUSBMsg(int level, char *fmt, ...);
//2014.04.01
#ifdef EXTEND_ATR_WT
u8 apply_wt_atr=0;
void ISO7816_ATR_CWTBXT_Ext(u8 val)
{
	apply_wt_atr = val;
}
#endif

unsigned long long Get_Tick(void)
{
	return 0;
}

//2014.04.01
#ifdef DEBUG_TIME
u64 exe_tick;
u32 ISO7816_Get_ExeTime(void)
{
	return ((u32)exe_tick);
}
#endif

void Clear_snsts_byte(void)
{
	//icc_BWT_cnt = 0;
    //icc_CWT_cnt = 0;
	//CWTint_Flag=0;
	//BWTint_Flag=0;
	
  SC_BWT_CWT_Clear();
	NATRint_flag=0;
	RBUFint_flag=0;
	PARITYint_flag=0;
	TEMPint_flag=0;
	ATROVERint_flag=0;
	DBDEACTint_flag=0;
}

u32 ISO7816_Get_ETU(u8 FiDi)////2007.12.04
{
	u32 f,d;
	switch(FiDi>>4)
	{
		case 0 :
		case 1 : f = 372; break;
		case 2 : f = 558; break;
		case 3 : f = 744; break;
		case 4 : f = 1116; break;
		case 5 : f = 1488; break;
		case 6 : f = 1860; break;
		case 9 : f = 512; break;
		case 10 : f = 768; break;
		case 11 : f = 1024; break;
		case 12 : f = 1536; break;
		case 13 : f = 2048; break;
		default : f = 372; break;
	}
	switch((FiDi)&0x0f)
	{
		case 1 : d = 1; break;
		case 2 : d = 2; break;
		case 3 : d = 4; break;
		case 4 : d = 8; break;
		case 5 : d = 16; break;
		case 6 : d = 32; break;
		case 7 : d = 64; break;	//2011.10.24 add
		case 8 : d = 12; break;
		case 9 : d = 20; break;
		default : d = 1; break;
	}
	
	return(f/d);
}


//2011.11.10 HTY add
u16 rx_len_old;
u16 ISO7816_Rcv_Len_Get(void)
{
	
	int len;
	len = SC_Rcv_Len_Get();
	if(len != rx_len_old){
		
		rx_len_old = len;
		SC_BWT_CWT_Clear();
		//if(len == 5)printf("CWTint_Flag[%d]\n",CWTint_Flag);
		//2012.07.24
		/*if((CWTint_Flag==0) && (BWTint_Flag==0)){
			SC_BWT_CWT_Clear();
		}*/
		//DebugUSBMsg(DBG_LV,".");
		//printf("Get len[%d]\n",len);
	}
	
	return len;
}

void TxxByteInit(void)
{
	u8 ch;
	//2011.08.04 HTY
	//for(ch=0;ch<10;ch++){
	for(ch=0;ch<T_DEPTH;ch++){ //2019.07.01
		TA[ch]=TB[ch]=TC[ch]=TD[ch]=0x00;
		TA_flag[ch]=TB_flag[ch]=TC_flag[ch]=TD_flag[ch]=0;
	}
	T0_flag = 0;
}

//2011.11.18
#if 0
//CRC(HDLC standard ISO/IEC 13239(2002) Annex A)
u16 ISO_crc16(u8 octet, u16 crc)
{
	int i;
	for(i=8;i;i--)
	{
		if(crc&0x0001)
		{
			crc >>=1;
			if(octet & 0x01)
				crc |= 0x8000;
			crc = crc ^ 0x8408;
			octet >>=1;
		}
		else
		{
			crc >>= 1;
			if(octet & 0x01)
				crc |=0x8000;
			octet >>=1;
		}
	}
	return crc;
}
u16 ISO_crc(u16 size, u8 *packet)
{
	int i;
	u16 crc;
	
	crc = (~packet[1] <<8) | (~packet[0] & 0xff);
	
	for(i=2 ; i<size; i++)
		crc = crc16(packet[i],crc);
	
	crc=crc16(0x00,crc);
	crc=crc16(0x00,crc);
	crc=~crc;
	crc=crc>>8 | crc<<8;
	
	return crc;
}
u16 ISO7816_CalBcc2(u8 *ptr,u16 len)
{
	return ISO_crc(len, ptr);

}
#endif
//////////////////////////////////////////////////


u8 ISO7816_CalBcc(u8 *ptr,u16 len)
{
	u8	bcc=0;
	u16		i;

	for(i=0; i<len; i++)	bcc ^= *ptr++;
	return bcc;
}
//2021.08.27 Moon
void ISO7816_Get_FiDi(u32 FiDi,u32* F,u32* D)
{
	u32 f,d;
	switch(FiDi>>4)
	{
		case 0 :
		case 1 : f = 372; break;
		case 2 : 
f = 558; break;
		case 3 : f = 744; break;
		case 4 : f = 1116; break;
		case 5 : f = 1488; break;
		case 6 : f = 1860; break;
		case 9 : f = 512; break;
		case 10 : f = 768; break;
		case 11 : f = 1024; break;
		case 12 : f = 1536; break;
		case 13 : f = 2048; break;
		default : f = 372; break;
	}
	switch((FiDi)&0x0f)
	{
		case 1 : 
d = 1; break;
		case 2 : d = 2; break;
		case 3 : d = 4; break;
		case 4 : d = 8; break;
		case 5 : d = 16; break;
		case 6 : d = 32; break;
		case 7 : d = 64; break;	//2011.10.24 add
		case 8 : d = 12; break;
		case 9 : d = 20; break;
		default : d = 1; break;
	}
	*F = f;
	*D = d;
}
extern u16 g_etu; //2021.08.26 Moon
/*--------------------------------------------------------------------------*/
void WTXmultiply(u8 slot,u8 mx)		// BWT extension after WTX request
{
	u32 WTX = 0;
	u32 bwt = 0;
	u32 etu_d = 0;
	u32 etu_f = 0;

	if(mx == 0) mx = 1; //not extend WTX
	//SC_Set_BWT(slot,BWI[slot]+ mx); 2021.08.27 Moon test delete
	//2021.08.27 Moon test	
	bwt=1;
	ISO7816_Get_FiDi(FIDI[slot],&etu_f,&etu_d);
	for(int i=0;i<BWI[slot];i++) bwt*=2L;
	bwt = ((bwt * 960 * (372*etu_d)/etu_f) + 11); //BWT Value
	WTX = bwt+(1500*etu_d); //WTX = BWT + (960 ~ 4800)*D + BWT Margin 
	//printf("WTX VAL[%d], Extend WTX[%d]etu\n",WTX,WTX*mx);
	WTX = WTX*mx;
	
	sc_BWT = ((WTX+(960*mx*etu_d))*g_etu)/1000; //2021.08.27 extend WTX

	//sc_BWT += 50; //2021.08.27 Moon Add Margin
	gBWT[slot]= sc_BWT;
	//printf("WTX VAL[%d]ms  D[%d], M[%d]\n",gBWT[slot],FIDI[slot]&0x0F,mx);
}	
/*------------------------------------------------------------------------*/
/*------------------------------------------------------------------------*/
void ISO7816_PcbByteInit(u8 slot)
{		
	SPCBI_buff[slot] = 0x00;// (0,0) for start sequence
	RPCBI_buff[slot] = 0x40;// (1,0) for start sequence
	SPCBR_buff[slot] = 0x80;// 
	
	T1prostart_flag = 1;
	T1abort_flag = 0;
}
/*--------------------------------------------------------------------------*/
u16 ISO7816_ProtocolCheck(u8 slot)// return : TCK existance
{
	//u8 c;
	//DebugUSBMsg(DBG_LV,"\nProtocolCheck->");
	
	//2011.11.18
	/*for(c=0;c<5;c++){
		//if(TD_flag[c])	DebugUSBMsg(DBG_LV,",TD%d=0x%2x",c+1,TD[c]);
		if(TD_flag[c]){
			if((TD[c] & 0x0F)==0x0F){
				SC_Protocol_Set(slot, T0_PROTOCOL);
				return 0;	
			}	
		}
	}*/
	
	if(TD_flag[0] == 0){		//TD1
		SC_Protocol_Set(slot, T0_PROTOCOL);
		return 0;	//TCK not exist
	}
	else
	{		
		if((TD[0] & 0x0f) == 1) SC_Protocol_Set(slot, T1_PROTOCOL);				
		else	SC_Protocol_Set(slot, T0_PROTOCOL);
	}

// TCK exist ? (belong to T=1 or 14)
	/*if(TD_flag[4] && (TD[4] & 0x0f))	//TD5
		return 1;
	if(TD_flag[3] && (TD[3] & 0x0f))	//TD4
		return 1;
	if(TD_flag[0] && (TD[0] & 0x0f))	//TD3
		return 1;
	*/
	if(TD_flag[1] && (TD[1] & 0x0f)){	//TD2
		/*
		//2010.06.22 
		//TD1에서 T=0일때도 이게 맞는가???  2011.08.05 HTY
		if((TD[1] & 0x0f)==1)		SC_Protocol_Set(slot, T1_PROTOCOL);
		//2019.11.25
		else										SC_Protocol_Set(slot, T0_PROTOCOL);
		//2019.11.25 delete
		//return 1;		//TCK exist
		*/
		
		//2019.11.27  
		if(TD_flag[1] && (TD[1] & 0x0f)){	//TD2
			if((TD[1] & 0x0f)==1){
				T1_Supportable[slot] = 1;
				//DebugUSBMsg(DBG_LV,"\nT1 Supportable1.");	
			}
			return 1;		//TCK exist
		}

	}
	//2019.11.25 
	/*if(TD_flag[2] && (TD[2] & 0x0f)){	//TD2
		if((TD[2] & 0x0f)==1)		SC_Protocol_Set(slot, T1_PROTOCOL);
		else										SC_Protocol_Set(slot, T0_PROTOCOL);
		return 1;		//TCK exist
	}*/
	//2019.11.27  
	if(TD_flag[2] && (TD[2] & 0x0f)){	//TD2
		if((TD[2] & 0x0f)==1){
			T1_Supportable[slot] = 1;
			//DebugUSBMsg(DBG_LV,"\nT1 Supportable2.");	
		}
		return 1;		//TCK exist
	}

	if(TD_flag[0] && (TD[0] & 0x0f)){	//TD1
		return 1;		//TCK exist
	}
	else 	return 0;	//TCK not exist
}

//2011.11.10
void Set_ATR_Cwt_Bwt(u8 step)
{
	//2011.11.18
	/*if(step == 0)	sc_BWT = 15;		//when receive TS is 8ms for 4.5MHz, 11ms for 3,57MHz
	else			sc_BWT = 1100;		//from second byte(T1)
	sc_CWT = 1100;*/

//2014.04.01

#ifndef EXTEND_ATR_WT
	if(step == 0)	sc_BWT = 30;		//when receive TS is 8ms for 4.5MHz, 11ms for 3,57MHz
	else			sc_BWT = 1100;		//from second byte(T1)
	sc_CWT = 1100;
#else
	sc_CWT = 1100;
	if(step == 0){		
		if(apply_wt_atr){
			sc_BWT = gBWT[0];
			sc_CWT = gCWT[0];
		}
		else
			sc_BWT = 15;		//when receive TS is 8ms for 4.5MHz, 11ms for 3,57MHz
	}
	else{
		sc_BWT = 1100;		//from second byte(T1)
		apply_wt_atr=0;
	}
#endif  
}

u16 ISO7816_AtrCheck(u8 slot,u8 reset);
extern vu16  icrcv_len;
typedef struct 
{
	u8 dummy;
	u8 len_h;
	u8 len_l;
	u8 cmd;
	u8 buf[2*1024];	
}st_usb_main;


#ifdef ANDROID_NDK
void SC_CheckTime_Rx(void)
{
	SC_Check_Time();
	SC_Receive(slot);
}
#endif

extern st_usb_main  usb_main_st;
u8 parity_flag = 0; //2021.08.20 Moon, Case 1726: ATR T0 Parity error 
//u16 ISO7816_Activation(u8 slot,u8 reset,u8 *atr_buf,u16 *len)
u16 ISO7816_Activation(u8 slot,u8 reset,u8 *atr_buf,u16 *len)
{
	u8	historical,step,chklen,ch;
	u8	wait_flag,tck_flag,TDi;

	//2021.08.20 Moon
	unsigned int stime = 0;
	unsigned int etime = 0;
	//u16 check_len = 0;
	//unsigned int check_time[4];
	//u8 cnt = 0;
	//u8 i = 0;

	//u8 t1_pos=0;

	//2012.04.17
	AntiTearing_Clear();
	
// Activation
  SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = T0_PROTOCOL;
	TxxByteInit();
	//sc_inv_flag[slot]=0;
	SC_Invrese_Flag(slot, 0);
	FIDI[slot] = 0x11;//2009.02.18
	
	CGT[slot] = 0;//2011.11.09
	EGT[slot] = 0;//2011.11.12
	
	//2011.08.04 HTY
	TDi = 0x00;
	//pn = 1;
	
	//2020.03.11 
	last_slot = slot;

//2010.11.23
Re_Atr:
	ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
	//SC_Parity_Set(slot,NON_PARITY);
	//2021,07.14
	SC_Parity_Set(slot,EVEN_PARITY);
	
	icrcv_ptr = atr_buf;
	//pps_flag[slot] = 0;
	SC_PPS_Flag(slot,0);
	//t0_retry = 3;
	SC_t0_retry(3);
	
	BWI[slot] = 14;		
  //CWI[slot] = 10;	
  //2011.04.25 HTY default CWI is 13, CWT = (11+2^(cwi))etu, min CWT=12etu
	CWI[slot] = 13;
    //2011.11.13 meanless because set at the end of ISO7816_AtrCheck()	
    //SC_Set_CWT(slot,CWI[slot]);
	//SC_Set_BWT(slot,BWI[slot]);
	
	//SC_RxIntControl_Enable(slot);
	//SC_ActiveInit(slot,reset);

	//2018.06.07
	//SC_RxIntControl(slot,DISABLE);
	//SC_ActiveInit(slot,reset);
	//SC_RxIntControl_Enable(slot);
		
	//2019.09.25
#ifdef STM32F4XX
	SC_RxIntControl(slot,DISABLE);
	SC_ActiveInit(slot,reset);
	SC_RxIntControl_Enable(slot);
#else //especially, ABCM_DC Datacard need it
	SC_RxIntControl_Enable(slot);
	SC_ActiveInit(slot,reset);
#endif	
	//sc_BWT = 100;
	Set_ATR_Cwt_Bwt(0);
	sc_BWT += 100; //2023.01.04 Moon test in Dualface
	
	Clear_snsts_byte();
	//icrcv_len = 0;
	SC_Rcv_Len_Clr();
	//2011.11.12 delete
	//ic_ts_flag = 1;//SC_TS_Flag(1);
//For ATR test 2012.05.14
/**
atr_buf[0]=0x3B;
atr_buf[1]=0x12;
atr_buf[2]=0x96;
atr_buf[3]=0x50;
atr_buf[4]=0x21;
icrcv_len = 5;
DebugUSBMsg(DBG_LV,"\n ATR TEST len=5 "); 
DebugUSBMsg(DBG_LV,"\nATR:%02X%02X%02X%02X%02X ",atr_buf[0],atr_buf[1],atr_buf[2],atr_buf[3],atr_buf[4]); 
*/
	//printf("1111111111111\n");
	while((ISO7816_Rcv_Len_Get()==0) && !BWTint_Flag){
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
	}
	//2021.08.20 Moon
	//check_len = rx_len_old;
	stime = Get_Tick();
	//printf("22222222222\n");
//DebugUSBMsg(DBG_LV,"\n ISO7816_Rcv_Len_Get In ");		Delay_ms(200);
	
	if(ISO7816_Rcv_Len_Get()==0) 
	{
		//DebugUSBMsg(DBG_LV,"\n ATR No Response "); 
		return MI_ERROR;
	}
	//printf("3333333333333\n");
	//icc_BWT_cnt = icc_CWT_cnt = 0;
	SC_BWT_CWT_Clear();	
	//SC_Set_BWT_Atr(slot,BWI[slot]);
	//sc_BWT = 1100;
	//Set_ATR_Cwt_Bwt(1);
	//2014.04.04
#ifdef EXTEND_ATR_WT	
	Set_ATR_Cwt_Bwt(0);	
#else
	Set_ATR_Cwt_Bwt(1);
#endif
	if(atr_buf[0]==0x03)
	{
		SC_Parity_Set(slot,ODD_PARITY);
		atr_buf[0]=0x3f;
		//sc_inv_flag[slot]=1;
		SC_Invrese_Flag(slot, 1);
	}
	else{
		//2021.07.14  MICROCHIP PIC은 paity 설정시 serial driver off on 시에 통신 끊긴다. 
		SC_Parity_Set(slot,EVEN_PARITY);
	}
	
	ch = atr_buf[0];
	if((ch != 0x3b) && (ch != 0x3f))
	{
		*len = ISO7816_Rcv_Len_Get();
		//if(atr_buf[0] == 0x3D || atr_buf[0] == 0x43){
			//2021.08.17 이종범 진행 중
		//	SC_Deactivation(slot);
		//	goto Re_Atr;
		//}
		//DebugUSBMsg(DBG_LV,"\n Not ATR[0x%2x]",ch); 
		
		//2021.07.14 add for test
		//DebugUSBMsg("[[[TS=%02x]]].",atr_buf[0]);
		
		//2010.11.23
		//Delay_ms(30);
#ifndef OTHER_MCU //2021.07.14 인터럽트 사용안할 때는 없어야 함. 
		//2012.07.24
		Delay_1us_GT(30000);
		DebugUSBMsg(DBG_LV,"1"); 
#endif
		
		FIDI[slot] += 1;
		//if(FIDI[slot] < 0x14){
		if((FIDI[slot] < 0x14) && (reset != WARM)){//2021.08.20 Moon CASE 1716 Warm test
			//DebugUSBMsg(DBG_LV,"\n Re ATR FiDi[0x%2x]",FIDI[slot]); 
			goto Re_Atr;
		}		
		
		return MI_ERROR;
	}

// Other bytes
	chklen = 1;
	step = 1;
	wait_flag = 0;	
	T0_flag = 0; //2021.08.20 Moon, Warm Reset Retry
	//cnt = 0;
//DebugUSBMsg(DBG_LV,"\nSC_BWTint_Flag=%d",SC_BWTint_Flag());		
//DebugUSBMsg(DBG_LV,"\nSC_CWTint_Flag=%d",SC_CWTint_Flag());		Delay_ms(100);

	while(!BWTint_Flag && !ATROVERint_flag && !PARITYint_flag &&!CWTint_Flag)
	{
		//printf("!!!!!!!!!!PARITYint_flag[%d]",PARITYint_flag);
	//	printf("BWTint_Flag[%d],ATROVERint_flag[%d],PARITYint_flag[%d],CWTint_Flag[%d]\n",BWTint_Flag,ATROVERint_flag,PARITYint_flag,CWTint_Flag);
//DebugUSBMsg(DBG_LV,"\nATRlength=%d",ATRlength);
	//printf("\nATRlength=%d",ATRlength);		
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif

/*#ifdef OTHER_MCU //2021.07.14
		ISO7816_Rcv_Len_Get();
		Delay_3us(10);
		DebugUSBMsg(DBG_LV,"2"); 
#endif*/

		if(wait_flag)
		{		
			ATRover_flag = 0;
			//2011.08.05 HTY add
#ifndef OTHER_MCU //2021.07.14 인터럽트 사용안할 때는 없어야 함. 
			//2012.07.24
			Delay_1us_GT(3000);
#endif		
			Delay_1us_GT(3000);//2021.08.20 Moon ATR 오버된 바이트 받을 시 필요함.
			if(ISO7816_Rcv_Len_Get() > ATRlength)// ATR over
			{
				//DebugUSBMsg(DBG_LV,"ATR over1===");
				
			
				if(tck_flag)
				{		
					ch = 0;
					chklen = 1;
					while(chklen != ATRlength)	ch ^= atr_buf[chklen++];// TCK verify		
					if(ch) 
					{
//						DebugUSBMsg(DBG_LV,"\n TCK error1 ===");
						//2021.08.18 revive
						return MI_ERROR;	// TCK error
						//return MI_OK;	
					}
				}
				//2021.08.18
				else{
#if 0
					//2021.08.20 Moon, Case 1707: DTS02
					if(((atr_buf[1] == 0x20) || (atr_buf[1] == 0x40)) && (reset != WARM)){
						reset = WARM;
						goto Re_Atr;
						
					}
#endif
			
					return MI_ERROR;
				}
				
				/* *len = ISO7816_Rcv_Len_Get();
				SC_Rcv_Len_Clr();
				ISO7816_AtrCheck(slot,0x00);
				ch = ISO7816_ProtocolCheck(slot);
				if(SC_Protocol_Get(slot) == T0_PROTOCOL){
					DebugUSBMsg(DBG_LV,"\n T0_Protocol");
				}
				else{
					DebugUSBMsg(DBG_LV,"\n T1_Protocol");
				}
				////////////////////////////////////////////
				
				ATRover_flag = 1;
				*len = ATRlength;
				return MI_OK;*/
			}
			else
			{		
				while(ISO7816_Rcv_Len_Get() < ATRlength)
				{		
#ifdef ANDROID_NDK
					SC_CheckTime_Rx();
#endif				

/*#ifdef OTHER_MCU //2021.07.14
				ISO7816_Rcv_Len_Get();
#endif*/

					//DebugUSBMsg(DBG_LV,"\n BWTint or CWTint_Flag..");
					if(BWTint_Flag||CWTint_Flag) return ERROR;// in case of missing byte				
				}
				//Delay_ms(50);	// double check time					
				//Delay_ms(3);	//2011.08.04 double check time		
#ifndef OTHER_MCU //2021.07.14 인터럽트 사용안할 때는 없어야 함. 
				//2012.07.24
				Delay_1us_GT(3000);
				DebugUSBMsg(DBG_LV,"3"); 
#endif
				//2021.08.18 add
				//Delay_ms(2); 
					
				if(ISO7816_Rcv_Len_Get() == ATRlength)// ATR all received
				{
					//2021.08.20 Moon, Case 1704: ATR timing exceeded
					etime = Get_Tick();
					if(etime-stime > 1700){
						printf("Time Out[%d]\n",etime-stime);
						SC_Deactivation(slot);
						return MI_ERROR;
					}

					//2021.08.20 Moon, Case 1726: ATR T0 Parity error 
					if(parity_flag == 1){
						parity_flag = 0;
						SC_Deactivation(slot);
						return MI_ERROR;
					}

					
#if 0
					//2021.08.20 Moon, Case about warm reset: TB1의 마지막 비트는 항상 0 이다. 
					if(((atr_buf[0] == 0x3f)|| (atr_buf[0] == 0x3b)) && (TB_flag[0] == 1) && ((TB[0] & 0x01) == 0x01) && (reset != WARM)){
					//if((TA_flag[0]+TB_flag[0]+TC_flag[0]+TD_flag[0]+2) == chklen){
						reset = WARM;
						goto Re_Atr;
					//}
					}else if((atr_buf[1] == 0x40) && (reset != WARM)){
						reset = WARM;
						goto Re_Atr;
					}else if(atr_buf[1] == 0x20){//TS T0 TB
					//2021.08.20 Moon, Case 1704: ATR timing exceeded
						if(etime-stime > 955){ //Case 1704 DTS08,DTS09 T0만 딜레이 10320etu(959ms)
							printf("Time Out[%d]\n",etime-stime);
							//cnt = 0;
							SC_Deactivation(slot);
							return MI_ERROR;
						}					
					}
					//2021.08.25 이종범, Case 1707 TA Test (DTS05, DTS08, DTS16) 이외에도 다른 1707 test가 왜 통과하는지 확인 필요
					
					if(((TA[0] == 0xD6) || (TA[2] == 0xFF) || (TA[2] == 0x0F)) && (reset != WARM)){
						reset = WARM;
						goto Re_Atr;
						
					}
					else if(((TA[0] == 0xD6) || (TA[2] == 0xFF) || (TA[2] == 0x0F)) && (reset == WARM)){
						SC_Deactivation(slot);
						return MI_ERROR;
					}//Case 1707 TC Test(DTS10, DTS12, DTS26, DTS27, DTS30) CASE 1710(DTS20)과 중첩되기 때문에 DTS31 제외
					if((TC[1] > 0x0A) || (TC[2] == 0xFF) || (TC[1] == 0X01)  && (reset != WARM)){

						reset = WARM;
						goto Re_Atr;
					}
					else if((TC[1] > 0x0A) || (TC[2] == 0xFF) || (TC[1] == 0X01) && (reset == WARM)){
						SC_Deactivation(slot);
						return MI_ERROR;
					}
					/// Case 1707 TD Test(DTS06, DTS14, DTS22, DTS23) 21번 TD[2] = 0X?0 시 ATR에러는 추가 확인 필요
					if(((TD[0] == 0xE) || (TD[0] == 0x04) || (TD[1] == 0xE) || (TD[1] == 0xF) ) && (reset != WARM)){
						reset = WARM;
						goto Re_Atr;
						
					}
					else if(((TD[0] == 0xE) || (TD[0] == 0x04) || (TD[1] == 0xE) || (TD[1] == 0xF) ) && (reset == WARM)) {
						SC_Deactivation(slot);
						return MI_ERROR;
					}
#endif
//DebugUSBMsg(DBG_LV,"\nATR rx end..");		Delay_ms(200);	
					if(tck_flag)
					{		
//DebugUSBMsg(DBG_LV,"\ntck_flag..");		Delay_ms(200);	
						ch = 0;
						chklen = 1;
				
						while(chklen != ATRlength)	ch ^= atr_buf[chklen++];// TCK verify					
						if(ch) 
						{
//							DebugUSBMsg(DBG_LV,"\n TCK error2 ===");
							//2021.08.18 revive
							return MI_ERROR;	// TCK error
							//return MI_OK;	
						}
					}
				}
				else{
					ATRover_flag = 1;	// ATR over
//					DebugUSBMsg(DBG_LV,"ATR over2===");
					//2021.08.18
					return MI_ERROR;	
				}
				
                /* *len = ISO7816_Rcv_Len_Get();
                SC_Rcv_Len_Clr();
                if(ATRover_flag) *len = ATRlength;// *len = ISO7816_Rcv_Len_Get();//2009.06.29
				DebugUSBMsg(DBG_LV,"\nATR len=%d \n",*len);			//Delay_ms(200);			
				return MI_OK;*/
			}
            *len = ISO7816_Rcv_Len_Get();
            SC_Rcv_Len_Clr();
            if(ATRover_flag) *len = ATRlength;//*len = ISO7816_Rcv_Len_Get();//2009.06.29
//			DebugUSBMsg(DBG_LV,"\nATR len=%d \n",*len);			//Delay_ms(200);	
			//for infineon test
			//*len = 3;
			//atr_buf[0] = 0x3B; atr_buf[1]=0x10; atr_buf[2]=0x96;
			//2012.05.14 for test
			//memcpy(tatr_buf,atr_buf,ATRlength);
			
			return MI_OK;
		}
			
		else if(ISO7816_Rcv_Len_Get() != chklen)	// received other byte ?
		{
			//2021.08.20 Moon
			//etime = Get_Tick();
			//check_time[chklen-1] = etime-stime;
			//printf("@@@@@@@@@@@Data[%02x],chklen[%d],time[%d]\n",atr_buf[chklen],chklen,check_time[chklen-1]);
			//stime = Get_Tick();
			if(!T0_flag)
			{		
				T0_flag = 1;
				//2011.11.12 delete	
				//ic_ts_flag = 0;	//SC_TS_Flag(0);
				TDi_byte = atr_buf[chklen] & 0xf0;
				TAX_flag = (TDi_byte>>4)&0x01;
				TBX_flag = (TDi_byte>>5)&0x01;
				TCX_flag = (TDi_byte>>6)&0x01;
				TDX_flag = (TDi_byte>>7)&0x01;
				historical = atr_buf[chklen++] & 0x0f;
				ATRlength = historical+2;				
				
				//DebugUSBMsg(DBG_LV,"\n Step=%d,ATRlength=%d,T0=%2x  ",step,ATRlength,TDi_byte);
				if(TDi_byte	== 0)
				{		
					SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = T0_PROTOCOL;
					wait_flag = 1;
				}
			}
				
			else
			{		
				if(TAX_flag)
				{
					TA_flag[step-1]=1;
					TA[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TA%d=%2x",step,TA[step-1]);
					//printf("\n TA%d=%2x\n",step,TA[step-1]);
					TAX_flag = 0;
					TDi_byte&= ~(1<<4);
					ATRlength++;
					chklen++;
				}
				else if(TBX_flag)
				{		
					TB_flag[step-1]=1;
					TB[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TB%d=%2x",step,TB[step-1]);
					TBX_flag = 0;
					TDi_byte&= ~(1<<5);
					ATRlength++;
					chklen++;
				}
				else if(TCX_flag)
				{		
					TC_flag[step-1]=1;
					TC[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TC%d=%2x",step,TC[step-1]);
					TCX_flag = 0;
					TDi_byte&= ~(1<<6);
					ATRlength++;
					chklen++;		
				}
				else if(TDX_flag)
				{		
					TD_flag[step-1]=1;
					TD[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TD%d=%2x",step,TD[step-1]);
					TDX_flag = 0;
					TDi_byte&= ~(1<<7);
					TDi = atr_buf[chklen]; 
					ATRlength++;
					
					
					TDi_byte = atr_buf[chklen] & 0xf0;	//TDi&0xF0
					TAX_flag = (TDi_byte>>4)&0x01;
					TBX_flag = (TDi_byte>>5)&0x01;
					TCX_flag = (TDi_byte>>6)&0x01;
					TDX_flag = (TDi_byte>>7)&0x01;
					chklen++;		
					step++;
					
					//if((TDi & 0x0F) != 0x00) pn += 1;

				}			
				//printf("@#@#@#@#@#[%x]\n",TDi_byte);
				//DebugUSBMsg(DBG_LV,"\n Step=%d,ATRlength=%d,TD%d=0x%2x ",step,ATRlength,step-1,TDi);
				if(TDi_byte	== 0)
				{	
					ch = ISO7816_ProtocolCheck(slot);
					//DebugUSBMsg(DBG_LV,"\n TXX=0,pn=%d,T=%d ",step-1,ch);
					//printf("\n TXX=0,pn=%d,T=%d \n",step-1,ch);
					//2011.08.05
					if((TDi & 0x0F) != 0x00)
					//if(ISO7816_ProtocolCheck(slot))						
					{		
						ATRlength++;	// +TCK
						tck_flag = 1;		
//						DebugUSBMsg(DBG_LV,"\n TCK exist");		
					}
					else 
					{
						tck_flag = 0;
						//DebugUSBMsg(DBG_LV,"\n T0 Protocol ");
					}
					wait_flag = 1;
				}				
			}
		}
	}
	
	*len = ISO7816_Rcv_Len_Get();
	//DebugUSBMsg(DBG_LV,"\n BWT,ATR over,parity Error "); 
	return MI_ERROR;	// BWT,ATR over,parity
}

#if 0		//testing
//u16 ISO7816_Activation(u8 slot,u8 reset,u8 *atr_buf,u16 *len)
u16 ISO7816_ATR_Test(u8 slot,u8 *atr_buf,u16 Atr_len)
{
#ifdef COMPACT_MEM

	return 0;
#else
	u8	historical,step,chklen,ch;
	u8	wait_flag,tck_flag,TDi;

// Activation
    SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = T0_PROTOCOL;
	TxxByteInit();
	SC_Invrese_Flag(slot, 0);
	FIDI[slot] = 0x11;//2009.02.18
	CGT[slot] = 0;//2011.11.09
	EGT[slot] = 0;//2011.11.12
	
	//2011.08.04 HTY
	TDi = 0x00;
	tck_flag = 0;
		
	ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
	SC_Parity_Set(slot,NON_PARITY);
	
	icrcv_ptr = atr_buf;
	SC_PPS_Flag(slot,0);
	SC_t0_retry(3);
	
	BWI[slot] = 14;		
    //CWI[slot] = 10;	
    //2011.04.25 HTY default CWI is 13, CWT = (11+2^(cwi))etu, min CWT=12etu
    CWI[slot] = 13;	

	//SC_Set_CWT(slot,CWI[slot]);
	//SC_Set_BWT(slot,BWI[slot]);
	
// TS byte
//DebugUSBMsg(DBG_LV,"\n SC_RxIntControl_Enable In ");		Delay_ms(200);
	//iso7816_
	SC_RxIntControl_Enable(slot);
	
	//SC_ActiveInit(slot,reset);
	//SC_Set_BWT_Atr(slot,0);
	Set_ATR_Cwt_Bwt(0);
	
	Clear_snsts_byte();
	SC_Rcv_Len_Clr();
	//SC_TS_Flag(1);
	
	SC_BWT_CWT_Clear();	
	//SC_Set_BWT_Atr(slot,BWI[slot]);
	Set_ATR_Cwt_Bwt(1);
	if(atr_buf[0]==0x03)
	{
		SC_Parity_Set(slot,ODD_PARITY);
		atr_buf[0]=0x3f;
		SC_Invrese_Flag(slot, 1);
	}
	else SC_Parity_Set(slot,EVEN_PARITY);
		
	//DebugUSBMsg(DBG_LV,"\n%2X ",atr_buf[icrcv_len]); 
	
	ch = atr_buf[0];	
	if((ch != 0x3b) && (ch != 0x3f))
	{
		//*len = Atr_len;
		#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n Not ATR[0x%2x]",ch); 
		#endif
		//2010.11.23
		FIDI[slot] += 1;
		#if DEBUG_TEST
		if(FIDI[slot] < 0x14){
			DebugUSBMsg(DBG_LV,"\n Re ATR FiDi[0x%2x]",FIDI[slot]); 
			//goto Re_Atr;
		}		
		#endif
		return MI_ERROR;
	}

// Other bytes
	chklen = 1;
	step = 1;
	wait_flag = 0;

	
//DebugUSBMsg(DBG_LV,"\nSC_BWTint_Flag=%d",SC_BWTint_Flag());		
//DebugUSBMsg(DBG_LV,"\nSC_CWTint_Flag=%d",SC_CWTint_Flag());		Delay_ms(100);

	//while(!SC_BWTint_Flag() && !ATROVERint_flag && !PARITYint_flag &&!SC_CWTint_Flag())
	//2011.11.09
	while(!BWTint_Flag && !ATROVERint_flag && !PARITYint_flag &&!CWTint_Flag)
	{
//DebugUSBMsg(DBG_LV,"\nATRlength=%d",ATRlength);			
		if(wait_flag)
		{		
			ATRover_flag = 0;
			
			if(Atr_len > ATRlength)// ATR over
			{
				#if DEBUG_TEST
				DebugUSBMsg(DBG_LV,"\n ATR over1===============");		
				#endif
				if(tck_flag)
				{		
					ch = 0;
					chklen = 1;
					while(chklen != ATRlength)	ch ^= atr_buf[chklen++];// TCK verify			
					#if DEBUG_TEST		
					if(ch) 
					{
						DebugUSBMsg(DBG_LV,"\n TCK error1 ============= ");
					}
					#endif
				}

				ISO7816_AtrCheck(slot,0x00);
				ch = ISO7816_ProtocolCheck(slot);

				if(SC_Protocol_Get(slot) == T0_PROTOCOL){
					ch = 0;
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n T=0.");
					#endif
				}
				else{
					ch = 1;
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n T=1.");
					#endif
				}
				ATRover_flag = 1;
				//*len = ATRlength;//*len = icrcv_len;//2009.06.29
				return ch;
			}
			else
			{		
				if(Atr_len == ATRlength)// ATR all received
				{
DebugUSBMsg(DBG_LV,"\nATR rx end..");		//Delay_ms(200);	
					if(tck_flag)
					{		
//DebugUSBMsg(DBG_LV,"\ntck_flag..");		Delay_ms(200);	
						ch = 0;
						chklen = 1;
				
						while(chklen != ATRlength)	ch ^= atr_buf[chklen++];// TCK verify		
						#if DEBUG_TEST			
						if(ch) 
						{
							DebugUSBMsg(DBG_LV,"\n TCK error2 ==============  ");
							//*len = Atr_len;
						}
						#endif
					}
				}
				else{
					ATRover_flag = 1;	// ATR over
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n ATR OVER2 ================= ");
					#endif
				}
				
                //*len = Atr_len;
                SC_Rcv_Len_Clr();
                //if(ATRover_flag) *len = ATRlength;//*len = ISO7816_Rcv_Len_Get();//2009.06.29
				//DebugUSBMsg(DBG_LV,"\nATR len=%d \n",*len);			//Delay_ms(200);

				ISO7816_AtrCheck(slot,0x00);
				ch = ISO7816_ProtocolCheck(slot);

				if(SC_Protocol_Get(slot) == T0_PROTOCOL){
					ch = 0;
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n T0_Protocol");
					#endif
				}
				else{
					ch = 1;
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n T1_Protocol");
					#endif
				}

				return ch;
			}
		}
			
		else if(Atr_len != chklen)	// received other byte ?
		{
			if(!T0_flag)
			{		
				T0_flag = 1;	
				//2011.11.12 delete
				//ic_ts_flag = 0;	//SC_TS_Flag(0);
				TDi_byte = atr_buf[chklen] & 0xf0;
				TAX_flag = (TDi_byte>>4)&0x01;
				TBX_flag = (TDi_byte>>5)&0x01;
				TCX_flag = (TDi_byte>>6)&0x01;
				TDX_flag = (TDi_byte>>7)&0x01;
				historical = atr_buf[chklen++] & 0x0f;
				ATRlength = historical+2;				
				#if DEBUG_TEST
				DebugUSBMsg(DBG_LV,"\n Step=%d,ATRlength=%d,T0=%2x  ",step,ATRlength,TDi_byte);
				#endif
				if(TDi_byte	== 0)
				{		
					SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = T0_PROTOCOL;
					wait_flag = 1;
				}
			}
			
				
			else
			{		
				if(TAX_flag)
				{
					TA_flag[step-1]=1;
					TA[step-1] = atr_buf[chklen];
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n TA%d=%2x",step,TA[step-1]);
					#endif
					TAX_flag = 0;
					TDi_byte&= ~(1<<4);
					ATRlength++;
					chklen++;
				}
				else if(TBX_flag)
				{		
					TB_flag[step-1]=1;
					TB[step-1] = atr_buf[chklen];
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n TB%d=%2x",step,TB[step-1]);
					#endif
					TBX_flag = 0;
					TDi_byte&= ~(1<<5);
					ATRlength++;
					chklen++;
				}
				else if(TCX_flag)
				{		
					TC_flag[step-1]=1;
					TC[step-1] = atr_buf[chklen];
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n TC%d=%2x",step,TC[step-1]);
					#endif
					TCX_flag = 0;
					TDi_byte&= ~(1<<6);
					ATRlength++;
					chklen++;		
				}
				else if(TDX_flag)
				{		
					TD_flag[step-1]=1;
					TD[step-1] = atr_buf[chklen];
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n TD%d=%2x",step,TD[step-1]);
					#endif
					TDX_flag = 0;
					TDi_byte&= ~(1<<7);
					TDi = atr_buf[chklen]; 
					ATRlength++;
					
					
					TDi_byte = atr_buf[chklen] & 0xf0;	//TDi&0xF0
					TAX_flag = (TDi_byte>>4)&0x01;
					TBX_flag = (TDi_byte>>5)&0x01;
					TCX_flag = (TDi_byte>>6)&0x01;
					TDX_flag = (TDi_byte>>7)&0x01;
					chklen++;		
					step++;
					
					//if((TDi & 0x0F) != 0x00) pn += 1;

				}							
				#if DEBUG_TEST						
				DebugUSBMsg(DBG_LV,"\n Step=%d,ATRlength=%d,TD%d=0x%2x ",step,ATRlength,step-1,TDi);
				#endif
				if(TDi_byte	== 0)
				{	
					#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n TXX=0,pn=%d ",step-1);
					#endif
					//2011.08.05
					if((TDi & 0x0F) != 0x00)
					//if(ISO7816_ProtocolCheck(slot))						
					{		
						ATRlength++;	// +TCK
						tck_flag = 1;		
						#if DEBUG_TEST
						DebugUSBMsg(DBG_LV,"\n TCK exist");	
						#endif	
					}
					else 
					{
						tck_flag = 0;
						//DebugUSBMsg(DBG_LV,"\n T0 Protocol ");
					}
					wait_flag = 1;
				}
			}
		}
	}
	//*len = ISO7816_Rcv_Len_Get();
//	DebugUSBMsg(DBG_LV,"\n BWT,ATR over,parity Error "); 
	return 0xFF;	// BWT,ATR over,parity
#endif
}
#endif
void ISO7816_Deactivation(u8 slot)
{
	sc_protocol[slot] = 0xFF;//2015.06.18
	SC_Deactivation(slot);
}

void ISO7816_SetBaudRate(u8 slot,u8 u8_fidi)
{
	//DebugUSBMsg(DBG_LV,"\n%%%%%%%%%% Set Speed FiDi=%02x.\n",u8_fidi); Delay_ms(300);
	SC_SetBaudRate(slot,u8_fidi);//2008.01.17
#ifndef STM32F4XX
	FIDI_ACT[slot] = u8_fidi;
#endif	
}
/*--------------------------------------------------------------------------*/

u8 ISO7816_PPS_Processing(u8 slot, u8 *trx_buf)
{
	u8 tx_buff[10],rx_buff[10];
	int		rlen;
	//u32 i=0;

	//2012.07.25
#ifdef ANTITEARING
	if(AntiTearing_Occured()){	
		DebugUSBMsg(DBG_LV,"\n AntiTearing Escape...");
		return MI_ACCESSTIMEOUT;
	}
#endif

	icsend_ptr = tx_buff;
	icsend_len = 4;
	icrcv_ptr = rx_buff;
	SC_Rcv_Len_Clr();
	
	Clear_snsts_byte();

	memcpy(tx_buff,trx_buf,4);				//2009.05.24

	//2010.08.26
	SC_Protocol_Set(slot, tx_buff[1] & 0x0F);//sc_protocol[slot] = tx_buff[1] & 0x0F;
	
	//2019.11.25
	ISO7816_PcbByteInit(slot);// sequence,chain number

	FIDI[slot] = tx_buff[2];
	////////////////////////////////////////////////////
	//pps_flag[slot] = 1;
	memset(rx_buff,0x00,sizeof(rx_buff)); 
	SC_PPS_Flag(slot,1);
	SC_Send_Data(slot,4,tx_buff);
	Clear_snsts_byte();
	SC_RxIntControl_Enable(slot);
   // printf("\n receive ");
// receive -----------------------------------------/
    //DebugUSBMsg(DBG_LV,"\n ISO7816_PPS_Processing ");
	while(1)
	{
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
		rlen = ISO7816_Rcv_Len_Get();
		if(rlen >= 4)
		{
			#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\n PPS Rx[%d] %2x%2x%2x%2x ",ISO7816_Rcv_Len_Get(),rx_buff[0],rx_buff[1],rx_buff[2],rx_buff[3]);
			#endif
			if(memcmp(tx_buff,rx_buff,4)==0)
			{
				memcpy(trx_buf,rx_buff,ISO7816_Rcv_Len_Get());
				ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
//				DebugUSBMsg(DBG_LV,"\n Success PPS ");
				//pps_flag[slot] = 0;
				SC_PPS_Flag(slot,0);
				return MI_OK;
			}
			else
			{
				FIDI[slot] = 0x11;
				//DebugUSBMsg(DBG_LV,"\n Fail PPS %2x%2x%2x%2x ",rx_buff[0],rx_buff[1],rx_buff[2],rx_buff[3]);
				//pps_flag[slot] = 0;
				SC_PPS_Flag(slot,0);
				return MI_ERROR;
			}
		} 	
		if(BWTint_Flag)
		{
//			DebugUSBMsg(DBG_LV,"\n PPS BWT_ERR(%d[%2x%2x%2x%2x]) ",rlen,rx_buff[0],rx_buff[1],rx_buff[2],rx_buff[3]);
//			ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
			//pps_flag[slot] = 0;
			SC_PPS_Flag(slot,0);
			return BWT_ERR;// block wait time check
		}
		if(CWTint_Flag) 
		{
//			DebugUSBMsg(DBG_LV,"\n PPS CWT_ERR(%d[%2x%2x%2x%2x]) ",rlen,rx_buff[0],rx_buff[1],rx_buff[2],rx_buff[3]);
			//pps_flag[slot] = 0;
			SC_PPS_Flag(slot,0);
			return CWT_ERR;	
		}	
	}
}


u8 T;
u8 F,D,I,PI;

void TAn(u8 i, u8 v, u8 slot)
{
    //XI = ("not supported", "state L", "state H", "no preference")
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n\nTA%d: 0x%2x",i+1, v);
	if (T == 1){
		//IFSC_buff[slot] = v;		//set at ISO7816_AtrCheck() 
		DebugUSBMsg(DBG_LV,"\nIFSC[%d]: %d",i, v);
	}
	else{
		F = v >> 6;
		D = v % 64;
		//Class = ["(3G) "]
		
		if (D & 0x1)	DebugUSBMsg(DBG_LV,"[A 5V] ");
		if (D & 0x2)	DebugUSBMsg(DBG_LV,"[B 3V] ");
		if (D & 0x4)	DebugUSBMsg(DBG_LV,"[C 1.8V] ");
		if (D & 0x8)	DebugUSBMsg(DBG_LV,"[D RFU] ");
		if (D & 0x10)	DebugUSBMsg(DBG_LV,"[E RFU]");
		DebugUSBMsg(DBG_LV,"\nClock stop: ");
		if(F==0)	DebugUSBMsg(DBG_LV,"not supported\n");
		else if(F==1)	DebugUSBMsg(DBG_LV,"state L\n");
		else if(F==2)	DebugUSBMsg(DBG_LV,"state H\n");
		else if(F==3)	DebugUSBMsg(DBG_LV,"no preference\n");
	}
#endif
#endif
}
void TBn(u8 i, u8 v, u8 slot)
{
#ifdef COMPACT_MEM
	if (T == 1){
		BWI[slot] = v >> 4;
		CWI[slot] = v % 16;
	}
#else
	#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n\nTB%d: 0x%2x",i+1, v);
	#endif
	if (T == 1){
		BWI[slot] = v >> 4;
		CWI[slot] = v % 16;
		#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\nBlock Waiting Integer: %d - Character Waiting Integer: %d", BWI[slot], CWI[slot]);
		#endif
	}
	else{
		if (i > 2 && T == 15){
			//see ETSI TS 102 221 V8.3.0 (2009-08)
			//Smart Cards; UICC-Terminal interface;
			//Physical and logical characteristics (Release 8)
			/*texts = {0x00: "No additional global interface parameters supported",
			0x88: "Secure Channel supported as defined in TS 102 484",
			0x8C: "Secured APDU - Platform to Platform required as defined in TS 102 484",
			0x90: "Low Impedance drivers and protocol available on the I/O line available (see clause 7.2.1)",
			0xA0: "UICC-CLF interface supported as defined in TS 102 613",
			0xC0: "Inter-Chip USB UICC-Terminal interface supported as defined in TS 102 600"}
			text = texts.get(v, "RFU")*/
		}
	}
#endif
}
void TCn(u8 i, u8 v)
{
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n\nTC%d: 0x%2x",i+1, v);
	if (T == 1){
		DebugUSBMsg(DBG_LV,"\nError detection code: ");
		if (v == 1)		DebugUSBMsg(DBG_LV,"CRC");
		else{
			if (v == 0)	DebugUSBMsg(DBG_LV,"LRC");
			else		DebugUSBMsg(DBG_LV,"RFU");
		}
	}
#endif
#endif
}
void TDn(u8 i, u8 v)
{
    T = v & 0xF;
#ifndef COMPACT_MEM
#if DEBUG_TEST
	u8 Y;	
  Y = v >> 4;
	DebugUSBMsg(DBG_LV,"\n\nTD%d: 0x%2x",i+1, v);
	DebugUSBMsg(DBG_LV,"\nY(i+1) = 0x%2x, Protocol T=%d", Y, T);
#endif
#endif
}



u16 ISO7816_AtrCheck(u8 slot,u8 reset)
{
#ifndef COMPACT_MEM
#if DEBUG_TEST
	u16 Fi[16] = {372, 372, 558, 744, 1116, 1488, 1860, 0, 0, 512, 768, 1024, 1536, 2048, 0, 0};
	u8 Di[16] = {0, 1, 2, 4, 8, 16, 32, 64, 12, 20, 0, 0, 0, 0, 0, 0};
	u16 FMax[16] = {40, 50, 60, 80, 120, 160, 20, 0, 0, 50, 75, 100, 150, 200, 0, 0};
#endif
#endif
	// -------------------- Parameter check
	IFSC_buff[slot] = 0x80;
	BWI[slot] = 4;// 960*D*TC2(WI)																				
	CWI[slot] = 13;	

	if(ATRover_flag) 
	{
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n ATRover_flag error ");
#endif
#endif
	}		

	//DebugUSBMsg(DBG_LV,"\nTA1 flag =%d",TA_flag[0]);
	if(TA_flag[0])	//TA1
	{
		F = TA[0]>>4;
		D = TA[0]&0x0F;
		
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n\nTA1: 0x%2x",TA[0]);
		DebugUSBMsg(DBG_LV,"\nF=%d(Fi=%d),D=%d(Di=%d)",F,Fi[F],D, Di[D]);
		DebugUSBMsg(DBG_LV,"\nMax %d bps at %dHz", SC_Get_FCLK(slot)/(Fi[F] / Di[D]),SC_Get_FCLK(slot));
		DebugUSBMsg(DBG_LV,"\n%d bps for fMax=%dHz", FMax[F]*100000/(Fi[F] / Di[D]),FMax[F]*100000);
#endif
#endif
		if((D >= 1) && (D <= 8))
		{
			//2011.08.05
			if((F==7)||(F==8)||(F>=14)){
#ifndef COMPACT_MEM
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\nF=%d ==Wrong Value===",F);
#endif
#endif
			//2012.03.26
			//F = 1; don't need
			}
			else		FIDI[slot] = TA[0];
		}
		else{
#ifndef COMPACT_MEM
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\nD=%d ==Wrong Value==",D);
#endif
#endif
    		//2012.03.26
    		//D = 1; don't need
		}
	}
	if(TB_flag[0]){		//TB1
		I = TB[0] >> 5;
		PI = TB[0] & 0x1F;
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n\nTB1: 0x%2x",TB[0]);
		if (PI == 0)
			DebugUSBMsg(DBG_LV,"\nVPP is not electrically connected");
		else
			DebugUSBMsg(DBG_LV,"\nProgramming Param P: %d Volts, I: %d(25+25*i ??? milliamperes)",PI, I);
#endif
#endif
	}		
	
	if(TC_flag[0]){		//TC1
		if (TC[0] == 255){
			//2011.11.12 apply character guard time when T=1
			CGT[slot] = 1;
		}
		//2011.11.12
		else	EGT[slot] = TC[0];

		
		
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n\nTC1: 0x%2x",TC[0]);
		DebugUSBMsg(DBG_LV,"\nExtra guard time: %d", TC[0]);
		if (CGT[slot] != 0){
			DebugUSBMsg(DBG_LV," (special value)-character guart time for T=1");
		}
#endif
#endif
	}
	if(TD_flag[0]){		//TD1
		TDn(0, TD[0]);
	}

	//DebugUSBMsg(DBG_LV,"\n\r==>TA0_f=%2x,TA1_f=%2x,FDID=%2x",TA_flag[0],TA_flag[1],FIDI[slot]);

	if(TA_flag[1]){		//TA2
		if(TA_flag[0]){
			ISO7816_SetBaudRate(slot,FIDI[slot]);
#ifndef COMPACT_MEM
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\n==>Speed Change[[0x%2x]]",FIDI[slot]);
#endif
#endif
		}
		//2011.11.18 for test
		/*if(TA_flag[0]){
			if(FIDI[slot] == 0x13){
				FIDI[slot] = 0x33;
				ISO7816_SetBaudRate(slot,FIDI[slot]);
			}
		}*/
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n\nTA2: 0x%2x",TA[1]);
		DebugUSBMsg(DBG_LV,"\nProtocol to be used in spec mode[TA2=%2x]: T=%d", TA[1],TA[1]&0x0F);
		if (TA[1] & 0x80)
		    DebugUSBMsg(DBG_LV," - Unable to change");
		else
		    DebugUSBMsg(DBG_LV," - Capable to change");
		
		if (TA[1] & 0x10)
		    DebugUSBMsg(DBG_LV," - implicity defined");
		else{	
		    DebugUSBMsg(DBG_LV," - defined by interface bytes");
			//2011.08.05 HTY
			if(TA_flag[0]){
				DebugUSBMsg(DBG_LV,"\n====Auto Speed Change[0x%2x]=====...",FIDI[slot]);
			}
		}
#endif
#endif
		/////////////////////////////////////////////////////////
		if(!TA_flag[0]){
			TA[0] = 0x11;
			FIDI[slot] = TA[0];
		}		
		//TA2롤 프로토톨 설정은 없다.
		//if((TA[1]&0x0f)==1) SC_Protocol_Set(slot, T1_PROTOCOL);//sc_protocol[slot] = 	T0_PROTOCOL;
		//else 	SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = 	T1_PROTOCOL;
		//FIDI[slot] = TA[0];
		//ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
	}
	else{
		//2012.05.15 HTY add
//		if(!TA_flag[0])
		TA[0] = 0x11;	// 372	// negotiable mode - F.D is adopted TA1				
	}
#ifndef COMPACT_MEM
#if DEBUG_TEST
	if(TB_flag[1]){		//TB2
		DebugUSBMsg(DBG_LV,"\n\nTB2: 0x%2x",TB[1]);
		DebugUSBMsg(DBG_LV,"\nProgramming param PI2 (PI1 should be ignored): %d",TB[1]);
		//if ((v > 49) or (v < 251)):
		if ((TB[1] > 49) && (TB[1] < 251))
			DebugUSBMsg(DBG_LV," (dV).\n");
		else
			DebugUSBMsg(DBG_LV," is RFU.\n");
	}	
#endif
#endif

	if(TC_flag[1]){	//TC2
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n\nTC2: 0x%2x",TC[1]);
		DebugUSBMsg(DBG_LV,"\nWork waiting time: 960 x %d x (Fi/F)", TC[1]);
#endif
#endif
		//2011.09.01
		if(SC_Protocol_Get(slot) == T0_PROTOCOL){
			BWI[slot] = TC[1];
			/*if(TC[1] > 0x20){//2011.11.12 JRSC 요청사항 제거 
				//BWI[slot] = 0x40;	//960*64*(512/4.5M)=64*110ms
				BWI[slot] = 0x20;	//=32*110ms
				DebugUSBMsg(DBG_LV,"\nBWI too long change to: 0x%2x",BWI[slot]);
			}*/
		}
	}
	//2011.09.02 HTY add
	else{
		if(SC_Protocol_Get(slot) == T0_PROTOCOL){
			BWI[slot] = 10;	//=10*110ms
#ifndef COMPACT_MEM
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\nT=0, default BWI to: 0x%2x",BWI[slot]);
#endif
#endif
		}
	}

	if(TD_flag[1])		//TD2
	{	
		TDn(1, TD[1]);
	}

	if(TA_flag[2])		//TA3
	{		
		TAn(2, TA[2], slot);
	}
	if(TB_flag[2])		//TB3
	{	
		TBn(2, TB[2],slot);
	}
	//if(TC3_flag && (TC3 != 0)) 
	if(TC_flag[2]) 
	{
		TCn(2, TC[2]);
	}
	if(TD_flag[2]) 	//TD3
	{
		TDn(2, TD[2]);
	}

	if(TA_flag[3])		//TA4
	{		
		TAn(3, TA[3], slot);
	}
	if(TB_flag[3])		//TB4
	{	
		TBn(3, TB[3],slot);
	}
	if(TC_flag[3]) 		//TC4
	{
		TCn(3, TC[3]);
	}
	if(TD_flag[3]) 		//TD4
	{
		TDn(3, TD[3]);
	}
	if(TD_flag[4]) 		//TD5
	{
		TDn(4, TD[4]);
	}
	
	

// -------------------- mode and time constant check
	if(SC_Protocol_Get(slot) == T1_PROTOCOL)
	{		
		if(TA_flag[2]) IFSC_buff[slot] = TA[2];	//TA3		
		else 	IFSC_buff[slot] = 32;
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n IFSC_buff[slot%d] %2x",slot,IFSC_buff[slot]);
#endif
#endif
		if(!TB_flag[2])	//TB3 not exist
		{		
			//Default value
			CWI[slot] = 13;		// 
			BWI[slot] = 4;		// 15371
			#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\n Set Defuult CWI & BWI.");	
			#endif	
		}

	}
	else //if(SC_Protocol_Get(slot) == T0_PROTOCOL)
	{		
		//if(TC_flag[1]) BWI[slot] = TC[1];// 960*D*TC2(WI)																	
		//else	BWI[slot] = 10;// TC2				
		//CWI[slot] = 5;														
	}
	
	

// -------------------- sniper register setting

	//SnAtrParaSet(slot);
	//WTadjust(slot);
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n BWI=%2x,CWI=%2x ",BWI[slot],CWI[slot]);
	DebugUSBMsg(DBG_LV,"\n FIDI[slot %d]=0x%2x,TA1=0x%2x ",slot,FIDI[slot],TA[0]);
#endif
#endif

	SC_Set_BWT(slot,BWI[slot]);
	SC_Set_CWT(slot,CWI[slot]);

	return MI_OK;
}

//2010.08.21 add
u16 ISO7816_Activation2(u8 slot,u8 reset,u8 *atr_buf,u16 *len)
{
	//u8	historical,step,chklen,ch;
	//u8		wait_flag,tck_flag;
	//u8 t1_pos=0;

	//2012.04.17
	AntiTearing_Clear();

  SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = T0_PROTOCOL;
	TxxByteInit();
	//sc_inv_flag[slot]=0;
	SC_Invrese_Flag(slot, 0);
	FIDI[slot] = 0x11;//2009.02.18
	ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
	SC_Parity_Set(slot,NON_PARITY);
	
	icrcv_ptr = atr_buf;
	//pps_flag[slot] = 0;
	SC_PPS_Flag(slot,0);
	//t0_retry = 3;
	SC_t0_retry(3);
	
	BWI[slot] = 14;																				
  CWI[slot] = 13;	
  SC_Set_CWT(slot,CWI[slot]);
  SC_Set_BWT(slot,BWI[slot]);
	
	SC_RxIntControl_Enable(slot);
	
	SC_ActiveInit(slot,reset);
	//SC_Set_BWT_Atr(slot,0);
	
	Set_ATR_Cwt_Bwt(1);	//wait for 1 sec from beginning
	
	Clear_snsts_byte();
	SC_Rcv_Len_Clr();
	//ic_ts_flag = 1;//SC_TS_Flag(1);
	while((ISO7816_Rcv_Len_Get()==0) && !BWTint_Flag);
	if(ISO7816_Rcv_Len_Get()==0) 
	{
		//DebugUSBMsg(DBG_LV,"\n ATR No Response "); 
		return MI_ERROR;
	}
	//icc_BWT_cnt = icc_CWT_cnt = 0;
	SC_BWT_CWT_Clear();
	
	//SC_Set_BWT_Atr(slot,BWI[slot]);
	Set_ATR_Cwt_Bwt(1);	
	
	if(atr_buf[0]==0x03)
	{
		SC_Parity_Set(slot,ODD_PARITY);
		atr_buf[0]=0x3f;
		//sc_inv_flag[slot]=1;
		SC_Invrese_Flag(slot, 1);
	}
	else SC_Parity_Set(slot,EVEN_PARITY);
		
	//ic_ts_flag=0;//SC_TS_Flag(0);

	//while(!SC_BWTint_Flag() && !ATROVERint_flag && !PARITYint_flag &&!SC_CWTint_Flag())
	while(!BWTint_Flag && !ATROVERint_flag && !PARITYint_flag &&!CWTint_Flag)
	{
	}
	*len = ISO7816_Rcv_Len_Get();
//	DebugUSBMsg(DBG_LV,"\n BWT,ATR over,parity Error "); 
	if(*len == 0)	return MI_ERROR;	// BWT,ATR over,parity
	else			return MI_OK;
}
		
/*=========================================================================*
 *		ATR procedure based EMV96 (T=0,1)																	   *
 *=========================================================================*/
//2019.06.13
#ifndef UART_MAX_SPEED
#define UART_MAX_SPEED	230400
#endif

u16 ISO7816_ActivationFlow(u8 slot,u8 *atr_buf,u16 *len)
{
  u16	ret;
  u8 reset,i;
  u8 auto_pps,pps_buf[5],warm_reset, dummy_reset,v5_only;
//Uart_Printf("ISO7816_ActivationFlow(%d,,)\n",slot);
//USB_Printf("\nISO7816_ActivationFlow(%d,,)\n",slot);
DebugUSBMsg(DBG_LV,"\nISO7816_ActivationFlow(%d,,)\n",slot);
  if((atr_buf[0]&0xF0)== 0xF0){
//#ifndef COMPACT_MEM
#if DEBUG_TEST
  	DebugUSBMsg(DBG_LV,"\n Auto PPS ");
#endif
//#endif
  	auto_pps = 1;
  }
  else  auto_pps = 0;
  	
  //2019.11.27
  T1_Supportable[slot] = 0;
  
//2010.08.21 add
  if((atr_buf[0]&0xF0)== 0xD0) dummy_reset = 1;
  else  dummy_reset = 0;
  //if((atr_buf[0]&0x0F)== 0x0A){
  //2012.02.28
  if((atr_buf[0]&0x0E)== 0x0A){
  	//printf("Warm reset\n");
  	warm_reset = 1;
  	//inverse_flag = 1;
  }
  else  warm_reset = 0;
//2012.02.28
  if((atr_buf[0]&0x0E)== 0x08){
  	ifsd_size_flag = 0;
  }
  else	ifsd_size_flag = 1;
  //DebugUSBMsg(DBG_LV,"\n ifsd_size_flag=%d..[%2x] ",);
  
  if((atr_buf[0]&0x01)== 0x01){
  	//Uart_Printf("5V only reset\n");
  	v5_only = 1;
  }
  else  v5_only = 0;
  /////////////////////////////////////////////////

  *len = 0;
   
   // auto_pps = 1;
	//SnPretryOnoff(slot,OFF);	// parity error retry is 0
	parity_retry = 0;
	ret = MI_ERROR;
	//2012.01.07 move to below
	//if(SC_SlotCheck(slot)!=MI_OK) return MI_NOCARD;//MI_NOTAGERR;
#ifdef SC_PWRON_RFOFF
	if(slot == 0)
	{
		//if((rc531_txcontrol&0x03)==0x03) Rf_Off();
		if(Rf_Off_Chk_Contact() == 1)	Rf_Off();
  }
#endif
	//2012.01.07 move from up
	if(SC_SlotCheck(slot)!=MI_OK){
		ISO7816_Deactivation(slot);	//added 2012.10.24
		return MI_NOCARD;//MI_NOTAGERR;
	}
  reset = COLD_5V;
  i=0;
  for(i=0;i<3;)
  {
/* EMV :  C(1.8V)->B(3V)->A(5V)
#ifdef SC_SUPPORT_1_8V
		if(i==0) reset = COLD_1_8V;
#else 
        if(i==0) i++;//skip
#endif
#ifdef SC_SUPPORT_3V
        //if(i==1) reset = COLD_3V;
		//2012.02.28        
		if(i==1){
			if(v5_only==0) 	reset = COLD_3V;
			else			i = 2;
		}
		///////////////////////////////////////////
#else 
		if(i==1) i++;//skip
#endif
		if(i==2) reset = COLD_5V;
*/

//2015.03.02  : INFINEON: A(5V)->B(3V)->C(1.8V)

		if(i==0) reset = COLD_5V;

#ifdef SC_SUPPORT_3V
        //if(i==1) reset = COLD_3V;
		//2012.02.28        
		if(i==1){
			if(v5_only==0) 	reset = COLD_3V;
			else			i = 2;
		}
		///////////////////////////////////////////
#else 
		if(i==1) i++;//skip
#endif

#ifdef SC_SUPPORT_1_8V
		if(i==2) reset = COLD_1_8V;
#else 
		if(i==2) i++;//skip
#endif


#ifndef COMPACT_MEM
#if DEBUG_TEST
		if(reset == COLD_1_8V) DebugUSBMsg(DBG_LV,"\n COLD_1_8V[%d] ",slot);	
		else if(reset == COLD_3V) DebugUSBMsg(DBG_LV,"\n COLD_3V[%d] ",slot);	
		else DebugUSBMsg(DBG_LV,"\n COLD_5V[%d] ",slot);
#endif
#endif
		//2010.08.21
		if(warm_reset){
			reset = WARM;
#ifndef COMPACT_MEM
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\n Warm Reset[%d]\n",slot);
#endif
#endif
		}
		if(dummy_reset){
#ifndef COMPACT_MEM
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\n Dummy Reset[%d]\n",slot);
#endif
#endif
			ret = ISO7816_Activation2(slot,reset,atr_buf,len);
			//2020.01.08
			if(ret == MI_OK) break;
		}
		else{
		///////////////////
//Uart_Printf("ISO7816_Activation()start)\n",ret);
			ret = ISO7816_Activation(slot,reset,atr_buf,len);

//Uart_Printf("ISO7816_Activation()=(%d),len=%d[%2x %2x %2x]\n",ret,*len,atr_buf[0],atr_buf[1],atr_buf[2]);

#if DEBUG_TEST
/**/DebugUSBMsg(DBG_LV,"ISO7816_Activation()=(%d),len=%d[%02x%02x%02x..]\n",ret,*len,atr_buf[0],atr_buf[1],atr_buf[2]); 
//Delay_ms(300);
#endif

			if(ret == MI_OK)
			{				
				if(ISO7816_AtrCheck(slot,reset) == MI_OK)
				{
					DebugUSBMsg(DBG_LV,"\n ISO7816_AtrCheck End ");		Delay_ms(200);
					ret = MI_OK;
				}
				break;
			}
		}
		i++;
	}
	//DebugUSBMsg(DBG_LV,"\n ISO7816_Activation End2 ");		Delay_ms(100);
	
	//2010.08.21
	if(dummy_reset){
		if(ret != MI_OK)	SC_Deactivation(slot);

#ifndef NOT_COMBI		//2010.11.24   when use contact slot RF off
#ifdef SC_PWRON_RFOFF	
		if(slot == 0){
			Rf_On_Contact();
		}
#endif
#endif
		return ret;		
	}
	
	if(ret == MI_OK)
	{
		//DebugUSBMsg(DBG_LV,"\n>>TA1 flag =%d,TA2 flag =%d.",TA_flag[0],TA_flag[1]);
		//2010.11.04
		if(TA_flag[1] == 0)	//TA2
		{
			if(TA_flag[0] == 0) //TA1, for phillips card
			{
				//왜 이것을 강제로 넣었는 지 이해가 안감. 
				//2011.08.05 PM8, HTY delete
				//FIDI[slot] = 0x18;
				
			}
			//if((FIDI[slot]>0x11)&&auto_pps) 
			
			//2019.11.25 for test
/*			if((TD[2]&0x0F) == 0x0F){ //T=15, reserved protocol for future use
				if(auto_pps == 0){
					auto_pps = 1;
					FIDI[slot] = 0x11;
				}
			}
*/		
			//2010.06.22
			if(auto_pps) 
			//FIDI[slot] = 0x18;	//for test
			{
				//USB_Printf("\n PPS FIDI=%02x.",FIDI[slot]);
				//2011.11.18
				if((SC_Protocol_Get(slot) == T1_PROTOCOL) || (FIDI[slot] > 0x11)){
					
				    //Delay_ms(100);
				    //Delay_ms(10);		//2011.08.08 HTY
				    //2012.07.24
				    Delay_1us_GT(10000);
				    
				    //SC_Set_BWT_Atr(slot,0);
					//SC_Set_CWT(slot,1);
					//2011.11.10
					Set_ATR_Cwt_Bwt(0);	

					//2014.06.27
#ifdef CT_FIDI_LIMIT4	//added for Thai ID v4 FiDi=0x18
					if((FIDI[slot]&0x0F) >  0x01){
						FIDI[slot] &= 0xF0;
						FIDI[slot] |= 0x01;
					}
#endif
#ifdef SAM_FIDI_LIMIT4	//2014.11.19 SAM 이 받아 들이는 값이 한계가 많음.
					if(slot != CONTACT_SLOT){
						if((FIDI[slot]&0xF0) == 0x90){
							FIDI[slot] &= 0x0F;
							FIDI[slot] |= 0x10;
							//FIDI[slot] |= 0x02;
						}						
					}
#endif
					pps_buf[0]=0xFF;		//2009.05.24
					//pps_buf[1]= 0x10|SC_Protocol_Get(slot);
					//2019.11.27
					if(T1_Supportable[slot]){
						pps_buf[1]= 0x11;
						SC_Protocol_Set(slot,T1_PROTOCOL);
					}
					else{
						pps_buf[1]= 0x10|SC_Protocol_Get(slot);
					}
									
					//2019.06.13
					if( ISO7816_Get_ETU(FIDI[slot]) <  93*9600/UART_MAX_SPEED){
						DebugUSBMsg(DBG_LV,"\nSC PPS speed is too high3, etu =%d.",ISO7816_Get_ETU(FIDI[slot]));
						if(((FIDI[slot] & 0x0F) <= 7) && (FIDI[slot] >= 3)) 	FIDI[slot] -= 3;						
						else	FIDI[slot] = 0x11; 
					}
					else if( ISO7816_Get_ETU(FIDI[slot]) <  186*9600/UART_MAX_SPEED){
						DebugUSBMsg(DBG_LV,"\nSC PPS speed is too high2, etu =%d.",ISO7816_Get_ETU(FIDI[slot]));
						if(((FIDI[slot] & 0x0F) <= 7) && (FIDI[slot] >= 2)) 	FIDI[slot] -= 2;						
						else	FIDI[slot] = 0x11; 
					}
					else if( ISO7816_Get_ETU(FIDI[slot]) <  372*9600/UART_MAX_SPEED){
						DebugUSBMsg(DBG_LV,"\nSC PPS speed is too high, etu =%d.",ISO7816_Get_ETU(FIDI[slot]));
						if(((FIDI[slot] & 0x0F) <= 7) && (FIDI[slot] >= 1)) 	FIDI[slot] -= 1;
						else	FIDI[slot] = 0x11; 
					}
					
					pps_buf[2]=FIDI[slot];
					pps_buf[3]=pps_buf[0]^pps_buf[1]^pps_buf[2];
#ifndef COMPACT_MEM
#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"\n PPS[%2x%2x%2x%2x]",pps_buf[0],pps_buf[1],pps_buf[2],pps_buf[3]);
#endif	
#endif				
					//USB_Printf("\n PPS[%2x%2x%2x%2x]",pps_buf[0],pps_buf[1],pps_buf[2],pps_buf[3]);
					//Delay_ms(300);


			    if(ISO7816_PPS_Processing(slot,pps_buf)!=MI_OK)
			    {
#ifndef COMPACT_MEM
#if DEBUG_TEST
				    	DebugUSBMsg(DBG_LV,"\n PPS ERROR");
#endif
#endif
			    	//Delay_ms(10);	
			    	//2012.07.24
				    Delay_1us_GT(10000);
				    	
				    ret = MI_ERROR;
				    if(ISO7816_Activation(slot,reset,atr_buf,len)==MI_OK)
						{
							//DebugUSBMsg(DBG_LV,"\n ISO7816_Activation OK %d ",*len);	
							if(ISO7816_AtrCheck(slot,reset) == MI_OK)
							{	
								ret = MI_OK;	  
							}
						}
					}
				}
			}
		}

		if(SC_Protocol_Get(slot) == T0_PROTOCOL){		// T=0 ?
			parity_retry = 3;//SnPretryOnoff(slot,ON);	// parity error retry is 3
		}
		else
		{	
			ISO7816_PcbByteInit(slot);// sequence,chain number
#ifdef	EMV
	    	/*Delay_ms(100);	//BGT = 22uS
			Set_ATR_Cwt_Bwt(1);	//wait response for 1000ms
			//ret = ISO7816_SblockRequest(slot,0xc1,0xfe);// IFSD size is 254
			//2011.11.18 for test
			ret = ISO7816_SblockRequest(slot,0xc1,0xfd);// IFSD size is 254
	    	DebugUSBMsg(DBG_LV,"\nIFSD size set ret=%d.\n",ret);
	    	Delay_ms(2);	//BGT = 22uS
	    	SC_Load_BWT(slot);
			SC_Load_CWT(slot);
			*/
			
			//ifsd_size_flag = 1; //2012.02.28 mark
			ret = MI_OK;

#else
			//2012.02.28 add
			ifsd_size_flag = 0;
			ret = MI_OK;
#endif
		}
		//SC_Set_BWT(slot,BWI[slot]);
		//SC_Set_CWT(slot,CWI[slot]);
		
#ifndef COMPACT_MEM
#if DEBUG_TEST
		if(SC_Protocol_Get(slot) == T0_PROTOCOL) DebugUSBMsg(DBG_LV,"\n T0_Protocol");
		else DebugUSBMsg(DBG_LV,"\n T1_Protocol");
#endif		
#endif
	}
	else{
		//SC_Deactivation(slot); 2021.08.18
	}
#ifndef NOT_COMBI		//2010.11.24  when use contact slot RF off
#ifdef SC_PWRON_RFOFF	
	if(slot == 0){
		Rf_On_Contact();
	}
#endif
#endif
//Uart_Printf("ISO7816_ActivationFlow()=(%d)\n",ret);
	return ret;
}

#ifdef SC_SEC_SECURE_RESET
u16 ISO7816_Activation_Sec(u8 slot,u8 reset,u8 *atr_buf,u16 *len)
{
	u8	historical,step,chklen,ch;
	u8	wait_flag,tck_flag,TDi;

	AntiTearing_Clear();
	
// Activation
  SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = T0_PROTOCOL;
	TxxByteInit();
	SC_Invrese_Flag(slot, 0);
	FIDI[slot] = 0x11;//2009.02.18
	CGT[slot] = 0;//2011.11.09
	EGT[slot] = 0;//2011.11.12
	
	TDi = 0x00;
	
Re_Atr:
	
	reset = COLD_5V;
	
	ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
	SC_Parity_Set(slot,NON_PARITY);
	
	icrcv_ptr = atr_buf;
	//pps_flag[slot] = 0;
	SC_PPS_Flag(slot,0);
	//t0_retry = 3;
	SC_t0_retry(3);
	
	BWI[slot] = 14;		
  CWI[slot] = 13;

	SC_RxIntControl_Enable(slot);
	SC_ActiveInit_Sec(0,reset);
	
	Set_ATR_Cwt_Bwt(0);
	
	Clear_snsts_byte();
	SC_Rcv_Len_Clr();


	while((ISO7816_Rcv_Len_Get()==0) && !BWTint_Flag){
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
	}		

	if(ISO7816_Rcv_Len_Get()==0) 
	{
		//DebugUSBMsg(DBG_LV,"\n ATR No Response "); 
		return MI_ERROR;
	}
	SC_BWT_CWT_Clear();	

#ifdef EXTEND_ATR_WT	
	Set_ATR_Cwt_Bwt(0);	
#else
	Set_ATR_Cwt_Bwt(1);
#endif
	if(atr_buf[0]==0x03)
	{
		SC_Parity_Set(slot,ODD_PARITY);
		atr_buf[0]=0x3f;
		//sc_inv_flag[slot]=1;
		SC_Invrese_Flag(slot, 1);
	}
	else SC_Parity_Set(slot,EVEN_PARITY);
		
	ch = atr_buf[0];
	
	if((ch != 0x3b) && (ch != 0x3f))
	{
		*len = ISO7816_Rcv_Len_Get();
		//DebugUSBMsg(DBG_LV,"\n Not ATR[0x%2x]",ch); 
		
		Delay_1us_GT(30000);
		
		FIDI[slot] += 1;
		if(FIDI[slot] < 0x14){
			//DebugUSBMsg(DBG_LV,"\n Re ATR FiDi[0x%2x]",FIDI[slot]); 
			goto Re_Atr;
		}		
		
		return MI_ERROR;
	}

// Other bytes
	chklen = 1;
	step = 1;
	wait_flag = 0;

	while(!BWTint_Flag && !ATROVERint_flag && !PARITYint_flag &&!CWTint_Flag)
	{
//DebugUSBMsg(DBG_LV,"\nATRlength=%d",ATRlength);			
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
		if(wait_flag)
		{		
			ATRover_flag = 0;

			Delay_1us_GT(3000);
			
			if(ISO7816_Rcv_Len_Get() > ATRlength)// ATR over
			{
				DebugUSBMsg(DBG_LV,"ATR over1===");	
				if(tck_flag)
				{		
					ch = 0;
					chklen = 1;
					while(chklen != ATRlength)	ch ^= atr_buf[chklen++];// TCK verify					
					if(ch) 
					{
					}
				}
			}
			else
			{		
				while(ISO7816_Rcv_Len_Get() < ATRlength)
				{		
#ifdef ANDROID_NDK
					SC_CheckTime_Rx();
#endif				
					//DebugUSBMsg(DBG_LV,"\n BWTint or CWTint_Flag..");
					if(BWTint_Flag||CWTint_Flag) return ERROR;// in case of missing byte				
				}
				//Delay_ms(50);	// double check time					
				//Delay_ms(3);	//2011.08.04 double check time		
				//2012.07.24
				Delay_1us_GT(3000);
							
				if(ISO7816_Rcv_Len_Get() == ATRlength)// ATR all received
				{
//DebugUSBMsg(DBG_LV,"\nATR rx end..");		Delay_ms(200);	
					if(tck_flag)
					{		
//DebugUSBMsg(DBG_LV,"\ntck_flag..");		Delay_ms(200);	
						ch = 0;
						chklen = 1;
				
						while(chklen != ATRlength)	ch ^= atr_buf[chklen++];// TCK verify					
						if(ch) 
						{

						}
					}
				}
				else{
					ATRover_flag = 1;	// ATR over
//					DebugUSBMsg(DBG_LV,"ATR over2===");
				}
			}
            *len = ISO7816_Rcv_Len_Get();
            SC_Rcv_Len_Clr();
            if(ATRover_flag) *len = ATRlength;//*len = ISO7816_Rcv_Len_Get();//2009.06.29
			
			return MI_OK;
		}
			
		else if(ISO7816_Rcv_Len_Get() != chklen)	// received other byte ?
		{
			if(!T0_flag)
			{		
				T0_flag = 1;
				//2011.11.12 delete	
				//ic_ts_flag = 0;	//SC_TS_Flag(0);
				TDi_byte = atr_buf[chklen] & 0xf0;
				TAX_flag = (TDi_byte>>4)&0x01;
				TBX_flag = (TDi_byte>>5)&0x01;
				TCX_flag = (TDi_byte>>6)&0x01;
				TDX_flag = (TDi_byte>>7)&0x01;
				historical = atr_buf[chklen++] & 0x0f;
				//ATRlength = historical+2;				
				//2014.12.18
				ATRlength = historical+6;
				
				//DebugUSBMsg(DBG_LV,"\n Step=%d,ATRlength=%d,T0=%2x  ",step,ATRlength,TDi_byte);
				
				if(TDi_byte	== 0)
				{		
					SC_Protocol_Set(slot, T0_PROTOCOL);//sc_protocol[slot] = T0_PROTOCOL;
					wait_flag = 1;
				}
			}
			else
			{		
				if(TAX_flag)
				{
					TA_flag[step-1]=1;
					TA[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TA%d=%2x",step,TA[step-1]);
					TAX_flag = 0;
					TDi_byte&= ~(1<<4);
					ATRlength++;
					chklen++;
				}
				else if(TBX_flag)
				{		
					TB_flag[step-1]=1;
					TB[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TB%d=%2x",step,TB[step-1]);
					TBX_flag = 0;
					TDi_byte&= ~(1<<5);
					ATRlength++;
					chklen++;
				}
				else if(TCX_flag)
				{		
					TC_flag[step-1]=1;
					TC[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TC%d=%2x",step,TC[step-1]);
					TCX_flag = 0;
					TDi_byte&= ~(1<<6);
					ATRlength++;
					chklen++;		
				}
				else if(TDX_flag)
				{		
					TD_flag[step-1]=1;
					TD[step-1] = atr_buf[chklen];
					//DebugUSBMsg(DBG_LV,"\n TD%d=%2x",step,TD[step-1]);
					TDX_flag = 0;
					TDi_byte&= ~(1<<7);
					TDi = atr_buf[chklen]; 
					ATRlength++;
					
					
					TDi_byte = atr_buf[chklen] & 0xf0;	//TDi&0xF0
					TAX_flag = (TDi_byte>>4)&0x01;
					TBX_flag = (TDi_byte>>5)&0x01;
					TCX_flag = (TDi_byte>>6)&0x01;
					TDX_flag = (TDi_byte>>7)&0x01;
					chklen++;		
					step++;
					
					//if((TDi & 0x0F) != 0x00) pn += 1;

				}	
				
																
//				DebugUSBMsg(DBG_LV,"\n Step=%d,ATRlength=%d,TD%d=0x%2x ",step,ATRlength,step-1,TDi);
				if(TDi_byte	== 0)
				{	
					ch = ISO7816_ProtocolCheck(slot);
					//DebugUSBMsg(DBG_LV,"\n TXX=0,pn=%d,T=%d ",step-1,ch);
					//2011.08.05
					if((TDi & 0x0F) != 0x00)
					//if(ISO7816_ProtocolCheck(slot))						
					{		
						ATRlength++;	// +TCK
						tck_flag = 1;		
//						DebugUSBMsg(DBG_LV,"\n TCK exist");		
					}
					else 
					{
						tck_flag = 0;
						//DebugUSBMsg(DBG_LV,"\n T0 Protocol ");
					}
					wait_flag = 1;
				}			

			}
		}
	}
	*len = ISO7816_Rcv_Len_Get();
//	DebugUSBMsg(DBG_LV,"\n BWT,ATR over,parity Error "); 
	return MI_ERROR;	// BWT,ATR over,parity
}
#endif	//#ifdef SC_SEC_SECURE_RESET

#if 1
/*------------------------------------------------------------------------*/
u16 ISO7816_ReadChainbit(u8 slot,u8 dir)// I-pcb of IFD,ICC
{
	if(!dir)
	{		
		if(SPCBI_buff[slot] & 0x20)	return 1;// IFD					
		else	return 0;
	}
	else
	{		
		if(RPCBI_buff[slot] & 0x20)	return 1;// ICC						
		else	return 0;
	}
}
/*------------------------------------------------------------------------*/
void ConvSequenceI(u8 slot)	// I-pcb of IFD
{
	SPCBI_buff[slot] ^= 0x40;
}
/*------------------------------------------------------------------------*/
u16 ISO7816_ReadSeqbitI(u8 slot,u8 dir)	// I-pcb of IFD,ICC
{
	if(!dir)
	{		
		if(SPCBI_buff[slot] & 0x40)	return 1;// IFD						
		else	return 0;
	}
	else
	{		
		if(RPCBI_buff[slot] & 0x40)	return 1;// ICC					
		else	return 0;
	}
}
/*------------------------------------------------------------------------*/
void ISO7816_MakeRsequenceR(u8 slot)	// R-pcb of IFD
{		
	if(ISO7816_ReadSeqbitI(slot,1)) SPCBR_buff[slot] &= 0xef;				
	else	SPCBR_buff[slot] |= 0x10;
}
/*------------------------------------------------------------------------*/
void ISO7816_MakeChainbit(u8 slot,u8 chain)	// I-pcb of IFD
{
	if(chain == 0) SPCBI_buff[slot] &= 0xdf;				
	else	SPCBI_buff[slot] |= 0x20;
}


/*------------------------------------------------------------------------*/
/*u16 ISO7816_ReadSeqbitR(u8 slot,u8 dir)	// R-pcb of IFD,ICC
{
	if(!dir)
	{		
	   if(SPCBR_buff[slot] & 0x10)	// IFD
						return 1;
			else	return 0;
	}
	else
	{		if(RPCBR_buff[slot] & 0x10)	// ICC
						return 1;
			else	return 0;
	}
}*/

/*--------------------------------------------------------------------------*/
void ISO7816_ReceiveT0comp(u8 ins,u8 len,u8 *rbuff)
{
	u8	ch,ins_c;	
	u16		i,j,rlen;
	
	i = 0;
	j = 1;
	rlen = len + 3;	// INS+data+SW
	ins_c = ins ^ 0xff;
	
	ictx_buffer[i++] = ins;
	
	while(1)
	{		
		if(j != ISO7816_Rcv_Len_Get())
		{	
			ch = rbuff[ISO7816_Rcv_Len_Get()-1];
			if((ch != ins) && (ch != ins_c))// real data ?
			{
			
				ictx_buffer[i++] = ch;
				
				if(i == rlen)
				{		
					memcpy(rbuff,ictx_buffer,rlen);
					return;
				}
			}			
			j++;
		}
	}
}			

//2011.11.16 SC_SlotCheck()->ISO7816_SlotCheck()
u8 ISO7816_SlotCheck(u8 slot)
{
	u8 i;
	for(i=0;i<10;i++){
		if(SC_SlotCheck(slot) == 0)	return 0;	
		//Delay_ms(2);	
		Delay_1us_GT(2000);		 
	}
	return 1;
}	

/*=========================================================================*
 *		Transport Layer	(T=0)																						 		 *
 *=========================================================================*/
u8 ISO7816_TransReceiveT0(u8 wcase,u8 slot,u16 slength,u8 *sbuff,u8 *rbuff)
{
	u8  ch,ins_c;
	u16		clength;
	u8		start_flag;
	u8 null_cnt=0; //2019.08.23

	icsend_ptr = sbuff;
	icsend_len = slength;
	icrcv_ptr = rbuff;
	SC_Rcv_Len_Clr();
	start_flag = 0;
	ins_c = sbuff[1] ^ 0xff;
	//lc = sbuff[4];

	Clear_snsts_byte();
	//DebugUSBMsg(DBG_LV,"\n WCASE %c ",wcase);
//USB_Printf("\nSC_Send_Data.C=BWT=%d, CWT=%d",sc_BWT,sc_CWT);		//2019.08.23
	SC_Send_Data(slot,icsend_len,sbuff);
	Clear_snsts_byte();
	SC_RxIntControl_Enable(slot);
	
// receive ------------------------------------------/

	while(1)
	{
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
//USB_Printf("w[b=%d,c=%d,r=%d]",icc_BWT_cnt,icc_BWT_cnt,ISO7816_Rcv_Len_Get());		//2019.08.23

		if(!start_flag && ISO7816_Rcv_Len_Get())
		{
			ch = rbuff[0];
			#ifndef CCID
			#if DEBUG_TEST
			/**/DEBUG_Printf("\nPB=%2x,",ch);
			#endif
			#endif
			//ch = 0xb0;		//for Le==0x00 test
			if(ch == 0x60)	// WWT extention request
			{	
				//USB_Printf("\nSC_BWT_CWT_Clear() Null(60) Rx...",ISO7816_Rcv_Len_Get()); //2019.08.23
				//DebugUSBMsg(DBG_LV,"WWT extention request");	
				icrcv_ptr = rbuff;	// memory initial
				SC_Rcv_Len_Clr();
				//2011.11.12
				SC_BWT_CWT_Clear();
				//2019.08.23
#ifdef WDT_ENABLE				
				Wdt_Clock();
#endif
				if(++null_cnt >= 5)	return PROCESS_ERR;
			}	
			else
			{		
				start_flag = 1;					
				//어짜피 아래를 탈 것임. 2011.10.15 HTY 
				/*if(ch == 0xc0)	// Get response
				{	
					//DebugUSBMsg(DBG_LV,"Get response");
					clength = sbuff[4];
					clength += 3;
				}
				else*/
				if(ch == sbuff[1])
				{		
					if(wcase == CASE2)	// CASE 2	
					{		
						clength = sbuff[4];
						clength += 3;
						
						//2011.08.25 HTY add
						if(clength == 3){
							clength = 259;
#ifndef COMPACT_MEM
#if DEBUG_TEST
							DebugUSBMsg(DBG_LV,"\nLe==0x00, rx= pb,data[256],sw[2].");
#endif
#endif
						}
					}
					else 
					{
						//DebugUSBMsg(DBG_LV,"INS feedback(ACK)");
						//SC_Send_Data(slot,lc,sbuff+5);
						clength = 1;// INS feedback(ACK)
						//SC_Rcv_Len_Clr();
					}
				}
		
				else if(ch == ins_c)// INS complemented(NACK)
				{		
					if(wcase == CASE2)
					{		
						ISO7816_ReceiveT0comp(sbuff[1],sbuff[4],rbuff);
						return MI_OK;
					}
					if((wcase == CASE3) || (wcase == CASE4)) 
					{
//						DebugUSBMsg(DBG_LV,"INS complemented(NACK)");
						clength = 1;
						
					}							
				}
		
				else if((ch > 0x60) && (ch <= 0x9f)) 
				{
//					DebugUSBMsg(DBG_LV,"clength = 2;// Status Word");
					clength = 2;// Status Word	
				}							
				else{
					
					return PROCESS_ERR;// error
				}
			}
		}		
		else if(start_flag)
		{		
			//2011.11.12 HTY add for Oberchur Cosmo 16 RSA 3.5
			//datacard에서 case4에서 0x006060이 리턴되는 문제가 발생됨  2011.10.15
			//확인 결과 get_response(case2) 수행하여 C0 후 00606060609000이 들어옴. 
			//if(ISO7816_Rcv_Len_Get() >= (clength-1)){
			//2021.07.21 
			if((ISO7816_Rcv_Len_Get() > 1)&& (ISO7816_Rcv_Len_Get() >= (clength-1))){
				if(clength>2) {
					if(rbuff[clength-2] == 0x60){
						//icrcv_ptr--;	//icrcv_ptr[icrcv_len] = chr;
						SC_Rcv_Len_Dec();	
						SC_BWT_CWT_Clear();
						#ifndef CCID
						#if DEBUG_TEST
						/**/DEBUG_Printf("%2x%2x.",rbuff[clength-3],rbuff[clength-2]);				
						#endif
						#endif
					}
				}
			}
			if(ISO7816_Rcv_Len_Get() == clength){
				return MI_OK;
			}
		}
			
		if(BWTint_Flag)	
		{
//			DebugUSBMsg(DBG_LV,"BWT_ERR1");
			return BWT_ERR;	// block and character
		}
		if(CWTint_Flag)	
		{
//			DebugUSBMsg(DBG_LV,"CWT_ERR1");
			return CWT_ERR;	//090203
		}

		//if(PARITYint_flag || SC_SlotCheck(slot)) 
		//	return PROCESS_ERR;	
		if(PARITYint_flag) 			return PROCESS_ERR;	
		if(ISO7816_SlotCheck(slot)) return SLOT_ERR;	
	}
}


u8 ISO7816_TransReceiveT0_Data(u8 slot,u16 slength,u8 *sbuff,u8 *rbuff)
{
	u8  ch;
	u16		clength;
	u8		start_flag;
	//u8 lc;

	//2012.07.25
#ifdef ANTITEARING
	if(AntiTearing_Occured()){	
		DebugUSBMsg(DBG_LV,"\n AntiTearing Escape...");
		return MI_ACCESSTIMEOUT;
	}
#endif
				
	icsend_ptr = sbuff;
	icsend_len = slength;
	icrcv_ptr = rbuff;
	SC_Rcv_Len_Clr();
	start_flag = 0;
	//lc = sbuff[4];

	Clear_snsts_byte();
	//DebugUSBMsg(DBG_LV,"\n WCASE %c ",wcase);
	SC_Send_Data(slot,icsend_len,sbuff);
	Clear_snsts_byte();
	SC_RxIntControl_Enable(slot);

	//DebugUSBMsg(DBG_LV,"\n Tx finish......");

// receive ------------------------------------------/

	while(1)
	{
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
		if(!start_flag && ISO7816_Rcv_Len_Get())
		{
			
			ch = rbuff[0];
			//ch = 0x00;
			if(ch == 0x60)	// WWT extention request
			{	
#ifndef COMPACT_MEM
#if DEBUG_TEST
				DebugUSBMsg(DBG_LV,"WWT extention request[0x60 rx]");	
#endif
#endif
				icrcv_ptr = rbuff;	// memory initial
				SC_Rcv_Len_Clr();
			}	
			else
			{		
				//start_flag = 1;					
				//clength = 2;// Status Word	
				//datacard에서 0x006060이 리턴되는 문제가 발생됨  2011.10.15
				//2011.10.25 HTY
				if((ch>0x60) && (ch<=0x9F)){	//SW1
					start_flag = 1;					
					clength = 2;// Status Word	
				}
				else{
#ifndef COMPACT_MEM
#if DEBUG_TEST
					DebugUSBMsg(DBG_LV,"SW1 rule error[sw1 err=%02x]\n",ch);	
#endif
#endif
					//Uart_Printf("SW1 rule error[sw1 err=%02x]",ch);	
					icrcv_ptr = rbuff;	// memory initial
					SC_Rcv_Len_Clr();
				}
			}
		}		
		else if(start_flag)
		{		
			if(ISO7816_Rcv_Len_Get() == clength)		return MI_OK;
		}		
		if(BWTint_Flag)	
		{
			#ifndef CCID
			#if DEBUG_TEST
			DEBUG_Printf("BWT_ERR1");
			#endif
			#endif
			//DEBUG_Printf("\nBWT_ERR1(%d) ",icc_BWT_cnt);
			return BWT_ERR;	// block and character
		}
		if(CWTint_Flag)	
		{
			#ifndef CCID
			#if DEBUG_TEST
			DEBUG_Printf("CWT_ERR1");
			#endif
			#endif
			//DEBUG_Printf("\nCWT_ERR1(%d) ",icc_CWT_cnt);
			return CWT_ERR;	//090203
		}
				
		//if(PARITYint_flag || SC_SlotCheck(slot)) 
		//2011.11.16
		if(PARITYint_flag) return PROCESS_ERR;	
		if(ISO7816_SlotCheck(slot)) return SLOT_ERR;	
	}
}


/*------------------------------------------------------------------------*/
u16 ISO7816_GetResponse(u8 slot,u8 len,u8 *rapdu,u8 *retcode)
{
	u8 	get_response[5] = { 0x00,0xc0,0x00,0x00,0x00 };
	u8 	ret;
	u16		rptr,slen;

	rptr = 0;
	slen = len;
	#ifndef CCID
	#if DEBUG_TEST
	DEBUG_Printf("\n Get Response[%d] ",len);
	#endif
	#endif

	//2012.07.25
#ifdef ANTITEARING
	if(AntiTearing_Occured()){	
		DebugUSBMsg(DBG_LV,"\n AntiTearing Escape...");
		*retcode = MI_ACCESSTIMEOUT;
		return 0;
	}
#endif

	while(1)
	{		
		get_response[4] = (u8)slen;
		ret = ISO7816_TransReceiveT0(CASE2,slot,5,get_response,icrx_buffer);

		if(ret == MI_OK)
		{		
			*retcode = MI_OK;
			if(icrx_buffer[0] == 0xc0)
			{
				if(icrx_buffer[slen+1] == 0x61)	// more data exist ?
				{		
					memcpy(&rapdu[rptr],&icrx_buffer[1],slen);
					rptr += slen;
					slen = icrx_buffer[slen+2];
				}
				else
				{		
					memcpy(&rapdu[rptr],&icrx_buffer[1],slen+2);
					
					//DebugUSBMsg(DBG_LV,"\n PTR %x ",&rapdu[rptr]);
					//for(i=0;i<slen+2;i++) DebugUSBMsg(DBG_LV,"%2x",rapdu[i]);
					return rptr+slen+2;
				}
			}
			
			else// error SW
			{		
				memcpy(rapdu,icrx_buffer,2);
				return 2;
			}
		}
		
		else
		{		
			//SC_Deactivation(slot);
			*retcode = ret;
			return 0;		
		}
		
	}				
}
/*------------------------------------------------------------------------*/
u16 ISO7816_Warning62(u8 slot,u8 *rapdu,u8 *retcode)
{
	u8 	get_response[5] = { 0x00,0xc0,0x00,0x00,0x00 };
	u8 	ret;

 	ret = ISO7816_TransReceiveT0(CASE2,slot,5,get_response,icrx_buffer);

	if(ret == MI_OK)
	{
		if(icrx_buffer[0] == 0x6c)
			return ISO7816_GetResponse(slot,icrx_buffer[1],rapdu,retcode);
		else
		{		
			memcpy(rapdu,icrx_buffer,2);
			return 2;
		}
	}
	
	//SC_Deactivation(slot);
	*retcode = ret;
	return 0;
}

										
/*--------------------------------------------------------------------------*/
u8 ISO7816_TransReceiveT0comp(u8 ins,u8 slot,u16 slength,u8 *sbuff,u8 *rbuff)
{
	int		i;
	u8  ch[2];  // 기존 2
	//int		i;
	u8		end_flag;
	//2021.08.18
	u8 ins_cmp;

	//2012.07.25
#ifdef ANTITEARING
	if(AntiTearing_Occured()){	
		DebugUSBMsg(DBG_LV,"\n AntiTearing Escape...");
		return MI_ACCESSTIMEOUT;
	}
#endif

	end_flag = 0;
	Clear_snsts_byte();

	ch[0] = (ins ^ 0xff); // //ch[0]가 여기서 XOR되어 A4 ^ FF 5B로 변경? 이종범
	//2021.08.18
	ins_cmp = ch[0];
	
// trans and receive ----------------------------/

	//if( rbuff[0] == 0x5B)	slength = 1;

	for(i=0; i<slength; i++)
	{
		icsend_ptr = &sbuff[i];
		SC_Rcv_Len_Clr();
		
		if(ch[0] == ins)
		{		
			icsend_len = slength-i;	// remain data
			icrcv_ptr = rbuff;
			end_flag = 1;
		}
		else 	//ch[0] == ins_cmp or Null(0x60)
		{		
			icsend_len = 1;
		
			if(i == slength-1)	// last byte ?
			{		icrcv_ptr = rbuff;
					end_flag = 1;
			}
			else icrcv_ptr = ch; //여기로 빠진다?? 이종범
			//else if(ch[0] == 0x5B) {
			//	icrcv_ptr = ch;
			//}
						
		}
							
		//SNtxmode(slot);
		//while(icsend_len);
		//Delay_1us(800);
		Delay_ms(1);		
		SC_Send_Data(slot,icsend_len,icsend_ptr);
		Clear_snsts_byte();
		SC_RxIntControl_Enable(slot);
		
		
		if(end_flag) break;	// send all data ?	
		//2021.08.18
		/*while(ISO7816_Rcv_Len_Get() == 0){
			if(CWTint_Flag||BWTint_Flag)	//2010.01.16
			{
//					DebugUSBMsg(DBG_LV,"CWT_ERR1");
				return MI_ERROR;	//090203
			}
		}*/	
				
		if(ch[0] == 0x60)	// 60+INS ?
		{		
			while(ISO7816_Rcv_Len_Get() != 2)
			{
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
				//if(SC_CWTint_Flag()|SC_BWTint_Flag())	
				if(CWTint_Flag||BWTint_Flag)	//2010.01.16
				{
//					DebugUSBMsg(DBG_LV,"CWT_ERR1");
					return MI_ERROR;	//090203
				}
			}
			ch[0] = ch[1];
		}
		//2021.08.18
		else if(ch[0] == ins_cmp) {
			while(ISO7816_Rcv_Len_Get() != 1)
			{
				if(CWTint_Flag||BWTint_Flag)	//2010.01.16
				{
//					DebugUSBMsg(DBG_LV,"CWT_ERR1");
					return MI_ERROR;	//090203
				}
			}
			SC_Rcv_Len_Clr();
		}
	}
	
// receive --------------------------------------/			

	while(ISO7816_Rcv_Len_Get() != 2)	// (60)+SW
	{		
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
		if(ISO7816_Rcv_Len_Get() && (rbuff[0] == 0x60))
		{		
			icrcv_ptr = rbuff;
			SC_Rcv_Len_Clr();
		}
		//if(SC_CWTint_Flag()|SC_BWTint_Flag())	2010.01.16
		if(CWTint_Flag||BWTint_Flag)	
		{
//			DebugUSBMsg(DBG_LV,"CWT_ERR1");
			return MI_ERROR;	//090203
		}
	}
	return MI_OK;
}
/*------------------------------------------------------------------------*/
/*
int ISO7816_Warning6c(char slot,u8 len,u8 *rtyheader,u8 *rapdu,u8 *retcode)
{
	u8	ret;
//	DebugUSBMsg(DBG_LV,"\n ISO7816_Warning6c ");
	rtyheader[4] = len;
	ret = ISO7816_TransReceiveT0(CASE2,slot,5,rtyheader,icrx_buffer);
	
	if(ret == MI_OK)
	{
		if(icrx_buffer[0] == rtyheader[1])
		{		
			memcpy(rapdu,&icrx_buffer[1],rtyheader[4]+2);
			return rtyheader[4]+2;
		}
		
		if(icrx_buffer[0] == 0x61)
			return ISO7816_GetResponse(slot,icrx_buffer[1],rapdu,retcode);
				
		else
		{		
			memcpy(rapdu,icrx_buffer,2);
			return 2;
		}
	}
	
	//SC_Deactivation(slot);
	*retcode = ret;
	return 0;
}
*/

/*=========================================================================*
 *	T=0 Protocol Layer 																										 *
 *=========================================================================*/
u16 ISO7816_T0_process(u8 slot,u8 wcase,u8 *tpdu,u8 *rapdu,u8 *retcode)
{
	u8	header[5];
	u8	ret;
	//2011.08.25 HTY
	u8 exp_len;
	u32 egt;

//DebugUSBMsg(DBG_LV,"\nt1=%d ",Get_Tick());
	if(wcase == CASE4){
		exp_len = tpdu[5+tpdu[4]];
		
#ifndef COMPACT_MEM
#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\ncase4, exp_len=%d ",exp_len );
#endif
#endif
		//DebugUSBMsg(DBG_LV,"\ncase4, exp_len=%d [%2x %2x]",exp_len,tpdu[4],tpdu[5+tpdu[4]] );
	}
    
	memcpy(header,tpdu,5);
	if(wcase == CASE1)		header[4] = 0x00;
	ret = ISO7816_TransReceiveT0(wcase,slot,5,header,icrx_buffer);
	//DebugUSBMsg(DBG_LV,"\n ISO7816_TransReceiveT0()=%2x",ret);
	*retcode = ret;//2014.04.07 add
	if(ret == MI_OK)
	{											
		if((wcase == CASE1) || (wcase == CASE2))
		{
			if(icrx_buffer[0] == header[1])	// INS(PB)+data+SW
			{		
				//memcpy(rapdu,&icrx_buffer[1],header[4]+2);
				//return header[4]+2;
				memcpy(rapdu,&icrx_buffer[1],ISO7816_Rcv_Len_Get()-1);
				return ISO7816_Rcv_Len_Get()-1;
			}
			else// 9000,error SW
			{		
				memcpy(rapdu,icrx_buffer,2);
				return 2;
			}
		}
			
		else	// CASE3,4
		{
			if(icrx_buffer[0] == header[1]){ 
				//2011.11.12
				//Delay_ms(2);	//2011.11.16, 1->2
				//2012.07.24
				Delay_1us_GT(2000);
				
				//2010.01.16 by jbkim
				ret = ISO7816_TransReceiveT0_Data(slot,tpdu[4],&tpdu[5],icrx_buffer);
//DebugUSBMsg(DBG_LV,"\nt3=%d ",Get_Tick());
			}												
			else if(icrx_buffer[0] == (header[1]^0xff)){	// INS complement
				// 2021.08.17
				/*if(icrx_buffer[0] == 0x5B) {
					u8 up, cnt;
					ret = ISO7816_TransReceiveT0comp(header[1],slot,1,&tpdu[5+g_cnt],icrx_buffer);
					g_cnt++;
					//Delay_ms(11);
					//for(cnt=0; cnt<100; cnt++) {
					while(1) {
						Delay_1us_GT(1);
						up = Uartx_GetKey(UART_ICC);
						if(up > 0) {
							printf("\n1111 %02x", up);
							break;
						}
					}
					if((header[1]^up) != 0x5B) {
						printf("\n2222");
						return ret;
					}
				}
				else {*/
					//Delay_1us_GT(2000);
					ret = ISO7816_TransReceiveT0comp(header[1],slot,tpdu[4],&tpdu[5],icrx_buffer);
				//}
			}
			else// error SW
			{
				memcpy(rapdu,icrx_buffer,2);
				return 2;
			}
			*retcode = ret;
			if(ret == MI_OK)
			{
#ifndef AUTO_GET_RESP	//2014.02.25 for DE-600 protocol
				if(wcase == CASE4)//2009.10.29. Case4에서만 처리
#endif
				{
					if(icrx_buffer[0] == 0x61)
					{
						//2011.11.12 add
						//Delay_ms(1);	//GT = at least 12etu
						//2011.11.16 extend
						//Delay_ms(5);	//GT = at least 12etu
						//2012.07.24
						Delay_1us_GT(5000);
		
						//2011.11.13 extra guard time
						//EGT[slot] = 5;	//for test
						if(EGT[slot]){
							egt = ISO7816_Get_ETU(FIDI[slot]);
							egt *= 1000000L;
							egt /= SC_Get_FCLK(slot);
							egt *= EGT[slot];
							Delay_1us(egt);
#ifndef COMPACT_MEM
#if DEBUG_TEST
							DebugUSBMsg(DBG_LV,"\nEGT = %duS",egt);
#endif
#endif
						}
						//2011.08.25 HTY
						if(exp_len == 0)	exp_len = icrx_buffer[1];
						else if(exp_len > icrx_buffer[1])	exp_len = icrx_buffer[1];
						//return ISO7816_GetResponse(slot,exp_len,rapdu,retcode);
						//2012.07.25
						ret  = ISO7816_GetResponse(slot,exp_len,rapdu,retcode);
//DebugUSBMsg(DBG_LV,"\nt4=%d ",Get_Tick());
						return ret;
					}
					
					else if((icrx_buffer[0] == 0x62) || (icrx_buffer[0] == 0x63) || (icrx_buffer[0] == 0x9f)){
						return ISO7816_Warning62(slot,rapdu,retcode);

					}
					else// 9000,error SW
					{		
						memcpy(rapdu,icrx_buffer,2);
						return 2;
					}
				}
#ifndef AUTO_GET_RESP	//2014.02.25 for DE-600 protocol
				else 
				{		
					memcpy(rapdu,icrx_buffer,2);
					return 2;
				}
#endif
			}
		}
	}
	//2014.04.01
	else{

	}
	//SC_Deactivation(slot);
	*retcode = ret;
	return 0;//MI_ERROR;
}

/*------------------------------------------------------------------------*/
u8 ISO7816_T1BlockCheck(u8 slot,u8 *buff)
{
	u16		rlen;
	u8	bcc,pcb,len,para;

// EDC,NAD check ---------------------------------/
	rlen = buff[2];	// EDC check
	rlen += 3;
	bcc = ISO7816_CalBcc(buff,rlen);	
	if(bcc != buff[rlen]){
		//USB_Printf("\n BCC error [%02x]", bcc);
		return EDC_ERR;
	}
	if(buff[0] != 0) return NAD_ERR; // NAD check
	pcb = buff[1];
	len = buff[2];
	para = buff[3];
// I block ---------------------------------------/										
	if(!(pcb & 0x80))		// I block (0xxxxxxx)
	{		
		if(len == 0)			// LEN check
		{		
			if(ISO7816_ReadChainbit(slot,1) == 0) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 Len error1");
				return LEN_ERR;	
			}					
		}
		PCBI_byte = pcb;		// sequence check
		if(ISO7816_ReadSeqbitI(slot,1) == (PCBI_byte>>6)&0x01) 
		{
//			DebugUSBMsg(DBG_LV,"\n T1 SEQ_ERR1");
			return SEQ_ERR;
		}
		RPCBI_buff[slot] = pcb;	// save PCB
		//DebugUSBMsg(DBG_LV,"\n T1 IBLOCK1");
		return IBLOCK;
	}			
// R block ---------------------------------------/
	else if((pcb & 0xe0) == 0x80)	// R block(100xxxxx)
	{		
		if(len != 0)	// LEN check
		{
//			DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR2");
			return LEN_ERR;
		}
		PCBR_byte = pcb;		// sequence check	
		if((pcb == 0x80) || (pcb == 0x90))	//error free
		{		
			RPCBR_buff[slot] = pcb;		// save PCB
			if(ISO7816_ReadSeqbitI(slot,0) == (PCBR_byte>>4)&0x01)  //block number error 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 RBLOCK_ERR_I2");
				return RBLOCK_ERR_I;// for Synario #1783
			}	
//			DebugUSBMsg(DBG_LV,"\n T1 RBLOCK_NERR2");		
			return RBLOCK_NERR;		//NO error, ACK
		}
		else	//0x01-CRC or parity error, 0x02-other error
		{		
			RPCBR_buff[slot] = pcb;		// save PCB
			if(ISO7816_ReadSeqbitI(slot,0) == (PCBR_byte>>4)&0x01)	//block number error 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 RBLOCK_ERR_I2");
				return RBLOCK_ERR_I;
			}	
//			DebugUSBMsg(DBG_LV,"\n T1 RBLOCK_ERR_R2");				
			return RBLOCK_ERR_R;	//Other error 
		}
	}

// S block ---------------------------------------/
	else if((pcb & 0xc0) == 0xc0)	// S block(11xxxxxx)
	{
		if(pcb == 0xc1)		// IFS request
		{		
			if(len != 1) return LEN_ERR;					
			if((para < 0x10) || (para == 0xff)) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 SPARA_ERR3");	
				return SPARA_ERR;	
			}
//			DebugUSBMsg(DBG_LV,"\n T1 SBLOCK_REQ3");				
			return SBLOCK_REQ;
		}
		else if(pcb == 0xe1)	// IFS response
		{		
			if(len != 1) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR3");
				return LEN_ERR;	
			}				
			if(SSPCB_buff[slot] != para) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 SPARA_ERR3");
				return SPARA_ERR;
			}				
			return SBLOCK_RES;
		}
		else if(pcb == 0xc3)// WTX request
		{		
			if(len != 1) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR3");
				return LEN_ERR;	
			}	
//			DebugUSBMsg(DBG_LV,"\n T1 SBLOCK_REQ3");				
			return SBLOCK_REQ;
		}
		else if(pcb == 0xe3) // WTX response
		{		
			if(len != 1) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR4");
				return LEN_ERR;	
			}		
			if(SSPCB_buff[slot] != para) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 SPARA_ERR4");
				return SPARA_ERR;	
			}	
//			DebugUSBMsg(DBG_LV,"\n T1 SBLOCK_RES4");		
			return SBLOCK_RES;
		}
		else if(pcb == 0xc0)// Resynch request
		{		
			if(len != 0) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR5");
				return LEN_ERR;	
			}
//			DebugUSBMsg(DBG_LV,"\n T1 SBLOCK_REQ5");				
			return SBLOCK_REQ;
		}
		else if(pcb == 0xe0)// Resynch response
		{		
			if(len != 0) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR6");
				return LEN_ERR;	
			}
//			DebugUSBMsg(DBG_LV,"\n T1 SBLOCK_RES6");					
			return SBLOCK_RES;
		}
		else if(pcb == 0xc2)// Abort request
		{		
			if(len != 0) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR7");
				return LEN_ERR;	
			}	
//			DebugUSBMsg(DBG_LV,"\n T1 SBLOCK_REQ7");				
			return SBLOCK_REQ;
		}
		else if(pcb == 0xe2)// Abort response
		{		
			if(len != 0) 
			{
//				DebugUSBMsg(DBG_LV,"\n T1 LEN_ERR8");
				return LEN_ERR;	
			}
//			DebugUSBMsg(DBG_LV,"\n T1 SBLOCK_RES8");					
			return SBLOCK_RES;
		}
	}
//	DebugUSBMsg(DBG_LV,"\n T1 BLOCK_WRONG");					
	return BLOCK_WRONG;
}
/*=========================================================================*
 *		Transport Layer	(T=1)																						 		 *
 *=========================================================================*/
u8 ISO7816_TransReceiveT1(u8 slot,u16 slength,u8 *sbuff,u8 *rbuff)
{
	int		clength;
	u8  	start_flag;
	u32 i=0;
	//2021.08.27 Moon testing
	unsigned int stime = 0;
	unsigned int etime = 0;
	int len=0;
	u8 cwi_err_flag = 0; //2021.08.27 Moon testing

	icsend_ptr = sbuff;
	icsend_len = slength;
	icrcv_ptr = rbuff;
	SC_Rcv_Len_Clr();
	start_flag = 0;
	
	Clear_snsts_byte();

	//2019.06.13
	clength = 0;
	
// trans -------------------------------------------/

	/*SNtxmode(slot);
	while(icsend_len)
	{		
		if(SC_SlotCheck(slot)) return PROCESS_ERR;					
	}*/
	//DebugUSBMsg(DBG_LV,"\n ISO7816_TransReceiveT1 ");
	
	/**/
	#ifndef CCID
	#if DEBUG_TEST
	DEBUG_Printf("\nT1 Tx(tk=%d) :",Get_Tick());
	for(i=0;i<icsend_len;i++){
		DEBUG_Printf("%02x ",sbuff[i]);
	}
	DEBUG_Printf("\n\r");
	//Delay_ms(300); //2019.06.13 for test
	#endif
	#endif
	//Delay_ms(2);	//2011.11.12 BGT
	//Delay_ms(10);	//2011.11.16 BGT
	//2012.07.24
	Delay_1us_GT(10000);
	
	if(icsend_len)
		SC_Send_Data(slot,icsend_len,sbuff);
	Clear_snsts_byte();
	SC_RxIntControl_Enable(slot);
	
// receive -----------------------------------------/
#if 1	
	while(1)
	{	
		i++;
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
		//if((i%10000)==0) printf("<>");	
		if(icrcv_len == 1)	stime = Get_Tick();//2021.08.27 Moon testing
		if(!start_flag && (ISO7816_Rcv_Len_Get() >= 3))	// NAD+PCB+LEN+datas+EDC
		{
			clength = rbuff[2];
			clength += 4; //nad,pcd,length, LRC
			start_flag = 1;
		}	
		else if(start_flag)
		{
			if(ISO7816_Rcv_Len_Get() == clength){
//2021.08.27 Moon testing
#if 0						
				etime = Get_Tick();
				//printf("Spec Time[%d]ms, Real Read Time[%d]ms,length[%d]\n",((12*(clength-1))*g_etu)/1000,etime-stime,clength);
				if(cwi_err_flag){
					cwi_err_flag = 0;
					printf("CWT Error\n");
					return CWT_ERR;
				}
#endif				
				//Delay_ms(4);
				//if(CWTint_Flag == 1){
				//	return CWT_ERR;
				//}
				//printf("clength[%d][%x]\n",clength,rbuff[2]);
				
				#ifndef CCID
				#if DEBUG_TEST
				DEBUG_Printf("\nT1 Rx(%d) :",Get_Tick());
				for(i=0;i<clength;i++){
					DEBUG_Printf("%2x ",rbuff[i]);
				}
				DEBUG_Printf("\n\r");
				#endif
				#endif
				return MI_OK;
			}
//2021.08.27 Moon testing
#if 1			
			else{				
				if(icrcv_len == (clength-1)){			
						for(i=0;i<250;i++)	Delay_1us(1); //한바이트 읽고 다음 데이터 읽기 전 딜레이 188us
																//Delay_1us(250) 하면 안됨...
						if(ISO7816_Rcv_Len_Get() == clength-1){ //250us 쉬엇다가 데이터 체크
							//printf("Read Before EDC Time[%d]ms.Length[%d]\n",etime-stime,icrcv_len);
							//cwi_err_flag = 1;
							CWTint_Flag = 1;
						}				
				}
				//printf("L[%d],Buf[%x]\n",icrcv_len,rbuff[icrcv_len-1]);
			}
#endif						
			if(rbuff[2] == 0xff)// LEN error
			{		
				while(!CWTint_Flag){// wait till all byte receive
#ifdef ANDROID_NDK
					SC_CheckTime_Rx();
#endif
				}
				//USB_Printf("..EDC_ERR..\n\r");//2019.06.13
				//return EDC_ERR;	// for retry by R-block
				// 2021.08.24 NJS 
				return LEN_ERR;
			}
		}
#if 1		
//		if(wtctrl_buff[slot] == ENABLE)
		{
#if 1		
			if(!ISO7816_Rcv_Len_Get() && BWTint_Flag){
				//DEBUG_Printf("..BWT_ERR..\n\r");//2019.06.13
				//printf("..BWT_ERR..\n\r");//2019.06.13
				return BWT_ERR;// block wait time check
			}
#endif			
			//printf("CWTint_Flag[%d][%d][%d]\n",ISO7816_Rcv_Len_Get(),CWTint_Flag,test_cwi_flag);
			if(ISO7816_Rcv_Len_Get() && CWTint_Flag)// character(in block) guard time check
			{
				if(ISO7816_Rcv_Len_Get() == clength) return MI_OK;// for last character CWT interrupt			
				printf("..CWT_ERR\n\r");
				/**/DEBUG_Printf("..CWT_ERR(rx=%d[%02x%02x], to rx=%d).\n\r",ISO7816_Rcv_Len_Get(),rbuff[0],rbuff[1],clength);		//2019.06.13
				//2019.07.01
				//if(ISO7816_Rcv_Len_Get() > 3) DEBUG_Printf(">>(%d)%02x%02x%02x%02x%02x\n\r",ISO7816_Rcv_Len_Get(),rbuff[0],rbuff[1],rbuff[2],rbuff[3]);		//2019.06.13
				/*CWTint_Flag = 0;
				Delay_ms(10);
				if(ISO7816_Rcv_Len_Get() != clength) return CWT_ERR;
				*/
				return CWT_ERR;
			}
		}		
#endif		
		if(PARITYint_flag)	// parity error
		{		
			while(!CWTint_Flag){// wait till all byte receive
#ifdef ANDROID_NDK
				SC_CheckTime_Rx();
#endif
			}
			//DEBUG_Printf("..EDC_ERR2..\n\r");//2019.06.13
			//printf("..EDC_ERR2..\n\r");//2019.06.13
			return EDC_ERR;		// for retry by R-block
		}			
		if(ISO7816_SlotCheck(slot)) return SLOT_ERR;	
	}
#endif	
}
/*------------------------------------------------------------------------*/
u8 ISO7816_Rprocessing(u8 slot,u8 *buffer,u8 *wblock)
{
	u8	rblock[4] = { 0,0,0,0 };
	u8	ch;
	u8	ret,retry1,ch1;

// make R block --------------------------------------/
	ISO7816_MakeRsequenceR(slot);
	ch = SPCBR_buff[slot];
	if(*wblock == EDC_ERR)
				ch |= 0x01;	// EDC,parity error
	else	ch |= 0x02;		// other error
	
	rblock[1] = ch;	
	rblock[3] = ISO7816_CalBcc(rblock,3);
	
// send and receive ----------------------------------/						
	retry1 = 1;
	
	while(1)
	{
		ret = ISO7816_TransReceiveT1(slot,4,rblock,buffer);
		#ifndef CCID
		#if DEBUG_TEST
		//DEBUG_Printf("T1 ret = %2x.",ret);
		//printf("ISO7816_TransReceiveT1[%d]\n",ret);
		#endif
		#endif
		if(ret == MI_OK)
		{		
			ch1 = ISO7816_T1BlockCheck(slot,buffer);
			//printf("ISO7816_T1BlockCheck[%d]\n",ch1);
			*wblock = ch1;				
			if((ch1 == IBLOCK) || (ch1 == RBLOCK_NERR) || (ch1 == SBLOCK_REQ))
				return ret;
			// 2021.08.24 NJS Case 1785
			//else if((ch1==EDC_ERR)||(ch1==NAD_ERR)||(ch1==LEN_ERR)||(ch1==BLOCK_WRONG)||(ch==SPARA_ERR))
			else
			{
				parity_retry++;
				if(parity_retry < T1_TRY_CNT) {
					continue;
				}
			}
		}
		else if(ret == EDC_ERR) {
			*wblock = EDC_ERR;
			// 2021.08.24 NJS Case 1785 DTS00
			parity_retry++;
			if(parity_retry < T1_TRY_CNT) {
				continue;
			}
		}
		else return ret;
			
		if(lastsend_block == 'I')
		{		
			if(*wblock == RBLOCK_ERR_I)	// resend I-block ?
				return MI_OK;
		}
		//if(++retry1 == 2);				
		//else if(retry1 == 3)
		//else 
		if(++retry1 == T1_TRY_CNT)	//2011.11.16
		{		
			if(*wblock == RBLOCK_ERR_R);	
			else return PROCESS_ERR;
		}
		else return PROCESS_ERR;
	}
}
/*------------------------------------------------------------------------*/
void ISO7816_T1ProcessEnd(u8 slot,u8 *retcode,u8 err)
{
	//SC_Deactivation(slot);
	*retcode = err;
}

/*------------------------------------------------------------------------*/
u16 ISO7816_ReceiveChaining(u8 slot,u8 *buff,u8 *rapdu,u8 *retcode)
{
	u8	rblock[4] = { 0,0,0,0 };
	u16 	rptr;
	u8	wblock,retry1,ret;
	rptr = 0;
	memcpy(&rapdu[rptr],&buff[3],buff[2]);
	rptr += buff[2];
	while(1)
	{		
		if(ISO7816_ReadChainbit(slot,1))
		{		
			ISO7816_MakeRsequenceR(slot);
			rblock[1] = SPCBR_buff[slot];
			rblock[3] = ISO7816_CalBcc(rblock,3);

			retry1 = 0;
			T1sendr_flag = 0;
			while(1)
			{		
				if(!T1sendr_flag)
				{		
					ret = ISO7816_TransReceiveT1(slot,4,rblock,icrx_buffer);
					if(ret == MI_OK)
						wblock = ISO7816_T1BlockCheck(slot,icrx_buffer);		
				}
				else T1sendr_flag = 0;				
				if(ret == MI_OK)
				{		
					if(wblock == IBLOCK)
					{		
						memcpy(&rapdu[rptr],&icrx_buffer[3],icrx_buffer[2]);
						rptr += icrx_buffer[2];
						break;
					}
				}		
				else if(ret == EDC_ERR)
						wblock = EDC_ERR;	
						
				else
				{		
					ISO7816_T1ProcessEnd(slot,retcode,ret);
					return 0;//MI_ERROR;
				}						
		

				if(wblock == RBLOCK_ERR_R)
				{		
					//if(++retry1 == 3)
					if(++retry1 == T1_TRY_CNT)	//2011.11.16
					{ 	
						ISO7816_T1ProcessEnd(slot,retcode,PROCESS_ERR);
						return 0;//MI_ERROR;
					}
				}
				else
				{		
					lastsend_block = 'R';
					ret = ISO7816_Rprocessing(slot,icrx_buffer,&wblock);
					T1sendr_flag = 1;
					retry1 = 0;
				}
					
			}
		}
		
		else return rptr;
	}
}

/*--------------------------------------------------------------------------*/
u8 ISO7816_SblockResponse(u8 slot,u8 *buffer,u8 *wblock)
{
	u8	R[5],len;
	u8	retry1,ch,ret;
	u8		Rerr_flag;

// make S response block ----------------------------------/
	memcpy(R,buffer,5);

	if(R[1] == 0xc1)// IFS
	{		
		R[1] = 0xe1;
		R[4] = ISO7816_CalBcc(R,4);
		len = 5;		
		IFSC_buff[slot] = R[3];
		//DebugUSBMsg(DBG_LV,"\n IFSC_buff[slot] %2x",IFSC_buff[slot]);
	}	
	else if(R[1] == 0xc3)// WTX
	{		
		R[1] = 0xe3;
		R[4] = ISO7816_CalBcc(R,4);
		len = 5;		
		WTXmultiply(slot,R[3]);
	}
	
	else if(R[1] == 0xc0)// Resynch
	{		
		R[1] = 0xe0;
		R[3] = ISO7816_CalBcc(R,3);
		len = 4;		
		T1resynch_flag = 1;
	}	
	else if(R[1] == 0xc2)// Abort
	{		
		T1abort_flag = 1;
		return MI_OK;
	}
	
// send and receive --------------------------------------/		
	retry1 = 0;
	Rerr_flag = 0;	
	while(1)
	{		
		if(!Rerr_flag)
		{
			//printf("\nData => ");//2021.08.26 Moon
			//for(int i=0;i<len;i++)	printf("%02x ",R[i]);
			//printf("\n");
			ret = ISO7816_TransReceiveT1(slot,len,R,buffer);
			//printf("ret[%d] WTX[%d] Timeout[%d]\n",ret,gBWT[slot],icc_BWT_cnt);
			if(ret == MI_OK)
				*wblock = ISO7816_T1BlockCheck(slot,buffer);
		}
		else Rerr_flag = 0;	
		if(ret == MI_OK)
		{		
			ch = *wblock;
			if((ch == IBLOCK) || (ch == RBLOCK_NERR) || (ch == SBLOCK_REQ))
				return MI_OK;
		}	
		else if(ret == EDC_ERR)
			*wblock = EDC_ERR;
				
		else return ret;
		
		
		if(*wblock == RBLOCK_ERR_R)
		{	
			//if(++retry1 == 3)
			if(++retry1 == T1_TRY_CNT)		//2011.11.16
				return PROCESS_ERR;
		}
		else 
		{		
			lastsend_block = 'S';
			Rerr_flag = 1;
			ret = ISO7816_Rprocessing(slot,buffer,wblock);
		}
	}
}

/*------------------------------------------------------------------------*/
/*
u16 ISO7816_CalcuT1Block(u8 wcase,u8 *tpdu)
{
	u16	i;
	
	if(wcase == CASE1)// header
	{		
		memcpy(ictx_buffer,tpdu,4);
		//2011.10.15 hty mark
		//ictx_buffer[4] = 0x00;
		//i = 5;
		i = 4;
	}
	else if(wcase == CASE2)// header+le
	{		
		memcpy(ictx_buffer,tpdu,5);
		i = 5;
	}		
	else if(wcase == CASE3)	// header+lc+data
	{		
		memcpy(ictx_buffer,tpdu,tpdu[4]+5);
		i = tpdu[4]+5;
	}
	//2011.10.18 HTY add
	else if(wcase == CASE4)	// header+lc+data+le
	{		
		memcpy(ictx_buffer,tpdu,tpdu[4]+6);
		i = tpdu[4]+6;
	}
	else{
		i = tpdu[5];	i*=256;
		i += tpdu[6];
		if(wcase == CASE2e)// header+le
		{		
			memcpy(ictx_buffer,tpdu,7);
			i = 7;
		}		
		else if(wcase == CASE3e)	// header+lc+data
		{		
			i += 7;
			memcpy(ictx_buffer,tpdu,i);
		}
		else// apdu+eLc[2]+data+eLe[2]
		{		
			i += 9;
			memcpy(ictx_buffer,tpdu,i);
		}	
	}
	///////////////////////////////////////////////
	
	memcpy(tpdu,ictx_buffer,i);
	//DebugUSBMsg(DBG_LV,"\n wcase %c, len %d ",wcase,i);
	return i;
}*/
/*------------------------------------------------------------------------*/	
void ISO7816_MakeT1Block(u8 slot,u16 slen,u8 *tpdu,u8 *buffer)
{
	u8  bcc;
	u16 	sslen;
	//u16 bcc2;
	
	
	//slen = 5;
    
	buffer[0] = 0x00;// NAD
	buffer[1] = SPCBI_buff[slot];// I block PCB
	buffer[2] = slen;// LEN
		
	memcpy(&buffer[3],tpdu,slen);// datas
	sslen = slen+3;
	bcc = ISO7816_CalBcc(buffer,sslen);	// EDC
	buffer[sslen] = bcc;
	
}

/*
void ISO7816_MakeT1eBlock(u8 slot,u16 slen,u8 *tpdu,u8 *buffer)
{
	u8  bcc;
	u16 	sslen;
  
	buffer[0] = 0x00;// NAD
	buffer[1] = SPCBI_buff[slot];// I block PCB
	buffer[2] = slen+2;// LEN

	memcpy(&buffer[3],tpdu,slen+2);// datas
	sslen = slen+5;
	bcc = ISO7816_CalBcc(buffer,sslen);	// EDC
	buffer[sslen] = bcc;
	
}*/



/*=========================================================================*
 *	T=1 Protocol Layer 																										 *
 *=========================================================================*/
//u16 ISO7816_T1_process(u8 slot,u8 wcase, u8 *tpdu,u8 *rapdu,u8 *retcode)
//2011.10.24
u16 ISO7816_T1_process(u8 slot,u8 wcase,u16 tlength, u8 *tpdu,u8 *rapdu,u8 *retcode)
{
	u8	slen;
	u16		tlen,ttlen,sptr1,retlen;//,rlen;
	u8	retry1,wblock,ret;
    //printf("t0 ");
  if(ifsd_size_flag){
		ifsd_size_flag = 0;
		//2011.11.18 for test
		//CGT[slot] = 1;
		
#ifdef EMV
		//2012.03.26 for test
		//SC_PPS_Flag(slot,1);
		
		//2011.11.18 
		//Set_ATR_Cwt_Bwt(1);	//wait response for 1000ms //2021.08.26 Moon Delete	
		SC_Set_BWT(slot,BWI[slot]);//2021.08.26 Moon 
		SC_Set_CWT(slot,CWI[slot]);//2021.08.26 Moon 
		//printf("BWI Val[%d][%d]\n",BWI[slot],gBWT[slot]);

		//2021.08.27 Moon
    Delay_1us_GT(1000);
		
//2019.07.01 delete for test
		ret = ISO7816_SblockRequest(slot,0xc1,0xfe);// IFSD size is 254
		if(ret != MI_OK)	return MI_ERROR; //2021.08.26 Moon
		//printf("@#@#$@#%@#%\n");
//2020.06.10 delete for test
		//ret = ISO7816_SblockRequest(slot,0xc1,0xfc);// IFSD size is 252 for extended length
#ifndef COMPACT_MEM
#if DEBUG_TEST
    DebugUSBMsg(DBG_LV,"\nIFSD size set ret=%d.\n",ret);
#endif
#endif
    //Delay_ms(2);	//BGT = 22uS
    //2012.07.24
    Delay_1us_GT(2000);

		//2012.03.26 for test
		//SC_PPS_Flag(slot,0);

		
		
    //2011.11.18
    //SC_Load_BWT(slot); //2021.08.27 test moon
		//SC_Load_CWT(slot); //2021.08.27 test moon
#endif
	}
	//ttlen = ISO7816_CalcuT1Block(wcase,tpdu);
	//2011.10.24
	ttlen = tlength;
	
	//2020.06.10
	retlen = 0;
	parity_retry = 0; //2021.08.27 Moon Case 1772
	
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\nttlen=%d, case =%2x, IFSC=%d .",ttlen ,wcase,IFSC_buff[slot]);
#endif
#endif

#ifdef DEBUG_TIME	//2014.04.02
	exe_tick = Get_Tick();
	DebugUSBMsg(DBG_LV,"\nstart2=%d ",exe_tick);
#endif
	while(1)
	{		
		tlen = ttlen;
		sptr1 = 0;
		T1resynch_flag = 0;
		
		while(1)
		{		
			if(tlen > IFSC_buff[slot])
			{	
				slen = IFSC_buff[slot]; //40 error return
				tlen -= slen;										
				//printf("t2 ");
				ISO7816_MakeChainbit(slot,1);
				//DebugUSBMsg(DBG_LV,"\n Make Chain bit1 ");
				//printf("t3 ");
			}
			else
			{		
				slen = tlen;
				//printf("t4 ");
				ISO7816_MakeChainbit(slot,0);
				//printf("t5 ");
				//DebugUSBMsg(DBG_LV,"\n Make Chain bit0 ");
			}
			ISO7816_MakeT1Block(slot,slen,&tpdu[sptr1],ictx_buffer);
			//2019.06.13 make and not apply
			//2020.06.10
			//if(wcase <= CASE4)	ISO7816_MakeT1Block(slot,slen,&tpdu[sptr1],ictx_buffer);
			//else								ISO7816_MakeT1eBlock(slot,slen,&tpdu[sptr1],ictx_buffer);
			//DebugUSBMsg(DBG_LV,"\n ISO7816_MakeT1Block %d ",slen);
			//printf("t7 ");
			retry1 = 0;
			T1sends_flag = 0;
			T1sendr_flag = 0;
			
			while(1)
			{		
				if(!T1sendr_flag && !T1sends_flag)
				{	
					//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 1 ");	
					//printf("t8 ");
					//CWI[slot] = 10;
					//SC_Set_BWT(slot,BWI[slot]);
					//SC_Set_CWT(CWI[slot]);
					SC_Load_CWT(slot);
					//ret = ISO7816_TransReceiveT1(slot,slen+4,ictx_buffer,icrx_buffer);
					//2020.06.10 HTY
					//printf("CASE[%d][%d],!@#!@#!@#\n",wcase,sc_BWT);
					if(wcase <= CASE4)	ret = ISO7816_TransReceiveT1(slot,slen+4,ictx_buffer,icrx_buffer); //nad+pcb+len+bcc
					else 				ret = ISO7816_TransReceiveT1(slot,slen+6,ictx_buffer,icrx_buffer); //nad+pcb+len+ext len[2]+bcc
					//DebugUSBMsg(DBG_LV,"\n ret %x ",ret);
					//printf("\n ret %x \n",ret);
					*retcode = ret;	//2014.04.07 add
					if(ret == MI_OK){	
						wblock = ISO7816_T1BlockCheck(slot,icrx_buffer);
						//DEBUG_Printf("\nWB=%c[%02x]",wblock,wblock);
						//2021.08.25 HTY
						//printf("\nWB=%c[%02x]",wblock,wblock);
					}
					//2019.06.13 add for test
					//Delay_ms(200);
				}
				else
				{	
					//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 2 ");			
					T1sends_flag = 0;
					T1sendr_flag = 0;
				}
				
				//2019.11.25
				//USB_Printf("\n ret=%02x, wblock=%d. ",ret,wblock);	
				
				if(ret == MI_OK)
				{
					if(wblock == IBLOCK)	//'A'
					{	
						//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 3 ");	
						//printf("t11\n");
						//2021.08.27 Moon Not Set Multiply
						WTXmultiply(slot,0); 
						if(!ISO7816_ReadChainbit(slot,1))
						{		
							//printf("t22222\n");
							//printf("Data %02x %02x %02x %02x\n",icrx_buffer[0],icrx_buffer[1],icrx_buffer[2],icrx_buffer[3]);
							ConvSequenceI(slot);
							memcpy(rapdu,&icrx_buffer[3],icrx_buffer[2]);
							return icrx_buffer[2];
							
							//2020.06.10
							//rlen = icrx_buffer[2];
							//memcpy(rapdu+retlen,&icrx_buffer[3],rlen);
							//retlen += rlen;
							//return retlen;
						}
						else
						{		
							//DebugUSBMsg(DBG_LV,"\n ISO7816_T1 Chaining... ");	
							//in ISO7816_ReceiveChaining() receive all data include previous receive, 2020.06.10
							retlen = ISO7816_ReceiveChaining(slot,icrx_buffer,rapdu,retcode);
							//printf("retlen[%d], retcode[%d]\n",retlen,retcode);
							if(retlen) ConvSequenceI(slot);	
							//2020.06.10 read up, it is useless
							//rlen = ISO7816_ReceiveChaining(slot,icrx_buffer,rapdu+retlen,retcode);
							//retlen += rlen;
							//if(rlen) ConvSequenceI(slot);	
								
							//2019.06.13
							Delay_ms(1); 
													
							return retlen;
						}
					}			
					else if(wblock == RBLOCK_NERR)	//'B', No Error, =ACK
					{	
						//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 4 ");		
						//Delay_ms(2);	//2011.11.12 BGT, at ISO7816_T1_process()
						ConvSequenceI(slot);
						sptr1 += slen;
						break;
					}
					//2021.08.25 HTY
					else if(wblock == RBLOCK_ERR_I)		//'C' , block number error 
					{
						lastsend_block = 'R';
						ret = ISO7816_Rprocessing(slot,icrx_buffer,&wblock);
						//T1sendr_flag = 1;
						//retry1 = 0;						
					}
					
					else if(wblock == SBLOCK_REQ)	//'E'
					{	
						//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 5 ");	
						//printf("t12 \n");	
						//Delay_ms(2);	//2011.11.12 BGT, at ISO7816_T1_process()
						ret = ISO7816_SblockResponse(slot,icrx_buffer,&wblock);
						*retcode = ret;	//2014.04.07 add
						if(T1resynch_flag || T1abort_flag) break;								
						T1sends_flag = 1;
						retry1 = 0;
					}
				}					
				else if(ret == EDC_ERR) //'H'
				{
					//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 6 ");	
					wblock = EDC_ERR;	
				}			
				else
				{
					//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 7 ");	
					ISO7816_T1ProcessEnd(slot,retcode,ret);
					return 0;//MI_ERROR;
				}				
				if(T1sends_flag);						
				//else if(wblock == RBLOCK_ERR_I)		//block number error
				//2011.11.16
				//block number error and other error
				else if((wblock == RBLOCK_ERR_I) || (wblock == RBLOCK_ERR_R))		//'C' or 'D'
				{	
					//2011.11.18 for test
					//ConvSequenceI(slot);
					//ictx_buffer[1] ^= 0x40;
					//ictx_buffer[slen+3] ^= 0x40;
					
					//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 8 ");	
					//printf("t14 ");	
					//if(++retry1 == 3)// consecutive error check
					if(++retry1 == T1_TRY_CNT)//2011.11.16
					{		
						ISO7816_T1ProcessEnd(slot,retcode,PROCESS_ERR);
						return 0;//MI_ERROR;
					}
				}


				else	//2011.11.16, RBLOCK_ERR_R일 때 여기로 들어왔었음. 위로 들어감. 	
				{
					//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 9 ");	
					//printf("t15 ");

					//2021.08.25 HTY
					if(++retry1 >= T1_TRY_CNT)//2011.11.16
					{		
						ISO7816_T1ProcessEnd(slot,retcode,PROCESS_ERR);
						return 0;//MI_ERROR;
					}
					//printf("!!!!!!!!!![%d]\n",parity_retry);
					// 2021.08.24 NJS Case 1785
					parity_retry++;
					lastsend_block = 'I';
					ret = ISO7816_Rprocessing(slot,icrx_buffer,&wblock);
					//printf("ISO7816_Rprocessing[%x]\n",ret);
					T1sendr_flag = 1;
					retry1 = 0;
				}
			}
			if(T1resynch_flag)	// received resynch ?
			{		
				//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 10 ");	
				ISO7816_PcbByteInit(slot);
				break;
			}			
			if(T1abort_flag)// received abort ?
			{	
				//DebugUSBMsg(DBG_LV,"\n ISO7816_T1_process 11 ");		
				ISO7816_T1ProcessEnd(slot,retcode,PROCESS_ERR);
				return 0;//MI_ERROR;
			}				
		}
	}
}



#ifdef	EMV
/*--------------------------------------------------------------------------*/
u16 ISO7816_SblockRequest(u8 slot,u8 pcb,u8 para)
{
	u8	sblock[5] = { 0x00,0x00,0x00,0x00,0x00 };
	u16		slen;
	u8	ret,retry1,wblock;
// make S request block --------------------/
	sblock[1] = pcb;
		
	if((pcb == 0xc1) || (pcb == 0xc3))	// IFS,WTX
	{
		sblock[2] = 0x01;
		sblock[3] = para;
		sblock[4] = ISO7816_CalBcc(sblock,4);
		slen = 5;		
		SSPCB_buff[slot] = para;// for check when response
	}
	else	// Resynch,Abort
	{		
	  sblock[2] = 0x00;
		sblock[3] = ISO7816_CalBcc(sblock,3);
		slen = 4;
	}

// send and receive ----------------------------------------------/
	retry1 = 0;
		
	while(1)
	{		
		ret = ISO7816_TransReceiveT1(slot,slen,sblock,icrx_buffer);
//DEBUG_Printf("..TransReceiveT1=0x%2x..\n\r",ret);//2019.06.13
		//printf("..TransReceiveT1=0x%2x..\n\r",ret);//2019.06.13
		if(ret == MI_OK)
		{		
			wblock = ISO7816_T1BlockCheck(slot,icrx_buffer);
			if(wblock == SBLOCK_RES)
			{		
				if(pcb == (icrx_buffer[1] & 0xcf))	return MI_OK;// c0(e0),c1(e1),c2(e2),c3(e3)						
			}
		}		
		else if(ret != EDC_ERR)
		{		
			//SC_Deactivation(slot);
			return MI_ERROR;
		}
		
		//if(++retry1 == 3)
		if(++retry1 == T1_TRY_CNT)	//2011.11.16
		{		
			//SC_Deactivation(slot);
			return MI_ERROR;
		}
	}
}
#else
#endif

/*
u8 ISO7816_CaseAnalysis(u8 protocol, u16 rlen,u8 *lclen)
{
	u16 tx_len;
	
	if(rlen == 4) return CASE1;	// header
	else if(rlen == 5)	return CASE2;	// header+le
	else if(rlen == (lclen[0]+5)) return CASE3;	// header+lc+data
	else	return CASE4;	// header+lc+data+le		
}*/
//2011.10.18 HTY extended Le support
u8 ISO7816_CaseAnalysis(u8 protocol, u16 rlen,u8 *lclen)
{
	u16 tx_len;
	
	//USB_Printf("\nlclen=[%02x%02x%02x]",lclen[0],lclen[1],lclen[2]);		
	
	if(rlen == 4) return CASE1;	// header
	else if(rlen == 5)	return CASE2;	// header+le
	else if(rlen == (lclen[0]+5)) return CASE3;	// header+lc+data
	else if(rlen == (lclen[0]+6)) return CASE4;	// header+Lc+data+Le
	else{

		if(protocol != T1_PROTOCOL)	return CASE4;	// header+Lc+data+Le, T1일때만 extended Length 지원
		
		if(lclen[0] != 0x00)		return CASE4;	// header+Lc+data+Le
		else{
			tx_len = lclen[1];	tx_len *= 256;
			tx_len += lclen[2];
			//USB_Printf("\nrlen=%d, tx_len=%d,",rlen,tx_len);		
			if(rlen == 7)				return CASE2e;	// header[5]+extended le[2]
			else if(rlen == (tx_len+7)) return CASE3e;	// apdu[5]+exlc[2]+data
			//else 						return CASE4e;	// header[5]+extended Lc[2]+data+ exteneded Le[1~2]
			//2019.06.14
			else if(rlen == (tx_len+9)) return CASE4e;	// header[5]+lc[2]+data+le[2]
			else 						return CASEerr;
		}
	}
}
//u16 ISO7816_CaseProcess(void)
u16 ISO7816_CaseProcess(u8 slot,u16 tlen,u8 *tpdu,u16 *rlen,u8 *rapdu)
{
	u8	wcase,retcode;
	u16		retlen;
    
	//slot = comm_buffer[SLOT_PTR];
	//DebugUSBMsg(DBG_LV,"\n\r");
	//2011.11.10 add for Multos card
	//Delay_ms(10);
	
	//Set_BWTX(slot,3);	//set to 6second
	SC_Load_BWT(slot);//SC_Set_BWT(slot,BWI[slot]);
	SC_Load_CWT(slot);//SC_Set_CWT(CWI[slot]);
	
	//Uart_Printf("\nBWT(%dmS) CWT(%dms)",sc_BWT,sc_CWT);
	
	//wcase = ISO7816_CaseAnalysis(tlen,tpdu[4]);
	//2011.10.18 HTY to support extended Le
	//wcase = ISO7816_CaseAnalysis(tlen,&tpdu[4]);
	if(SC_SlotCheck(slot)!=MI_OK) return MI_NOCARD;//MI_NOTAGERR;

	//2016.11.14
	//if(last_slot != slot)	ISO7816_SetBaudRate(slot,FIDI[slot]);//2009.02.18
	//2017.01.06
#ifndef STM32F4XX
	if(last_slot != slot)	ISO7816_SetBaudRate(slot,FIDI_ACT[slot]);
#endif
	
	last_slot = slot;
	
	if(SC_Protocol_Get(slot) == T0_PROTOCOL)
	{
		wcase = ISO7816_CaseAnalysis(T0_PROTOCOL,tlen,&tpdu[4]);
		//2011.10.15 it doesn't need, ISO7816_T0_process() fills tpdu[4]=0 when case1
		/*if((datalen == 4) && (SC_Protocol_Get(slotno) == T0_PROTOCOL)){
			data[4] = 0x00;
			datalen = 5;
		}*/
//		DebugUSBMsg(DBG_LV,"\nT0_PROTOCOL[case:%c]",wcase);

		//2019.06.14
		if(wcase > CASE4){
			*rlen = 0;
			return MI_INVALID_FORMAT;
		}

		//2014.04.01
#ifdef DEBUG_TIME
		exe_tick = Get_Tick();
		DebugUSBMsg(DBG_LV,"\nstart=%d ",exe_tick);
#endif
		//Buzzer(_OCTV4,_DO,50);
		//DebugUSBMsg(DBG_LV,"\n rapdu %x ",rapdu);
		retlen = ISO7816_T0_process(slot,wcase,tpdu,rapdu,&retcode);
		//DebugUSBMsg(DBG_LV,"\nISO7816_T0_process() retlen=%2x,retcode=%2x",retlen,retcode);
		
#ifdef DEBUG_TIME	//2014.04.01
		exe_tick = Get_Tick()- exe_tick;
		DebugUSBMsg(DBG_LV,"\nexe time T0=%d ",exe_tick);
#endif

	}
	else	//T=1
	{
		wcase = ISO7816_CaseAnalysis(T1_PROTOCOL,tlen,&tpdu[4]);
//		DebugUSBMsg(DBG_LV,"\nT1_PROTOCOL[case:%c]",wcase);
		
		//2019.06.14
		//if(wcase == CASE4e)	tlen -= 2; //2020.06.11 delete, expected length 2byte
		if(wcase >= CASEerr){
			*rlen = 0;
			return MI_INVALID_FORMAT;
		}

		retlen = ISO7816_T1_process(slot,wcase,tlen,tpdu,rapdu,&retcode);
		//printf("\nISO7816_T1_process() retlen=%2x,retcode=%2x\n",retlen,retcode);
#ifdef DEBUG_TIME	//2014.04.01, tick starts in  ISO7816_T1_process()
		//always 10ms Guard time in ISO7816_TransReceiveT1();	//2014.04.02
		//exe_tick = Get_Tick()- exe_tick - 15;
		exe_tick = Get_Tick()- exe_tick - 19;
		DebugUSBMsg(DBG_LV,"\nexe time T1=%d ",exe_tick);
#endif
	}
	*rlen = retlen;
	//DebugUSBMsg(DBG_LV,"\nT1 rx len=%d.",retlen);
	
	//if(retlen==0) return MI_ERROR;
	//2011.11.10
	
	if(retcode != MI_OK){
		#ifndef CCID
		#if DEBUG_TEST
		DEBUG_Printf("\nret=0x%2x.",retcode);		
		#endif
		#endif
	}
	if(retlen < 2) return MI_ERROR;
	return MI_OK;
}

u16 ISO7816_T1Bypass(u8 slot,u16 tlen,u8 *tpdu,u16 *rlen,u8 *rapdu)
{
	u8 ret;
	//u16 i;
	
	//DebugUSBMsg(DBG_LV,"\n Tx: ");	
	//for(i=0;i<tlen;i++)	DebugUSBMsg(DBG_LV,"%02x ",tpdu[i]);	
	//DebugUSBMsg(DBG_LV,"\n.");
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\nT1_BYPASS[%d]",slot);		
#endif	
#endif
	//CWI[slot] = 10;
	SC_Load_BWT(slot);//SC_Set_BWT(slot,BWI[slot]);
	SC_Load_CWT(slot);//SC_Set_CWT(CWI[slot]);
	*rlen = 0;
	ret =  ISO7816_TransReceiveT1(slot,tlen,tpdu,rapdu);
	if((ret==MI_OK)||(ret==EDC_ERR))
	{
		ret = MI_OK;
		*rlen = ISO7816_Rcv_Len_Get();

	//DebugUSBMsg(DBG_LV,"\n Rx: ");	
	//for(i=0;i<*rlen;i++)	DebugUSBMsg(DBG_LV,"%02x ",rapdu[i]);	
	//DebugUSBMsg(DBG_LV,"\n.");		
	}
	return ret;
	
}
u16 ISO7816_Bypass(u8 slot,u16 tlen,u8 *tpdu,u16 *rlen,u8 *rapdu)
{
	//int		clength;
	//u8  	start_flag;
	//u32 i=0;

	icsend_ptr = tpdu;
	icsend_len = tlen;
	icrcv_ptr = rapdu;
	SC_Rcv_Len_Clr();
	//start_flag = 0;
	*rlen = ISO7816_Rcv_Len_Get();
	
	Clear_snsts_byte();
    SC_Load_BWT(slot);//SC_Set_BWT(slot,BWI[slot]);
	SC_Load_CWT(slot);//SC_Set_CWT(CWI[slot]);
// trans -------------------------------------------/

	/*SNtxmode(slot);
	while(icsend_len)
	{		
		if(SC_SlotCheck(slot)) return PROCESS_ERR;					
	}*/
	//DebugUSBMsg(DBG_LV,"\n ISO7816_TransReceiveT1 ");
	if(icsend_len)
		SC_Send_Data(slot,icsend_len,icsend_ptr);
	Clear_snsts_byte();
	SC_RxIntControl_Enable(slot);

   // printf("\n receive ");
// receive -----------------------------------------/

	while(1)
	{
#ifdef ANDROID_NDK
		SC_CheckTime_Rx();
#endif
		if(!ISO7816_Rcv_Len_Get() && BWTint_Flag) return BWT_ERR;
		if(!ISO7816_Rcv_Len_Get() && CWTint_Flag) return CWT_ERR;
		else if(CWTint_Flag) 
		{
			*rlen = ISO7816_Rcv_Len_Get();
			return MI_OK;
		}
		if(ISO7816_SlotCheck(slot)) return SLOT_ERR;	
	}
}
#endif



/*
void SC_TS_Flag(u8 ts_val)
{
	ic_ts_flag = ts_val;
}*/

#ifdef ANTITEARING_FAST
u8 anti_activated;
#endif
#ifdef ANDROID_NDK
unsigned long m_nTick;

extern unsigned long GetTickCount();

void SC_Check_Time(void)
{
	unsigned long a = GetTickCount();

	if(a !=	m_nTick)
	{
		m_nTick = a;

		if(++icc_CWT_cnt > sc_CWT)
		{

			if((ISO7816_Rcv_Len_Get()!=0)&&!CWTint_Flag)
			{
				//LOGD("%s, %d [CWTint]", __FUNCTION__, __LINE__);
				//				TRACE(_T("\nCWTint\n"));
				CWTint_Flag=1;
			}
		}
		if(++icc_BWT_cnt > sc_BWT)
		{
			if((ISO7816_Rcv_Len_Get()==0)&& (!BWTint_Flag))
			{
				//LOGD("%s, %d [BWTint]", __FUNCTION__, __LINE__);
				//				TRACE(_T("\nBWTint\n"));
				BWTint_Flag=1;
			}
		}
	}
}
#else
void SC_Check_Time(void)
{
	//USB_Printf("\nt-"); //2019.08.23 
	if(++icc_CWT_cnt>sc_CWT) 
	{		
		//if(!ic_ts_flag&&(ISO7816_Rcv_Len_Get()!=0)&&!CWTint_Flag)
		//2011.11.12
		if((ISO7816_Rcv_Len_Get()!=0)&&!CWTint_Flag)
		{
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\nCWT_int.\n");
#endif
			//Uart_Printf("[C]");
			CWTint_Flag=1;
			
		}
	}
	if(++icc_BWT_cnt>sc_BWT) 
	{
		//if(((ISO7816_Rcv_Len_Get()==0)&&!BWTint_Flag)||((ic_ts_flag)&&!BWTint_Flag)) 
		//2011.11.12
		if((ISO7816_Rcv_Len_Get()==0)&& (!BWTint_Flag)) 
		{	u8 slot;
#if DEBUG_TEST
			DebugUSBMsg(DBG_LV,"\nBWT_int.\n");
#endif
			//Uart_Printf("[B]");
			BWTint_Flag=1;
		}		
	}	
	//2012.04.17

#ifdef ANTITEARING_FAST	//ANTITEARING
	if(AntiTearing_Occured()){
		if(anti_activated < 100){
			DebugUSBMsg(DBG_LV,"\n\rCWT BWT by anti tearing[%d]..",anti_activated);
			icc_BWT_cnt = sc_BWT;
			icc_CWT_cnt = sc_CWT;

			//2012.07.25	
			//여기서 계속해서 쓰는 것이 중간에 clear 된 변수를 다시 설정하는 효과 있음.   
			CWTint_Flag=1;
			BWTint_Flag=1;

			//AntiTearing_Clear();	2012.07.25 delete

			anti_activated++;
		}
	}
	else	anti_activated = 0; 
#endif

}
#endif

u8 SC_GuardTime_Escape(void)
{
	if(BWTint_Flag)		return 1;		
	if(CWTint_Flag)		return 1;		
//2012.07.25
#ifdef ANTITEARING
	if(AntiTearing_Occured())	return 1;
#endif		
		
	return 0;
}

void SC_Load_BWT(u8 slot)
{
	sc_BWT = gBWT[slot];	
}

void SC_Set_BWT(u8 slot,u8 bwi)
{
	u32 i;
	u32 bwt;
	u32 f;
	
	u32 etu_d = 0;
	u32 etu_f = 0;
	//double g;
	//if(sc_protocol[slot] == T1_PROTOCOL)
	if(SC_Protocol_Get(slot) == T1_PROTOCOL)
	{
		//BWT=11etu+2^bwi*960*Fd/f, Fd = 372
		bwt=1;
		for(i=0;i<bwi;i++) bwt*=2L;
		//DebugUSBMsg(DBG_LV,"\n bwt %d ",bwt);
		
		f = SC_Get_FCLK(slot)/1000;		//DebugUSBMsg(DBG_LV,"\n f %d ",f);
		//bwt = (bwt*960*372)/f;	//in msecond
		//2021.08.25 HTY
		//bwt = (bwi*960*ISO7816_Get_ETU(FIDI[slot]&0xF0))/f;
		//2021.08.26 Moon
#if 0		
		bwt = (11*g_etu+bwt*960*ISO7816_Get_ETU(FIDI[slot]&0x0F))/f; 
#else
		//2021.08.27 Moon
		ISO7816_Get_FiDi(FIDI[slot],&etu_f,&etu_d);
		//for(int i=0;i<BWI[slot];i++) bwt*=2L;
		//printf("bwi[%d], bwt[%d], etu_f[%d], etu_d[%d]\n",BWI[slot],bwt,etu_f,etu_d);
		//bwt = ((((bwt * 960 * (372*etu_d)/etu_f) + 11))*g_etu)/1000; //msecond
		//bwt += 50; //2021.08.27 Moon Add Margin
		bwt = ((bwt * 960 * (372*etu_d)/etu_f) + 11);
		//printf("BWT VAL[%d]etu\n",bwt);
		bwt = bwt+(1500*etu_d); //BWT + (960 ~ 4800)*D 
		//printf("BWT VAL[%d]etu\n",bwt);
		bwt = (bwt*g_etu)/1000; //ms 변환
		//sc_BWT = bwt;
#endif		
		//printf("\n bwt[%d]ms, bwi[%d] D[%d] \n",bwt,bwi,etu_d);
	}
	else
	{
		//WT=WI*960*Fi/f

		f = SC_Get_FCLK(slot)/1000;
	
		//DebugUSBMsg(DBG_LV,"\n f %d ",f);
		//bwt = (bwi*960*372)/f;
		//2011.11.10 HTY
		bwt = (bwi*960*ISO7816_Get_ETU(FIDI[slot]&0xF0))/f;
	}
	//bwt += 100;

#ifdef _EXTEND_WT
	if(bwt < 7500){
		#if DEBUG_TEST
		DebugUSBMsg(DBG_LV,"\n(B)WT(%dmS) extended to 7.5S",bwt);
		#endif
		bwt = 7500;	//OK for Multos card
	}
#endif
#ifndef COMPACT_MEM
#if DEBUG_TEST
    DebugUSBMsg(DBG_LV,"\nT1 (b)wt[+100]= %d mS, bwi= %d ",bwt,bwi);
#endif	
#endif
	sc_BWT = bwt;	
	gBWT[slot] = sc_BWT;

	//to check etu time
	/*bwt = ISO7816_Get_ETU(FIDI[slot]);
	bwt *= 1000000L;
	bwt /= SC_Get_FCLK(slot);
	DebugUSBMsg(DBG_LV,"\n1etu = %duS",bwt);
	*/
	//to check EGT
	//EGT[slot]=5;
	//DebugUSBMsg(DBG_LV,"\nEGT = %duS",bwt*EGT[slot]);
	
}


void Set_BWTX(u8 slot, u8 val)
{
	gBWT[slot] = gCWT[slot] = val*2000;
	sc_BWT = sc_CWT = gBWT[slot];
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n bwt(cwt)_x %d mS",gBWT[slot]);
#endif
#endif
}
#if 0
void SC_Set_CWT(u8 slot,u8 cwi)
{
	u32 i;
	u32 cwt;//,etu;
	u32 f;
	
	//CWT = (11+2^(cwi))etu
	
	//2011.11.10 add and delete at 2011.11.12
	/*if(SC_Protocol_Get(slot) == T0_PROTOCOL){
		sc_CWT = 20000;	//Not to use 
		gCWT[slot] = sc_CWT;
		DebugUSBMsg(DBG_LV,"\nT0 cwt=%d ms",sc_CWT);
		return;
	}*/
	///////////////////////////////////////
		
	cwt=1;
	for(i=0;i<cwi;i++) cwt*=2L;
	
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n cwi(=%d)_n =%d ",cwi,cwt);
#endif
#endif
	f = SC_Get_FCLK(slot)/1000;	//in mS
	cwt = cwt*372/f;	//default(ATR) etu

	//2011.11.09 below is correct	
	/*
	f = ISO7816_Get_ETU(FIDI[slot]);
	f = f*1000000/SC_Get_FCLK(slot);
	DebugUSBMsg(DBG_LV,"\n1 etu= %d uS",f);
	cwt = cwt*f/1000;	//uS to ms
	*/
	
	//cwt += 100;
	//2020.10.20
	cwt += 150;
#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n cwt[+150] %d ms",cwt);
#endif
#endif
	//if(cwt < 2000)	cwt = 2000; 
	//2021.08.24 HTY delete
	if(cwt < 1000)	cwt = 1000;

#ifndef COMPACT_MEM
#if DEBUG_TEST
	DebugUSBMsg(DBG_LV,"\n cwt %d ms",cwt);
#endif
#endif
	/**/printf("\n cwt %d ms\n",cwt);
	//printf("\n cwt %dms %dus %d CWi[%d]",cwt,sc_CWT_dummy,sc_CWT_dummy%1000,cwi);
	sc_CWT = cwt;	
	gCWT[slot] = sc_CWT;
}
#else
//2021.08.26 Moon test
void SC_Set_CWT(u8 slot,u8 cwi)
{
	u32 i;
	u32 cwt;
	
	cwt=1;
	for(i=0;i<cwi;i++) cwt*=2L;

	cwt = (11+cwt)*g_etu;
	cwt = (cwt + 2000)/1000; //+2000 margin
	sc_CWT = cwt;	
	gCWT[slot] = sc_CWT;
	DebugUSBMsg(DBG_LV,"\n cwt %d ms\n",cwt);
}
#endif
void SC_Load_CWT(u8 slot)
{
	sc_CWT = gCWT[slot];
}

void SC_BWT_CWT_Clear(void)
{
	icc_BWT_cnt = 0;
	icc_CWT_cnt = 0;	
	
	CWTint_Flag=0;
	BWTint_Flag=0;
	Init_Tick_Start();
}

void SC_CGT_Wait(u8 slot)
{
	u32 etu;
	if((CGT[slot] == 1) && (SC_Protocol_Get(slot) == T1_PROTOCOL)){
		//2011.12.28 add
		SC_Tx_Complete(slot);
		
		etu = ISO7816_Get_ETU(FIDI[slot]);
		etu = etu*1000000/SC_Get_FCLK(slot);
		//DebugUSBMsg(DBG_LV,"\n1 etu= %d uS, wait=%d uS",etu, etu*15);	
		//DEBUG_Printf("+");
		//Delay_1us(15*etu);	//spec is 11etu
		//2012.03.26
		//Delay_1us_GT(2*etu);	//start(1)+Data[8] = 11-9=2, error of Belbim DESFIRE SAM
		if(etu > 10){
			Delay_1us_GT(etu);	//start(1)+Data[8] = 11-9=2 -> 1
		}
		else{
			
		}
	}
}
u8 SC_CGT_State(u8 slot)
{
	if(CGT[slot] == 1) 	return 1;
	else				return 0;
}


//2019.11.25 move from scard.c
void SC_Invrese_Flag(u8 slot, u8 inv)
{
	sc_inv_flag[slot]=inv;
}
void SC_PPS_Flag(u8 slot, u8 pps)
{
	pps_flag[slot] = pps;
}

//2021.07.13
#ifndef OTHER_MCU
u16 SC_Rcv_Len_Get(void)
{
	return icrcv_len;	
}
#endif

void SC_Rcv_Len_Clr(void)
{
	icrcv_len=0;	
	//DebugUSBMsg(0,"\n\r Len clr. ");
}
void SC_Rcv_Len_Dec(void)
{
	icrcv_len--;	
	//DebugUSBMsg(0,"\n\r Len --. ");
}
void SC_Protocol_Set(u8 slot, u8 prtcl)
{
	sc_protocol[slot] = prtcl;	
}
u8 SC_Protocol_Get(u8 slot)
{
	//USB_Printf("\n SC_Protocol_Get= %d. ",sc_protocol[slot]);
	return sc_protocol[slot];	
}
u8 SC_CWTint_Flag(void)
{
	return CWTint_Flag;
}
u8 SC_BWTint_Flag(void)
{
	return BWTint_Flag;
}

#endif //#ifdef CONTACT_ICC
