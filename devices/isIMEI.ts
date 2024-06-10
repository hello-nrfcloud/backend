export const isIMEI = (imei?: string): imei is string =>
	/^35[0-9]{13}$/.test(imei ?? '')
