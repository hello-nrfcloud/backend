import { Logger } from '@aws-lambda-powertools/logger'
import { fromEnv } from '@nordicsemiconductor/from-env'

const { level } = fromEnv({
	level: 'LOG_LEVEL',
})(process.env)

export const logger = (serviceName: string): Logger => {
	return new Logger({
		logLevel: (level as any) ?? 'INFO',
		serviceName,
	})
}
