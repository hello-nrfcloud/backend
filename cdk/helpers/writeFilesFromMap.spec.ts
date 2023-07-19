import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { writeFilesFromMap } from './writeFilesFromMap.js'

describe('writeFilesFromMap()', () => {
	it('should read files from a map', async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'writeFilesFromMap-'),
		)
		const f1 = path.join(tempDir, 'f1.txt')
		const f2 = path.join(tempDir, 'f2.txt')

		await writeFilesFromMap({
			[f1]: 'f1',
			[f2]: 'f2',
		})

		expect(await fs.readFile(f1, 'utf-8')).toEqual('f1')
		expect(await fs.readFile(f2, 'utf-8')).toEqual('f2')
	})
})
