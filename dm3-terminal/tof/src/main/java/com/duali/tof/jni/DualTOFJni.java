/*
 * Duali inc.
 * 
 * date: 2011/3/14
 * author: Jungrae, Yeom
 */
package com.duali.tof.jni;

import android.util.Log;
// TODO: Auto-generated Javadoc
/**
 * The Class DualCardJni.
 */
public class DualTOFJni {
	/** The obj. */
	private static DualTOFJni obj = null;
	
	/**
	 * getInstance()
	 * 
	 * This function is instantiates a new dual card jni.
	 *
	 * @return DualIOJni instance
	 */
	
	public static DualTOFJni getInstance(){
		if (obj == null)
			obj = new DualTOFJni();

		return obj;
	}
	
	static {
		try {
			System.loadLibrary("tof");
		} catch (UnsatisfiedLinkError e) {
			Log.e("thermal", "Can not load thermal");
		}
	}
	
	/**
	 * Instantiates a new dual card jni.
	 */
	private DualTOFJni() {
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

	public native int DE_TOF_Open();
	public native int DE_TOF_Close();
	public native int DE_TOF_GetData();

}
	