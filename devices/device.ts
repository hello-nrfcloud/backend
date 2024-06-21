export type Device = {
	id: string
	fingerprint: string
	model: string
	account: string
	/**
	 * Hide device data before this date.
	 */
	hideDataBefore?: Date
}
