#include <android/log.h>

#ifdef __cplusplus
extern "C" {
#endif

void LOGV(const char* format, ...);

void LOGD(const char* format, ...);

void LOGI(const char* format, ...);

void LOGW(const char* format, ...);

void LOGE(const char* format, ...);

#ifdef __cplusplus
}
#endif
//void LOGV(const char* tag, const char* format, ...);
//
//void LOGD(const char* tag, const char* format, ...);
//
//void LOGI(const char* tag, const char* format, ...);
//
//void LOGW(const char* tag, const char* format, ...);
//
//void LOGE(const char* tag, const char* format, ...);