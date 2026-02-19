#include "type_def.h"
#define T0_PROTOCOL          0
#define T1_PROTOCOL          1 
#define INIT_PROTOCOL        2

#define CWT_ERR				'8'
#define BWT_ERR				'9'
#define PROCESS_ERR			'a'
#define SLOT_ERR			'b'
#define IBLOCK				'A'
#define RBLOCK_NERR			'B'
#define RBLOCK_ERR_I		'C' //block number error 
#define RBLOCK_ERR_R		'D'
#define SBLOCK_REQ		    'E'
#define SBLOCK_RES			'F'
#define BLOCK_WRONG			'G'
#define EDC_ERR				'H'
#define NAD_ERR				'I'
#define LEN_ERR				'J'
#define SEQ_ERR				'K'
#define SPARA_ERR			'L'


#define NON_PARITY    	2
#define EVEN_PARITY 	0
#define ODD_PARITY 		1

#define COLD_1_8V			0
#define COLD_3V				1
#define COLD_5V				2   //ic card clod reset
#define WARM			    3	//ic card warm reset
// other
#define	ISO7816_BUFF_SMALL			260 

//2019.06.13
#ifndef ISO7816_BUFF_SIZE 
#define	ISO7816_BUFF_SIZE			ISO7816_BUFF_SMALL //260
#endif
#define ISO7816_SLOT	1

#define	SLOT_PTR			1
#define	CMD_PTR				2
#define	LENGTH_PTR			3
#define	DATA_PTR			5



#define CASE1				'1'
#define CASE2				'2'
#define CASE3				'3'
#define CASE4				'4'

#define CASE2e				'b'
#define CASE3e				'c'
#define CASE4e				'd'
#define CASEerr				'e' //2019.06.14

extern u8 TA1;
//extern u32 gBWT[];
extern void Set_BWT(u8 slot, u8 val);
u16 ISO7816_ActivationFlow(u8 slot,u8 *atr_buf,u16 *len);
void ISO7816_Deactivation(u8 slot);
void ISO7816_SetBaudRate(u8 slot,u8 fidi);
u16 ISO7816_CaseProcess(u8 slot,u16 tlen,u8 *tpdu,u16 *rlen,u8 *rapdu);

u16 ISO7816_T1Bypass(u8 slot,u16 tlen,u8 *tpdu,u16 *rlen,u8 *rapdu);
u16 ISO7816_Bypass(u8 slot,u16 tlen,u8 *tpdu,u16 *rlen,u8 *rapdu);

u8 ISO7816_PPS_Processing(u8 slot, u8 *trx_buf);
//extern vu16  icrcv_len;
extern void SC_Tx_Complete(u8 slot);
extern u8 SC_CGT_State(u8 slot);
extern void ISO7816_ATR_CWTBXT_Ext(u8 val);
extern u32 ISO7816_Get_ExeTime(void);
extern u32 ISO7816_Get_ETU(u8 FiDi);
//2021.07.06
extern void SC_Protocol_Set(u8 slot, u8 prtcl);
extern u8 SC_Protocol_Get(u8 slot);
extern u16 DE_I2C_Activation(u8 slot,u8 reset,u8 rlen, u8 *atr_buf,u16 *len);
extern void DE_I2C_Deactivation(u8 slot);
extern u16 I2C_Read2(u8 slot, u8 cmd, u8 addr,u8 fdata_cnt, u8 extra_clock, u8 *buf);
extern u8 I2C_Write2(u8 slot, u8 cmd, u8 addr,u8 op_cnt,u8 fdata_cnt,u8 *buf);
void SC_Init_Ports(void);
void SC_Close_Ports(void);
