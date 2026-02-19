/*
*****************************************************************************
* Copyright by ams AG                                                       *
* All rights are reserved.                                                  *
*                                                                           *
* IMPORTANT - PLEASE READ CAREFULLY BEFORE COPYING, INSTALLING OR USING     *
* THE SOFTWARE.                                                             *
*                                                                           *
* THIS SOFTWARE IS PROVIDED FOR USE ONLY IN CONJUNCTION WITH AMS PRODUCTS.  *
* USE OF THE SOFTWARE IN CONJUNCTION WITH NON-AMS-PRODUCTS IS EXPLICITLY    *
* EXCLUDED.                                                                 *
*                                                                           *
* THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS       *
* "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT         *
* LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS         *
* FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT  *
* OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,     *
* SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT          *
* LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,     *
* DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY     *
* THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT       *
* (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE     *
* OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.      *
*****************************************************************************
*/

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <string.h>
#include <sys/ioctl.h>
#include <linux/i2c.h>
#include <linux/i2c-dev.h>
#include <android/log.h>
#include "ams_linux_i2c.h"
#include "tmf8801.h"

//static char *i2cdev_fp = "/dev/i2c-4";
char i2cdev_fp[32];

void Set_I2C_Num(char *num)
{
    memset(i2cdev_fp,0x00,sizeof(i2cdev_fp));
    memcpy(i2cdev_fp,num,sizeof(i2cdev_fp));
    __android_log_print(ANDROID_LOG_DEBUG,"Set_I2C_Num ==>", "%s",i2cdev_fp);
}

int32_t write_i2c_block(uint32_t slave_addr, uint8_t reg, const uint8_t *buf, uint32_t len)
{
    int32_t i2c_fd;
    uint8_t *outbuf = NULL;
    struct i2c_rdwr_ioctl_data data;
    struct i2c_msg messages[1];

    if (buf == NULL || len == 0)
        return -1;

    outbuf = (uint8_t *)malloc(len + 1);
    if (!outbuf)
        return -1;

    i2c_fd = open(i2cdev_fp, O_RDWR);
    if (i2c_fd < 0)
        return -1;

    data.msgs = messages;
    data.nmsgs = 1;

    messages[0].addr  = slave_addr;
    messages[0].flags = 0;
    messages[0].buf   = outbuf;
    messages[0].len   = len + 1;

    outbuf[0] = reg;
    memcpy(outbuf + 1, buf, len);

    if(ioctl(i2c_fd, I2C_RDWR, &data) < 0) {
        close(i2c_fd);
        free(outbuf);
        return -1;
    }

    close(i2c_fd);
    free(outbuf);

    return 0;
}

int32_t read_i2c_block(uint32_t slave_addr, uint8_t reg, uint8_t *buf, uint32_t len)
{
    int32_t i2c_fd;
    struct i2c_rdwr_ioctl_data data;
    struct i2c_msg messages[2];

    if (buf == NULL || len == 0)
        return -1;

    i2c_fd = open(i2cdev_fp, O_RDWR);
    if (i2c_fd < 0)
        return -1;

    data.msgs = messages;
    data.nmsgs = 2;

    messages[0].addr  = slave_addr;
    messages[0].flags = 0;
    messages[0].buf   = &reg;
    messages[0].len   = 1;

    messages[1].addr  = slave_addr;
    messages[1].flags = I2C_M_RD;
    messages[1].buf   = buf;
    messages[1].len   = len;

    if(ioctl(i2c_fd, I2C_RDWR, &data) < 0) {
        close(i2c_fd);
        return -1;
    }

    close(i2c_fd);

    return 0;
}
