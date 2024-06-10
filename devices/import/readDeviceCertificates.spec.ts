import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { readDeviceCertificates } from './readDeviceCertificates.js'

void describe('readDeviceCertificates()', () => {
	void it('should return a map of certificates', async () => {
		const certs = await readDeviceCertificates(
			path.join(process.cwd(), 'devices', 'import', 'testdata', 'test.zip'),
		)

		assert.deepEqual(
			certs,
			new Map([
				[
					'355066600000001',
					{
						certificate:
							'-----BEGIN CERTIFICATE-----\n' +
							'MIICqzCCAZMCFG9IoXJW7nl4voWun34WtDBTYpHvMA0GCSqGSIb3DQEBCwUAMGcx\n' +
							'42\n' +
							'CqDIci37jYzXd0wbZdBG\n' +
							'-----END CERTIFICATE-----\n',
						fingerprint: '974.test42',
					},
				],
				[
					'355066600000002',
					{
						certificate:
							'-----BEGIN CERTIFICATE-----\n' +
							'MIICqzCCAZMCFCHU+gjxjn/jZa/JYCapK1DWlmvCMA0GCSqGSIb3DQEBCwUAMGcx\n' +
							'43\n' +
							'ckTN2yqQoWDYoQeyth6B\n' +
							'-----END CERTIFICATE-----\n',
						fingerprint: '971.test43',
					},
				],
				[
					'355066600000003',
					{
						certificate:
							'-----BEGIN CERTIFICATE-----\n' +
							'MIICqzCCAZMCFAdCndJPPb2HPr2URC0PsaG8nnqWMA0GCSqGSIb3DQEBCwUAMGcx\n' +
							'44\n' +
							'EZ4Ny1KBq0sBs0shQffX\n' +
							'-----END CERTIFICATE-----\n',
						fingerprint: '971.test44',
					},
				],
			]),
		)
	})
})
