export type Logger = {
	error: (message: string, detail?: unknown) => void
	debug: (...args: any[]) => void
	info: (...args: any[]) => void
	warn: (...args: any[]) => void
}

export const logger = (serviceName: string): Logger => ({
	error: (message, detail) => {
		console.error(`[${serviceName}]`, message)
		if (detail !== undefined) console.error(detail)
	},
	debug: (...args) => {
		console.debug(`[${serviceName}]`, ...args)
	},
	info: (...args) => {
		console.log(`[${serviceName}]`, ...args)
	},
	warn: (...args) => {
		console.warn(`[${serviceName}]`, ...args)
	},
})
