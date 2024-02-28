export type Logger = {
	error: (message: string, detail?: unknown) => void
	debug: (...args: any[]) => void
	info: (...args: any[]) => void
	warn: (...args: any[]) => void
}

export const logger = (serviceName: string): Logger => ({
	error: (message, detail) => {
		console.error(`[${serviceName}]`, message)
		if (detail !== undefined) console.error(JSON.stringify(detail))
	},
	debug: (...args) => {
		console.debug(`[${serviceName}]`, ...args.map((a) => JSON.stringify(a)))
	},
	info: (...args) => {
		console.log(`[${serviceName}]`, ...args.map((a) => JSON.stringify(a)))
	},
	warn: (...args) => {
		console.warn(`[${serviceName}]`, ...args.map((a) => JSON.stringify(a)))
	},
})
