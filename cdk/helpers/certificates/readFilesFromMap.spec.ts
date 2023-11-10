import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { readFilesFromMap } from './readFilesFromMap.js'

void describe('readFilesFromMap()', () => {
	void it('should read files from a map', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'readfilesfrommap-'),
		)
		const f1 = path.join(tempDir, 'f1.txt')
		const f2 = path.join(tempDir, 'f2.txt')
		await fs.writeFile(f1, 'f1', 'utf-8')
		await fs.writeFile(f2, 'f2', 'utf-8')

		assert.deepEqual(
			await readFilesFromMap({
				f1,
				f2,
			}),
			{
				f1: 'f1',
				f2: 'f2',
			},
		)
	})
})
