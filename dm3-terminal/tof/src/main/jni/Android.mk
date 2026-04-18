LOCAL_PATH := $(call my-dir)

include $(CLEAR_VARS)
LOCAL_MODULE    := tof
LOCAL_CFLAGS := -DANDROID_NDK  -DDEBUG_MODE -DBUILD_LIB

LOCAL_LDLIBS:= -llog
LOCAL_SRC_FILES := \
		tof.c ams_linux_i2c.c tmf8801.c tof_hex_interpreter.c tofinit.c

include $(BUILD_SHARED_LIBRARY) 
