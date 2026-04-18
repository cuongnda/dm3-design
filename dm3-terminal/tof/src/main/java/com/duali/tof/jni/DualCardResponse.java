/*
 * DualCardJni - A Java API for using method of DUALi Reader and module
 *
 * Copyright ⓒ 2011 DUALi Inc. All rights reserved. 
 * 
 * DUALi Inc. reserves the right to make changes to its applications or services or to
 * discontinue any application or service at any time without notice. DUALi provides customer
 * assistance in various technical areas, but does not have full access to data concerning the
 * use and applications of customer's products.
 * Therefore, DUALi assumes no liability and is not responsible for customer applications or
 * software design or performance relating to systems or applications incorporating DUALi
 * products. In addition, DUALi assumes no liability and is not responsible for infringement of
 * patents and/or any other intellectual or industrial property rights of third parties, which may
 * result from assistance provided by DUALi.
 * Composition of the information in this manual has been done to the best of our knowledge.
 * DUALi does not guarantee the correctness and completeness of the details given in this
 * manual and may not be held liable for damages ensuing from incorrect or incomplete
 * information. Since, despite all our efforts, errors may not be completely avoided, we are
 * always grateful for your useful tips.
 * We have our development center in South Korea to provide technical support. For any
 * technical assistance can contact our technical support team as below;
 * Tel: +82 31 213 0074
 * e-mail : yekwon@duali.com
 */

package com.duali.tof.jni;

/**
 * Response Class
 */
public class DualCardResponse {
	/**
	 * Response Code
	 */
	private int responseCode;
	/**
	 * Response Data
	 */
	private byte[] responseData;

	/**
	 * See the {@link com.duali.tof.jni.ResponseCode ResponseCode}.
	 * @return Response Code
	 */
	public int getResponseCode() {
		return responseCode;
	}
	
	/**
	 * @param responseCode Response Code
	 */
	public void setResponseCode(int responseCode) {
		this.responseCode = responseCode;
	}
	
	/**
	 * @return Response Data
	 */
	public byte[] getResponseData() {
		return responseData;
	}
	
	/**
	 * @param responseData Response Data
	 */
	public void setResponseData(byte[] responseData) {
		this.responseData = responseData;
	}	
}