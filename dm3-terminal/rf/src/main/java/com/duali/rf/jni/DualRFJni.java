/*
 * Duali inc.
 * 
 * date: 2011/3/14
 * author: Jungrae, Yeom
 */
package com.duali.rf.jni;

import android.util.Log;
// TODO: Auto-generated Javadoc
/**
 * The Class DualCardJni.
 */
public class DualRFJni {
	/** The obj. */
	private static DualRFJni obj = null;
	
	/**
	 * getInstance()
	 * 
	 * This function is instantiates a new dual card jni.
	 *
	 * @return DualIOJni instance
	 */
	
	public static DualRFJni getInstance(){
		if (obj == null)
			obj = new DualRFJni();

		return obj;
	}
	
	static {
		try {
			System.loadLibrary("RF_PN5180");
		} catch (UnsatisfiedLinkError e) {
			Log.e("RF_PN5180", "Can not load RF_PN5180");
		}
	}
	
	/**
	 * Instantiates a new dual card jni.
	 */
	private DualRFJni() {
		this.data = new byte[0];
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


	public native void DE_RF_Open();
	public native void DE_RF_Close();
	public native synchronized DualCardResponse DE_Polling(int dataLen, byte[] data, int timeout);
}
	