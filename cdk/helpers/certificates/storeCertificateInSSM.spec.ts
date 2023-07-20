import { ParameterType, type SSMClient } from '@aws-sdk/client-ssm'
import { Scope } from '../../../util/settings.js'
import { caLocation } from '../../../bridge/caLocation.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { writeFilesFromMap } from './writeFilesFromMap.js'
import { storeCertificateInSSM } from './storeCertificateInSSM.js'

describe('storeCertificateInSSM()', () => {
	it('should store a certificate map in SSM', async () => {
		const send = jest.fn(async () => Promise.resolve())
		const ssm: SSMClient = {
			send,
		} as any
		const certsDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'restoreCertificateFromSSM-'),
		)
		const certsMap = caLocation({
			certsDir,
		})
		await writeFilesFromMap({
			[path.join(certsDir, 'CA.key')]: 'Contents of CA.key',
			[path.join(certsDir, 'CA.cert')]: 'Contents of CA.cert',
			[path.join(certsDir, 'CA.verification.cert')]:
				'Contents of CA.verification.cert',
		})

		await storeCertificateInSSM({ ssm, stackName: 'hello-nrfcloud' })(
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT',
			certsMap,
		)

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					Name: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT/cert`,
					Type: ParameterType.STRING,
					Value: 'Contents of CA.cert',
					Overwrite: true,
				},
			}),
		)

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					Name: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT/key`,
					Type: ParameterType.STRING,
					Value: 'Contents of CA.key',
					Overwrite: true,
				},
			}),
		)

		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					Name: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT/verificationCert`,
					Type: ParameterType.STRING,
					Value: 'Contents of CA.verification.cert',
					Overwrite: true,
				},
			}),
		)
	})
})
