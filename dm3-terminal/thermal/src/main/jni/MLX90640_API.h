#ifndef _MLX90640_API_H_
#define _MLX90640_API_H_
#define INTERPOLATE 0
#if INTERPOLATE
#define O_WIDTH 224
#define O_HEIGHT 168
#else
#define O_WIDTH 32
#define O_HEIGHT 24
#endif

#define  TA_SHIFT 	8
#define THERMAL_DEV_PATH	"/dev/drvThermal"
#define ROTATION_0		0
#define ROTATION_90		1
#define ROTATION_180	2
#define ROTATION_270	3
#define FLIP_X	4
#define FLIP_NO	5
typedef struct {
    short kVdd;
    short vdd25;
    float KvPTAT;
    float KtPTAT;
    unsigned short vPTAT25;
    float alphaPTAT;
    short gainEE;
    float tgc;
    float cpKv;
    float cpKta;
    uint8_t resolutionEE;
    uint8_t calibrationModeEE;
    float KsTa;
    float ksTo[4];
    short ct[4];
    float alpha[768];
    short offset[768];
    float kta[768];
    float kv[768];
    float cpAlpha[2];
    short cpOffset[2];
    float ilChessC[3];
    unsigned short brokenPixels[5];
    unsigned short outlierPixels[5];
} paramsMLX90640;
    
	int DevThermal_open(void);
	int DevThermal_close(void);
	int DevThermal_GetDumpData(unsigned short *eeprom);
	int DevThermal_GetFrameData(unsigned short *fdata);
    //int MLX90640_DumpEE(unsigned short *eeData);
    //int MLX90640_SynchFrame(void);
    //int MLX90640_TriggerMeasurement(void);
    //int MLX90640_GetFrameData(unsigned short *frameData);
    int MLX90640_ExtractParameters(unsigned short *eeData, paramsMLX90640 *mlx90640);
    float MLX90640_GetVdd(unsigned short *frameData, const paramsMLX90640 *params);
    float MLX90640_GetTa(unsigned short *frameData, const paramsMLX90640 *params);
    void MLX90640_GetImage(unsigned short *frameData, const paramsMLX90640 *params, float *result);
    void MLX90640_CalculateTo(unsigned short *frameData, const paramsMLX90640 *params, float emissivity, float tr, float *result);
    int MLX90640_SetResolution(unsigned char resolution);
    int MLX90640_GetCurResolution(void);
    int MLX90640_SetRefreshRate(unsigned char refreshRate);   
    int MLX90640_GetRefreshRate(void);  
    int MLX90640_GetSubPageNumber(unsigned short *frameData);
    int MLX90640_GetCurMode(void); 
    int MLX90640_SetInterleavedMode(void);
    int MLX90640_SetChessMode(void);
    void MLX90640_BadPixelsCorrection(unsigned short *pixels, float *to, int mode, paramsMLX90640 *params);
	
	
	void init_array(void);
	void readTempValues(void);
	void interpolate();
	float lerp(float v0, float v1, float t);
	void drawPicture(void);
	void drawMeasurement(void);
	void setTempScale(void);
	void drawLegend(void);
	void setAbcd(void);
int Thermal_Init(void);
int Thermal_Start(unsigned char *jpegdata, int *jpeglen, int rotate, int flip);
int GetMinTemp(float *temp);
int GetMaxTemp(float *temp);
int GetCenterTemp(float *temp);

	
    
#endif