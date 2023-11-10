import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { checkSumOfFiles } from './checksumOfFiles.js'

void describe('checkSumOfFiles()', () => {
	void it('should calculate a checksum of files', async () =>
		assert.equal(
			await checkSumOfFiles([
				// sha1sum cdk/helpers/lambdas/test-data/1.txt
				// 6ae3f2029d36e029175cc225c2c4cda51a5ac602  cdk/helpers/lambdas/test-data/1.txt
				path.join(
					process.cwd(),
					'cdk',
					'helpers',
					'lambdas',
					'test-data',
					'1.txt',
				),
				// sha1sum cdk/helpers/lambdas/test-data/2.txt
				// 6a9c3333d7a3f9ee9fa1ef70224766fafb208fe4  cdk/helpers/lambdas/test-data/2.txt
				path.join(
					process.cwd(),
					'cdk',
					'helpers',
					'lambdas',
					'test-data',
					'2.txt',
				),
			]),
			// echo -n 6ae3f2029d36e029175cc225c2c4cda51a5ac6026a9c3333d7a3f9ee9fa1ef70224766fafb208fe4 | sha1sum
			'baa003a894945a0d2519b1f4340caa97c462058f',
		))
})
