/*
 * Duali inc.
 * 
 * date: 2011/3/14
 * author: Jungrae, Yeom
 */
package com.duali.thermal.jni;

import android.util.Log;

import com.duali.thermal.jni.DualCardResponse;
// TODO: Auto-generated Javadoc
/**
 * The Class DualCardJni.
 */
public class DualThermalJni {
	/** The obj. */
	private static DualThermalJni obj = null;
	
	/**
	 * getInstance()
	 * 
	 * This function is instantiates a new dual card jni.
	 *
	 * @return DualIOJni instance
	 */
	
	public static DualThermalJni getInstance(){
		if (obj == null)
			obj = new DualThermalJni();

		return obj;
	}
	
	static {
		try {
			System.loadLibrary("thermal");
		} catch (UnsatisfiedLinkError e) {
			Log.e("thermal", "Can not load thermal");
		}
	}
	
	/**
	 * Instantiates a new dual card jni.
	 */
	private DualThermalJni() {
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

	public native int DE_Thermal_Open();
	public native int DE_Thermal_Close();
	public native synchronized DualCardResponse DE_Thermal_MinTemp();
	public native synchronized DualCardResponse DE_Thermal_MaxTemp();
	public native synchronized DualCardResponse DE_Thermal_CentTemp();
	public native synchronized DualCardResponse DE_Thermal_Start(int rotate, int flip);
}
	