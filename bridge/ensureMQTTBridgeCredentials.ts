import type { IoTClient } from '@aws-sdk/client-iot'
import { mkdir, stat } from 'node:fs/promises'
import type { logFn } from '../cli/log.js'
import run from '@bifravst/run'
import { ulid } from '../util/ulid.js'
import { ensureCA } from './ensureCA.js'
import {
	mqttBridgeCertificateLocation,
	type CertificateFiles,
} from './mqttBridgeCertificateLocation.js'

export const ensureMQTTBridgeCredentials =
	({
		iot,
		certsDir,
		debug,
	}: {
		iot: IoTClient
		certsDir: string
		debug?: logFn
	}) =>
	async (): Promise<CertificateFiles> => {
		try {
			await stat(certsDir)
		} catch {
			debug?.(`Creating ${certsDir}...`)
			await mkdir(certsDir, { recursive: true })
		}
		const mqttBridgeId = ulid()
		const certFiles = mqttBridgeCertificateLocation({
			certsDir,
		})
		try {
			await stat(certFiles.key)
			debug?.(`${certFiles.key} exists`)
		} catch {
			const caFiles = await ensureCA({ certsDir, debug, iot })()

			await run({
				command: 'openssl',
				args: [
					'ecparam',
					'-out',
					certFiles.key,
					'-name',
					'prime256v1',
					'-genkey',
				],
				log: debug !== undefined ? { debug, stderr: debug } : undefined,
			})

			debug?.(`Generating CSR for MQTT bridge ${mqttBridgeId}`)

			await run({
				command: 'openssl',
				args: [
					'req',
					'-new',
					'-key',
					certFiles.key,
					'-out',
					certFiles.csr,
					'-subj',
					`/CN=${mqttBridgeId}`,
				],
				log: debug !== undefined ? { debug, stderr: debug } : undefined,
			})

			debug?.(`Generating certificate for MQTT bridge ${mqttBridgeId}`)

			await run({
				command: 'openssl',
				args: [
					'x509',
					'-req',
					'-in',
					certFiles.csr,
					'-CAkey',
					caFiles.key,
					'-CA',
					caFiles.cert,
					'-CAcreateserial',
					'-out',
					certFiles.cert,
					'-days',
					`5000`,
					'-sha256',
				],
				log: debug !== undefined ? { debug, stderr: debug } : undefined,
			})
		}

		return certFiles
	}
