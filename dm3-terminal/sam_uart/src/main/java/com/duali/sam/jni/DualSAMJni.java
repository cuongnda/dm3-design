/*
 * Duali inc.
 * 
 * date: 2011/3/14
 * author: Jungrae, Yeom
 */
package com.duali.sam.jni;

import android.util.Log;
// TODO: Auto-generated Javadoc
/**
 * The Class DualCardJni.
 */
public class DualSAMJni {
	/** The obj. */
	private static DualSAMJni obj = null;
	
	/**
	 * getInstance()
	 * 
	 * This function is instantiates a new dual card jni.
	 *
	 * @return DualIOJni instance
	 */
	
	public static DualSAMJni getInstance(){
		if (obj == null)
			obj = new DualSAMJni();

		return obj;
	}
	
	static {
		try {
			System.loadLibrary("SAM_Uart");
		} catch (UnsatisfiedLinkError e) {
			Log.e("SAM_Uart", "Can not load SAM_Uart");
		}
	}
	
	/**
	 * Instantiates a new dual card jni.
	 */
	private DualSAMJni() {
		this.data = new byte[0];
		//DE_SAM_Open(0);
	}
	
	/** The data. */
	private byte[] data = new byte[10];
	
	/** The length. */
	private int length = 0;	
	
	
	/* (non-Javadoc)
     * 
     */
	public void initData() {
		this.data = new byte[10];
	}
	
	/* (non-Javadoc)
     * 
     */
	public void setLength (int length) {
		this.length = length;
	}
	
	/* (non-Javadoc)
     * 
     */
	public void setData(byte[] retData) {
		this.data = retData;
	}
	
	/* (non-Javadoc)
     * 
     */
	public byte[] getData() {
		return this.data;
	}
	
	/* (non-Javadoc)
     * 
     */
	public int getLength() {
		return this.length;
	}


	public native int DE_SAM_Open(int nPort);
	public native int DE_SAM_Close(int nPort);
	public native int DE_SAM_PWR_OFF();
	public native synchronized DualCardResponse DE_SAM_ActivationFlow(int slot);
	public native synchronized DualCardResponse DE_SAM_CaseProcess(int slot, int dataLen, byte[] data);
}
	