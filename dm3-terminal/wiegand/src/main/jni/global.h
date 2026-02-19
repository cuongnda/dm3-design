#include <stdio.h>
#include <string.h>
#include <pthread.h>
#include <stdlib.h>
#include <errno.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <net/if_arp.h>
#include <arpa/inet.h>

#define ON	1
#define OFF	0

#define		KEY_F1		0xf1
#define		KEY_F2		0xf2
#define		KEY_F3		0xf3
#define		KEY_F4		0xf4
#define		KEY_F5		0xf5
#define		KEY_F6		0xf6
#define		KEY_F7		0xf7
#define		KEY_F8		0xf8
#define		KEY_F9		0xf9
#define		KEY_F10		0xfa
#define		KEY_F11		0xfb
#define		KEY_F12		0xfc
#define		KEY_BACKSPACE	0x7d
#define		KEY_CLEAR	0x7e
#define		KEY_BACK	0x7f
#define		KEY_ENTER	0x7c
#define		KEY_TLSTEST	0x7b
#define		KEY_SIGN	0xff

#define MAX_WIDGET_SIZE		20
#define MAX_WIDGET_STRING_SIZE	59


#define	TOP_RIGHT 0
#define	TOP_LEFT  1
#define	BOTTOM_RIGHT 2
#define	BOTTOM_LEFT  3
#define	LED_POSION_MAX 4

#define	LED_OFF 0
#define	LED_RED 1
#define	LED_GREEN 2
#define	LED_BLUE 3
#define	LED_YELLOW 4
#define	LED_MAGENTA 5
#define	LED_CYAN 6
#define	LED_WHITE 7
#define	LED_COLOR_MAX 8

#define BUTTON_RECT	0
#define BUTTON_ROUND	1

#define TRUE 1
#define FALSE 0


#define DPRINTF	printf

typedef struct _Rectangle{
	int x1;
	int y1;
	int width;
	int height;
	int lineColor;
	int fillColor;
	int charactorColor;
	int charactorSize;
	int active_touch;
	int buttontype;
	int changebtn;
	char name[64];
}Rectangle;
int sysSB_open();
void sysSB_close();
int GetKey(void);

void widget_init(Rectangle *button,int n_button,char *path);
int home_main(void);
int sign_main(void);
int rf_main(void);
int gpio_main(void);
int sam_main(void);
int sound_main(void);
int setting2_main(void);
int setting1_main(void);
int DrawRectagle(Rectangle r);
void touch_thread_end(void);
int wiegand_main(void);
int net_main(void);
int qr_main(void);
int sql_main(void);
int sign_all(void);
void DisplayToast(Rectangle toast_msg,int disp_msec);
void touch_disable(Rectangle *table, int cnt);
void touch_enable(Rectangle *table, int cnt);


