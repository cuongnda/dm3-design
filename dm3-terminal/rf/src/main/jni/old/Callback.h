#ifndef CALLBACK_H
#define CALLBACK_H

#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

    void startActivity();
    void recvQrData();
    void recvQrData_aging();
    void recvQrData_aging_none();

#ifdef __cplusplus
}
#endif
#endif // CALLBACK_H
