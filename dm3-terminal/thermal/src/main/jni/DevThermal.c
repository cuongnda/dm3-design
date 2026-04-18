/**
 * @copyright (C) 2017 Melexis N.V.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>
#include <stdint.h>
#include <sys/stat.h>
#include <sys/ioctl.h> 
#include <math.h>
#include <android/log.h>

#if 0
#include <jpeglib.h>
#endif
#include "MLX90640_API.h"
#include "global.h"

#ifdef SHOW_LCD
#include "apiLcd.h"
#include "libLcd.h"
#endif

#define constrain(amt,low,high) ((amt)<(low)?(low):((amt)>(high)?(high):(amt)))
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))
#define EMMISIVITY 0.95



void ExtractVDDParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractPTATParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractGainParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractTgcParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractResolutionParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractKsTaParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractKsToParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractAlphaParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractOffsetParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractKtaPixelParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractKvPixelParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractCPParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
void ExtractCILCParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
int ExtractDeviatingPixels(unsigned short *eeData, paramsMLX90640 *mlx90640);
int CheckAdjacentPixels(unsigned short pix1, unsigned short pix2);  
float GetMedian(float *values, int n);
int IsPixelBad(unsigned short pixel,paramsMLX90640 *params);
int ValidateFrameData(unsigned short *frameData);
int ValidateAuxData(unsigned short *auxData);

typedef enum _IOCTRL_TYPE
{
	IOCTL_I2C_READ = 101,
	IOCTL_I2C_WRITE = 102,
	IOCTL_I2C_GRESET = 103,
	IOCTL_I2C_GET_EEPROM = 104,
	IOCTL_I2C_GET_FRAMEDATA = 105,
	IOCTL_GET_VERSION = 200,
} IOCTRL_TYPE;

typedef struct{
	unsigned short addr;
	unsigned short len;
	//unsigned short sdata;
	unsigned short eedata[832];
	unsigned short frameData[834];
	//unsigned short pdata[1024];
}__attribute__((packed))i2c_control;
unsigned short eedata[832];
unsigned short frameData[834];
//paramsMLX90640 mlx90640;
#if 0
#define OUTBUFFER_SIZE 0x8000

static FILE*fi;
static JOCTET * buffer;
static unsigned char*dest;
static int len;
static int destlen;
static unsigned char*data;
static int pos;
static int size;

static void file_init_destination(j_compress_ptr cinfo) 
{ 
  struct jpeg_destination_mgr*dmgr = 
      (struct jpeg_destination_mgr*)(cinfo->dest);
  buffer = (JOCTET*)malloc(OUTBUFFER_SIZE);
  if(!buffer) {
      perror("malloc");
      printf("Out of memory!\n");
      exit(1);
  }
  dmgr->next_output_byte = buffer;
  dmgr->free_in_buffer = OUTBUFFER_SIZE;
}

static boolean file_empty_output_buffer(j_compress_ptr cinfo)
{ 
  struct jpeg_destination_mgr*dmgr = 
      (struct jpeg_destination_mgr*)(cinfo->dest);
  if(fi)
    fwrite(buffer, OUTBUFFER_SIZE, 1, fi);
  dmgr->next_output_byte = buffer;
  dmgr->free_in_buffer = OUTBUFFER_SIZE;
  return 1;
}

static void file_term_destination(j_compress_ptr cinfo) 
{ struct jpeg_destination_mgr*dmgr = 
      (struct jpeg_destination_mgr*)(cinfo->dest);
  if(fi)
    fwrite(buffer, OUTBUFFER_SIZE-dmgr->free_in_buffer, 1, fi);
  free(buffer);
  buffer = 0;
  dmgr->free_in_buffer = 0;
}

static void mem_init_destination(j_compress_ptr cinfo) 
{ 
  struct jpeg_destination_mgr*dmgr = 
      (struct jpeg_destination_mgr*)(cinfo->dest);
  dmgr->next_output_byte = dest;
  dmgr->free_in_buffer = destlen;
}

static boolean mem_empty_output_buffer(j_compress_ptr cinfo)
{ 
    printf("jpeg mem overflow!\n");
    exit(1);
}

static void mem_term_destination(j_compress_ptr cinfo) 
{ 
  struct jpeg_destination_mgr*dmgr = 
      (struct jpeg_destination_mgr*)(cinfo->dest);
  len = destlen - dmgr->free_in_buffer;
  dmgr->free_in_buffer = 0;
}



int jpeg_save(unsigned char*data, unsigned width, unsigned height, int quality, const char*filename)
{
  struct jpeg_destination_mgr mgr;
  struct jpeg_compress_struct cinfo;
  struct jpeg_error_mgr jerr;
  int t;

  if(filename)
    fi = fopen(filename, "wb");
  else
    fi = 0;

  memset(&cinfo, 0, sizeof(cinfo));
  memset(&jerr, 0, sizeof(jerr));
  memset(&mgr, 0, sizeof(mgr));
  cinfo.err = jpeg_std_error(&jerr);
  jpeg_create_compress(&cinfo);

  mgr.init_destination = file_init_destination;
  mgr.empty_output_buffer = file_empty_output_buffer;
  mgr.term_destination = file_term_destination;
  cinfo.dest = &mgr;

  // init compression
  
  cinfo.image_width  = width;
  cinfo.image_height = height;
  cinfo.input_components = 3;
  cinfo.in_color_space = JCS_RGB;
  jpeg_set_defaults(&cinfo);
  jpeg_set_quality(&cinfo,quality,TRUE);

  //jpeg_write_tables(&cinfo);
  //jpeg_suppress_tables(&cinfo, TRUE);
  jpeg_start_compress(&cinfo, FALSE);
  
  for(t=0;t<height;t++) {
    unsigned char*data2 = &data[width*3*t];
    jpeg_write_scanlines(&cinfo, &data2, 1);
  }
  jpeg_finish_compress(&cinfo);

  if(fi)
    fclose(fi);
  jpeg_destroy_compress(&cinfo);
  return 1;
}

int jpeg_save_to_file(unsigned char*data, unsigned width, unsigned height, int quality, FILE*_fi)
{
  struct jpeg_destination_mgr mgr;
  struct jpeg_compress_struct cinfo;
  struct jpeg_error_mgr jerr;
  int t;
printf("111!\n");
  fi = _fi;

  memset(&cinfo, 0, sizeof(cinfo));
  memset(&jerr, 0, sizeof(jerr));
  memset(&mgr, 0, sizeof(mgr));
  cinfo.err = jpeg_std_error(&jerr);
  jpeg_create_compress(&cinfo);

  mgr.init_destination = file_init_destination;
  mgr.empty_output_buffer = file_empty_output_buffer;
  mgr.term_destination = file_term_destination;
  cinfo.dest = &mgr;
printf("222!\n");
  // init compression
  
  cinfo.image_width  = width;
  cinfo.image_height = height;
  cinfo.input_components = 3;
  cinfo.in_color_space = JCS_RGB;
  jpeg_set_defaults(&cinfo);
  cinfo.dct_method = JDCT_IFAST;
  jpeg_set_quality(&cinfo,quality,TRUE);

  //jpeg_write_tables(&cinfo);
  //jpeg_suppress_tables(&cinfo, TRUE);
  jpeg_start_compress(&cinfo, FALSE);
printf("333!\n");  
  for(t=0;t<height;t++) {
    unsigned char*data2 = &data[width*3*t];
    jpeg_write_scanlines(&cinfo, &data2, 1);
  }
printf("444!\n");   
  jpeg_finish_compress(&cinfo);
printf("555!\n");   
  jpeg_destroy_compress(&cinfo);
printf("666!\n");    
  return 1;
}
#endif
#if 0
void jpeg(FILE* dest, unsigned char* rgb, unsigned int width, unsigned int height, int quality)
{
	size_t i,j;
	JSAMPARRAY image = calloc(height, sizeof (JSAMPROW));
	for (i = 0; i < height; i++) {
		image[i] = calloc(width * 3, sizeof (JSAMPLE));
		for (j = 0; j < width; j++) {
			image[i][j * 3 + 0] = rgb[(i * width + j) * 3 + 0];
			image[i][j * 3 + 1] = rgb[(i * width + j) * 3 + 1];
			image[i][j * 3 + 2] = rgb[(i * width + j) * 3 + 2];
		}
	}

	struct jpeg_compress_struct compress;
	struct jpeg_error_mgr error;
	compress.err = jpeg_std_error(&error);
	jpeg_create_compress(&compress);
	jpeg_stdio_dest(&compress, dest);
	compress.image_width = width;
	compress.image_height = height;
	compress.input_components = 3;
	compress.in_color_space = JCS_RGB;
	jpeg_set_defaults(&compress);
	jpeg_set_quality(&compress, quality, TRUE);
	jpeg_start_compress(&compress, TRUE);
	jpeg_write_scanlines(&compress, image, height);
	jpeg_finish_compress(&compress);
	jpeg_destroy_compress(&compress);
	for (i = 0; i < height; i++) {
		free(image[i]);
	}
	free(image);
}
#endif

int thermaldev = -1;
int DevThermal_open(void)
{
	int ret;
	
	
	//if (thermaldev < 0)
	//{
		
		thermaldev = open(THERMAL_DEV_PATH, O_RDWR|O_NOCTTY |O_NDELAY);

    if (thermaldev <= 0)
		{
			fprintf(stderr, "Failed to open Thermal[%x]\r\n", thermaldev);
			return thermaldev;
		}	
	//}

	return thermaldev;
}

int DevThermal_close(void)
{
	int ret;
	
	
	if (thermaldev < 0)	return -1;
	close(thermaldev);
	thermaldev = -1;
	return 0;
}

int DevThermal_GetDumpData(unsigned short *eeprom)
{
	int ret,i;
	i2c_control thermal;
	
	if (thermaldev < 0)	return -1;
	ret = ioctl(thermaldev,IOCTL_I2C_GET_EEPROM,eedata);
	if(ret == 0){
		for(i=0;i<832;i++)	eeprom[i] = eedata[i];
	}else return -1;
	printf("DevThermal_GetDumpData OK!!!\n");
	return 0;
}

int DevThermal_GetFrameData(unsigned short *fdata)
{
	
	if (thermaldev < 0)	return -1;
	return(ioctl(thermaldev,IOCTL_I2C_GET_FRAMEDATA,fdata));
}

int ValidateFrameData(unsigned short *frameData)
{
    unsigned char line = 0;
    
    for(int i=0; i<768; i+=32)
    {
        if((frameData[i] == 0x7FFF) && (line%2 == frameData[833])) return -8;
        line = line + 1;
    }    
        
    return 0;    
}

int ValidateAuxData(unsigned short *auxData)
{
    
    if(auxData[0] == 0x7FFF) return -8;    
    
    for(int i=8; i<19; i++)
    {
        if(auxData[i] == 0x7FFF) return -8;
    }
    
    for(int i=20; i<23; i++)
    {
        if(auxData[i] == 0x7FFF) return -8;
    }
    
    for(int i=24; i<33; i++)
    {
        if(auxData[i] == 0x7FFF) return -8;
    }
    
    for(int i=40; i<51; i++)
    {
        if(auxData[i] == 0x7FFF) return -8;
    }
    
    for(int i=52; i<55; i++)
    {
        if(auxData[i] == 0x7FFF) return -8;
    }
    
    for(int i=56; i<64; i++)
    {
        if(auxData[i] == 0x7FFF) return -8;
    }
    
    return 0;
    
}

int CheckEEPROMValid(unsigned short* eeData) {
    int deviceSelect;
    deviceSelect = eeData[10] & 0x0040;
    if (deviceSelect == 0) {
        return 0;
    }

    return -7;
}
    
int MLX90640_ExtractParameters(unsigned short *eeData, paramsMLX90640 *mlx90640)
{
    int error = 0;
    error = CheckEEPROMValid(eeData);
	
	if(error != 0){
		printf("CheckEEPROMValid Error!!!\n");
		return error;
	}
	
    ExtractVDDParameters(eeData, mlx90640);
    ExtractPTATParameters(eeData, mlx90640);
    ExtractGainParameters(eeData, mlx90640);
    ExtractTgcParameters(eeData, mlx90640);
    ExtractResolutionParameters(eeData, mlx90640);
    ExtractKsTaParameters(eeData, mlx90640);
    ExtractKsToParameters(eeData, mlx90640);
    ExtractCPParameters(eeData, mlx90640);
    ExtractAlphaParameters(eeData, mlx90640);
    ExtractOffsetParameters(eeData, mlx90640);
    ExtractKtaPixelParameters(eeData, mlx90640);
    ExtractKvPixelParameters(eeData, mlx90640);
    ExtractCILCParameters(eeData, mlx90640);
    error = ExtractDeviatingPixels(eeData, mlx90640);  
    
    return error;

}

//------------------------------------------------------------------------------
#if 0
int MLX90640_SetResolution(unsigned char resolution)
{
    unsigned short controlRegister1;
    int value;
    int error;
	i2c_control duali_thermal;
    
    value = (resolution & 0x03) << 10;
	
    memset(&duali_thermal,0x00,sizeof(duali_thermal));  
	duali_thermal.addr = 0x800D;
	duali_thermal.len = 1;
	error  = ioctl(thermaldev,IOCTL_I2C_READ,&duali_thermal);
	controlRegister1 = duali_thermal.pdata[0]; 
    //error = MLX90640_I2CRead(slaveAddr, 0x800D, 1, &controlRegister1);
    
    if(error == 0)
    {
        value = (controlRegister1 & 0xF3FF) | value;
		memset(&duali_thermal,0x00,sizeof(duali_thermal));    
		duali_thermal.addr = 0x800D;
		duali_thermal.sdata = value;
		error  = ioctl(thermaldev,IOCTL_I2C_WRITE,&duali_thermal);
        //error = MLX90640_I2CWrite(slaveAddr, 0x800D, value);        
    }    
    
    return error;
}

//------------------------------------------------------------------------------

int MLX90640_GetCurResolution(void)
{
    unsigned short controlRegister1;
    int resolutionRAM;
    int error;
	i2c_control duali_thermal;
    
	memset(&duali_thermal,0x00,sizeof(duali_thermal));  
	duali_thermal.addr = 0x800D;
	duali_thermal.len = 1;
	error  = ioctl(thermaldev,IOCTL_I2C_READ,&duali_thermal);
	controlRegister1 = duali_thermal.pdata[0]; 
    //error = MLX90640_I2CRead(slaveAddr, 0x800D, 1, &controlRegister1);
    if(error != 0)
    {
        return error;
    }    
    resolutionRAM = (controlRegister1 & 0x0C00) >> 10;
    
    return resolutionRAM; 
}

//------------------------------------------------------------------------------

int MLX90640_SetRefreshRate(unsigned char refreshRate)
{
    unsigned short controlRegister1;
    int value;
    int error;
	i2c_control duali_thermal;
    
    value = (refreshRate & 0x07)<<7;
    
	memset(&duali_thermal,0x00,sizeof(duali_thermal));  
	duali_thermal.addr = 0x800D;
	duali_thermal.len = 1;
	error  = ioctl(thermaldev,IOCTL_I2C_READ,&duali_thermal);
	controlRegister1 = duali_thermal.pdata[0]; 
    //error = MLX90640_I2CRead(slaveAddr, 0x800D, 1, &controlRegister1);
    if(error == 0)
    {
        value = (controlRegister1 & 0xFC7F) | value;
		memset(&duali_thermal,0x00,sizeof(duali_thermal));    
		duali_thermal.addr = 0x800D;
		duali_thermal.sdata = value;
		error  = ioctl(thermaldev,IOCTL_I2C_WRITE,&duali_thermal);
        //error = MLX90640_I2CWrite(slaveAddr, 0x800D, value);
    }    
    
    return error;
}

//------------------------------------------------------------------------------

int MLX90640_GetRefreshRate(void)
{
    unsigned short controlRegister1;
    int refreshRate;
    int error;
	i2c_control duali_thermal;
    
	memset(&duali_thermal,0x00,sizeof(duali_thermal));  
	duali_thermal.addr = 0x800D;
	duali_thermal.len = 1;
	error  = ioctl(thermaldev,IOCTL_I2C_READ,&duali_thermal);
	controlRegister1 = duali_thermal.pdata[0]; 
    //error = MLX90640_I2CRead(slaveAddr, 0x800D, 1, &controlRegister1);
    if(error != 0)
    {
        return error;
    }    
    refreshRate = (controlRegister1 & 0x0380) >> 7;
    
    return refreshRate;
}

//------------------------------------------------------------------------------

int MLX90640_SetInterleavedMode(void)
{
    unsigned short controlRegister1;
    int value;
    int error;
	i2c_control duali_thermal;
    
	memset(&duali_thermal,0x00,sizeof(duali_thermal));  
	duali_thermal.addr = 0x800D;
	duali_thermal.len = 1;
	error  = ioctl(thermaldev,IOCTL_I2C_READ,&duali_thermal);
	controlRegister1 = duali_thermal.pdata[0]; 
    //error = MLX90640_I2CRead(slaveAddr, 0x800D, 1, &controlRegister1);
    
    if(error == 0)
    {
        value = (controlRegister1 & 0xEFFF);
		memset(&duali_thermal,0x00,sizeof(duali_thermal));    
		duali_thermal.addr = 0x800D;
		duali_thermal.sdata = value;
		error  = ioctl(thermaldev,IOCTL_I2C_WRITE,&duali_thermal);
        //error = MLX90640_I2CWrite(slaveAddr, 0x800D, value);        
    }    
    
    return error;
}

//------------------------------------------------------------------------------

int MLX90640_SetChessMode(void)
{
    unsigned short controlRegister1;
    int value;
    int error;
    i2c_control duali_thermal;
    
	memset(&duali_thermal,0x00,sizeof(duali_thermal));  
	duali_thermal.addr = 0x800D;
	duali_thermal.len = 1;
	error  = ioctl(thermaldev,IOCTL_I2C_READ,&duali_thermal);
	controlRegister1 = duali_thermal.pdata[0];     
    //error = MLX90640_I2CRead(slaveAddr, 0x800D, 1, &controlRegister1);
    
    if(error == 0)
    {
        value = (controlRegister1 | 0x1000);
		memset(&duali_thermal,0x00,sizeof(duali_thermal));    
		duali_thermal.addr = 0x800D;
		duali_thermal.sdata = value;
		error  = ioctl(thermaldev,IOCTL_I2C_WRITE,&duali_thermal);
        //error = MLX90640_I2CWrite(slaveAddr, 0x800D, value);        
    }    
    
    return error;
}

//------------------------------------------------------------------------------

int MLX90640_GetCurMode(void)
{
    unsigned short controlRegister1;
    int modeRAM;
    int error;
	i2c_control duali_thermal;
    
	memset(&duali_thermal,0x00,sizeof(duali_thermal));  
	duali_thermal.addr = 0x800D;
	duali_thermal.len = 1;
	error  = ioctl(thermaldev,IOCTL_I2C_READ,&duali_thermal);
	controlRegister1 = duali_thermal.pdata[0];  
    //error = MLX90640_I2CRead(slaveAddr, 0x800D, 1, &controlRegister1);
    if(error != 0)
    {
        return error;
    }    
    modeRAM = (controlRegister1 & 0x1000) >> 12;
    
    return modeRAM; 
}

//------------------------------------------------------------------------------
#endif
void MLX90640_CalculateTo(unsigned short* frameData, const paramsMLX90640* params, float emissivity, float tr,
                          float* result) {
    float vdd;
    float ta;
    float ta4;
    float tr4;
    float taTr;
    float gain;
    float irDataCP[2];
    float irData;
    float alphaCompensated;
    unsigned char mode;
    char ilPattern;
    char chessPattern;
    char pattern;
    char conversionPattern;
    float Sx;
    float To;
    float alphaCorrR[4];
    char range;
    unsigned short subPage;

    subPage = frameData[833];
    vdd = MLX90640_GetVdd(frameData, params);
    ta = MLX90640_GetTa(frameData, params);
    ta4 = pow((ta + 273.15), (double)4);
    tr4 = pow((tr + 273.15), (double)4);
    taTr = tr4 - (tr4 - ta4) / emissivity;

    alphaCorrR[0] = 1 / (1 + params->ksTo[0] * 40);
    alphaCorrR[1] = 1 ;
    alphaCorrR[2] = (1 + params->ksTo[2] * params->ct[2]);
    alphaCorrR[3] = alphaCorrR[2] * (1 + params->ksTo[3] * (params->ct[3] - params->ct[2]));

    //------------------------- Gain calculation -----------------------------------
    gain = frameData[778];
    if (gain > 32767) {
        gain = gain - 65536;
    }

    gain = params->gainEE / gain;

    //------------------------- To calculation -------------------------------------
    mode = (frameData[832] & 0x1000) >> 5;

    irDataCP[0] = frameData[776];
    irDataCP[1] = frameData[808];
    for (int i = 0; i < 2; i++) {
        if (irDataCP[i] > 32767) {
            irDataCP[i] = irDataCP[i] - 65536;
        }
        irDataCP[i] = irDataCP[i] * gain;
    }
    irDataCP[0] = irDataCP[0] - params->cpOffset[0] * (1 + params->cpKta * (ta - 25)) * (1 + params->cpKv * (vdd - 3.3));
    if (mode ==  params->calibrationModeEE) {
        irDataCP[1] = irDataCP[1] - params->cpOffset[1] * (1 + params->cpKta * (ta - 25)) * (1 + params->cpKv * (vdd - 3.3));
    } else {
        irDataCP[1] = irDataCP[1] - (params->cpOffset[1] + params->ilChessC[0]) * (1 + params->cpKta * (ta - 25)) *
                      (1 + params->cpKv * (vdd - 3.3));
    }

    for (int pixelNumber = 0; pixelNumber < 768; pixelNumber++) {
        ilPattern = pixelNumber / 32 - (pixelNumber / 64) * 2;
        chessPattern = ilPattern ^ (pixelNumber - (pixelNumber / 2) * 2);
        conversionPattern = ((pixelNumber + 2) / 4 - (pixelNumber + 3) / 4 + (pixelNumber + 1) / 4 - pixelNumber / 4) *
                            (1 - 2 * ilPattern);

        if (mode == 0) {
            pattern = ilPattern;
        } else {
            pattern = chessPattern;
        }

        if (pattern == frameData[833]) {
            irData = frameData[pixelNumber];
            if (irData > 32767) {
                irData = irData - 65536;
            }
            irData = irData * gain;

            irData = irData - params->offset[pixelNumber] * (1 + params->kta[pixelNumber] * (ta - 25)) *
                     (1 + params->kv[pixelNumber] * (vdd - 3.3));
            if (mode !=  params->calibrationModeEE) {
                irData = irData + params->ilChessC[2] * (2 * ilPattern - 1) - params->ilChessC[1] * conversionPattern;
            }

            irData = irData / emissivity;

            irData = irData - params->tgc * irDataCP[subPage];

            alphaCompensated = (params->alpha[pixelNumber] - params->tgc * params->cpAlpha[subPage]) * (1 + params->KsTa *
                               (ta - 25));

            Sx = pow((double)alphaCompensated, (double)3) * (irData + alphaCompensated * taTr);
            Sx = sqrt(sqrt(Sx)) * params->ksTo[1];

            To = sqrt(sqrt(irData / (alphaCompensated * (1 - params->ksTo[1] * 273.15) + Sx) + taTr)) - 273.15;

            if (To < params->ct[1]) {
                range = 0;
            } else if (To < params->ct[2]) {
                range = 1;
            } else if (To < params->ct[3]) {
                range = 2;
            } else {
                range = 3;
            }

            To = sqrt(sqrt(irData / (alphaCompensated * alphaCorrR[range] * (1 + params->ksTo[range] *
                                     (To - params->ct[range]))) + taTr)) - 273.15;

            result[pixelNumber] = To;
        }
    }
}

//------------------------------------------------------------------------------

void MLX90640_GetImage(unsigned short* frameData, const paramsMLX90640* params, float* result) {
    float vdd;
    float ta;
    float gain;
    float irDataCP[2];
    float irData;
    float alphaCompensated;
    unsigned char mode;
    char ilPattern;
    char chessPattern;
    char pattern;
    char conversionPattern;
    float image;
    unsigned short subPage;

    subPage = frameData[833];
    vdd = MLX90640_GetVdd(frameData, params);
    ta = MLX90640_GetTa(frameData, params);

    //------------------------- Gain calculation -----------------------------------
    gain = frameData[778];
    if (gain > 32767) {
        gain = gain - 65536;
    }

    gain = params->gainEE / gain;

    //------------------------- Image calculation -------------------------------------
    mode = (frameData[832] & 0x1000) >> 5;

    irDataCP[0] = frameData[776];
    irDataCP[1] = frameData[808];
    for (int i = 0; i < 2; i++) {
        if (irDataCP[i] > 32767) {
            irDataCP[i] = irDataCP[i] - 65536;
        }
        irDataCP[i] = irDataCP[i] * gain;
    }
    irDataCP[0] = irDataCP[0] - params->cpOffset[0] * (1 + params->cpKta * (ta - 25)) * (1 + params->cpKv * (vdd - 3.3));
    if (mode ==  params->calibrationModeEE) {
        irDataCP[1] = irDataCP[1] - params->cpOffset[1] * (1 + params->cpKta * (ta - 25)) * (1 + params->cpKv * (vdd - 3.3));
    } else {
        irDataCP[1] = irDataCP[1] - (params->cpOffset[1] + params->ilChessC[0]) * (1 + params->cpKta * (ta - 25)) *
                      (1 + params->cpKv * (vdd - 3.3));
    }

    for (int pixelNumber = 0; pixelNumber < 768; pixelNumber++) {
        ilPattern = pixelNumber / 32 - (pixelNumber / 64) * 2;
        chessPattern = ilPattern ^ (pixelNumber - (pixelNumber / 2) * 2);
        conversionPattern = ((pixelNumber + 2) / 4 - (pixelNumber + 3) / 4 + (pixelNumber + 1) / 4 - pixelNumber / 4) *
                            (1 - 2 * ilPattern);

        if (mode == 0) {
            pattern = ilPattern;
        } else {
            pattern = chessPattern;
        }

        if (pattern == frameData[833]) {
            irData = frameData[pixelNumber];
            if (irData > 32767) {
                irData = irData - 65536;
            }
            irData = irData * gain;

            irData = irData - params->offset[pixelNumber] * (1 + params->kta[pixelNumber] * (ta - 25)) *
                     (1 + params->kv[pixelNumber] * (vdd - 3.3));
            if (mode !=  params->calibrationModeEE) {
                irData = irData + params->ilChessC[2] * (2 * ilPattern - 1) - params->ilChessC[1] * conversionPattern;
            }

            irData = irData - params->tgc * irDataCP[subPage];

            alphaCompensated = (params->alpha[pixelNumber] - params->tgc * params->cpAlpha[subPage]) * (1 + params->KsTa *
                               (ta - 25));

            image = irData / alphaCompensated;

            result[pixelNumber] = image;
        }
    }
}

//------------------------------------------------------------------------------

float MLX90640_GetVdd(unsigned short* frameData, const paramsMLX90640* params) {
    float vdd;
    float resolutionCorrection;

    int resolutionRAM;

    vdd = frameData[810];
    if (vdd > 32767) {
        vdd = vdd - 65536;
    }
    resolutionRAM = (frameData[832] & 0x0C00) >> 10;
    resolutionCorrection = pow(2, (double)params->resolutionEE) / pow(2, (double)resolutionRAM);
    vdd = (resolutionCorrection * vdd - params->vdd25) / params->kVdd + 3.3;

    return vdd;
}

//------------------------------------------------------------------------------

float MLX90640_GetTa(unsigned short* frameData, const paramsMLX90640* params) {
    float ptat;
    float ptatArt;
    float vdd;
    float ta;

    vdd = MLX90640_GetVdd(frameData, params);

    ptat = frameData[800];
    if (ptat > 32767) {
        ptat = ptat - 65536;
    }

    ptatArt = frameData[768];
    if (ptatArt > 32767) {
        ptatArt = ptatArt - 65536;
    }
    ptatArt = (ptat / (ptat * params->alphaPTAT + ptatArt)) * pow(2, (double)18);

    ta = (ptatArt / (1 + params->KvPTAT * (vdd - 3.3)) - params->vPTAT25);
    ta = ta / params->KtPTAT + 25;

    return ta;
}

//------------------------------------------------------------------------------

int MLX90640_GetSubPageNumber(unsigned short* frameData) {
    return frameData[833];

}


//------------------------------------------------------------------------------
void MLX90640_BadPixelsCorrection(unsigned short *pixels, float *to, int mode, paramsMLX90640 *params)
{   
    float ap[4];
    unsigned char pix;
    unsigned char line;
    unsigned char column;
    
    pix = 0;
    while(pixels[pix] != 0xFFFF)
    {
        line = pixels[pix]>>5;
        column = pixels[pix] - (line<<5);
        
        if(mode == 1)
        {        
            if(line == 0)
            {
                if(column == 0)
                {        
                    to[pixels[pix]] = to[33];                    
                }
                else if(column == 31)
                {
                    to[pixels[pix]] = to[62];                      
                }
                else
                {
                    to[pixels[pix]] = (to[pixels[pix]+31] + to[pixels[pix]+33])/2.0;                    
                }        
            }
            else if(line == 23)
            {
                if(column == 0)
                {
                    to[pixels[pix]] = to[705];                    
                }
                else if(column == 31)
                {
                    to[pixels[pix]] = to[734];                       
                }
                else
                {
                    to[pixels[pix]] = (to[pixels[pix]-33] + to[pixels[pix]-31])/2.0;                       
                }                       
            } 
            else if(column == 0)
            {
                to[pixels[pix]] = (to[pixels[pix]-31] + to[pixels[pix]+33])/2.0;                
            }
            else if(column == 31)
            {
                to[pixels[pix]] = (to[pixels[pix]-33] + to[pixels[pix]+31])/2.0;                
            } 
            else
            {
                ap[0] = to[pixels[pix]-33];
                ap[1] = to[pixels[pix]-31];
                ap[2] = to[pixels[pix]+31];
                ap[3] = to[pixels[pix]+33];
                to[pixels[pix]] = GetMedian(ap,4);
            }                   
        }
        else
        {        
            if(column == 0)
            {
                to[pixels[pix]] = to[pixels[pix]+1];            
            }
            else if(column == 1 || column == 30)
            {
                to[pixels[pix]] = (to[pixels[pix]-1]+to[pixels[pix]+1])/2.0;                
            } 
            else if(column == 31)
            {
                to[pixels[pix]] = to[pixels[pix]-1];
            } 
            else
            {
                if(IsPixelBad(pixels[pix]-2,params) == 0 && IsPixelBad(pixels[pix]+2,params) == 0)
                {
                    ap[0] = to[pixels[pix]+1] - to[pixels[pix]+2];
                    ap[1] = to[pixels[pix]-1] - to[pixels[pix]-2];
                    if(fabs(ap[0]) > fabs(ap[1]))
                    {
                        to[pixels[pix]] = to[pixels[pix]-1] + ap[1];                        
                    }
                    else
                    {
                        to[pixels[pix]] = to[pixels[pix]+1] + ap[0];                        
                    }
                }
                else
                {
                    to[pixels[pix]] = (to[pixels[pix]-1]+to[pixels[pix]+1])/2.0;                    
                }            
            }                      
        } 
        pix = pix + 1;    
    }    
}

void ExtractVDDParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    short kVdd;
    short vdd25;

    kVdd = eeData[51];

    kVdd = (eeData[51] & 0xFF00) >> 8;
    if (kVdd > 127) {
        kVdd = kVdd - 256;
    }
    kVdd = 32 * kVdd;
    vdd25 = eeData[51] & 0x00FF;
    vdd25 = ((vdd25 - 256) << 5) - 8192;

    mlx90640->kVdd = kVdd;
    mlx90640->vdd25 = vdd25;
}

//------------------------------------------------------------------------------

void ExtractPTATParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    float KvPTAT;
    float KtPTAT;
    short vPTAT25;
    float alphaPTAT;

    KvPTAT = (eeData[50] & 0xFC00) >> 10;
    if (KvPTAT > 31) {
        KvPTAT = KvPTAT - 64;
    }
    KvPTAT = KvPTAT / 4096;

    KtPTAT = eeData[50] & 0x03FF;
    if (KtPTAT > 511) {
        KtPTAT = KtPTAT - 1024;
    }
    KtPTAT = KtPTAT / 8;

    vPTAT25 = eeData[49];

    alphaPTAT = (eeData[16] & 0xF000) / pow(2, (double)14) + 8.0f;

    mlx90640->KvPTAT = KvPTAT;
    mlx90640->KtPTAT = KtPTAT;
    mlx90640->vPTAT25 = vPTAT25;
    mlx90640->alphaPTAT = alphaPTAT;
}

//------------------------------------------------------------------------------

void ExtractGainParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    short gainEE;

    gainEE = eeData[48];
    if (gainEE > 32767) {
        gainEE = gainEE - 65536;
    }

    mlx90640->gainEE = gainEE;
}

//------------------------------------------------------------------------------

void ExtractTgcParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    float tgc;
    tgc = eeData[60] & 0x00FF;
    if (tgc > 127) {
        tgc = tgc - 256;
    }
    tgc = tgc / 32.0f;

    mlx90640->tgc = tgc;
}

//------------------------------------------------------------------------------

void ExtractResolutionParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    unsigned char resolutionEE;
    resolutionEE = (eeData[56] & 0x3000) >> 12;

    mlx90640->resolutionEE = resolutionEE;
}

//------------------------------------------------------------------------------

void ExtractKsTaParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    float KsTa;
    KsTa = (eeData[60] & 0xFF00) >> 8;
    if (KsTa > 127) {
        KsTa = KsTa - 256;
    }
    KsTa = KsTa / 8192.0f;

    mlx90640->KsTa = KsTa;
}

//------------------------------------------------------------------------------

void ExtractKsToParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    int KsToScale;
    char step;

    step = ((eeData[63] & 0x3000) >> 12) * 10;

    mlx90640->ct[0] = -40;
    mlx90640->ct[1] = 0;
    mlx90640->ct[2] = (eeData[63] & 0x00F0) >> 4;
    mlx90640->ct[3] = (eeData[63] & 0x0F00) >> 8;

    mlx90640->ct[2] = mlx90640->ct[2] * step;
    mlx90640->ct[3] = mlx90640->ct[2] + mlx90640->ct[3] * step;

    KsToScale = (eeData[63] & 0x000F) + 8;
    KsToScale = 1 << KsToScale;

    mlx90640->ksTo[0] = eeData[61] & 0x00FF;
    mlx90640->ksTo[1] = (eeData[61] & 0xFF00) >> 8;
    mlx90640->ksTo[2] = eeData[62] & 0x00FF;
    mlx90640->ksTo[3] = (eeData[62] & 0xFF00) >> 8;


    for (int i = 0; i < 4; i++) {
        if (mlx90640->ksTo[i] > 127) {
            mlx90640->ksTo[i] = mlx90640->ksTo[i] - 256;
        }
        mlx90640->ksTo[i] = mlx90640->ksTo[i] / KsToScale;
    }
}

//------------------------------------------------------------------------------

void ExtractAlphaParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    int accRow[24];
    int accColumn[32];
    int p = 0;
    int alphaRef;
    unsigned char alphaScale;
    unsigned char accRowScale;
    unsigned char accColumnScale;
    unsigned char accRemScale;


    accRemScale = eeData[32] & 0x000F;
    accColumnScale = (eeData[32] & 0x00F0) >> 4;
    accRowScale = (eeData[32] & 0x0F00) >> 8;
    alphaScale = ((eeData[32] & 0xF000) >> 12) + 30;
    alphaRef = eeData[33];

    for (int i = 0; i < 6; i++) {
        p = i * 4;
        accRow[p + 0] = (eeData[34 + i] & 0x000F);
        accRow[p + 1] = (eeData[34 + i] & 0x00F0) >> 4;
        accRow[p + 2] = (eeData[34 + i] & 0x0F00) >> 8;
        accRow[p + 3] = (eeData[34 + i] & 0xF000) >> 12;
    }

    for (int i = 0; i < 24; i++) {
        if (accRow[i] > 7) {
            accRow[i] = accRow[i] - 16;
        }
    }

    for (int i = 0; i < 8; i++) {
        p = i * 4;
        accColumn[p + 0] = (eeData[40 + i] & 0x000F);
        accColumn[p + 1] = (eeData[40 + i] & 0x00F0) >> 4;
        accColumn[p + 2] = (eeData[40 + i] & 0x0F00) >> 8;
        accColumn[p + 3] = (eeData[40 + i] & 0xF000) >> 12;
    }

    for (int i = 0; i < 32; i ++) {
        if (accColumn[i] > 7) {
            accColumn[i] = accColumn[i] - 16;
        }
    }

    for (int i = 0; i < 24; i++) {
        for (int j = 0; j < 32; j ++) {
            p = 32 * i + j;
            mlx90640->alpha[p] = (eeData[64 + p] & 0x03F0) >> 4;
            if (mlx90640->alpha[p] > 31) {
                mlx90640->alpha[p] = mlx90640->alpha[p] - 64;
            }
            mlx90640->alpha[p] = mlx90640->alpha[p] * (1 << accRemScale);
            mlx90640->alpha[p] = (alphaRef + (accRow[i] << accRowScale) + (accColumn[j] << accColumnScale) + mlx90640->alpha[p]);
            mlx90640->alpha[p] = mlx90640->alpha[p] / pow(2, (double)alphaScale);
        }
    }
}

//------------------------------------------------------------------------------

void ExtractOffsetParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    int occRow[24];
    int occColumn[32];
    int p = 0;
    short offsetRef;
    unsigned char occRowScale;
    unsigned char occColumnScale;
    unsigned char occRemScale;


    occRemScale = (eeData[16] & 0x000F);
    occColumnScale = (eeData[16] & 0x00F0) >> 4;
    occRowScale = (eeData[16] & 0x0F00) >> 8;
    offsetRef = eeData[17];
    if (offsetRef > 32767) {
        offsetRef = offsetRef - 65536;
    }

    for (int i = 0; i < 6; i++) {
        p = i * 4;
        occRow[p + 0] = (eeData[18 + i] & 0x000F);
        occRow[p + 1] = (eeData[18 + i] & 0x00F0) >> 4;
        occRow[p + 2] = (eeData[18 + i] & 0x0F00) >> 8;
        occRow[p + 3] = (eeData[18 + i] & 0xF000) >> 12;
    }

    for (int i = 0; i < 24; i++) {
        if (occRow[i] > 7) {
            occRow[i] = occRow[i] - 16;
        }
    }

    for (int i = 0; i < 8; i++) {
        p = i * 4;
        occColumn[p + 0] = (eeData[24 + i] & 0x000F);
        occColumn[p + 1] = (eeData[24 + i] & 0x00F0) >> 4;
        occColumn[p + 2] = (eeData[24 + i] & 0x0F00) >> 8;
        occColumn[p + 3] = (eeData[24 + i] & 0xF000) >> 12;
    }

    for (int i = 0; i < 32; i ++) {
        if (occColumn[i] > 7) {
            occColumn[i] = occColumn[i] - 16;
        }
    }

    for (int i = 0; i < 24; i++) {
        for (int j = 0; j < 32; j ++) {
            p = 32 * i + j;
            mlx90640->offset[p] = (eeData[64 + p] & 0xFC00) >> 10;
            if (mlx90640->offset[p] > 31) {
                mlx90640->offset[p] = mlx90640->offset[p] - 64;
            }
            mlx90640->offset[p] = mlx90640->offset[p] * (1 << occRemScale);
            mlx90640->offset[p] = (offsetRef + (occRow[i] << occRowScale) + (occColumn[j] << occColumnScale) + mlx90640->offset[p]);
        }
    }
}

//------------------------------------------------------------------------------

void ExtractKtaPixelParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    int p = 0;
    char KtaRC[4];
    char KtaRoCo;
    char KtaRoCe;
    char KtaReCo;
    char KtaReCe;
    unsigned char ktaScale1;
    unsigned char ktaScale2;
    unsigned char split;

    KtaRoCo = (eeData[54] & 0xFF00) >> 8;
    if (KtaRoCo > 127) {
        KtaRoCo = KtaRoCo - 256;
    }
    KtaRC[0] = KtaRoCo;

    KtaReCo = (eeData[54] & 0x00FF);
    if (KtaReCo > 127) {
        KtaReCo = KtaReCo - 256;
    }
    KtaRC[2] = KtaReCo;

    KtaRoCe = (eeData[55] & 0xFF00) >> 8;
    if (KtaRoCe > 127) {
        KtaRoCe = KtaRoCe - 256;
    }
    KtaRC[1] = KtaRoCe;

    KtaReCe = (eeData[55] & 0x00FF);
    if (KtaReCe > 127) {
        KtaReCe = KtaReCe - 256;
    }
    KtaRC[3] = KtaReCe;

    ktaScale1 = ((eeData[56] & 0x00F0) >> 4) + 8;
    ktaScale2 = (eeData[56] & 0x000F);

    for (int i = 0; i < 24; i++) {
        for (int j = 0; j < 32; j ++) {
            p = 32 * i + j;
            split = 2 * (p / 32 - (p / 64) * 2) + p % 2;
            mlx90640->kta[p] = (eeData[64 + p] & 0x000E) >> 1;
            if (mlx90640->kta[p] > 3) {
                mlx90640->kta[p] = mlx90640->kta[p] - 8;
            }
            mlx90640->kta[p] = mlx90640->kta[p] * (1 << ktaScale2);
            mlx90640->kta[p] = KtaRC[split] + mlx90640->kta[p];
            mlx90640->kta[p] = mlx90640->kta[p] / pow(2, (double)ktaScale1);
        }
    }
}

//------------------------------------------------------------------------------

void ExtractKvPixelParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    int p = 0;
    char KvT[4];
    char KvRoCo;
    char KvRoCe;
    char KvReCo;
    char KvReCe;
    unsigned char kvScale;
    unsigned char split;

    KvRoCo = (eeData[52] & 0xF000) >> 12;
    if (KvRoCo > 7) {
        KvRoCo = KvRoCo - 16;
    }
    KvT[0] = KvRoCo;

    KvReCo = (eeData[52] & 0x0F00) >> 8;
    if (KvReCo > 7) {
        KvReCo = KvReCo - 16;
    }
    KvT[2] = KvReCo;

    KvRoCe = (eeData[52] & 0x00F0) >> 4;
    if (KvRoCe > 7) {
        KvRoCe = KvRoCe - 16;
    }
    KvT[1] = KvRoCe;

    KvReCe = (eeData[52] & 0x000F);
    if (KvReCe > 7) {
        KvReCe = KvReCe - 16;
    }
    KvT[3] = KvReCe;

    kvScale = (eeData[56] & 0x0F00) >> 8;


    for (int i = 0; i < 24; i++) {
        for (int j = 0; j < 32; j ++) {
            p = 32 * i + j;
            split = 2 * (p / 32 - (p / 64) * 2) + p % 2;
            mlx90640->kv[p] = KvT[split];
            mlx90640->kv[p] = mlx90640->kv[p] / pow(2, (double)kvScale);
        }
    }
}

//------------------------------------------------------------------------------

void ExtractCPParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    float alphaSP[2];
    short offsetSP[2];
    float cpKv;
    float cpKta;
    unsigned char alphaScale;
    unsigned char ktaScale1;
    unsigned char kvScale;

    alphaScale = ((eeData[32] & 0xF000) >> 12) + 27;

    offsetSP[0] = (eeData[58] & 0x03FF);
    if (offsetSP[0] > 511) {
        offsetSP[0] = offsetSP[0] - 1024;
    }

    offsetSP[1] = (eeData[58] & 0xFC00) >> 10;
    if (offsetSP[1] > 31) {
        offsetSP[1] = offsetSP[1] - 64;
    }
    offsetSP[1] = offsetSP[1] + offsetSP[0];

    alphaSP[0] = (eeData[57] & 0x03FF);
    if (alphaSP[0] > 511) {
        alphaSP[0] = alphaSP[0] - 1024;
    }
    alphaSP[0] = alphaSP[0] /  pow(2, (double)alphaScale);

    alphaSP[1] = (eeData[57] & 0xFC00) >> 10;
    if (alphaSP[1] > 31) {
        alphaSP[1] = alphaSP[1] - 64;
    }
    alphaSP[1] = (1 + alphaSP[1] / 128) * alphaSP[0];

    cpKta = (eeData[59] & 0x00FF);
    if (cpKta > 127) {
        cpKta = cpKta - 256;
    }
    ktaScale1 = ((eeData[56] & 0x00F0) >> 4) + 8;
    mlx90640->cpKta = cpKta / pow(2, (double)ktaScale1);

    cpKv = (eeData[59] & 0xFF00) >> 8;
    if (cpKv > 127) {
        cpKv = cpKv - 256;
    }
    kvScale = (eeData[56] & 0x0F00) >> 8;
    mlx90640->cpKv = cpKv / pow(2, (double)kvScale);

    mlx90640->cpAlpha[0] = alphaSP[0];
    mlx90640->cpAlpha[1] = alphaSP[1];
    mlx90640->cpOffset[0] = offsetSP[0];
    mlx90640->cpOffset[1] = offsetSP[1];
}

//------------------------------------------------------------------------------

void ExtractCILCParameters(unsigned short* eeData, paramsMLX90640* mlx90640) {
    float ilChessC[3];
    unsigned char calibrationModeEE;

    calibrationModeEE = (eeData[10] & 0x0800) >> 4;
    calibrationModeEE = calibrationModeEE ^ 0x80;

    ilChessC[0] = (eeData[53] & 0x003F);
    if (ilChessC[0] > 31) {
        ilChessC[0] = ilChessC[0] - 64;
    }
    ilChessC[0] = ilChessC[0] / 16.0f;

    ilChessC[1] = (eeData[53] & 0x07C0) >> 6;
    if (ilChessC[1] > 15) {
        ilChessC[1] = ilChessC[1] - 32;
    }
    ilChessC[1] = ilChessC[1] / 2.0f;

    ilChessC[2] = (eeData[53] & 0xF800) >> 11;
    if (ilChessC[2] > 15) {
        ilChessC[2] = ilChessC[2] - 32;
    }
    ilChessC[2] = ilChessC[2] / 8.0f;

    mlx90640->calibrationModeEE = calibrationModeEE;
    mlx90640->ilChessC[0] = ilChessC[0];
    mlx90640->ilChessC[1] = ilChessC[1];
    mlx90640->ilChessC[2] = ilChessC[2];
}

//------------------------------------------------------------------------------

int ExtractDeviatingPixels(unsigned short* eeData, paramsMLX90640* mlx90640) {
    unsigned short pixCnt = 0;
    unsigned short brokenPixCnt = 0;
    unsigned short outlierPixCnt = 0;
    int warn = 0;
    int i;

    for (pixCnt = 0; pixCnt < 5; pixCnt++) {
        mlx90640->brokenPixels[pixCnt] = 0xFFFF;
        mlx90640->outlierPixels[pixCnt] = 0xFFFF;
    }

    pixCnt = 0;
    while (pixCnt < 768 && brokenPixCnt < 5 && outlierPixCnt < 5) {
        if (eeData[pixCnt + 64] == 0) {
            mlx90640->brokenPixels[brokenPixCnt] = pixCnt;
            brokenPixCnt = brokenPixCnt + 1;
        } else if ((eeData[pixCnt + 64] & 0x0001) != 0) {
            mlx90640->outlierPixels[outlierPixCnt] = pixCnt;
            outlierPixCnt = outlierPixCnt + 1;
        }

        pixCnt = pixCnt + 1;

    }

    if (brokenPixCnt > 4) {
        warn = -3;
    } else if (outlierPixCnt > 4) {
        warn = -4;
    } else if ((brokenPixCnt + outlierPixCnt) > 4) {
        warn = -5;
    } else {
        for (pixCnt = 0; pixCnt < brokenPixCnt; pixCnt++) {
            for (i = pixCnt + 1; i < brokenPixCnt; i++) {
                warn = CheckAdjacentPixels(mlx90640->brokenPixels[pixCnt], mlx90640->brokenPixels[i]);
                if (warn != 0) {
                    return warn;
                }
            }
        }

        for (pixCnt = 0; pixCnt < outlierPixCnt; pixCnt++) {
            for (i = pixCnt + 1; i < outlierPixCnt; i++) {
                warn = CheckAdjacentPixels(mlx90640->outlierPixels[pixCnt], mlx90640->outlierPixels[i]);
                if (warn != 0) {
                    return warn;
                }
            }
        }

        for (pixCnt = 0; pixCnt < brokenPixCnt; pixCnt++) {
            for (i = 0; i < outlierPixCnt; i++) {
                warn = CheckAdjacentPixels(mlx90640->brokenPixels[pixCnt], mlx90640->outlierPixels[i]);
                if (warn != 0) {
                    return warn;
                }
            }
        }

    }


    return warn;

}

//------------------------------------------------------------------------------

 int CheckAdjacentPixels(unsigned short pix1, unsigned short pix2)
 {
     int pixPosDif;
     
     pixPosDif = pix1 - pix2;
     if(pixPosDif > -34 && pixPosDif < -30)
     {
         return -6;
     } 
     if(pixPosDif > -2 && pixPosDif < 2)
     {
         return -6;
     } 
     if(pixPosDif > 30 && pixPosDif < 34)
     {
         return -6;
     }
     
     return 0;    
 }
 
//------------------------------------------------------------------------------
 
float GetMedian(float *values, int n)
 {
    float temp;
    
    for(int i=0; i<n-1; i++)
    {
        for(int j=i+1; j<n; j++)
        {
            if(values[j] < values[i]) 
            {                
                temp = values[i];
                values[i] = values[j];
                values[j] = temp;
            }
        }
    }
    
    if(n%2==0) 
    {
        return ((values[n/2] + values[n/2 - 1]) / 2.0);
        
    } 
    else 
    {
        return values[n/2];
    }
    
 }           

//------------------------------------------------------------------------------

int IsPixelBad(unsigned short pixel,paramsMLX90640 *params)
{
    for(int i=0; i<5; i++)
    {
        if(pixel == params->outlierPixels[i] || pixel == params->brokenPixels[i])
        {
            return 1;
        }    
    }   
    
    return 0;     
}     

//------------------------------------------------------------------------------
#if 1
// array for the 32 x 24 measured tempValues
static float tempValues[32*24];
int x, y;
// variables for interpolated colors
unsigned char red, green, blue;
float intPoint, val, a, b, c, d, ii;
// Output size
//#define O_WIDTH 224
//#define O_HEIGHT 168
#define O_RATIO O_WIDTH/32

#define CLIP(X) ( (X) > 255 ? 255 : (X) < 0 ? 0 : X)

// RGB -> YUV
#define RGB2Y(R, G, B) CLIP(( (  66 * (R) + 129 * (G) +  25 * (B) + 128) >> 8) +  16)
#define RGB2U(R, G, B) CLIP(( ( -38 * (R) -  74 * (G) + 112 * (B) + 128) >> 8) + 128)
#define RGB2V(R, G, B) CLIP(( ( 112 * (R) -  94 * (G) -  18 * (B) + 128) >> 8) + 128)

float **interpolated = NULL;
unsigned short *imageData = NULL;
unsigned short *imageData1 = NULL;
unsigned char *imageData2 = NULL;
extern paramsMLX90640 mlx90640;
int row;
float temp, temp2;
// start with some initial colors
float minTemp = 20.0;
float maxTemp = 40.0;
#ifdef SHOW_LCD
Rectangle thermal[]={
	{
		.x1    		= 8,
		.y1    		= 190,
		.width   	= 50,
		.height  	= 17,
		.lineColor   	= cYellow,
		.fillColor   	= cYellow,
		.charactorColor = cBlack,
		.charactorSize 	= FONT16,
		.name		= "",
		.active_touch	= 0,
		.buttontype	= BUTTON_RECT,
	}, 
	{
		.x1    		= 192,
		.y1    		= 190,
		.width   	= 50,
		.height  	= 17,
		.lineColor   	= cYellow,
		.fillColor   	= cYellow,
		.charactorColor = cBlack,
		.charactorSize 	= FONT16,
		.name		= "",
		.active_touch	= 0,
		.buttontype	= BUTTON_RECT,
	}, 
	{
		.x1    		= 86,
		.y1    		= 190,
		.width   	= 50,
		.height  	= 17,
		.lineColor   	= cYellow,
		.fillColor   	= cYellow,
		.charactorColor = cBlack,
		.charactorSize 	= FONT16,
		.name		= "",
		.active_touch	= 0,
		.buttontype	= BUTTON_RECT,
	}, 
};
#endif


void init_array(void)
{
	int i = 0;
	// Prepare interpolated array
	interpolated = (float **)malloc(O_HEIGHT * sizeof(float *));
	for (i=0; i<O_HEIGHT; i++) {
		interpolated[i] = (float *)malloc(O_WIDTH * sizeof(float));
	}

	// Prepare imageData array
	imageData = (unsigned short *)malloc(O_WIDTH * O_HEIGHT * sizeof(unsigned short));
	imageData1 = (unsigned short *)malloc(O_WIDTH * O_HEIGHT * sizeof(unsigned short));
	imageData2 = (unsigned char *)malloc(O_WIDTH * O_HEIGHT * 3);

}

unsigned short color565(unsigned char r, unsigned char g, unsigned char b)
{
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// Get color for temp value.
unsigned short getColor(float val) 
{

  red = constrain(255.0 / (c - b) * val - ((b * 255.0) / (c - b)), 0, 255);

  if ((val > minTemp) & (val < a)) {
    green = constrain(255.0 / (a - minTemp) * val - (255.0 * minTemp) / (a - minTemp), 0, 255);
  }
  else if ((val >= a) & (val <= c)) {
    green = 255;
  }
  else if (val > c) {
    green = constrain(255.0 / (c - d) * val - (d * 255.0) / (c - d), 0, 255);
  }
  else if ((val > d) | (val < a)) {
    green = 0;
  }

  if (val <= b) {
    blue = constrain(255.0 / (a - b) * val - (255.0 * b) / (a - b), 0, 255);
  }
  else if ((val > b) & (val <= d)) {
    blue = 0;
  }
  else if (val > d) {
    blue = constrain(240.0 / (maxTemp - d) * val - (d * 240.0) / (maxTemp - d), 0, 240);
  }

  // use the displays color mapping function to get 5-6-5 color palet (R=5 bits, G=6 bits, B-5 bits)
  return color565(red, green, blue);
}


// Read pixel data from MLX90640.
void readTempValues(void) {
	int rv = 0;
  unsigned short mlx90640Frame[834];
    //int status = MLX90640_GetFrameData(MLX90640_address, mlx90640Frame);
	rv = DevThermal_GetFrameData(mlx90640Frame);
	if (rv < 0)
	{
		printf("GetFrame Error: %d\n",rv);
		DevThermal_close();
		return;
	}
	/*for(int i = 0; i < 768; i++){
		if(i%32 == 0 && i != 0){
			printf("\r\n");
		}
		printf("%04x ",mlx90640Frame[i]);
	}
	for (y=0; y<24; y++) {
      for (x=0; x<32; x++) {
        //Display.fillRect(8 + x*7, 8 + y*7, 7, 7, getColor(tempValues[(31-x) + (y*32)]));
		DevLCD_putPixel16(32* 7 + x, y,mlx90640Frame[x + y*32]);
      }
    }*/
    float vdd = MLX90640_GetVdd(mlx90640Frame, &mlx90640);
    float Ta = MLX90640_GetTa(mlx90640Frame, &mlx90640);

    float tr = Ta - TA_SHIFT; //Reflected temperature based on the sensor ambient temperature

    MLX90640_CalculateTo(mlx90640Frame, &mlx90640, EMMISIVITY, tr, tempValues);
	/*for(int i = 0; i < 768; i++){
		if(i%32 == 0 && i != 0){
			printf("\r\n");
		}
		printf("%.2f ",tempValues[i]);
	}*/
}

// Linear interpolation
float lerp(float v0, float v1, float t) {
  return v0 + t * (v1 - v0);
}

void interpolate() {
  for (row=0; row<24; row++) {
    for (x=0; x<O_WIDTH; x++) {
      temp  = tempValues[(31 - (x/7)) + (row*32) + 1];
      temp2 = tempValues[(31 - (x/7)) + (row*32)];
      interpolated[row*7][x] = lerp(temp, temp2, x%7/7.0);
    }
  }
  for (x=0; x<O_WIDTH; x++) {
    for (y=0; y<O_HEIGHT; y++) {
      temp  = interpolated[y-y%7][x];
      temp2 = interpolated[min((y-y%7)+7, O_HEIGHT-7)][x];
      interpolated[y][x] = lerp(temp, temp2, 1);//y%7/7.0);
    }
  }
}

void swap(unsigned short* a, unsigned short* b)
{
    unsigned short temp = *a;
    *a = *b;
    *b = temp;
}


int rotate_flip_image_array(int x, int y, unsigned short* image_i, unsigned short* image_o, int rotation_type, int flip_type)
{
    int    i, j, xx, yy, type, flip, start, end;
    unsigned short the_image[y][x], out_image[y][x];

    type = rotation_type;
    flip = flip_type;
    if(type != ROTATION_90  && type != ROTATION_180  && type != ROTATION_270) type = ROTATION_0;
    for(i=0;i<y;i++)
    {
        for(j=0;j<x;j++)
        {
            the_image[i][j] = image_i[(i*x)+j];
        }
    }

    if(type == ROTATION_0){
        for(i=0;i<x;i++)
        {
            for(j=y-1;j>=0;j--)
            {
                out_image[j][i] = the_image[j][i];
            }
        }
    }
    if(type == ROTATION_90){
        for(i=0;i<x;i++)
        {
            for(j=y-1;j>=0;j--)
            {
                out_image[i][(y-j)-1] = the_image[j][i];
            }
        }
    }
    else if(type == ROTATION_180){
        for (i = (y - 1); i >= 0; i--) {
            for (j = (x - 1); j >= 0; j--)	out_image[(y-i)-1][(x-j)-1] = the_image[i][j];
        }
    }
    else if(type == ROTATION_270){
        for(i=x-1;i>=0;i--)
        {
            for(j=0;j<=y-1;j++)
            {
                out_image[(x-i)-1][j] = the_image[j][i];
            }
        }
    }

    if((type == ROTATION_90) || (type == ROTATION_270)){
        xx = x;
        yy = y;
    }else{
        xx = y;
        yy = x;
    }

    if(flip == FLIP_X){
        for (i = 0; i < xx; i++) {
            start = 0;
            end = yy - 1;
            while (start < end) {
                swap(&out_image[i][start],
                     &out_image[i][end]);
                start++;
                end--;
            }
        }
    }
//    else if(flip == FLIP_Y){
//        for (i = 0; i < xx; i++) {
//            start = 0;
//            end = yy - 1;
//            while (start < end) {
//                swap(&out_image[start][i],
//                     &out_image[end][i]);
//
//                start++;
//                end--;
//            }
//        }
//    }

    if((type == ROTATION_90) || (type == ROTATION_270)){
        for(i=0;i<x;i++)
        {
            for(j=0;j<y;j++)
            {
                image_o[(i*y)+j] = out_image[i][j];
            }
        }
    }else if((type == ROTATION_0) || (type == ROTATION_180)){
        for(i=0;i<y;i++)
        {
            for(j=0;j<x;j++)
            {
                image_o[(i*x)+j] = out_image[i][j];
            }
        }
    }
    return type;
}


void drawPicture(void) {
#if 1
	static int i = 0;
	int j=0;
	int rsize;
	char output[30];
	unsigned char Red,Green,Blue;
	unsigned short rgbdata[O_HEIGHT*O_WIDTH];
    unsigned short rgbdata2[32*24];
    //unsigned char rgbdata2[O_HEIGHT*O_WIDTH];
	//char rgb_buf[O_WIDTH*O_HEIGHT*2];
	//system("rm /duapp/pic.jpg");
#if 0
	sprintf(output,"/duapp/pic.jpg");
	//printf("Frames %s\n",output);
	FILE* out = fopen(output, "w");
#endif
  if (INTERPOLATE) {
    interpolate();
#if 1
    for (y=0; y<O_HEIGHT; y++) {
      for (x=0; x<O_WIDTH; x++) {
          rgbdata[(y*O_WIDTH) + x] = getColor(interpolated[y][x]);
      }
    }
//      for (y=0; y<24; y++) {
//          for (x=0; x<32; x++) {
//              rgbdata[(y*32) + x] = tempValues[(31-x) + (y*32)];
//          }
//      }
//	for(j=0;j<(32*24);j++){
//        rgbdata2[j*3+0] = (unsigned char)(((rgbdata[j] & 0xF800) >> 11) << 3); //R
//        rgbdata2[j*3+1] = (unsigned char)(((rgbdata[j] & 0x07E0) >> 5) << 2); //G
//        rgbdata2[j*3+2] = (unsigned char)((rgbdata[j] & 0x001F) << 3); //B
//	}
#endif
#if 0	
	jpeg(out,imageData2,O_WIDTH,O_HEIGHT,90);
	fclose(out);
#endif
#ifdef SHOW_LCD	
	devLCD_displayData16_abs(0, 0, O_WIDTH, O_HEIGHT, imageData, 0);
#endif	
  }
  else {
#ifdef SHOW_LCD	  
    for (y=0; y<24; y++) {
      for (x=0; x<32; x++) {
		devLCD_fillArea16_abs(x*7, 8 + y*7, 7, 7, getColor(tempValues[(31-x) + (y*32)]));	
      }
    }

#endif

        unsigned char rgbdata3[32*24*2];
    char rgbdata4[32*24*2];
      for (y=0; y<24; y++) {
          for (x=0; x<32; x++) {
              rgbdata2[(y*32) + x] = getColor(tempValues[(31-x) + (y*32)]);
          }
      }
      for (i=0; i<(24*32); i++) {
          rgbdata3[i*2]=(unsigned char)(rgbdata2[i] >> 8);
          rgbdata3[(i*2) + 1]=(unsigned char)(rgbdata2[i] & 0x00ff);
      }

      for(i=0;i<(32*24*2);i++)   sprintf(rgbdata4+i,"%02x",rgbdata3[i]);
      __android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data => %s",rgbdata4);
  }
#endif
}

//unsigned char *GetJpegData(void) {
void GetRGBData(unsigned char* rgb, int rotate, int flip) {
    int i = 0;
    int j=0;
    int type = 0;
    //unsigned char Red,Green,Blue;
    unsigned short rgbdata[24*32];
    unsigned char rgbdata3[(O_HEIGHT*O_WIDTH) * 2];
    unsigned short i_image[O_HEIGHT*O_WIDTH],o_image[O_HEIGHT*O_WIDTH];
    if (INTERPOLATE) {
        interpolate();
        for (y=0; y<O_HEIGHT; y++) {
            for (x=0; x<O_WIDTH; x++) {
                //imageData[(y*O_WIDTH) + x] = getColor(interpolated[y][x]);
                i_image[(y*O_WIDTH) + x] = getColor(interpolated[y][x]);
            }
        }
        type = rotate_flip_image_array(O_WIDTH,O_HEIGHT,i_image,o_image, rotate, flip);
        for (i=0; i<(O_HEIGHT*O_WIDTH); i++) {
            rgbdata3[(i*2) + 1]=(unsigned char)(o_image[i] >> 8);
            rgbdata3[i*2]=(unsigned char)(o_image[i] & 0x00ff);
        }
        memcpy(rgb,rgbdata3,O_WIDTH*O_HEIGHT*2);
        /*for(j=0;j<(24*32);j++){
            rgbdata2[j*3+0] = (unsigned char)(((rgbdata[j] & 0xF800) >> 11) << 3); //R
            rgbdata2[j*3+1] = (unsigned char)(((rgbdata[j] & 0x07E0) >> 5) << 2); //G
            rgbdata2[j*3+2] = (unsigned char)((rgbdata[j] & 0x001F) << 3); //B
        }*/

    }else{
        for (y=0; y<O_HEIGHT; y++) {
            for (x=0; x<O_WIDTH; x++) {
                //rgbdata[(y*32) + x] = getColor(tempValues[(31-x) + (y*32)]);
                i_image[(y*O_WIDTH) + x] = getColor(tempValues[(31-x) + (y*32)]);
            }
        }
        type = rotate_flip_image_array(O_WIDTH,O_HEIGHT,i_image,o_image, rotate, flip);
        for (i=0; i<(O_HEIGHT*O_WIDTH); i++) {
            //rgbdata2[(i*2) + 1]=(unsigned char)(rgbdata[i] >> 8);
            //rgbdata2[i*2]=(unsigned char)(rgbdata[i] & 0x00ff);
            rgbdata3[(i*2) + 1]=(unsigned char)(o_image[i] >> 8);
            rgbdata3[i*2]=(unsigned char)(o_image[i] & 0x00ff);
        }
        memcpy(rgb,rgbdata3,O_HEIGHT*O_WIDTH*2);
        //for(i=0;i<(32*24*2);i++)   sprintf(rgbdata3+i,"%02x",rgbdata2[i]);
        //__android_log_print(ANDROID_LOG_DEBUG, "TAG", "Data => %s",rgbdata3);
    }
   //return rgbdata2;
}
#ifdef SHOW_LCD
void drawFastVLine(short x, short y, short h, unsigned short color) {
  //startWrite();
  devLCD_vLine16_abs(x, y, h, color);
  //endWrite();
}
// Draw a legend.
void drawLegend(void) {
	char maxval[10];
	char minval[10];
  float inc = (maxTemp - minTemp) / 224.0;
  int j = 0;
  for (ii = minTemp; ii < maxTemp; ii += inc) {
    drawFastVLine(8+ + j++, 230, 20, getColor(ii));
  }
  DrawRectagle(thermal[0]);
  DrawRectagle(thermal[1]);
  //Display.setTextFont(2);
  //Display.setTextSize(1);
  //Display.setCursor(8, 272);
  //Display.setTextColor(TFT_WHITE, TFT_BLACK);
  //Display.print(String(minTemp).substring(0, 5));
  sprintf(minval," %.2f",minTemp);
  devLCD_putString_abs(8,190,minval,cBlack,cTransparent, FONT16);

  //Display.setCursor(192, 272);
  //Display.setTextColor(TFT_WHITE, TFT_BLACK);
  //Display.print(String(maxTemp).substring(0, 5));
  sprintf(maxval," %.2f",maxTemp);
  devLCD_putString_abs(192,190,maxval,cBlack,cTransparent, FONT16);

  //Display.setTextFont(NULL);
}
#endif
// Function to get the cutoff points in the temp vs RGB graph.
void setAbcd(void) {
  a = minTemp + (maxTemp - minTemp) * 0.2121;
  b = minTemp + (maxTemp - minTemp) * 0.3182;
  c = minTemp + (maxTemp - minTemp) * 0.4242;
  d = minTemp + (maxTemp - minTemp) * 0.8182;
}

void setTempScale(void) {
	int i;
	minTemp = 255;
	maxTemp = 0;
	for (i = 0; i < 768; i++) {
		minTemp = min(minTemp, tempValues[i]);
		maxTemp = max(maxTemp, tempValues[i]);
	}

	setAbcd();
#ifdef SHOW_LCD	
	drawLegend();
#endif	
}

int Thermal_Init(void)
{
    int rv;
    static float mlx90640To[768];
    static float mlx90640Image[768];
    unsigned short mlx90640Frame[834];
    unsigned short eeMLX90640[832];
    rv = DevThermal_open();
    if (rv <= 0)
    {
        __android_log_print(ANDROID_LOG_DEBUG, "TAG", "Failed to open Thermal[%x]",rv);
        fprintf(stderr, "Failed to open Thermal[%x]\r\n", rv);
        return -1;
    }

    init_array();
    setAbcd();
    rv = DevThermal_GetDumpData(eeMLX90640);
    if (rv != 0) {
        __android_log_print(ANDROID_LOG_DEBUG, "TAG", "Get Dump Data failed with error code:%d",rv);
        printf("Get Dump Data failed with error code:%d\n",rv);
        return -1;
    }
    rv = MLX90640_ExtractParameters(eeMLX90640, &mlx90640);
    if (rv != 0) {
        __android_log_print(ANDROID_LOG_DEBUG, "TAG", "Parameter extraction failed with error code:%d",rv);
        printf("Parameter extraction failed with error code:%d\n",rv);
        return -1;
    }
    __android_log_print(ANDROID_LOG_DEBUG, "TAG", "Thermal Init OK!!!!!");
    return 0;
}

int Thermal_Start(unsigned char *jpegdata, int *jpeglen, int rotate, int flip)
{
    //unsigned char data[32*24*2];
    //*jpeglen= (32*24*2);
    unsigned char data[(O_HEIGHT*O_WIDTH) * 2];
    *jpeglen= (O_HEIGHT*O_WIDTH) * 2;
    readTempValues();
    setTempScale();
    GetRGBData(data,rotate,flip);
    memcpy(jpegdata,data,(O_HEIGHT*O_WIDTH) * 2);
    return 0;
}

int GetMinTemp(float *temp)
{
    *temp = minTemp;
    return 0;
}

int GetMaxTemp(float *temp)
{
    *temp = maxTemp;
    return 0;
}

int GetCenterTemp(float *temp)
{
    float centerTemp;
    centerTemp = (tempValues[383 - 16] + tempValues[383 - 15] + tempValues[384 + 15] + tempValues[384 + 16]) / 4;
    *temp = centerTemp;
    return 0;
}



#ifdef SHOW_LCD
// Draw a circle + measured value.
void drawMeasurement(void) 
{
	float centerTemp;
	char centerval[10];
	DrawRectagle(thermal[2]);
	//char *data;
	// Mark center measurement
	//Display.drawCircle(120, 8+84, 3, TFT_WHITE);

	// Measure and print center temperature
	centerTemp = (tempValues[383 - 16] + tempValues[383 - 15] + tempValues[384 + 15] + tempValues[384 + 16]) / 4;
	sprintf(centerval," %.2f",centerTemp);
	//Display.setCursor(86, 214);
	//Display.setTextColor(TFT_WHITE, TFT_BLACK);
	//Display.setTextFont(2);
	//Display.setTextSize(2);
	//Display.print(String(centerTemp).substring(0, 5) + " °C");
	//vsprintf(data,"%.2f",centerTemp);
	//DrawRectagle(thermal[0]);
	devLCD_putString_abs(86,190,centerval,cBlack,cTransparent, FONT16);
}


int DrawRectagle(Rectangle r)
{
	if(r.changebtn == 0xFF) 
	{
		return 1;
	}

	if(r.charactorSize == FONT_IMAGE){
		devLCD_displayBmp(r.x1, r.y1, r.name);
		return 1;
	}

	if(r.fillColor == cHalfTransparent) devLCD_fillAreaHalfTransparent_abs(r.x1, r.y1,r.x1+r.width, r.y1+r.height);
	else if(r.fillColor != cTransparent) devLCD_fillArea_abs(r.x1, r.y1,r.x1+r.width, r.y1+r.height, r.fillColor);
	else devLCD_fillAreaHalfTransparent_abs(r.x1, r.y1,r.x1+r.width, r.y1+r.height);

	int x,y;
	x = r.x1 + (r.width - strlen(r.name) * r.charactorSize/2)/2;
	y = r.y1 + (r.height - r.charactorSize)/2;

	devLCD_putString_abs(x, y, r.name, r.charactorColor, r.fillColor, r.charactorSize);
	if((r.lineColor == cTransparent)||(r.fillColor == cHalfTransparent)) return -1;
	if(r.buttontype == BUTTON_RECT){
		DevLCD_drawLine_abs(r.x1, r.y1,r.x1+r.width, r.y1+r.height,  r.lineColor);
		DevLCD_drawLine_abs(r.x1+1, r.y1+1,r.x1+r.width-1, r.y1+r.height-1,  r.lineColor);
	}
	return 0;
}
#endif
#endif
