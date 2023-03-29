import { mkdir } from 'node:fs/promises'
import path from 'path'
import type { PackedLambda } from './backend.js'
import { packLambda } from './packLambda.js'
import { packLayer } from './packLayer.js'
import { TestResources } from './test-resources/TestResourcesApp.js'

const pack = async (id: string, handler = 'handler'): Promise<PackedLambda> => {
	try {
		await mkdir(path.join(process.cwd(), 'dist', 'test-resources'), {
			recursive: true,
		})
	} catch {
		// Directory exists
	}
	const zipFile = path.join(
		process.cwd(),
		'dist',
		'test-resources',
		`${id}.zip`,
	)
	await packLambda({
		sourceFile: path.join(process.cwd(), 'cdk', 'test-resources', `${id}.ts`),
		zipFile,
	})
	return {
		lambdaZipFile: zipFile,
		handler: `${id}.${handler}`,
	}
}
new TestResources({
	lambdaSources: {
		httpApiMock: await pack('http-api-mock-lambda'),
	},
	layer: await packLayer({
		id: 'testResources',
		dependencies: ['@aws-sdk/client-dynamodb', '@nordicsemiconductor/from-env'],
	}),
})
