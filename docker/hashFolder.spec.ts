import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { hashFile, hashFolder, hashStrings } from './hashFolder.js'

void describe('hashFolder', () => {
	void it('should calculate correct MD5 hash value for folder with files', async () => {
		const folderPath = path.join(process.cwd(), 'docker', 'test-folder')
		const expectedMd5 = '2446ef9dbaecdce8dbf59fdfb68b0f81'
		const actualMd5 = await hashFolder(folderPath)
		assert.equal(actualMd5, expectedMd5)
	})
})

void describe('hashStrings', () => {
	void it('should calculate correct MD5 hash value for array of strings', async () => {
		const expectedMd5 = 'beff3fcba56f29677c5d52b843df365e'
		const data = ['test1', 'test2']

		const actualMd5 = hashStrings(data)
		assert.equal(actualMd5, expectedMd5)
	})

	void it('should calculate correct MD5 hash value for empty array', async () => {
		const expectedMd5 = 'd41d8cd98f00b204e9800998ecf8427e'
		const data: string[] = []

		const actualMd5 = hashStrings(data)
		assert.equal(actualMd5, expectedMd5)
	})
})

void describe('hasFile', () => {
	void it('should return correct file MD5 hash', async () => {
		const expectedMd5 = '35fd70b6138a64d64c376a6549d6bf57'

		const filePath = path.join(
			process.cwd(),
			'docker',
			'test-folder',
			'test.txt',
		)
		const actualMd5 = await hashFile(filePath)
		assert.equal(actualMd5, expectedMd5)
	})
})
