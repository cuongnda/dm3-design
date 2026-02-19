LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE    := wiegand
LOCAL_CFLAGS := -DANDROID_NDK  -DDEBUG_MODE -DBUILD_LIB

LOCAL_LDLIBS:= -llog
LOCAL_SRC_FILES := \
		DevWiegand.c wiegand.c

include $(BUILD_SHARED_LIBRARY) 
