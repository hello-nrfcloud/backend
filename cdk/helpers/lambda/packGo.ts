import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import { checkSumOfFiles } from '@bifravst/aws-cdk-lambda-helpers/util'
import run from '@bifravst/run'
import { createWriteStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import yazl from 'yazl'

const zipBinary = async (binary: Buffer, outfile: string): Promise<void> => {
	const zipFile = new yazl.ZipFile()
	zipFile.addBuffer(binary, 'bootstrap', { mode: 0o755 })

	await new Promise<void>((resolve) => {
		zipFile.outputStream.pipe(createWriteStream(outfile)).on('close', () => {
			resolve()
		})
		zipFile.end()
	})
}

export const packGo = async (
	id: string,
	lambdaFolder: string,
	distFolder: string = join(process.cwd(), 'dist/lambda'),
): Promise<PackedLambda> => {
	const zipFile = join(distFolder, `${id}.zip`)
	const absLambdaFolder = join(process.cwd(), lambdaFolder)
	await run({
		command: 'go',
		args: ['mod', 'tidy'],
		cwd: absLambdaFolder,
		env: {
			...process.env,
			GOOS: 'linux',
			GOARCH: 'arm64',
			GOMODCACHE: join(distFolder, 'gomodcache'),
			GOCACHE: join(distFolder, 'gocache'),
		},
	})
	await run({
		command: 'go',
		args: ['build', '-tags', 'lambda.norpc', '-o', 'bootstrap', 'bootstrap.go'],
		cwd: absLambdaFolder,
		env: {
			...process.env,
			GOOS: 'linux',
			GOARCH: 'arm64',
			GOMODCACHE: join(distFolder, 'gomodcache'),
			GOCACHE: join(distFolder, 'gocache'),
		},
	})
	await zipBinary(await readFile(join(absLambdaFolder, 'bootstrap')), zipFile)

	return {
		handler: 'bootstrap',
		hash: await checkSumOfFiles(
			(await readdir(absLambdaFolder)).map((f) => join(absLambdaFolder, f)),
		),
		zipFile,
		id,
	}
}
