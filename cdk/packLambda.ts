import swc from '@swc/core'
import { createWriteStream } from 'node:fs'
import { parse } from 'path'
import * as yazl from 'yazl'
import { findDependencies } from './findDependencies'

/**
 * In the bundle we only include code that's not in the layer.
 */
export const packLambda = async ({
	sourceFile,
	zipFile,
	debug,
	progress,
}: {
	sourceFile: string
	zipFile: string
	debug?: (label: string, info: string) => void
	progress?: (label: string, info: string) => void
}): Promise<void> => {
	const lambdaFiles = [sourceFile, ...findDependencies(sourceFile)]

	const zipfile = new yazl.ZipFile()

	for (const file of lambdaFiles) {
		const compiled = (
			await swc.transformFile(file, {
				jsc: {
					target: 'es2022',
				},
			})
		).code
		debug?.(`compiled`, compiled)
		const jsFileName = `${parse(file).name}.js`
		zipfile.addBuffer(Buffer.from(compiled, 'utf-8'), jsFileName)
		progress?.(`added`, jsFileName)
	}

	// Mark it as ES module
	zipfile.addBuffer(
		Buffer.from(
			JSON.stringify({
				type: 'module',
			}),
			'utf-8',
		),
		'package.json',
	)
	progress?.(`added`, 'package.json')

	await new Promise<void>((resolve) => {
		zipfile.outputStream.pipe(createWriteStream(zipFile)).on('close', () => {
			resolve()
		})
		zipfile.end()
	})
	progress?.(`written`, zipFile)
}
