import * as crypto from 'node:crypto'
import * as fs from 'node:fs'

/**
 * Computes the combined checksum of the given files
 */
export const checkSumOfFiles = async (files: string[]): Promise<string> => {
	const fileChecksums = await checkSum(files)
	const checksum = checkSumOfStrings(
		[...Object.entries(fileChecksums)].map(([, hash]) => hash),
	)
	return checksum
}

export const checkSumOfStrings = (strings: string[]): string => {
	const hash = crypto.createHash('sha1')
	hash.update(strings.join(''))
	return hash.digest('hex')
}

const hashCache: { [key: string]: string } = {}
const hashFile = async (file: string) => {
	if (hashCache[file] === undefined) {
		hashCache[file] = await new Promise((resolve) => {
			const hash = crypto.createHash('sha1')
			hash.setEncoding('hex')
			const fileStream = fs.createReadStream(file)
			fileStream.pipe(hash, { end: false })
			fileStream.on('end', () => {
				hash.end()
				const h = hash.read().toString()
				resolve(h)
			})
		})
	}
	return hashCache[file] as string
}

/**
 * Computes the checksum for the given files
 */
const checkSum = async (
	files: string[],
): Promise<{ [key: string]: string }> => {
	const hashes: { [key: string]: string } = {}
	await files.reduce(
		async (p, file) =>
			p.then(async () => {
				hashes[file] = await hashFile(file)
			}),
		Promise.resolve() as Promise<any>,
	)
	return hashes
}
