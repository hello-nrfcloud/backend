type WillUpdatedDevice = {
	model: string
	updatedAt: Date
	count: number
}

const jitter = 200 // The time we compensate for execution time

export const createDeviceUpdateChecker =
	(
		referenceTime: Date,
		interval = 5,
	): ((device: WillUpdatedDevice) => boolean) =>
	(device) =>
		device.updatedAt <=
		new Date(referenceTime.getTime() - interval * 1000 + jitter)
