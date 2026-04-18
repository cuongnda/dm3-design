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

#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <stdbool.h>
#include <linux/limits.h>
#include <android/log.h>

//#include "mcu_tmf8801_config.h"
#include "tmf8801.h"
#include "tof_hex_interpreter.h"
//#include "ams_linux_gpio.h"
#include "ams_linux_i2c.h"

#define EXP_PARAMS       1
//#define GPIO_CE          (GPIO_16)
//#define GPIO_IRQ         (GPIO_20)
#define GPIO_CE          (TOF_RST)
#define GPIO_IRQ         (TOF_IRQ)
#define TMF8801_I2C_ADDR (0x41)



static uint32_t exit_num_results = 0;
static struct tmf8801_ctx tmf8801 = {
    .i2c_addr = TMF8801_I2C_ADDR,
};

static int32_t do_fwdl(const char *filename)
{
    FILE *fwfile;
    size_t len = 0;
    ssize_t read = 0;
    char * line = NULL;
    int32_t error = 0;

    if (!filename)
        return -1;

    fwfile = fopen(filename, "r");

    if (!fwfile)
        return -1;

    error = tof8801_BL_upload_init(&tmf8801, &tmf8801.BL_app, BL_DEFAULT_SALT);
    if (error) {
        return error;
    }

    intelHexInterpreterInitialise();
    while ((read = getline(&line, &len, fwfile) != -1)) {
        error = intelHexHandleRecord(&tmf8801, &tmf8801.BL_app, len, line, 0);
        if (error)
            return error;
    }

    fclose(fwfile);
    if (line)
        free(line);

    return 0;
}

static int32_t read_factory_calibration_file(const char *filename, uint8_t*fac_cal, uint32_t size)
{
    FILE *fac_cal_file;
    char * line = NULL;
    size_t len = 0;
    ssize_t read = 0;
    uint32_t count = 0;
    int32_t error = 0;

    if (!filename || !fac_cal || size == 0)
        return -1;

    fac_cal_file = fopen(filename, "r");

    if (!fac_cal_file)
        return -1;

    while ((read = getline(&line, &len, fac_cal_file) != -1)) {
        error = sscanf(line, "%hhx", &fac_cal[count++]);
        if (error != 1)
            return -1;
        if (count == size)
            break; // we have filled the factory calibration buffer
    }

    printf("Factory calibration data: \n");
    for (uint32_t i = 0; i < size; i++) {
        printf("0x%02x ", fac_cal[i]);
    }
    printf("\n");

    fclose(fac_cal_file);
    if (line)
        free(line);

    return 0;
}

static int32_t start_factory_calib(struct tmf8801_ctx *tmf8801, const char *output_filename)
{
    int32_t flags = 0;
    int32_t error = 0;
    FILE *fac_cal_file;

    if (!tmf8801)
        return -1;

    fac_cal_file = fopen(output_filename, "w");

    if (!fac_cal_file)
        return -1;

    error = tof8801_app0_start_fac_calib(tmf8801);
    if (error) {
        fprintf(stderr, "Error starting factory calibration\n");
    }

    do {
        sleep(1);
        flags = tof8801_app0_interrupt_status(tmf8801);
        if (flags < 0) {
            fprintf(stderr, "Error reading int status\n");
            return -1;
        }
    } while (flags == 0);

    tof8801_app0_process_irq(tmf8801);

    for (int i = 0; i < APP0_FAC_CALIB_SIZE; i++) {
        fprintf(fac_cal_file, "0x%02x\n", tmf8801->app0_app.app0_fac_calib[i]);
    }
    fclose(fac_cal_file);
    printf("Factory calibration complete, saved to: '%s'\n", output_filename);

    return 0;
}

static int print_result(struct tmf8801_ctx *tmf8801)
{
    static int32_t last_num = 0;
    static int32_t cnt = 0;
    uint32_t num;
    uint32_t distance, conf;

    if (!tmf8801)
        return -1;

    num =tof8801_app0_get_last_result(tmf8801, &distance, &conf);
    if (num != last_num) {
        //printf("Result num: %4u\tDistance: %6u mm\tconfidence: %4u\n",
        //       num, distance, conf);

        //__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Result num: %4u\tDistance: %6u mm\tconfidence: %4u\n",
        //                    num, distance, conf);
        last_num = num;
        cnt++;
    }

    if (exit_num_results && cnt >= exit_num_results) {
        printf("Read %u results, exiting.\n", cnt);
        //exit(write_gpio(GPIO_CE, 0));
        return -1;
    }

    return distance;
}

int getresult(void)
{
    int dist = 0;
    tof8801_app0_process_irq(&tmf8801);
    dist = print_result(&tmf8801);
    return dist;
}
static void start_measurements(struct tmf8801_ctx *tmf8801, bool with_fac_cal, uint8_t *fac_cal, uint32_t len)
{
    int32_t rc = 0;

    if (!tmf8801) {
        fprintf(stderr, "Error null context pointer\n");
        //exit(-1);
    }

    if (with_fac_cal) {
        if (!fac_cal || len == 0) {
            fprintf(stderr, "Error null fac_cal pointer, or size is 0\n");
        } else {
            rc = tof8801_app0_set_fac_calib(tmf8801, fac_cal, len);
            if (rc) {
                fprintf(stderr, "Error configuring factory calibration data: %d\n", rc);
                //exit(rc);
            }
        }
    }

    (void) tof8801_app0_set_default_capture_settings(tmf8801);

    rc = tof8801_app0_start_capture(tmf8801);
    if (rc) {
        fprintf(stderr, "Error starting measurements: %d\n", rc);
        //exit(rc);
    }
	fprintf(stderr, "starting measurements: %d\n", rc);
//    while ( true ) {
//        tof8801_app0_process_irq(tmf8801);
//        print_result(tmf8801);
//        usleep(5000); // poll period
//    }
    return;
}

int TOF_Init(void)
{
    int c;
    uint32_t gpio_val = 0;
    int32_t rc = 0;

    //char firmware_file[PATH_MAX] = "/duapp/main_app_3v3_k2.hex";
    char firmware_file[PATH_MAX] = "/vendor/etc/main_app_3v3_k2.hex";
    bool fac_cal_supplied = false;
    char fac_cal_fname[PATH_MAX] = {0};
    uint8_t opt_fac_calib[APP0_FAC_CALIB_SIZE] = {0};
    // wait for i2c communication
    system("echo TOFRST1 > /dev/drvTOFRST");
    usleep(10*1000);
    system("echo TOFRST0 > /dev/drvTOFRST");
    usleep(50*1000);
    system("echo TOFRST1 > /dev/drvTOFRST");
    usleep(10*1000);
    rc = tof8801_wait_for_cpu_ready(&tmf8801);
    if (rc) {
        //fprintf(stderr, "Error waiting for CPU_READY status\n");
        __android_log_print(ANDROID_LOG_DEBUG,"Error waiting for CPU_READY status", "%d",rc);
        return -1;
    }

    // initialize bootloader app
    tof8801_BL_init_app(&tmf8801.BL_app);

    // Download app0 firmware
    if (strlen(firmware_file)) {
        rc = do_fwdl(firmware_file);
        if (rc) {
            fprintf(stderr, "Error (%d) performing FWDL with file %s\n",
                    rc, firmware_file);
            __android_log_print(ANDROID_LOG_DEBUG,"Error performing FWDL with file", "%d",rc);
            return -1;
        }
    } else {
        fprintf(stderr, "Error, no firmware hex file given\n");
        __android_log_print(ANDROID_LOG_DEBUG,"Error, no firmware hex file given", "%d",strlen(firmware_file));
        return -1;
    }

    // initialize app0 app
    tof8801_app0_init_app(&tmf8801);

    printf("App0 version: %u.%u.%u.%u\n",
            tmf8801.app0_app.version[0],tmf8801.app0_app.version[1], tmf8801.app0_app.version[2],
            tmf8801.app0_app.version[3] | (tmf8801.app0_app.version[4] << 8));

    start_measurements(&tmf8801, fac_cal_supplied,
                       opt_fac_calib, sizeof(opt_fac_calib)); // this function never returns

    return 0;
}

