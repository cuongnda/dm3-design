
typedef unsigned char BYTE;


#ifndef u16
#define u16	unsigned short
#endif
#ifndef u8
#define u8	unsigned char
#endif
#ifndef u32
#define u32	unsigned int
#endif


#define TN_SW_TIMER	30

#define ID_SW_TIMER0 0	//1 Reserved for System delay Timer
#define ID_SW_TIMER1 1	

/* uart channel define */
#define CONSOLE_UART_ID	0
#define QR_UART_ID	10

//////////////////////////////////////
//Device control command
//////////////////////////////////////
#define _DE_RFON				0x10
#define _DE_RFOFF				0x11
#define _DE_RESET				0x12
#define _DE_BUZZER				0x13
#define _DE_DEV_CHANGE				0x15
#define _DE_VERSION				0x16
#define _DE_TRXSPEED				0x1A
#define _DE_RF_WTX				0x1B
#define _DE_CONTACT_WTX				0x1C
#define _DE_FLASH				0x1F
#define _DE_CONTACT_ANTI_TEARING		0x18
#define _DE_RF_ANTI_TEARING			0x19
#define _DE_RF_RESET				0x20

//////////////////////////////////////
//command
//////////////////////////////////////

//////////////////////////////////////
//TYPE C
//////////////////////////////////////
#define _DEC_TRANSPARENT			0x50
#define _DEC_POLLING_NOENC			0x51
#define _DEC_READ_NOENC				0x52
#define _DEC_WRITE_NOENC			0x53
//////////////////////////////////////
//TYPE B
//////////////////////////////////////
#define _DEB_TRANSPARENT			0x60
#define _DEB_TRANSPARENT2			0x6E
#define _DEB_BFRAMING				0x6F
//////////////////////////////////////
//TYPE A
//////////////////////////////////////
#define _DEA_RESET				0x20
#define _DEA_IDLE_REQ				0x21
#define _DEA_WAKEUP_REQ				0x22
#define _DEA_ANTICOLL				0x23
#define _DEA_SELECT				0x24
#define _DEA_AUTH				0x25
#define _DEA_HALT				0x26
#define _DEA_READ				0x27
#define _DEA_WRITE				0x28
#define _DEA_INCREMENT				0x29
#define _DEA_DECREMENT				0x2A
#define _DEA_INC_TRANS				0x2B
#define _DEA_DEC_TRANS				0x2C
#define _DEA_RESTORE				0x2D
#define _DEA_TRANSFER				0x2E
#define _DEA_LOADKEY				0x2F
#define _DEA_AUTHKEY				0x30
#define _DEA_REQ_ANTI_AUTH			0x31
#define _DEA_REQ_ANTI_AUTHKEY			0x32
#define _DEA_INC_TRANS2				0x33
#define _DEA_DEC_TRANS2				0x34
#define _DEA_REQ_ANTI_AUTH_RD			0x35
#define _DEA_REQ_ANTI_AUTHKEY_RD    		0x36
#define _DEA_REQ_ANTI_AUTH_WR			0x37
#define _DEA_REQ_ANTI_AUTHKEY_WR		0x38
#define _DEA_REQ_ANTI_SEL			0x39
#define _DEA_UWRITE  				0x3B
#define _DEA_ANTI_SEL_LEVEL			0x3D
#define _DEA_ANTICOLL_LEVEL			0x3E
#define _DEA_SELECT_LEVEL			0x3F
#define _DEA_DEVINFO				0x40
#define _DEA_TRANSPARENT			0x41
#define _DEA_TRANSPARENT2			0x47
#define _DEA_BITMODE				0xA1
#define _DEA_BITMODEANTI			0xA2
#define _DEA_BITMODE2				0xA4
///////////////////////////////////////
//TYPE A/B Common
///////////////////////////////////////
#define _DE_FIND_CARD				0x4C
#define _DE_APDU				0x61
#define _DEAB_RW_WRITE				0x7A
#define _DEAB_RW_READ				0x7B


///////////////////////////////////////
//15693
///////////////////////////////////////
#define _DED_Inventory				0x70
#define _DED_Select				0x71
#define _DED_Read				0x72
#define _DED_Write				0x73
#define _DED_Transparent			0x74
#define _DED_Eof				0x78


///////////////////////////////////////
//PCSC Autopolling
///////////////////////////////////////
#define _PCSC_CONNECT           0x80
#define _PCSC_POLLING_SET       0x81
#define _PCSC_POLLING_SET2      0x82
///////////////////////////////////////
/* Buzzer Tone define */
#define _DO		0
#define _DOS		1
#define _RE		2
#define _RES		3
#define _MI		4
#define _FA		5
#define _FAS		6
#define _SOL		7
#define _SOLS		8
#define _RA		9
#define _RAS		10
#define _SI		11
/* Buzzer Octave define */
#define _OCTV1  	1
#define _OCTV2  	2
#define _OCTV3  	3
#define _OCTV4  	4
#define _OCTV5  	5
#define _OCTV6  	6
#define _OCTV7  	7


