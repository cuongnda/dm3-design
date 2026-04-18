LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE    := SAM_Uart
LOCAL_CFLAGS := -DANDROID_NDK  -DDEBUG_MODE -DBUILD_LIB
LOCAL_LDLIBS:= -llog
LOCAL_SRC_FILES := \
		sam_test.c DevSAM.c api_uart2.c api_uart.c scard.c iso7816.c
include $(BUILD_SHARED_LIBRARY) 
