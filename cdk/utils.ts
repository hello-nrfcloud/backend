import { Logger } from '@aws-lambda-powertools/logger'

const logger = new Logger({
	persistentLogAttributes: {
		logger: {
			name: '@aws-lambda-powertools/logger',
		},
	},
})

export { logger }
