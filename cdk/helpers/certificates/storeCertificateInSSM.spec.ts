import { ParameterType, type SSMClient } from '@aws-sdk/client-ssm'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it, mock } from 'node:test'
import { arrayContaining, check, objectMatching } from 'tsmatchers'
import { caLocation } from '../../../bridge/caLocation.js'
import { ScopeContexts } from '../../../settings/scope.js'
import { storeCertificateInSSM } from './storeCertificateInSSM.js'
import { writeFilesFromMap } from './writeFilesFromMap.js'

void describe('storeCertificateInSSM()', () => {
	void it('should store a certificate map in SSM', async () => {
		const send = mock.fn(async () => Promise.resolve())
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
			ScopeContexts.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT',
			certsMap,
		)

		assert.equal(send.mock.callCount(), 3)

		const callArgs = send.mock.calls.map(
			(call) => ((call?.arguments ?? []) as unknown[])[0],
		)

		check(callArgs).is(
			arrayContaining(
				objectMatching({
					input: {
						Name: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT/cert`,
						Type: ParameterType.STRING,
						Value: 'Contents of CA.cert',
						Overwrite: true,
					},
				}),
			),
		)

		check(callArgs).is(
			arrayContaining(
				objectMatching({
					input: {
						Name: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT/key`,
						Type: ParameterType.STRING,
						Value: 'Contents of CA.key',
						Overwrite: true,
					},
				}),
			),
		)

		check(callArgs).is(
			arrayContaining(
				objectMatching({
					input: {
						Name: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT/verificationCert`,
						Type: ParameterType.STRING,
						Value: 'Contents of CA.verification.cert',
						Overwrite: true,
					},
				}),
			),
		)
	})
})
