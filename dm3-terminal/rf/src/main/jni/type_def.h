// \uFEFF
#ifndef _TYPE_DEF_ //2019.12.12
#define _TYPE_DEF_

#ifndef s8
#define s8	char
#endif
#ifndef vs8
#define vs8	volatile char
#endif
#ifndef u8
#define u8	unsigned char
#endif
#ifndef vu8
#define vu8	volatile unsigned char
#endif
#ifndef s16
#define s16	signed short
#endif
#ifndef u16
#define u16	unsigned short
#endif
#ifndef vu16
#define vu16 volatile unsigned short
#endif
#ifndef s32
#define s32	int
//#define s32	signed long
#endif
#ifndef u32
#define u32	unsigned int
//#define u32	unsigned long
#endif
#ifndef vu32
#define vu32 volatile unsigned int
#endif
#ifndef s64
#define s64	signed long long
#endif
#ifndef u64
#define u64	unsigned long long
#endif

#ifndef bool_t
#define bool_t	unsigned char
#endif

//2013.09.15
#ifndef boolean
#define boolean	unsigned char
#endif
#ifndef bool
#define bool	unsigned char
#endif
#ifndef BOOL
#define BOOL	unsigned char
#endif

//2016.06.02
/*
#ifndef __IO
#define     __IO    volatile             //!< defines 'read / write' permissions              
#endif
#ifndef uint32_t
#define uint32_t unsigned int
#endif
#ifndef uint16_t
#define uint16_t unsigned short
#endif
#ifndef uint8_t
#define uint8_t unsigned char
#endif
*/

//2014.06.04
#ifndef ON
#define ON						1
#endif
#ifndef OFF
#define OFF						0
#endif

// ISO14443 
#define TYPEA					'A'
#define MIFARE				'M'
#define TYPEB					'B'
#define CALYPSO				'L' //2018.08.07
#define FELICA				'C'
//#define HERMES				'H'
//#define MERCURY				'm'
#define TYPERFID			'I'
#define TYPEICODE			'i'
#define TYPEBIT			  'T'
//2013.03.20, ken
#define NFCBARCODE		'K' 
//2015.04.20
#define TYPEPICO			'P'

#define ACT_INIT			0x11
#define PASS_INIT			0x10
#define ACT_TARGET    0x21
#define PASS_TARGET		0x20


#define OK     			0
#define ERROR  			1

#define _ATR_DUALI			0
#define _ATR_PCSC			1
#define _ATR_CCID			2
#define _ATR_DUALI_ORG	3

#define RF_DIRECT		1
#define RF_50_OHM		0

//2017.07.05
#ifndef STM32F4XX_H
#ifndef __STM32F10x_TYPE_H
#ifndef ENABLE
#define ENABLE		1
#endif
#ifndef DISABLE
#define DISABLE		0
#endif
#endif
#endif

#endif //#ifndef _TYPE_DEF_ //2019.12.12