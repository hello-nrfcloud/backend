import { Metrics } from '@aws-lambda-powertools/metrics'

const registry: Record<string, Metrics> = {}

const metricsEnabled = process.env.DISABLE_METRICS !== '1'
console.debug(`[Metrics]`, metricsEnabled ? `Enabled` : `Disabled`)

/**
 * Manages the instantiation of a Metrics object (unless Metrics are disabled)
 */
export const metricsForComponent = (
	component: string,
): {
	metrics: Metrics
	track: (...args: Parameters<Metrics['addMetric']>) => void
} => {
	if (registry[component] === undefined) {
		registry[component] = new Metrics({
			namespace: 'hello-nrfcloud-backend',
			serviceName: component,
		})
	}
	const metrics = registry[component] as Metrics
	return {
		metrics,
		track: (...args) => {
			if (!metricsEnabled) {
				return
			}
			metrics.addMetric(...args)
		},
	}
}
