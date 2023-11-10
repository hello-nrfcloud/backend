import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
	ParameterType,
	type GetParametersByPathCommandOutput,
} from '@aws-sdk/client-ssm'
import { restoreCertificateFromSSM } from './restoreCertificateFromSSM.js'
import { Scope } from '../../../util/settings.js'
import { caLocation } from '../../../bridge/caLocation.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { readFilesFromMap } from './readFilesFromMap.js'
import { arrayContaining, check, objectMatching } from 'tsmatchers'
import { assertCall } from '../../../util/test/assertCall.js'

void describe('restoreCertificateFromSSM()', () => {
	void it('should query SSM for stored certificates, but not restored if value is not present', async () => {
		const result: GetParametersByPathCommandOutput = {
			Parameters: undefined,
			$metadata: {},
		}
		const send = mock.fn(async () => Promise.resolve(result))

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'restoreCertificateFromSSM-'),
		)

		const res = await restoreCertificateFromSSM({
			ssm: { send } as any,
			stackName: 'hello-nrfcloud',
		})(
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT'
			caLocation({
				certsDir: tempDir,
			}),
		)

		assert.equal(res, false)

		assertCall(send, {
			input: {
				Path: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT`,
				Recursive: true,
			},
		})
	})

	void it('should not restore if value is incomplete', async () => {
		const result: GetParametersByPathCommandOutput = {
			Parameters: [
				{
					Type: ParameterType.STRING,
					Name: 'invalidName',
					Value: 'invalidValue',
				},
			],
			$metadata: {},
		}
		const send = mock.fn(async () => Promise.resolve(result))

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'restoreCertificateFromSSM-'),
		)

		const res = await restoreCertificateFromSSM({
			ssm: {
				send,
			} as any,
			stackName: 'hello-nrfcloud',
		})(
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT'
			caLocation({
				certsDir: tempDir,
			}),
		)

		assert.equal(res, false)

		assertCall(send, {
			input: {
				Path: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT`,
				Recursive: true,
			},
		})
	})

	void it('should restore if value in SSM is complete', async () => {
		const result: GetParametersByPathCommandOutput = {
			Parameters: ['key', 'cert', 'verificationCert'].map((Name) => ({
				Type: ParameterType.STRING,
				Name,
				Value: `Content of ${Name}`,
			})),
			$metadata: {},
		}
		const send = mock.fn(async () => Promise.resolve(result))

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'restoreCertificateFromSSM-'),
		)

		const certsMap = caLocation({
			certsDir: tempDir,
		})
		const res = await restoreCertificateFromSSM({
			ssm: {
				send,
			} as any,
			stackName: 'hello-nrfcloud',
		})(
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT'
			certsMap,
		)

		assert.equal(res, true)

		const callArgs = send.mock.calls.map(
			(call) => ((call?.arguments ?? []) as unknown[])[0],
		)

		check(callArgs).is(
			arrayContaining(
				objectMatching({
					input: {
						Path: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT`,
						Recursive: true,
					},
				}),
			),
		)

		assert.deepEqual(await readFilesFromMap(certsMap), {
			key: `Content of key`,
			cert: `Content of cert`,
			verificationCert: `Content of verificationCert`,
		})
	})
})
