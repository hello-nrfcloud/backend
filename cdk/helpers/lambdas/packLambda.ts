import swc from '@swc/core'
import { createWriteStream } from 'node:fs'
import { parse } from 'path'
import yazl from 'yazl'
import { checkSumOfFiles } from './checksumOfFiles.js'
import { commonParent } from './commonParent.js'
import { findDependencies } from './findDependencies.js'
import { fileURLToPath } from 'node:url'

export type PackedLambda = {
	id: string
	zipFile: string
	handler: string
	hash: string
}

const removeCommonAncestor =
	(parentDir: string) =>
	(file: string): string => {
		const p = parse(file)
		const jsFileName = [
			p.dir.replace(parentDir.slice(0, parentDir.length - 1), ''),
			`${p.name}.js`,
		]
			.join('/')
			// Replace leading slash
			.replace(/^\//, '')

		return jsFileName
	}

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
}): Promise<{ handler: string; hash: string }> => {
	const lambdaFiles = [sourceFile, ...findDependencies(sourceFile)]

	const zipfile = new yazl.ZipFile()

	const stripCommon = removeCommonAncestor(commonParent(lambdaFiles))

	for (const file of lambdaFiles) {
		const compiled = (
			await swc.transformFile(file, {
				jsc: {
					target: 'es2022',
				},
			})
		).code
		debug?.(`compiled`, compiled)
		const jsFileName = stripCommon(file)
		zipfile.addBuffer(Buffer.from(compiled, 'utf-8'), jsFileName)
		progress?.(`added`, jsFileName)
	}

	const hash = await checkSumOfFiles([
		...lambdaFiles,
		// Include this script, so artefact is updated if the way it's built is changed
		fileURLToPath(import.meta.url),
	])

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

	return { handler: stripCommon(sourceFile), hash }
}
