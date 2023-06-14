import { SSMClient } from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { getSettingsOptional } from '../util/settings.js'
import { logger } from './logger.js'

// Format:
//   'model name': 'interval'
//   'model name': 'interval:count'
type ParameterConfig = {
	[k: string]: string
}

type ScheduleConfig = {
	[k: string]: { count: number; interval: number }[]
}

type WillUpdatedDevice = {
	model: string
	updatedAt: Date
	count: number
}

const log = logger('deviceShadowUpdateChecker')

const jitter = 200 // The time we compensate for execution time
const ssm = new SSMClient({})
const stackConfig = getSettingsOptional<
	ParameterConfig,
	{ [k: string]: string }
>({
	ssm,
	stackName: STACK_NAME,
	scope: 'config',
	system: 'stack',
})

const notNull = <T>(value: T | null): value is T => {
	return value !== null
}

export const parseConfig = (config: ParameterConfig): ScheduleConfig => {
	const parsedConfig: ScheduleConfig = {}
	for (const key in config) {
		const stringConfig = config[key]
		const regex = /(?<interval>\d+)(?:\s*:\s*(?<count>\d+))?/
		let acc = 0
		const schedule = (stringConfig ?? '')
			.split(',')
			.map((item) => {
				const matches = regex.exec(item)
				if (matches !== null) {
					return {
						count: parseInt(
							matches?.groups?.count ?? `${Number.MAX_SAFE_INTEGER}`,
							10,
						),
						interval: parseInt(matches?.groups?.interval ?? `5`, 10),
					}
				} else {
					return null
				}
			})
			.filter(notNull)
			.sort((a, b) => a.interval - b.interval)
			.map((item, index, arr) => {
				if (item.count < Number.MAX_SAFE_INTEGER) {
					acc += item.count
					item.count = acc
				}

				// Convert last interval to have endless count
				if (index === arr.length - 1) {
					item.count = Number.MAX_SAFE_INTEGER
				}

				return item
			})

		parsedConfig[key] = schedule
	}

	return parsedConfig
}

const getScheduleConfig = async (): Promise<ScheduleConfig> => {
	const parameterConfig = await stackConfig({})
	log.info(`Fetching configuration from parameter store`, {
		parameterConfig,
	})
	return parseConfig(parameterConfig)
}

export const createDeviceUpdateChecker = async (
	referenceTime: Date,
): Promise<(device: WillUpdatedDevice) => boolean> => {
	const config = await getScheduleConfig()
	return (device) => {
		// The default is 5 seconds rate
		const defaultStep = config['default'] ?? [
			{ count: Number.MAX_SAFE_INTEGER, interval: 5 },
		]
		const modelStep =
			config[device.model?.replace(/[^\w.-]/g, '_')] ?? defaultStep
		for (const step of modelStep) {
			if (device.count <= step.count) {
				return (
					device.updatedAt <=
					new Date(referenceTime.getTime() - step.interval * 1000 + jitter)
				)
			}
		}

		return false
	}
}
