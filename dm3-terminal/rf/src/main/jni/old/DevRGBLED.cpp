#include "DevRGBLED.h"

#define RGB_LEFT_RED "/sys/class/leds/leftred/brightness"
#define RGB_LEFT_GREEN "/sys/class/leds/leftgreen/brightness"
#define RGB_LEFT_BLUE "/sys/class/leds/leftblue/brightness"
#define RGB_RIGHT_RED "/sys/class/leds/rightred/brightness"
#define RGB_RIGHT_GREEN "/sys/class/leds/rightgreen/brightness"
#define RGB_RIGHT_BLUE "/sys/class/leds/rightblue/brightness"

int RGB_LED_Write(unsigned char control, char *path)
{	
	int ret,dev;
	char buf[100];
	memset(buf,0x00,sizeof(buf));
	//printf("Path[%s], Control[%c]\n",path,control);
	sprintf(buf,"%s",path);	
	dev = open(buf, O_RDWR|O_NDELAY );
	if(dev <0) return -1;

	ret = write(dev, &control, 1);
	if(ret < 0)	return -1;	
	ret = close(dev);  
	if(ret < 0)	return -1;	
	return 0;	
}

int RGB_LED_Control(unsigned char direction, int color)
{
	unsigned char buf[3];
	memset(buf,0x00,sizeof(buf));
	buf[0] = (unsigned char)((color & 0x00ff0000) >> 16);
	buf[1] = (unsigned char)((color & 0x0000ff00) >> 8);
	buf[2] = (unsigned char)((color & 0x000000ff) >> 0);
	
	//printf("Direction[%c] R[%c],G[%c],B[%c]\n",direction,buf[0],buf[1],buf[2]);
		
	if((direction == 'L') || (direction == 'A')){
		RGB_LED_Write(buf[0],RGB_LEFT_RED);
		RGB_LED_Write(buf[1],RGB_LEFT_GREEN);
		RGB_LED_Write(buf[2],RGB_LEFT_BLUE);
	}else if(direction != 'R')return -1;
	
	if((direction == 'R') || (direction == 'A')){
		RGB_LED_Write(buf[0],RGB_RIGHT_RED);
		RGB_LED_Write(buf[1],RGB_RIGHT_GREEN);
		RGB_LED_Write(buf[2],RGB_RIGHT_BLUE);
	}else if(direction != 'L')return -1;
	return 0;
}

