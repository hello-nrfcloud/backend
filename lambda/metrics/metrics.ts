import { Metrics } from '@aws-lambda-powertools/metrics'

const registry: Record<string, Metrics> = {}
export type AddMetricsFn = (...args: Parameters<Metrics['addMetric']>) => void

const metricsEnabled = process.env.DISABLE_METRICS !== '1'
console.debug(`[Metrics]`, metricsEnabled ? `Enabled` : `Disabled`)

/**
 * Manages the instantiation of a Metrics object (unless Metrics are disabled)
 */
export const metricsForComponent = (
	component: string,
	namespace = 'hello-nrfcloud-backend',
): {
	metrics: Metrics
	track: AddMetricsFn
} => {
	if (registry[component] === undefined) {
		registry[component] = new Metrics({
			namespace,
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
