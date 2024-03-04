import { packLayer, type PackedLayer } from '../helpers/lambdas/packLayer.js'

export const pack = async (): Promise<PackedLayer> =>
	packLayer({
		id: 'healthCheckLayer',
		dependencies: ['mqtt', 'ws'],
	})
