import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { writeFilesFromMap } from './writeFilesFromMap.js'

void describe('writeFilesFromMap()', () => {
	void it('should read files from a map', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'writeFilesFromMap-'),
		)
		const f1 = path.join(tempDir, 'f1.txt')
		const f2 = path.join(tempDir, 'f2.txt')

		await writeFilesFromMap({
			[f1]: 'f1',
			[f2]: 'f2',
		})

		assert.equal(await fs.readFile(f1, 'utf-8'), 'f1')
		assert.equal(await fs.readFile(f2, 'utf-8'), 'f2')
	})
})
