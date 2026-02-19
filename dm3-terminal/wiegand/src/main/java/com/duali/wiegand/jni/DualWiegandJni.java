/*
 * Duali inc.
 * 
 * date: 2011/3/14
 * author: Jungrae, Yeom
 */
package com.duali.wiegand.jni;

import android.util.Log;
// TODO: Auto-generated Javadoc
/**
 * The Class DualCardJni.
 */
public class DualWiegandJni {
	/** The obj. */
	private static DualWiegandJni obj = null;
	
	/**
	 * getInstance()
	 * 
	 * This function is instantiates a new dual card jni.
	 *
	 * @return DualIOJni instance
	 */
	
	public static DualWiegandJni getInstance(){
		if (obj == null)
			obj = new DualWiegandJni();

		return obj;
	}
	
	static {
		try {
			System.loadLibrary("wiegand");
		} catch (UnsatisfiedLinkError e) {
			Log.e("wiegand", "Can not load wiegand");
		}
	}
	
	/**
	 * Instantiates a new dual card jni.
	 */
	private DualWiegandJni() {
		this.data = new byte[0];
		//DE_Thermal_Open();
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

	public native int DE_Wiegand_Open();
	public native void DE_Wiegand_Close();
	public native synchronized DualCardResponse DE_Wiegand_Version();
	public native int DE_Wiegand_SendData(int parity, int dataLen, byte[] data);
	public native synchronized DualCardResponse DE_Wiegand_ReadData();
	public native int DE_Wiegand_WGD0Control(int gpio);
	public native int DE_Wiegand_WGD1Control(int gpio);
}
	