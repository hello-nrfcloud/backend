import {
	ParameterType,
	type GetParametersByPathCommandOutput,
	type SSMClient,
} from '@aws-sdk/client-ssm'
import { restoreCertificateFromSSM } from './restoreCertificateFromSSM.js'
import { Scope } from '../../../util/settings.js'
import { caLocation } from '../../../bridge/caLocation.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { readFilesFromMap } from './readFilesFromMap.js'

describe('restoreCertificateFromSSM()', () => {
	it('should query SSM for stored certificates, but not restored if value is not present', async () => {
		const result: GetParametersByPathCommandOutput = {
			Parameters: undefined,
			$metadata: {},
		}
		const send = jest.fn(async () => Promise.resolve(result))
		const ssm: SSMClient = {
			send,
		} as any

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'restoreCertificateFromSSM-'),
		)

		const res = await restoreCertificateFromSSM({
			ssm,
			stackName: 'hello-nrfcloud',
		})(
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT'
			caLocation({
				certsDir: tempDir,
			}),
		)

		expect(res).toEqual(false)

		expect(send).toHaveBeenLastCalledWith(
			expect.objectContaining({
				input: {
					Path: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT`,
					Recursive: true,
				},
			}),
		)
	})

	it('should not restore if value is incomplete', async () => {
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
		const send = jest.fn(async () => Promise.resolve(result))
		const ssm: SSMClient = {
			send,
		} as any

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'restoreCertificateFromSSM-'),
		)

		const res = await restoreCertificateFromSSM({
			ssm,
			stackName: 'hello-nrfcloud',
		})(
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT'
			caLocation({
				certsDir: tempDir,
			}),
		)

		expect(res).toEqual(false)

		expect(send).toHaveBeenLastCalledWith(
			expect.objectContaining({
				input: {
					Path: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT`,
					Recursive: true,
				},
			}),
		)
	})

	it('should restore if value in SSM is complete', async () => {
		const result: GetParametersByPathCommandOutput = {
			Parameters: ['key', 'cert', 'verificationCert'].map((Name) => ({
				Type: ParameterType.STRING,
				Name,
				Value: `Content of ${Name}`,
			})),
			$metadata: {},
		}
		const send = jest.fn(async () => Promise.resolve(result))
		const ssm: SSMClient = {
			send,
		} as any

		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), 'restoreCertificateFromSSM-'),
		)

		const certsMap = caLocation({
			certsDir: tempDir,
		})
		const res = await restoreCertificateFromSSM({
			ssm,
			stackName: 'hello-nrfcloud',
		})(
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT, // 'nRFCloudBridgeCertificate/MQTT'
			certsMap,
		)

		expect(res).toEqual(true)

		expect(send).toHaveBeenLastCalledWith(
			expect.objectContaining({
				input: {
					Path: `/hello-nrfcloud/nRFCloudBridgeCertificate/MQTT`,
					Recursive: true,
				},
			}),
		)

		expect(await readFilesFromMap(certsMap)).toMatchObject({
			key: `Content of key`,
			cert: `Content of cert`,
			verificationCert: `Content of verificationCert`,
		})
	})
})
