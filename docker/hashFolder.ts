import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const hashFile = async (file: string): Promise<string> => {
	const hash = createHash('md5')
	const content = createReadStream(file)

	return new Promise((resolve, reject) => {
		content.pipe(hash)
		content
			.on('close', () => {
				return resolve(hash.digest('hex'))
			})
			.on('error', (error) => {
				return reject(error)
			})
	})
}

const generateMd5ForFolder = async (
	path: string,
): Promise<Record<string, string>> => {
	const files = readdirSync(path)
	const md5Hashes: Record<string, string> = {}

	for (const file of files) {
		const filePath = join(path, file)
		const fileStats = statSync(filePath)

		if (fileStats.isFile()) {
			md5Hashes[filePath] = await hashFile(filePath)
		} else if (fileStats.isDirectory()) {
			const filesInNestedFolder = await generateMd5ForFolder(filePath)
			for (const file in filesInNestedFolder) {
				md5Hashes[file] = filesInNestedFolder[file] ?? ''
			}
		}
	}

	return md5Hashes
}

export const hashFolder = async (path: string): Promise<string> => {
	const filesHash = await generateMd5ForFolder(path)

	const hashMD5 = createHash('md5')
	Object.entries(filesHash)
		.sort((a, b) =>
			a[0].toLocaleLowerCase().localeCompare(b[0].toLocaleLowerCase()),
		)
		.forEach(([file, hash]) => {
			hashMD5.update(`${hash} ${file.replace(path, '')}`)
		})

	return hashMD5.digest('hex')
}
