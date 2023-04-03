import path from 'node:path'
import { hashFolder } from './hashFolder'

describe('hashFolder', () => {
	test('should calculate correct MD5 hash value for folder with files', async () => {
		const folderPath = path.join(process.cwd(), 'docker', 'test-folder')
		const expectedMd5 = '64c0ce0d8eb5e2073bf63f26f4283aca'

		const actualMd5 = await hashFolder(folderPath)

		expect(actualMd5).toBe(expectedMd5)
	})
})
