#ifndef _SYSDEF_H_
#define _SYSDEF_H_

#ifndef u16
#define u16	unsigned short
#endif
#ifndef u8
#define u8	unsigned char
#endif
#ifndef u32
#define u32	unsigned int
#endif

#define ON						1
#define OFF						0


#define TRUE	1
#define FALSE	0

#define RS232_PORT	2

#define AUDIO_USE_EXTERNAL
#define AUD_MAX_VOL_INDEX	16
#define AUD_MIN_VOL		45
#define AUD_ID_VOICE	100
#define KEY_ID_AUD_MSG_QUEUE	2017	/* message queue id, sender=receiver */
#define AUDIO_SAMPLE_RATES 16000
#define AUDIO_DELAY_TIME_NORMAL	(500*1000)
#define AUDIO_DELAY_TIME_PLAY	(1000)
#define AUDIO_PLAY_SIZE_NORMAL	(32768)
#define AUDIO_PLAY_SIZE_MIN	(640)
#define	AUD_DFLT_VOL_INDEX	12
enum AUDIO_NUM {
	AUD_ID_KEY = 0,
	AUD_ID_BUTTON,
	AUD_ID_WARNING,
	AUD_ID_ERROR,
	AUD_ID_START,
	AUD_ID_EVENT,
	AUD_ID_RECEIVE_OK,
	AUD_ID_END,
	AUD_ID_VOICE_START_TOURS = AUD_ID_VOICE,
	AUD_ID_VOICE_TOUCH_TOURS,
	AUD_ID_VOICE_AUTH_FINGER,
	AUD_ID_VOICE_CHANGE_GETONOFF,
	AUD_ID_VOICE_FAIL_AUTHDRIVER,
	AUD_ID_VOICE_OK_PASSANGER,
	AUD_ID_VOICE_FAIL_PASSANGER,
	AUD_ID_VOICE_FAIL_FINGER,
	AUD_ID_VOICE_CHECK_IN,
	AUD_ID_VOICE_CHECK_OUT,
	// Ȯ�强�� ���� ��ȣ�� �߰� //
	AUD_ID_VOICE_01,
	AUD_ID_VOICE_02,
	AUD_ID_VOICE_03,
	AUD_ID_VOICE_04,
	AUD_ID_VOICE_05,
	AUD_ID_VOICE_06,
	AUD_ID_VOICE_07,
	AUD_ID_VOICE_08,
	AUD_ID_VOICE_09,
	AUD_ID_VOICE_10,
	/////////////////////
	AUD_ID_VOICE_END,
};

/*Device Driver Path */
#define RF_DEVICE_PATH "/dev/derf"
#define SAM_DEVICE_PATH "/dev/devsc"
#define WIEGAND_DEVICE_PATH	"/dev/PopxWiegand"
#define HWTIMER_DEVICE_PATH	"/dev/devHwTimer"
#define RS485_DEVICE_PATH "/dev/drvRS485"
#define QRPWR_DEVICE_PATH "/dev/drvQRPWR"
#define QRTRIG_DEVICE_PATH "/dev/drvQRTRIG"
#define PDUCLK_DEVICE_PATH "/dev/drvPduCLK"
#define USBMODE_DEVICE_PATH "/dev/drvUSB"
#define RLY_DEVICE_PATH "/dev/drvRLY"
#define TAMP_DEVICE_PATH "/dev/drvTAMP"
#define RTC_DEVICE_PATH "/dev/rtc0"

//////////////////////////////////////
//Duali command
//////////////////////////////////////
/* Device Control */
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

/* TYPE C */
#define _DEC_TRANSPARENT			0x50
#define _DEC_POLLING_NOENC			0x51
#define _DEC_READ_NOENC				0x52
#define _DEC_WRITE_NOENC			0x53

/* TYPE B */
#define _DEB_TRANSPARENT			0x60
#define _DEB_TRANSPARENT2			0x6E
#define _DEB_BFRAMING				0x6F

/* TYPE A */
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

/* TYPE A/B */
#define _DE_FIND_CARD				0x4C
#define _DE_APDU				0x61
#define _DEAB_RW_WRITE				0x7A
#define _DEAB_RW_READ				0x7B


/* ISO15693 */
#define _DED_Inventory				0x70
#define _DED_Select				0x71
#define _DED_Read				0x72
#define _DED_Write				0x73
#define _DED_Transparent			0x74
#define _DED_Eof				0x78

/* PCSC */
#define _PCSC_CONNECT           0x80
#define _PCSC_POLLING_SET       0x81
#define _PCSC_POLLING_SET2      0x82

/* QR Module define */
#define QR_PWR_ON	'P'
#define QR_PWR_OFF	'O'
#define QR_SCAN_ON	'N'
#define QR_SCAN_OFF	'M'
#define QR_SCAN_RESET	'L'
#define QR_TRIG_MODE	'6'
#define QR_PRESENTATION_MODE_NORMAL	'7'
#define QR_PRESENTATION_MODE_CONTINUE_SCAN	'8'
#define QR_CRLF			'F'
#define QR_FACTORY_RESET	'0'
#define QR_ILLUMINATION_OFF	0x05
#define QR_ILLUMINATION_ON	0x06
#define QR_ALLSYMBOL_READ	0x07


#endif // _SYSDEF_H_