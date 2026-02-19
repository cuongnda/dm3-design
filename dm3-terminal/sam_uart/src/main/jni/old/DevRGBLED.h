#ifndef DEV_RGBLED_H
#define DEV_RGBLED_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

#include <pthread.h>
//#include <linux/input.h>
#include <sys/types.h>
#include <unistd.h>
#include <string.h>
#include <sys/stat.h>
#include <fcntl.h>

#define RED	0x00303131
#define GREEN	0x00313031
#define BLUE	0x00313130
#define YELLOW	0x00303031
#define PINK	0x00303130
#define BLACK	0x00303030
#define AQUA	0x00313030
#define OFF	0x00313131

#define LED_LEFT	'L'
#define LED_RIGHT	'R'
#define LED_ALL	'A'

int RGB_LED_Write(unsigned char control, char *path);

int RGB_LED_Control(unsigned char direction, int color);

#endif // DEV_RGBLED_H