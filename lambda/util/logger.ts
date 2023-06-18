import { Logger } from '@aws-lambda-powertools/logger'

export const logger = (serviceName: string): Logger => {
	return new Logger({
		logLevel: (process.env.LOG_LEVEL as any) ?? 'DEBUG',
		serviceName,
	})
}
