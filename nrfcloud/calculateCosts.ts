export type LocationService = keyof LocationServices

export type LocationServices = {
	AGPS: {
		requests: number
		devicesUsing: number
	}
	PGPS: {
		requests: number
		devicesUsing: number
	}
	SCELL: {
		requests: number
		devicesUsing: number
	}
	MCELL: {
		requests: number
		devicesUsing: number
	}
	WIFI: {
		requests: number
		devicesUsing: number
	}
}

export type UsageSummary = {
	currentDevices: {
		total: number
		bluetoothLE: number
		gateway: number
		generic: number
	}
	services: {
		date: string
		fotaJobExecutions: number
		storedDeviceMessages: number
		locationServices: LocationServices
	}[]
}

export type Prices = {
	currentDevices: number
	storedDeviceMessages: number
	fotaJobExecutions: number
	AGPS: number
	PGPS: number
	SCELL: number
	MCELL: number
	WIFI: number
}

export type ServicePrice = keyof Prices

export const nRFCloudPrices: Prices = {
	currentDevices: 0.1,
	storedDeviceMessages: 0.0001,
	fotaJobExecutions: 0.1,
	AGPS: 0.001,
	PGPS: 0.001,
	SCELL: 0.001,
	MCELL: 0.002,
	WIFI: 0.002,
}

export const calculateCosts = (data: UsageSummary): number => {
	//return 0 if empty object
	if (Object.keys(data).length === 0) {
		return 0
	}
	let monthlyCosts = 0
	for (const services of data.services) {
		if (services.date === getCurrentDate()) {
			monthlyCosts +=
				data.currentDevices.total * nRFCloudPrices.currentDevices +
				services.fotaJobExecutions * nRFCloudPrices.fotaJobExecutions +
				services.storedDeviceMessages * nRFCloudPrices.storedDeviceMessages

			const locationServices = services.locationServices
			for (const key in locationServices) {
				monthlyCosts +=
					locationServices[key as LocationService].requests *
					nRFCloudPrices[key as ServicePrice]
			}
		}
	}
	monthlyCosts = Number((monthlyCosts > 1.99 ? monthlyCosts : 1.99).toFixed(2))
	return monthlyCosts
}

export const getCurrentDate = (): string => {
	const date = new Date()
	const currentDate = `${date.getFullYear()}-${(date.getMonth() + 1)
		.toString()
		.padStart(2, '0')}`
	return currentDate
}
