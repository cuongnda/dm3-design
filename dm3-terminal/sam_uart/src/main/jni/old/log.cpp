#include "log.h"
#include <stdarg.h>

static const char tag[] = "SubScreen";

void LOGV(const char* format, ...)
{
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_VERBOSE, tag, format, args);
    va_end(args);
}

void LOGD(const char* format, ...)
{
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_DEBUG, tag, format, args);
    va_end(args);
}

void LOGI(const char* format, ...)
{
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_INFO, tag, format, args);
    va_end(args);
}

void LOGW(const char* format, ...)
{
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_WARN, tag, format, args);
    va_end(args);
}

void LOGE(const char* format, ...)
{
    va_list args;
    va_start(args, format);
    __android_log_vprint(ANDROID_LOG_ERROR, tag, format, args);
    va_end(args);
}