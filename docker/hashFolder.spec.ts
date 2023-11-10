import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { hashFolder, hashStrings } from './hashFolder.js'

void describe('hashFolder', () => {
	void it('should calculate correct MD5 hash value for folder with files', async () => {
		const folderPath = path.join(process.cwd(), 'docker', 'test-folder')
		const expectedMd5 = '2446ef9dbaecdce8dbf59fdfb68b0f81'
		const actualMd5 = await hashFolder(folderPath)
		assert.equal(actualMd5, expectedMd5)
	})
})

describe('hashStrings', () => {
	test('should calculate correct MD5 hash value for array of strings', async () => {
		const expectedMd5 = 'beff3fcba56f29677c5d52b843df365e'
		const data = ['test1', 'test2']

		const actualMd5 = hashStrings(data)
		expect(actualMd5).toBe(expectedMd5)
	})

	test('should calculate correct MD5 hash value for empty array', async () => {
		const expectedMd5 = 'd41d8cd98f00b204e9800998ecf8427e'
		const data: string[] = []

		const actualMd5 = hashStrings(data)
		expect(actualMd5).toBe(expectedMd5)
	})
})
