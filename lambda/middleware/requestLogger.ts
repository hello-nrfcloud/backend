import inputOutputLogger from '@middy/input-output-logger'

export const requestLogger = (): ReturnType<typeof inputOutputLogger> =>
	inputOutputLogger({
		logger: (message) => console.debug(JSON.stringify(message)),
	})
