#include "libLcd.h"
#include "sysdef.h"
#include "sysfunc.h"
#include "global.h"
#include <sys/time.h>
#include <stdio.h>
#include <string.h>

#include "test.h"

int Uartx_Receive_Byte(int uartCh, int timeout_ms) {
	struct timeval stime, etime;
	long long	tcheck = 0;
	int rx_byte = 0;
	gettimeofday(&stime, NULL);
	while(1){
		gettimeofday(&etime, NULL);
		tcheck = (1000*(etime.tv_sec-stime.tv_sec)) + ((etime.tv_usec-stime.tv_usec)/1000);
		if(tcheck>timeout_ms)	return -1;		
		rx_byte = HOST_GetByte(uartCh);
		if(rx_byte < 0)	usleep(1*1000);
		else return rx_byte;
	}
	return -1;
}
/*
int host_main(void)
{
	int i;
	int key;
	int data = 0;
	
	
	
	widget_init(host_button,sizeof(host_button)/sizeof(Rectangle),"/duapp/res/host");

	for(;;){
		key = GetKey();
		if(key == KEY_BACK){
			
			usleep(100*1000);
			return 0;
		}	
		
		HOST_SendByte(HOST3,'A');
		data = Uartx_Receive_Byte(HOST3,500);		
		if(data == 'A'){
			host_button[2].fillColor = cGreen;
			DrawRectagle(host_button[2]);
		}
		else{
			host_button[2].fillColor = cRed;
			DrawRectagle(host_button[2]);
		}

		HOST_SendByte(HOST4,'B');
		data = Uartx_Receive_Byte(HOST4,500);			
		if(data == 'B'){
			host_button[3].fillColor = cGreen;
			DrawRectagle(host_button[3]);
		}
		else{
			host_button[3].fillColor = cRed;
			DrawRectagle(host_button[3]);
		}
		
		HOST_SendByte(HOST5,'C');
		data = Uartx_Receive_Byte(HOST5,500);		
		if(data == 'C'){
			host_button[4].fillColor = cGreen;
			DrawRectagle(host_button[4]);
		}
		else{
			host_button[4].fillColor = cRed;
			DrawRectagle(host_button[4]);
		}
		key = 0;
		usleep(200*1000);	
	}

	return 0;
}
*/

