#ifdef __cplusplus
extern "C"
{
#endif
/* System Timer related funcion definitions */
/*******************************************************************************
* Function              	: DevSysTimerOpen
* Argument              	: None
* Return                	: Device File Pointer
* Description           	: is used to open the Timer device.
* Example               	: int fd;
				  			  fd = DevSysTimerOpen();
*******************************************************************************/
int DevSysTimerOpen(void);

/*******************************************************************************
* Function              	: DevSysTimerClose
* Argument              	: None
* Return                	: None
* Description           	: is used to close the Timer device.
* Example               	: DevSysTimerClose();
*******************************************************************************/
void DevSysTimerClose(void);

/******************************************************************************
* Function					: DevSysTimerVersion
* Argument 		*version	: Get Timer Version Info
* Return					: result = 0: ok , -1: err
* Description				: is used to Timer Version information.
* Example					: char version[30];
							  DevSysTimerVersion(version);
*******************************************************************************/
int DevSysTimerVersion(unsigned char *version);

/******************************************************************************
* Function					: HWGet_Tick
* Argument 					: None
* Return					: Timer tick jiffies value
* Description				: is used to Get Hw Timer jiffies value.
* Example					: long long time;
							  time = HWGet_Tick();
*******************************************************************************/
long long HWGet_Tick(void);

/******************************************************************************
* Function					: DevGetJiffies
* Description				: Same as HWGet_Tick().
*******************************************************************************/
long long DevGetJiffies(void);

/******************************************************************************
* Function					: swGet_Tick
* Argument 					: None
* Return					: Timer tick
* Description				: is used to Get tick using gettimeofday() at linux/time.h.
* Example					: long long time;
							  time = swGet_Tick();
*******************************************************************************/
long long swGet_Tick(void);

/******************************************************************************
* Function					: DevDelay_ms
* Argument 		time		: select mseconds
* Return					: None
* Description				: mseconds delay function
* Example					: DevDelay_ms(1000); //1 second delay
*******************************************************************************/
void DevDelay_ms(unsigned int time);

/******************************************************************************
* Function					: GetAvailableTimer
* Argument 					: None
* Return					: result = ID_SW_TIMER(2~29): ok , -value: err
* Description				: is used to Get available timer number. 
* Example					: int timer;
							  timer = GetAvailableTimer();
*******************************************************************************/
int GetAvailableTimer(void);

/******************************************************************************
* Function					: FreeUsedTimer
* Argument 		id			: used ID_SW_TIMER(2~29)
* Return					: result = 0: ok , -1: err
* Description				: is used to Set released timer number. 
* Example					: FreeUsedTimer(5);
*******************************************************************************/
int FreeUsedTimer(int id);

/******************************************************************************
* Function					: TimerSet
* Argument 		id			: ID_SW_TIMER(2~29)
				time_ms		: ms time value
* Return					: result = 0: ok , -1: err
* Description				: is used to Set the timeout to the user want timer number.
* Example					: TimerSet(ID_SW_TIMER2, 1000); //1second timeout
*******************************************************************************/
int TimerSet(int id,int time_ms);

/******************************************************************************
* Function					: TimerGet
* Argument 		id			: ID_SW_TIMER(2~29)
* Return					: Residual time value
* Description				: is used to Get the remaining timeout value.
* Example					: TimerGet(ID_SW_TIMER2);
*******************************************************************************/
int TimerGet(int id);

/******************************************************************************
* Function					: IsTimeout
* Argument 		id			: ID_SW_TIMER(2~29)
* Return					: result = 1: time out , 0: not timeout, -1: err
* Description				: check timer timeout
* Example					: IsTimeout(ID_SW_TIMER2);
*******************************************************************************/
int IsTimeout(int id);

/******************************************************************************
* Function					: set_apptimer
* Argument 		expires		: ms time value
* Return					: Get using timer number.
* Description				: is used to Set the timeout to the user want timer number.
* Example					: int timer;
							  timer = set_apptimer(1000); //1second timeout
*******************************************************************************/
int set_apptimer(int expires);

/******************************************************************************
* Function					: chk_apptimer
* Argument 		id			: set_apptimer() return value(Current Using timer number)
* Return					: result = 1: time out , 0: not timeout, -1: err
* Description				: check timer timeout
* Example					: chk_apptimer(set_apptimer() return value);
*******************************************************************************/
char chk_apptimer(int id);

/******************************************************************************
* Function					: release_apptimer
* Argument 		id			: set_apptimer() return value(Current Using timer number)
* Return					: result = 0: ok , -1: err
* Description				: is used to Set released ID_SW_TIMER(2~29). 
* Example					: release_apptimer(set_apptimer() return value);
*******************************************************************************/
int release_apptimer(int id);

/* RTC related funcion definitions */
/******************************************************************************
* Function					: DevRtcGetTime
* Argument 		*out		: Get RTC Time Info
* Return					: result = 0: ok , -1: err
* Description				: is used to get the Date information from RTC device.
* Example					: char rtctime[50]; 
							  ApiRtcGetTime(rtctime);
*******************************************************************************/
int DevRtcGetTime(char *out);

/******************************************************************************
* Function					: DevRtcSetTime
* Argument 		*in			: Set RTC Time Info
* Return					: result = 0: ok , -1: err
* Description				: is used to set the Date information of RTC.
* Example					: DevRtcSetTime(&tempRtcTime);
*							: DevRtcSetTime("20061221151001");
*							                 YYYYMMDDHHMMSS
										     Y: Year
										     M: Month
										     D: Day
										     H: Hour
										     M: Minutes
										     S: Second
*******************************************************************************/
int DevRtcSetTime(char *in);

/* GPIO related funcion definitions */
/*******************************************************************************
* Function              	: DevGpioOpen
* Argument              	: None
* Return                	: only 99
* Description           	: This is dummy function.
* Example               	: int fd;
				  			  fd = DevGpioOpen();
*******************************************************************************/
int DevGpioOpen(void);

/*******************************************************************************
* Function              	: DevGpioClose
* Argument              	: None
* Return                	: None
* Description           	: This is dummy function.
* Example               	: DevGpioClose();
*******************************************************************************/
void DevGpioClose(void);

/******************************************************************************
* Function					: OpenSw_get
* Argument 		 			: None
* Return					: result = 0 or 1: ok , -1: err
* Description				: Access the opensw device drive file and read the value.
* Example					: int status; 
							  status = OpenSw_get();
*******************************************************************************/
int OpenSw_get(void);

/******************************************************************************
* Function					: DoorStatus_get
* Argument 					: None
* Return					: result = 0 or 1: ok , -1: err
* Description				: Access the door device drive file and read the value.
* Example					: int status; 
							  status = DoorStatus_get();
*******************************************************************************/
int DoorStatus_get(void);

/******************************************************************************
* Function					: CaseSensor_get
* Argument 					: None
* Return					: result = 0 or 1: ok , -1: err
* Description				: Access the casesensor device drive file and read the value.
* Example					: int status; 
							  status = CaseSensor_get();
*******************************************************************************/
int CaseSensor_get(void);

/******************************************************************************
* Function					: BLEStatus_get
* Argument 					: None
* Return					: result = 0 or 1: ok , -1: err
* Description				: Access the blestatus device drive file and read the value.
* Example					: int status; 
							  status = BLEStatus_get();
*******************************************************************************/
int BLEStatus_get(void);

/******************************************************************************
* Function					: Relaylock_Period_get
* Argument 					: None
* Return					: result = Lock Period Value: ok, -1: err
* Description				: Access the relay device drive file and read the value.
* Example					: int period; 
							  period = Relaylock_Period_get();
*******************************************************************************/
int Relaylock_Period_get(void);

/******************************************************************************
* Function					: Relaylock_Period_set
* Argument 		period		: Set period Value
* Return					: result = Set period value: ok, -1: err
* Description				: Access the relay device drive file and write the value.
* Example					: int period = 1000; 
							  Relaylock_Period_set(period);
*******************************************************************************/
int Relaylock_Period_set(int microsec);

/******************************************************************************
* Function					: Relaylock_Control
* Argument 		control		: Lock Period Clock Occur Value
* Return					: result = 0: ok , -1: err
* Description				: is used to Set the Lock Period Clock Occur Value.
* Example					: Relaylock_Control(0); Lock Period Clock Not Occur
							  Relaylock_Control(1); Lock Period Clock Occur
*******************************************************************************/
int Relaylock_Control(int control);

/******************************************************************************
* Function					: Relay_Control
* Argument 		control		: Relay Control Value
* Return					: error result = 0: ok , -1: err
* Description				: is used to Set the Relay Pin Control Value.
* Example					: Relay_Control(0);
							  Relay_Control(1);
*******************************************************************************/
int Relay_Control(int control);

/******************************************************************************
* Function					: Tamper_Control
* Argument 		control		: Tamper Control Value
* Return					: result = 0: ok , -1: err
* Description				: is used to Set the Tamper Pin Control Value.
* Example					: Tamper_Control(0);
							  Tamper_Control(1);
*******************************************************************************/
int Tamper_Control(int control);

/******************************************************************************
* Function					: UsbOtg_Mode_Control
* Argument 		flag		: Usb Mode Control Value
* Return					: result = 0: ok , -1: err
* Description				: is used to Set the Usb Pin Control Value.
* Example					: UsbOtg_Mode_Control(0); HOST Mode, default 
							  UsbOtg_Mode_Control(1); OTG Mode
*******************************************************************************/
int UsbOtg_Mode_Control(int flag);
//int DevGpioGetFd(void);

/******************************************************************************
* Function					: DevGpioVerion
* Argument 		*version	: Get Gpio Version Info
* Return					: Only 0
* Description				: is used to Gpio Version information.
* Example					: char version[30];
							  DevGpioVerion(version);
*******************************************************************************/
int DevGpioVerion(unsigned char *version);

/******************************************************************************
* Function					: DevGpioDebug
* Argument 		flag		: Set Gpio Debug Info
* Return					: Only 0
* Description				: This function is Dummy.
*******************************************************************************/
int DevGpioDebug(int flag);

/******************************************************************************
* Function					: DevGpioPWM
* Description				: Same Relaylock_Control Function
*******************************************************************************/
int DevGpioPWM(int control);

/*******************************************************************************
* Function              	: DevInputOpen
* Argument              	: None
* Return                	: result = 99: ok , -2: err
* Description           	: is used to open the GPIO Input device.
							  if you call this function, Start Gpio Input thread for reading input gpio.
* Example               	: int fd;
				  			  fd = DevInputOpen();
*******************************************************************************/
int DevInputOpen(void);

/*******************************************************************************
* Function              	: DevInputClose
* Argument              	: None
* Return                	: None
* Description           	: is used to close the GPIO Input device.
							  if you call this function, Stop Gpio Input thread.
* Example               	: DevInputClose();
*******************************************************************************/
void DevInputClose(void);

/******************************************************************************
* Function					: CBleStatus_get
* Argument 					: None
* Return					: result = 0 or 1
* Description				: DevInputOpen() must be called first before calling the function,
							  and Get BLEStatus status information.
* Example					: int status; 
							  DevInputOpen();
									.
									.
									.
							  status = CBleStatus_get();
*******************************************************************************/
int CBleStatus_get(void);

/******************************************************************************
* Function					: CCaseSensor_get
* Argument 					: None
* Return					: result = 0 or 1
* Description				: DevInputOpen() must be called first before calling the function,
							  and Get CaseSensor status information.
* Example					: int status; 
							  DevInputOpen();
									.
									.
									.
							  status = CCaseSensor_get();
*******************************************************************************/
int CCaseSensor_get(void);

/******************************************************************************
* Function					: CDoorStatus_get
* Argument 					: None
* Return					: result = 0 or 1
* Description				: DevInputOpen() must be called first before calling the function,
							  and Get DoorStatus status information.
* Example					: int status; 
							  DevInputOpen();
									.
									.
									.
							  status = CDoorStatus_get();
*******************************************************************************/
int CDoorStatus_get(void);

/******************************************************************************
* Function					: COpenSw_get
* Argument 					: None
* Return					: result = 0 or 1
* Description				: DevInputOpen() must be called first before calling the function,
							  and Get OpenSw_get status information.
* Example					: int status; 
							  DevInputOpen();
									.
									.
									.
							  status = COpenSw_get();
*******************************************************************************/
int COpenSw_get(void);

/******************************************************************************
* Function					: PDUCLK_Read
* Argument 			*buf	: You can read pduclk current status.
* Return					: error result = 0: ok , -1: err
* Description				: Access the pduclk device drive file and read the value.
* Example					: char buf[20]; 
							  PDUCLK_Read(buf);
*******************************************************************************/
int PDUCLK_Read(char *buf);

/******************************************************************************
* Function					: RELAY_Read
* Argument 			*buf	: You can read rly current status.
* Return					: error result = 0: ok , -1: err
* Description				: Access the rly device drive file and read the value.
* Example					: char buf[20]; 
							  RELAY_Read(buf);
*******************************************************************************/
int RELAY_Read(char *buf);

/******************************************************************************
* Function					: TAMP_Read
* Argument 			*buf	: You can read tamp current status.
* Return					: error result = 0: ok , -1: err
* Description				: Access the tamp device drive file and read the value.
* Example					: char buf[20]; 
							  TAMP_Read(buf);
*******************************************************************************/
int TAMP_Read(char *buf);

/******************************************************************************
* Function					: USB_Read
* Argument 			*buf	: You can read usb current status.
* Return					: error result = 0: ok , -1: err
* Description				: Access the usb device drive file and read the value.
* Example					: char buf[20]; 
							  USB_Read(buf);
*******************************************************************************/
int USB_Read(char *buf);

/* KEY related funcion definitions */
/*******************************************************************************
* Function              	: DevKeyOpen
* Argument              	: None
* Return                	: result = 56: ok , -2: err
* Description           	: is used to open the Key device.
							  if you call this function, Start Key thread for reading key status.
* Example               	: int fd;
				  			  fd = DevKeyOpen();
*******************************************************************************/
int DevKeyOpen(void); //DevKeyOpen function is not use in QT App

/*******************************************************************************
* Function              	: DevKeyClose
* Argument              	: None
* Return                	: None
* Description           	: is used to close the Key device.
							  if you call this function, Stop Key thread.
* Example               	: DevKeyClose();
*******************************************************************************/
void DevKeyClose(void); //DevKeyClose function is not use in QT App

/******************************************************************************
* Function					: LeftKey_get
* Argument 					: None
* Return					: result = 0 or 1
* Description				: DevKeyOpen() must be called first before calling the function,
							  and Get LeftKey status information.
* Example					: int status;
							  DevKeyOpen();
									.
									.
									.
							  status = LeftKey_get();
*******************************************************************************/
int LeftKey_get(void); //LeftKey_get function is not use in QT App

/******************************************************************************
* Function					: RightKey_get
* Argument 					: None
* Return					: result = 0 or 1
* Description				: DevKeyOpen() must be called first before calling the function,
							  and Get RightKey status information.
* Example					: int status;
							  DevKeyOpen();
									.
									.
									.
							  status = RightKey_get();
*******************************************************************************/
int RightKey_get(void); //RightKey_get function is not use in QT App

/* RF related funcion definitions */
/*******************************************************************************
* Function              	: DevRFOpen
* Argument              	: None
* Return                	: Device File Pointer
* Description           	: is used to open the RF device.
* Example               	: int fd;
				  			  fd = DevRFOpen();
*******************************************************************************/
int DevRFOpen(void);

/*******************************************************************************
* Function              	: DevRFClose
* Argument              	: None
* Return                	: None
* Description           	: is used to close the RF device.
* Example               	: DevRFClose();
*******************************************************************************/
void DevRFClose(void);

/******************************************************************************
* Function					: DevRfDriver_Version
* Argument 		*version	: Get Rf Version Info
* Return					: result = 0: ok , -1: err
* Description				: is used to Rf Version information.
* Example					: char version[30];
							  DevRfDriver_Version(version);
*******************************************************************************/
int DevRfDriver_Version(unsigned char *version);

/******************************************************************************
* Function					: Linux_Rf_Reset
* Argument 					: None
* Return					: result = 0: ok , -1: err
* Description				: is used to Rf IC Reset.
* Example					: Linux_Rf_Reset();
*******************************************************************************/
int Linux_Rf_Reset(void);

/******************************************************************************
* Function					: Linux_Rf_Polling
* Argument 		datalen		: Send Data Length
				*data		: Send Data
				*outlen		: Receive Data Length
				*lpRes		: Receive Data
				timeout		: Receive Timeout time setting
* Return					: result = 0: ok , -1: err
* Description				: is used to Rf IC Reset.
* Example					: int slen = 2;
							  char sbuf[2] = {0xE0, 0x01};
							  char rbuf[50];
							  int rlen;
							  Linux_Rf_Polling(slen,sbuf,&rlen,rbuf,0);
*******************************************************************************/
int Linux_Rf_Polling( int datalen, unsigned char* data, int* outlen, unsigned char* lpRes, int timeout);

/******************************************************************************
* Function					: Linux_Rf_RFOn
* Argument 					: None
* Return					: result = 0: ok , -1: err
* Description				: is used to Rf Feild On.
* Example					: Linux_Rf_RFOn();
*******************************************************************************/
int Linux_Rf_RFOn(void);

/******************************************************************************
* Function					: Linux_Rf_RFOff
* Argument 					: None
* Return					: result = 0: ok , -1: err
* Description				: is used to Rf Feild OFF.
* Example					: Linux_Rf_RFOff();
*******************************************************************************/
int Linux_Rf_RFOff(void);
int Linux_Rf_RF_VERSION( int* outlen, unsigned char* lpRes);

/******************************************************************************
* Function					: Linux_Rf_FindCard
* Argument 		baud		: Max Card Baud Rate Use same speed for TX and RX [0x00 -> 106Kbps, 0x01 -> 212Kbps, 0x02 -> 424Kbps, 0x03 -> 848Kbps, 0x04 -> VHBR, 1.6~6.8Mbps]
				cid			: CID to use when communicate with card.
				nad			: NAD, normally set it to 0.
				option		: Option ('A': only A-type, 'B': only B-type, 'K': NFC Barcode, other: All)
				*outlen		: Response length received from card.
				*lpRes		: Data[0]	RF Type['M', 0x4D(=77) -> Mifare, 'A', 0x41(=65) -> A type, 'B', 0x42(=66) -> B type) \n -	Data[1] : Card communication speed \n - Data[2..]: Card Data and Card UID.
* Return					: result = 0: ok , -1: err
* Description				: This function detects card in the RF field.
* Example					: char rbuf[50];
							  int rlen;
							  Linux_Rf_FindCard(0,0,1,0,&rlen,rbuf);
*******************************************************************************/
int Linux_Rf_FindCard( unsigned char baud, unsigned char cid, unsigned char nad, unsigned char option, int* outlen, unsigned char* lpRes);

/******************************************************************************
* Function					: Linux_Rf_APDU
* Argument 		datalen		: Data length to send to card. 
				*data		: APDU and data to be send to card. If N is 1, this function deselects card.
				*outlen		: Response length received from card. 
				*lpRes		: Receive buffer: received data from card.
* Return					: result = 0: ok , -1: err
* Description				: This function transfers APDU command to contactless card.
* Example					: int slen = 5;
							  char sbuf[5] = {0x00, 0x84, 0x00, 0x00, 0x10};
							  char rbuf[50];
							  int rlen;
							  Linux_Rf_APDU(slen,sbuf,&rlen,rbuf);
*******************************************************************************/
int Linux_Rf_APDU( int datalen, unsigned char* data, int* outlen, unsigned char* lpRes);

/* SAM related funcion definitions */
/*******************************************************************************
* Function              	: DevSAMOpen
* Argument              	: None
* Return                	: Device File Pointer
* Description           	: is used to open the SAM device.
* Example               	: int fd;
				  			  fd = DevSAMOpen();
*******************************************************************************/
int DevSAMOpen(void);

/*******************************************************************************
* Function              	: DevSAMClose
* Argument              	: None
* Return                	: None
* Description           	: is used to close the SAM device.
* Example               	: DevSAMClose();
*******************************************************************************/
void DevSAMClose(void);

/******************************************************************************
* Function					: DE_IC_PowerOn
* Argument 		slotno		: SLOT. [0x00 -> contact card slot or first SAM slot, 0x01 -> second SAM slot ...]
				*outlen		: ATR length received from card. 
				*lpRes		: ATR data.
* Return					: result = 0: ok , -1,2: err
* Description				: Reader resets the card slot or sends PPS command to the active slot.
* Example					: char rbuf[50];
							  unsigned short rlen;
							  DE_IC_PowerOn(0,&rlen,rbuf);
*******************************************************************************/
int DE_IC_PowerOn(unsigned char slotno, unsigned short* outlen, unsigned char* lpRes);

/******************************************************************************
* Function					: DE_IC_PowerOff
* Argument 		slotno		: SLOT. [0x00 -> contact card slot or first SAM slot, 0x01 -> second SAM slot ...]
* Return					: result = 0: ok , -1,2: err
* Description				: Reader deactive card slot.
* Example					: DE_IC_PowerOff(0);
*******************************************************************************/
int DE_IC_PowerOff(unsigned char slotno);

/******************************************************************************
* Function					: DE_CARD_APDU
* Argument 		slotno		: SLOT. [0x00 -> contact card slot or first SAM slot, 0x01 -> second SAM slot ...]
				datalen		: Data length to send to card. 
				*data		: APDU[0..4]+data[5.. ]
				*outlen		: Response length received from card. 
				*lpRes		: Data + SW
* Return					: result = 0: ok , -1: err
* Description				: Reader sends APDU to card and receive data from card. In case of T0, reader analyzes case1 to 3 and support get-response procedure.(delete) In case of T1, it makes T1 frame, sends frame to card and receive data from card.
* Example					: unsigned short slen = 5;
							  char sbuf[5] = {0x00, 0x84, 0x00, 0x00, 0x10};
							  char rbuf[50];
							  unsigned short rlen;
							  DE_CARD_APDU(0,slen,sbuf,&rlen,rbuf);
*******************************************************************************/
int DE_CARD_APDU(unsigned char slotno, unsigned short datalen, unsigned char* data, unsigned short* outlen, unsigned char* lpRes);

/******************************************************************************
* Function					: SamDriver_Version
* Argument 		*version	: Get Sam Version Info
* Return					: result = 0: ok , -1: err
* Description				: is used to Sam Version information.
* Example					: char version[30];
							  SamDriver_Version(version);
*******************************************************************************/
int SamDriver_Version(unsigned char *version);
//int SamDriver_setDebug(int flag);

/* AUDIO related funcion definitions */
/*******************************************************************************
* Function              	: DevAudioOpen
* Argument              	: None
* Return                	: result = 0: ok , -1: err
* Description           	: is used to open the Audio device.
* Example               	: int fd;
				  			  fd = DevAudioOpen();
*******************************************************************************/
int DevAudioOpen(void);

/*******************************************************************************
* Function              	: DevAudioClose
* Argument              	: None
* Return                	: None
* Description           	: is used to close the Audio device.
* Example               	: DevAudioClose();
*******************************************************************************/
void DevAudioClose(void);

/******************************************************************************
* Function					: Audio_Play
* Argument 		aud_id		: Note please enum AUDIO_NUM{...} at sysdef.h 
* Return					: None
* Description				: is used to Play Audio File.
* Example					: Audio_Play(AUD_ID_EVENT);
*******************************************************************************/
void Audio_Play(int aud_id);

/******************************************************************************
* Function					: Audio_Play_rawfile
* Argument 		aud_id		: Note please xxx.raw file location(location : /duapp/res/).
* Return					: None
* Description				: is used to Play Audio RAW File.
* Example					: Audio_Play_rawfile("/duapp/res/complete.raw");
*******************************************************************************/
void Audio_Play_rawfile(char *rawfile);

/*******************************************************************************
* Function              	: Audio_Stop
* Argument              	: None
* Return                	: None
* Description           	: is used to you can stop while plaing the audio file.
* Example               	: Audio_Stop();
*******************************************************************************/
void Audio_Stop(void);

/*******************************************************************************
* Function              	: Audio_Set_Volume
* Argument      volidx     	: value is 0 ~ 100;
* Return                	: None
* Description           	: is used to you can set audio volume.
* Example               	: Audio_Set_Volume(50);
*******************************************************************************/
void Audio_Set_Volume(int volidx);

/* QR related funcion definitions */
/*******************************************************************************
* Function              	: DevQrOpen
* Argument              	: None
* Return                	: Device File Pointer
* Description           	: is used to open the QR device.
* Example               	: int fd;
				  			  fd = DevQrOpen();
*******************************************************************************/
int DevQrOpen(void);

/*******************************************************************************
* Function              	: DevQrClose
* Argument              	: None
* Return                	: None
* Description           	: is used to close the QR device.
* Example               	: DevQrClose();
*******************************************************************************/
void DevQrClose(void);

/******************************************************************************
* Function					: qr_control
* Argument 		select		: Note please sysdef.h 
* Return					: only 0
* Description				: is used to QR H/W Control.
* Example					: qr_control(QR_PWR_ON); //QR Power On Command
*******************************************************************************/
int qr_control(char select);

/******************************************************************************
* Function					: IsCheckQrData
* Argument 		*qrdata		: Response data received from qr. 
				*nqrdata	: Response length received from qr. 
* Return					: result = 1: ok , 0: err
* Description				: is used to QR H/W Control.
* Example					: char buf[30];
							  int rlen;
							  IsCheckQrData(buf,&rlen);
*******************************************************************************/
int IsCheckQrData(char *qrdata,int *nqrdata);

/******************************************************************************
* Function					: QR_PowerOn
* Argument 					: None
* Return					: result = 0: ok , -1: err
* Description				: is used to QR Power On.
* Example					: QR_PowerOn();
*******************************************************************************/
int QR_PowerOn(void);

/******************************************************************************
* Function					: QR_PowerOff
* Argument 					: None
* Return					: result = 0: ok , -1: err
* Description				: is used to QR Power OFF.
* Example					: QR_PowerOff();
*******************************************************************************/
int QR_PowerOff(void);

/******************************************************************************
* Function					: QR_TriggerHigh
* Argument 					: None
* Return					: result = 0: ok , -1: err
* Description				: is used to QR Trigger High(QR Stop Scan).
* Example					: QR_TriggerHigh();
*******************************************************************************/
int QR_TriggerHigh(void);

/******************************************************************************
* Function					: QR_TriggerLow
* Argument 					: None
* Return					: result = 0: ok , -1: err
* Description				: is used to QR Trigger Low(QR Start Scan).
* Example					: QR_TriggerLow();
*******************************************************************************/
int QR_TriggerLow(void);

/******************************************************************************
* Function					: QR_PWR_Read
* Argument 			*buf	: You can read QR PWR current status.
* Return					: result = 0: ok , -1: err
* Description				: Access the QR PWR device drive file and read the string value.
* Example					: char buf[20]; 
							  QR_PWR_Read(buf);
*******************************************************************************/
int QR_PWR_Read(char *buf);

/******************************************************************************
* Function					: QR_TRIG_Read
* Argument 			*buf	: You can read QR TRIG current status.
* Return					: result = 0: ok , -1: err
* Description				: Access the QR TRIG device drive file and read the string value.
* Example					: char buf[20]; 
							  QR_TRIG_Read(buf);
*******************************************************************************/
int QR_TRIG_Read(char *buf);

/* Wiegand related funcion definitions */
/*******************************************************************************
* Function              	: DevWiegandOpen
* Argument              	: None
* Return                	: Device File Pointer
* Description           	: is used to open the Wiegand device.
* Example               	: int fd;
				  			  fd = DevWiegandOpen();
*******************************************************************************/
int DevWiegandOpen(void);

/*******************************************************************************
* Function              	: DevWiegandClose
* Argument              	: None
* Return                	: Only 0
* Description           	: is used to close the Wiegand device.
* Example               	: DevWiegandClose();
*******************************************************************************/
int DevWiegandClose(void);

/******************************************************************************
* Function					: DevWiegandVerion
* Argument 		*version	: Get Wiegand Version Info
* Return					: result = 0: ok , -1: err
* Description				: is used to Wiegand Version information.
* Example					: char version[30];
							  DevWiegandVerion(version);
*******************************************************************************/
int DevWiegandVerion(char *version);
//int DevWiegandDebug(int flag);

/******************************************************************************
* Function					: Send_WGD
* Argument 		*ids		: Send Data. 
				parity		: 0: parity check, 1: parity not check
				len			: Send Data Length. 
* Return					: result = 0: ok , -1: err
* Description				: is used to send wiegand data.
* Example					: char data[4] = {0x31,0x32,0x33,0x34};
							  int slen = 4;
							  Send_WGD(data,0,slen);
*******************************************************************************/
int Send_WGD(char *ids, char parity, int len);

/******************************************************************************
* Function					: WiegandGetLastData
* Argument 	*readNum		: Success read count. 
			*lastBitsCount	: received bit count;
			*bitstream		: received bit data. 
* Return					: error result = 0: ok , -1: err
* Description				: is used to Get wiegand data.
* Example					: char data[100];
							  int readnum;;
							  int bitcnt;
							  WiegandGetLastData(&readnum,&bitcnt,data);
*******************************************************************************/
int WiegandGetLastData(int *readNum,int *lastBitsCount,char *bitstream);

/******************************************************************************
* Function					: DevWiegandSend
* Argument 	*data			: Send Data. 
			len				: Send Data Length;
			parity			: 0 - not use, 1 - use
* Return					: error result = 0: ok , -1: err
* Description				: send wiegand data.
* Example					: char data[4] = {0x31,0x32,0x33,0x34};
							  int len = 4;
							  DevWiegandSend(data,len,1);
*******************************************************************************/
int DevWiegandSend(unsigned char* data, int len, int parity);

/* HOST related funcion definitions */
/*******************************************************************************
* Function              	: HOST_Open
* Argument       uartCh   	: Note please sysdef.h 
				 Baud		: Select Uart Baudrate.[2400,4800,9600,19200,38400,57600,115200,230400]
* Return                	: Device File Pointer
* Description           	: is used to open the HOST device.
* Example               	: int fd;
				  			  fd = HOST_Open(RS232_PORT,115200);
*******************************************************************************/
int HOST_Open(int uartCh, int Baud);

/*******************************************************************************
* Function              	: HOST_Close
* Argument       uartCh   	: Note please sysdef.h 
* Return                	: None
* Description           	: is used to close the HOST device.
* Example               	: HOST_Close(RS232_PORT);
*******************************************************************************/
void HOST_Close(int uartCh);

/*******************************************************************************
* Function              	: HOST_SendString
* Argument       uartCh   	: Note please sysdef.h 
				 *s			: Send Data.
* Return                	: result = 0: ok , -1: err
* Description           	: is used to Send String Data.
* Example               	: char *string = "RS232_TEST";
							  HOST_SendString(RS232_PORT,string);
*******************************************************************************/
int HOST_SendString(int uartCh, char *s);

/*******************************************************************************
* Function              	: HOST_GetByte
* Argument       uartCh   	: Note please sysdef.h 
* Return                	: result = get byte: ok , -1: err
* Description           	: is used to Get Byte.
* Example               	: int byte;
							  byte = HOST_GetByte(RS232_PORT);
*******************************************************************************/
int HOST_GetByte(int uartCh);

/*******************************************************************************
* Function              	: HOST_SendByte
* Argument       uartCh   	: Note please sysdef.h 
* Return                	: result = 0: ok , -1: err
* Description           	: is used to Send 1 Byte.
* Example               	: HOST_SendByte(RS232_PORT,'A');
*******************************************************************************/
int HOST_SendByte(int uartCh, unsigned char send_data);

/*******************************************************************************
* Function              	: HOST_CheckRxCnt
* Argument       uartCh   	: Note please sysdef.h 
* Return                	: error result = Received Data Count: ok , -1: err.
* Description           	: is used to check received data count number.
* Example               	: int cnt;
							  cnt = HOST_CheckRxCnt(RS232_PORT);
*******************************************************************************/
int HOST_CheckRxCnt(int uartCh);

/* RS485 related funcion definitions */
/*******************************************************************************
* Function              	: DevRS485_Open
* Argument       Baud		: Select Uart Baudrate.[2400,4800,9600,19200,38400,57600,115200,230400]
* Return                	: Device File Pointer
* Description           	: is used to open the RS485 device.
* Example               	: int fd;
				  			  fd = DevRS485_Open(115200);
*******************************************************************************/
int DevRS485_Open(int Baud);

/*******************************************************************************
* Function              	: DevRS485_Close
* Argument       		   	: None
* Return                	: None
* Description           	: is used to close the RS485 device.
* Example               	: DevRS485_Close();
*******************************************************************************/
void DevRS485_Close(void);

/*******************************************************************************
* Function              	: DevRS485_SendDataN
* Argument       len   		: Send Data Length.
				 *data		: Send Data.
* Return                	: result = 0: ok , -1: err
* Description           	: is used to Send String Data.
* Example               	: char buf[3] = {0x31,0x32,0x33};
							  int slen = 3;
							  DevRS485_SendDataN(buf,slen);
*******************************************************************************/
int DevRS485_SendDataN(unsigned char *data, int len);

/*******************************************************************************
* Function              	: DevRS485_GetByte
* Argument       		   	: None
* Return                	: result = get byte: ok , -1: err
* Description           	: is used to Get Byte.
* Example               	: int byte;
							  byte = DevRS485_GetByte();
*******************************************************************************/
int DevRS485_GetByte(void);

/*******************************************************************************
* Function              	: DevRS485_CheckRxCnt
* Argument       		   	: None
* Return                	: result = Received Data Count: ok , -1: err.
* Description           	: is used to check received data count number.
* Example               	: int cnt;
							  cnt = DevRS485_CheckRxCnt();
*******************************************************************************/
int DevRS485_CheckRxCnt(void);

/******************************************************************************
* Function					: RS485_Read
* Argument 			*buf	: You can read RS485 current status.
* Return					: result = 0: ok , -1: err
* Description				: Access the RS485 device drive file and read the value.
* Example					: char buf[20]; 
							  RS485_Read(buf);
*******************************************************************************/
int RS485_Read(char *buf);

/* Common Uart related funcion definitions */
/*******************************************************************************
* Function              	: ApiUartExtraOpen
* Argument       uartCh		: This is dummy value, please select 11 ~ 15.
				 *path		: Virtual Comport Device location
* Return                	: Device File Pointer
* Description           	: is used to access virtual comport device
* Example               	: int fd;
				  			  fd = ApiUartExtraOpen(11,"/dev/ttyUSB0");
*******************************************************************************/
int ApiUartExtraOpen(int uartCh,char *path);

/*******************************************************************************
* Function              	: ApiUartOpen
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartOpen(int uartCh);

/*******************************************************************************
* Function              	: ApiUartClose
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
void ApiUartClose(int uartCh);

/*******************************************************************************
* Function              	: ApiUartConfig
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartConfig(int uartCh,unsigned int baud_rate);

/*******************************************************************************
* Function              	: ApiUartPutChar
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartPutChar(int uartCh, unsigned char ch);

/*******************************************************************************
* Function              	: ApiPutData
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiPutData(int uartCh, unsigned char *data, int len);

/*******************************************************************************
* Function              	: ApiUartPutString
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartPutString(int uartCh, char *s);

/*******************************************************************************
* Function              	: ApiUartGetRxDataInt
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartGetRxDataInt(int uartCh);

/*******************************************************************************
* Function              	: ApiUartGetData
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartGetData(int uartCh, char *pData);

/*******************************************************************************
* Function              	: ApiUartInitBuffer
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartInitBuffer(int uartCh);

/*******************************************************************************
* Function              	: ApiUartCheckRxCnt
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartCheckRxCnt(int uartCh);

/*******************************************************************************
* Function              	: ApiUartGetFd
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartGetFd(int uartCh);

/*******************************************************************************
* Function              	: ApiUart_tcdrain
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUart_tcdrain(int uartCh);

/*******************************************************************************
* Function              	: ApiUartPutByte
* Description           	: This fuction is common function for sys library.
*******************************************************************************/
int ApiUartPutByte(int uartCh, unsigned char ch);
//int ApiUartConfigXbaud(int uartCh,int baud_rate,int parity);
int Linux_USam_IC_PowerOn(int slotno, int* outlen, unsigned char* lpRes) ;
int Linux_USam_IC_PowerOff(int slotno) ;
int DevUSAMOpen(int uart_id, int baud, int parity, int stop); 
void DevUSAMClose(void);
int USamDriver_Version(unsigned char *version) ;
int SAMDEBUG_Control(int control);
int Linux_USam_IC_Case4(int slotno, int datalen, unsigned char* data, int* outlen, unsigned char* lpRes);
unsigned char Find_UARTSAM_Channel(void);
unsigned char Get_UARTSAM_Num(void);
int SAMPWR_Control_3V3(int control);
int SAMPWR_Control_5V(int control);
int SAMRST_Control(int control);
int SAMCLK_Control(int control);
void ApiUartConfigXClear(int uartCh);
int ApiUartConfigXBaud(int uartCh,int baud_rate);
int ApiUartConfigXParity(int uartCh,int parity);
int ApiUartConfigXStop(int uartCh,int stop);
int ApiUartConfigXSetup(int uartCh);
int ApiUartConfigXParityCheck(int uartCh);
int ApiUartConfigXDisableRx(int uartCh);
int ApiUartConfigXEnableRx(int uartCh);
//int tcdrain(int uartCh);
unsigned long long GET_1Ms_Tick(void);
int GET_Tick_Init(void);
int Start_Tick_1Ms(void);
int Init_Tick_1Ms(void);
void DevUSAMPOWEROFF(void);
int SAMSlot_Set(int slot);
#ifdef __cplusplus
}
#endif
