
//////////////////////////////////////////////////////////////////////////////
// Reader Error Codes                
//////////////////////////////////////////////////////////////////////////////
/// Received correct response from card
#define MI_OK                           0x00
#define MI_CHK_OK                       0x00
#define MI_CRC_ZERO                     0x00
#define READER_ERR_BASE_START           0x00

///Not specified error
#define MI_CRC_NOTZERO                  0x01
#define MI_ERROR                        0x01

///No response from card
#define MI_NOTAGERR                     0x02
#define MI_CHK_FAILED                   0x02	
///Wrong CRC was transmitted from card 	
#define MI_CRCERR                       0x03
#define MI_CHK_COMPERR                  0x03
/// Smart card is not inserted	
#define MI_EMPTY                        0x04
#define MI_NOCARD		                0x04
/// MIFARE card key authentication error     
#define MI_AUTHERR                      0x05
/// Smart card is in turned off state 
#define MI_NOPOWER						0x05
/// Wrong parity bit was transmitted from type-A card
#define MI_PARITYERR                    0x06
/// Wrong command code was transmitted from host      
#define MI_CODEERR                      0x07

#define MI_SERNRERR                     0x08
/// Check byte of UID is wrong 
#define MI_WRONG_UID_CHECKBYTE          0x08

#define MI_KEYERR                       0x09 //2017.10.13 for BJC
/// This command is not authenticated    
#define MI_NOTAUTHERR                   0x0A	//10
/// Bit count of received data is incorrect   
#define MI_BITCOUNTERR                  0x0B	//11
/// More or less data from protocol was sent from card 
#define MI_BYTECOUNTERR                 0x0C	//12
#define MI_IDLE                         0x0D	//13
#define MI_TRANSERR                     0x0E	//14
/// Error occured when it write data to MIFARE card 		
#define MI_WRITEERR                     0x0F	//15
/// Error occured when it increment data to MIFARE card		
#define MI_INCRERR                      0x10	//16
/// Error occured when it decrement data to MIFARE card 
#define MI_DECRERR                      0x11	//17
/// Error occured when it read FeliCa card 
#define MI_READERR                      0x12	//18
/// FIFO was overflowed when receive data form card     
#define MI_OVFLERR                      0x13	//19
/// Received data is out of correct frame (protocol)        
#define MI_FRAMINGERR                   0x15	//21
/// Unsupported command was sent from host
#define MI_UNKNOWN_COMMAND              0x17	//23
/// Collision was detected when receive data from card	
#define MI_COLLERR                      0x18	//24
#define MI_RESETERR                     0x19	//25
#define MI_ACCESSTIMEOUT                0x1B	//27
#define MI_INVALIDBLOCK					0x20	//32
/// Chaining retry overflowed limited count	
#define MI_ACKCOUNTERR					0x21	//33
// ACK was received for deselect command	
#define MI_NACKDESEL					0x22	//34
/// Retry count overflowed maximum limit
#define MI_NACKCOUNTERR					0x23	//35

/// Receive buffer is smaller than expected data length from card 
#define MI_BUF_2_SMALL                  0x31 	//49
/// More data than receive buffer was transmitted from card 
#define MI_BUF_OVERFLOW                 0x32	//50 
/// RF is not in ready state to communicate with card	(NFC)	
#define MI_RF_ERR                       0x33	//51
/// Wrong data from protocl was received or transmitted
#define MI_PROTOCOL_ERR					0x34	//52
/// Invalid data from protocol format was sent from host (NFC)
#define MI_INVALID_FORMAT               0x37	//55
/// Received LRC is different from calculated one
#define MI_LRCERR						0x38	//56	//added for serial comm
/// Receiced data is out of correct frame format
#define MI_FRAMERR						0x39	//57	

//PN5180, added by ken
#define MI_NOTCOMPLETE_ERR						0x3A	//58	
//2017.10.13
#define MI_CONFERR										0x3A	//add for BJC 

#define MI_INTEGRITY_ERR								0x3B	//59  

/// Wrong parameter from protocol format was sent from host (NFC) 
#define MI_WRONG_PARAMETER_VALUE        0x3C	//60
/// Invalid parameter from protocol format was sent from host (NFC)
#define MI_INVALID_PARAMETER            0x3D	//61
#define MI_INITEDERR  					61		//0x3D, BJC, added for initited card

/// Unsupported NFC command was sent from host (NFC)
#define MI_UNSUPPORTED_COMMAND          0x3F	//63
/// RF command is not supported when contact card exists
#define MI_INTERFACE_NOT_ENABLED		0x40	//64
/// Other response was received when ACK is supposed from card
#define MI_ACK_SUPPOSED					0x41	//65
/// NAK was received when waiting for other response from card	
#define MI_NACK_RECEIVED				0x42	//66
/// Temperature error
#define MI_JOINER_TEMP_ERROR			0x4C	//76


/// Action for this command is not implemented yet	
#define MI_NY_IMPLEMENTED               0x64	//100
/// Error occurred when write data to FIFO
#define MI_FIFOERR                      0x6D	//109
/// Read value from card is different from written value
#define MI_WRONG_VALUE                  0x7B	//123
/// Card responsed value error for the command
#define MI_VALERR                       0x7C	//124

/// User mode values and register mode values are different
#define MI_NFC_MODE_ERR					0x90	//144, mode set error if  user mode values and register mode values are different
/// User speed and register speed are different
#define MI_NFC_SPD_ERR					0x91	//145, communication speed set error if  user values and register values are different
//ksw
/// Protocols between two nfc devices are abnormal
#define MI_NFC_PRT_ERR					0x92 	//146, protocol error if protocols between two nfc devices are abnormal
/// There is no response until time-out value
#define MI_NFC_TO_ERR					0x93 	//147, Timeout error when there is no response until time-out value
/// Transmission failed until retry number is over 3 times	
#define MI_NFC_TR_ERR					0x94 	//148, Transmission error when retry number  is over 3 times
/// Scope data value is out of ranges defined in the specifications
#define MI_NFC_SCOPE_ERR				0x95 	//149, Scope error if scope of data value is out of ranges defined in the specifications.
/// Trying to connect each other during disconnected mode 
#define MI_NFC_NOTCONNECTED				0x96 	//150, When two nfc devices are trying to connect each other during disconnected mode
/// Two NFC devices are using different DID settings	
#define MI_NFC_BLOCK_ERR				0x97	//151, DID Protocol error when when two nfc devices are using different DID settings
/// Target didn't get Information PDU during Get_Target Command
#define MI_NFC_NOIPDU_ERR				0x98 	//152, No frame error when target didn't get Information PDU during Get_Target Command, Get_Target했는데 IPDU를 수신하지 못했을 때 이 코드를 리턴한다.
//2013.2.19, ken
#define MI_NFC_DESELECTED				0x99
#define MI_NFC_RELEASED					0x9A
#define MI_NFC_TOXERR					0x9B

/// MAC activation error when connect LLC communication
#define MI_MAC_ACTIVE_ERR				0xA0	//160, MAC activation error when two nfc devices are trying to connect each other for LLC communicaiton
/// There is no response to LLC connect command
#define MI_LLC_CONNECT_ERR				0xA1	//161, Communication error when there is no response to LLC connect  command
/// There is no response to LLC symmetry command 
#define MI_LLC_SYMM_ERR					0xA2	//162, Communication error when there is no response to LLC symmetry  command
/// There is no response to LLC information command
#define MI_LLC_INF_ERR					0xA3	//163, Communication error when there is no response to LLC information  command
/// There is no response to LLC receive ready command
#define MI_LLC_RR_ERR					0xA4	//164, Communication error when there is no response to LLC receive ready  command
/// There is no response to LLC disconnect command
#define MI_LLC_DISC_ERR					0xA5	//165, Communication error when there is no response to LLC disconnect command
/// MAC deactivation error when close LLC
#define MI_MAC_DEACTIVE_ERR				0xA6	//166, MAC deactivation error when two nfc devices are trying to disconnect each other to close LLC
/// Access Conditions, Data Size and Version are not different from defined value
#define MI_NDEF_ERR						0xA7	//167, NFC tag operation error when Access Conditions, Data Size  and Version are not different from defined value.
/// Checksum values in Attribute Block of Type 3 tag are wrong
#define MI_CHECKSUM_ERR					0xA8	//168, NFC tag operation error when checksum values in Attribute Block of Type 3 tag are wrong

/// There is no data from remote LLC in a target mode
#define MI_LLC_GET_ERR					0xA9	//169
/// There is error during sending PDU to remote LLC
#define MI_LLC_SET_ERR					0xAA	//170
/// Magic Number Error
#define MI_LLC_MAGIC_ERR				0xAB	//171, Magic Number Error
/// Length error in LLC PDU	format
#define MI_LLC_LEN_ERR					0xAC	//172, deselected
//2013.06 ken
#define MI_LLC_AGF_ERR					0xAD	//173
#define MI_SNEP_ERR						0xAE	//174
#define MI_LLC_CLOSED					0xAF 	//175, 2013.2.19, ken
/// No Service SAP in CONNECT PDU
#define MI_LLC_NOSERVICE				0xB0 	//176
/// Connect PDU rejected
#define MI_LLC_CON_REJECT				0xB1 	//177
/// PDU is invalid
#define MI_LLC_INVALID_PDU				0xB2	//178
/// NR is wrong value
#define MI_LLC_INVALID_NR				0xB3	//179
/// NS is wrong value
#define MI_LLC_INVALID_NS				0xB4	//180
/// Received data length for service name request is wrong(0).
#define MI_LLC_SNLLEN_ERR				0xB5	//181

#define MI_SYSCODE_ERR					0x99 //plugfest
#define MI_TAGCC_ERR					0x9A //plugfest, NFC태그내에 CC정보가 없는 경우발생
#define MI_READ_ONLY					0x9B //plugfest, Access condition이 Read only인것을 표시함

//SYH 2017.06.26
#define MI_NORECORD						0x9C  //레코드가 존재하지 않음

