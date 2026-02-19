#include <stdio.h>
#include <string.h>
#include <pthread.h>
#include <unistd.h>

#include "test.h"
#include "apiRect.h"
#include "libLcd.h"
#include "log.h"
#include "Callback.h"
#include "libQr.h"
#include "sysfunc.h"


#define DisplayX    320
#define DisplayY    240

void setting_init();
int setting_btnClickListener(int id);
int setting_btnTouchListener(int id, int type, int x, int y);

int *data;
static Rect btnLED;
static Rect btnSign;
static Rect btnRelay;
static Rect btnCASHBOX;
static Rect btnCount;
static Rect g_imgSignTest;
// pthread_t p_thread;


void setting_init()
{
    char text[] = "LED";
    char text1[] ="SIGN";
    char text2[] ="RELAY";
	char text3[] ="CASHBOX";

	devLCD_displayFile(0, 0, "/duapp/res/demo/bg_setting.bmp");

	btnSign = CreateRectangle(30, 20, 120, 50);
	SetImageRect(btnSign, "/duapp/res/demo/btn_clear_nor.bmp", 0);
	SetRectangleText(btnSign, text1, strlen(text1));
	SetRectangleTextSize(btnSign, FONT24);
	SetRectangleTextPosition(btnSign, TP_CENTER | TP_VCENTER);
	SetRectangleTextBgColor(btnSign, cTransparent);
	DrawRectangle(btnSign);

	btnLED = CreateRectangle(170, 20, 120, 50);
	SetImageRect(btnLED, "/duapp/res/demo/btn_clear_nor.bmp", 0);
	SetRectangleText(btnLED, text, strlen(text));
	SetRectangleTextSize(btnLED, FONT24);
	SetRectangleTextPosition(btnLED, TP_CENTER | TP_VCENTER);
	SetRectangleTextBgColor(btnLED, cTransparent);
	DrawRectangle(btnLED);

    btnRelay = CreateRectangle(30, 80, 120, 50);
    SetImageRect(btnRelay, "/duapp/res/demo/btn_clear_nor.bmp", 0);
    SetRectangleText(btnRelay, text2, strlen(text2));
    SetRectangleTextSize(btnRelay, FONT24);
    SetRectangleTextPosition(btnRelay, TP_CENTER | TP_VCENTER);
    SetRectangleTextBgColor(btnRelay, cTransparent);
    DrawRectangle(btnRelay);

	btnCASHBOX = CreateRectangle(170, 80, 120, 50);
	SetImageRect(btnCASHBOX, "/duapp/res/demo/btn_clear_nor.bmp", 0);
	SetRectangleText(btnCASHBOX, text3, strlen(text3));
	SetRectangleTextSize(btnCASHBOX, FONT24);
	SetRectangleTextPosition(btnCASHBOX, TP_CENTER | TP_VCENTER);
	SetRectangleTextBgColor(btnCASHBOX, cTransparent);
	DrawRectangle(btnCASHBOX);

//    btnCount = CreateRectangle(120, 145, 120, 50);
//    SetRectangleTextSize(btnCount, FONT24);
//    SetRectangleTextPosition(btnCount, TP_CENTER | TP_VCENTER);
//    SetRectangleTextBgColor(btnCount, cTransparent);
//	  DrawRectangle(btnCount);

	SetOnTouchRectangleListener(btnLED, setting_btnTouchListener);
	SetOnClickRectangleListener(btnLED, setting_btnClickListener);
	SetOnTouchRectangleListener(btnSign, setting_btnTouchListener);
	SetOnClickRectangleListener(btnSign, setting_btnClickListener);
    SetOnTouchRectangleListener(btnRelay, setting_btnTouchListener);
    SetOnClickRectangleListener(btnRelay, setting_btnClickListener);
	SetOnTouchRectangleListener(btnCASHBOX, setting_btnTouchListener);
	SetOnClickRectangleListener(btnCASHBOX, setting_btnClickListener);
}

void setting_destroy()
{
	DestroyRectangle(btnLED);
    DestroyRectangle(btnSign);
    DestroyRectangle(btnRelay);
	DestroyRectangle(btnCASHBOX);
}

int setting_btnClickListener(int id)
{
//	if (id == btnLED->id)
//	{
//		LOGD("clicked ");
	    startActivity();
//	}
	if (id == btnLED->id)
	{
		LOGD("led clicked ");
		led_test();
	}
	else if (id == btnSign->id)
	{
		LOGD("sign clicked ");
        setting_destroy();
        CheckTOUCH(0);
	}
    else if (id == btnRelay->id)
    {
        LOGD("relay clicked ");
        relay_test();
    }
	else if (id == btnCASHBOX->id)
	{
		LOGD("CASHBOX clicked ");
        setting_CASHBOXTest();
	}

	return 1;
}

int setting_signTest() {
	setting_destroy();
	CheckTOUCH(1);
	//signTest();
	return 1;
}

int setting_COMTest() {
    int data;
    int ret = 0;

	HOST_SendByte(3,'A');
	data = Uartx_Receive_Byte(3, 100);
	if(data == 'A'){
		ret += 1;
		LOGD("A:%c ttyS3(COM1) ok",data);
	}
    else
        LOGD("A:%d ttyS3(COM1) fail",data);

	HOST_SendByte(4,'B');
	data = Uartx_Receive_Byte(4, 100);
	if(data == 'B'){
		ret += 2;
		LOGD("B:%c ttyS4(COM2) ok",data);
	}
    else
        LOGD("B:%d ttyS4(COM2) fail",data);

    if (ret > 0) //success
        return ret;
    else
        return 0;
}

int setting_ledTest() {
    int ret;
	ret = led_test();
	if (ret > 0) //success
	    return 1;
	else
	    return 0;
}

int setting_CASHBOXTest() {
	int ret;
	ret = CASHBOX_Open(1);
	if (ret == 0)
	{
		usleep(300 * 1000);
		ret = CASHBOX_Open(0);
		if (ret == 0) //success
			return 1;
		else
			return 0;
	}
	else
		return 0;
}

int thread_qr_running = 0;
int thread_qr_running_aging = 0;
pthread_t p_thread_qr;
pthread_t p_thread_qr_aging;

int setting_QRTest() {
    int ret, thr_id;

//    if (thread_qr_running == 1)
//    {
//        QR_TRIG_Control(0);
//        apiQr_init();
//    }
	//ApiUartOpen(QR_UART_ID);
	//apiQr_init();
	ret = Check_Version_QR(200);
	if (ret == 0)  //success
	{
		if (thread_qr_running == 2)
			thread_qr_running = 0;
		qr_control('L');
	    if (thread_qr_running == 0) {
            thr_id = pthread_create(&p_thread_qr, NULL, qr_test, NULL);    // QR Data Reading
            if (thr_id < 0) {
                LOGD((char *)stderr, "%s : thread create error : \n", __func__);
                return 0;
            }
            return 1;
        }
	    return 1;
	}
	 else
		return 0;
}

int setting_QRTest_aging() {
	int ret, thr_id;

//    if (thread_qr_running_aging == 1)
//    {
//        QR_TRIG_Control(0);
//        apiQr_init();
//    }
	//ApiUartOpen(QR_UART_ID);
	//apiQr_init();
	ret = Check_Version_QR(200);
	if (ret == 0)  //success
	{
		if (thread_qr_running_aging == 2)
			thread_qr_running_aging = 0;
        qr_control('L');	//trigger on --> start scanning
		if (thread_qr_running_aging == 0) {
			thr_id = pthread_create(&p_thread_qr_aging, NULL, qr_test_aging, NULL);    // QR Data Reading
			if (thr_id < 0) {
				LOGD((char *)stderr, "%s : thread create error : \n", __func__);
				return 0;
			}
			return 1;
		}
		return 1;
	}
	else
		return 0;
}

int QR_CLOSE()
{
	LOGD("thread_qr_running %d\n",thread_qr_running);
	LOGD("thread_qr_running_aging %d\n",thread_qr_running_aging);
	if (thread_qr_running == 1) {
		thread_qr_running = 2;
		while (true) {
			if (thread_qr_running == 0) {
				pthread_kill(p_thread_qr, NULL);
				LOGD("thread_qr kill...\n");
				break;
			}
			usleep(5 * 1000);
		}
	}

	if (thread_qr_running_aging == 1) {
		thread_qr_running_aging = 2;
		while (true) {
			if (thread_qr_running_aging == 0) {
				pthread_kill(p_thread_qr_aging, NULL);
				LOGD("thread_qr_aging kill...\n");
				break;
			}
			usleep(5 * 1000);
		}
	}
	return 1;
    //ApiUartClose(QR_UART_ID);
}

int setting_relayTest() {
	int ret;
    ret = relay_test();
    if (ret == 0) //success
    	return 1;
	else
		return 0;
}


//int preessed_id;
int setting_btnTouchListener(int id, int type, int x, int y)
{
	//LOGD("touch id : %d, type: %d, x: %d, y: %d\n", id, type, x, y);
	int i;
	switch(type)
	{
	case TOUCH_DOWN:
		if (id == btnLED->id)
		{
			SetImageRect(btnLED, "/duapp/res/demo/btn_clear_sel.bmp", 0);
			DrawRectangle(btnLED);
		}
		if (id == btnSign->id)
		{
			SetImageRect(btnSign, "/duapp/res/demo/btn_clear_sel.bmp", 0);
			DrawRectangle(btnSign);
		}
        if (id == btnRelay->id)
        {
            SetImageRect(btnRelay, "/duapp/res/demo/btn_clear_sel.bmp", 0);
            DrawRectangle(btnRelay);
        }
		if (id == btnCASHBOX->id)
		{
			SetImageRect(btnCASHBOX, "/duapp/res/demo/btn_clear_sel.bmp", 0);
			DrawRectangle(btnCASHBOX);
		}

		break;
	case TOUCH_UP:
		if (id == btnLED->id)
		{
			SetImageRect(btnLED, "/duapp/res/demo/btn_clear_nor.bmp", 0);
			DrawRectangle(btnLED);
		}
		if (id == btnSign->id)
		{
			SetImageRect(btnSign, "/duapp/res/demo/btn_clear_nor.bmp", 0);
			DrawRectangle(btnSign);
		}
        if (id == btnRelay->id)
        {
            SetImageRect(btnRelay, "/duapp/res/demo/btn_clear_nor.bmp", 0);
            DrawRectangle(btnRelay);
        }
		if (id == btnCASHBOX->id)
		{
			SetImageRect(btnCASHBOX, "/duapp/res/demo/btn_clear_nor.bmp", 0);
			DrawRectangle(btnCASHBOX);
		}

		break;
	}
	return 1;
}

int setting_main()
{
	LOGI("setting open\n");
	setting_init();

	return 0;
}


void setText(const char* msg)
{
    char tmp[20];
    sprintf(tmp, "%s", msg);
    LOGD("count: %s", tmp);
    SetRectangleText(btnCount, tmp, strlen(tmp));
    DrawRectangle(btnCount);
}
