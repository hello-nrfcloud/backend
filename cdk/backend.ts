import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { BackendApp } from './BackendApp.js'
import { packLambda } from './packLambda.js'
import { packLayer } from './packLayer.js'
export type PackedLambda = { lambdaZipFile: string; handler: string }

const packagesInLayer: string[] = [
	'@nordicsemiconductor/from-env',
	'@sinclair/typebox',
	'ajv',
]
const pack = async (id: string, handler = 'handler'): Promise<PackedLambda> => {
	try {
		await mkdir(path.join(process.cwd(), 'dist', 'lambdas'), {
			recursive: true,
		})
	} catch {
		// Directory exists
	}
	const zipFile = path.join(process.cwd(), 'dist', 'lambdas', `${id}.zip`)
	await packLambda({
		sourceFile: path.join(process.cwd(), 'lambda', `${id}.ts`),
		zipFile,
	})
	return {
		lambdaZipFile: zipFile,
		handler: `${id}.${handler}`,
	}
}

new BackendApp({
	lambdaSources: {
		onConnect: await pack('onConnect'),
		onMessage: await pack('onMessage'),
		onDisconnect: await pack('onDisconnect'),
		publishToWebsocketClients: await pack('publishToWebsocketClients'),
	},
	layer: await packLayer({
		id: 'baseLayer',
		dependencies: packagesInLayer,
	}),
})
