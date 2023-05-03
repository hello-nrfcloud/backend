import { SSMClient } from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { ensureNumber } from '../util/ensureNumber.js'
import { createInMemoryCache } from '../util/inMemoryCache.js'
import { getSettings } from '../util/settings.js'
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
const stackConfig = getSettings<ParameterConfig>({
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
						count: ensureNumber(
							matches?.groups?.count,
							Number.MAX_SAFE_INTEGER,
						),
						interval: ensureNumber(matches?.groups?.interval, 5),
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

const cache = createInMemoryCache<ScheduleConfig>()
const cacheKey = 'schedule-config'
const cacheTTL = 300 // 5 mins
const getScheduleConfig = async (): Promise<ScheduleConfig> => {
	let scheduleConfig = cache.get(cacheKey)
	if (scheduleConfig === null) {
		const parameterConfig = await stackConfig(false)
		log.info(`Cache expired (${cacheTTL}s), fetching new one`, {
			parameterConfig,
		})
		scheduleConfig = parseConfig(parameterConfig)
		cache.set(cacheKey, scheduleConfig, cacheTTL)
	}

	return scheduleConfig
}

export const deviceShadowUpdateChecker = async (
	device: WillUpdatedDevice,
): Promise<boolean> => {
	const config = await getScheduleConfig()
	const currentDate = Date.now()

	// The default is 5 seconds rate
	const defaultStep = config['default'] ?? [
		{ count: Number.MAX_SAFE_INTEGER, interval: 5 },
	]
	const modelStep = config[device.model] ?? defaultStep
	for (const step of modelStep) {
		if (device.count <= step.count) {
			return (
				device.updatedAt <=
				new Date(currentDate - step.interval * 1000 + jitter)
			)
		}
	}

	return false
}
