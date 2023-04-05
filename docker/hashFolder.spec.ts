import path from 'node:path'
import { hashFolder } from './hashFolder'

describe('hashFolder', () => {
	test('should calculate correct MD5 hash value for folder with files', async () => {
		const folderPath = path.join(process.cwd(), 'docker', 'test-folder')
		const expectedMd5 = '2446ef9dbaecdce8dbf59fdfb68b0f81'

		const actualMd5 = await hashFolder(folderPath)

		expect(actualMd5).toBe(expectedMd5)
	})
})
