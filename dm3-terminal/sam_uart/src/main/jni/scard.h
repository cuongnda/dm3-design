
extern u16 SC_Rcv_Len_Get(void);
extern void SC_Rcv_Len_Clr(void);
extern void SC_Rcv_Len_Dec(void);
extern void SC_Invrese_Flag(u8 slot, u8 inv);
extern void SC_PPS_Flag(u8 slot, u8 pps);
extern u8 SC_SlotCheck(u8 slot);
extern unsigned int SC_Get_FCLK(u8 slot);
extern void SC_Parity_Set(u8 slot,u8 parity);
extern void SC_ActiveInit(u8 slot,u8 reset);
extern void SC_Deactivation(u8 slot);
extern void SC_SetBaudRate(u8 slot,u8 fidi);
extern u8 SC_Send_Data(u8 slot,u16 tlen, u8 *tbuf);
extern void SC_RxIntControl_Enable(u8 slot);
extern void SC_RxIntControl_Disable(u8 slot);
extern void SC_t0_retry(u8 t0r);
extern void Delay_1us_GT(int t);
extern void AntiTearing_Clear(void);
extern void SC_SetIO(u8 slot, u8 sta);
extern void SC_SetSlot(u8 slot);
extern void SC_Tx_Complete(u8 slot);
extern int Init_Tick_Start(void);
extern int Init_Tick_Stop(void);







