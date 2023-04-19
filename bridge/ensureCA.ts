import { IoTClient } from '@aws-sdk/client-iot'
import { mkdir, stat } from 'node:fs/promises'
import type { logFn } from '../cli/log'
import { run } from '../util/run.js'
import { ulid } from '../util/ulid.js'
import { caLocation, type CAFiles } from './caLocation.js'
import { createCAVerificationCert } from './createCAVerificationCert.js'

export const ensureCA =
	({
		certsDir,
		debug,
		iot,
	}: {
		certsDir: string
		debug?: logFn
		iot: IoTClient
	}) =>
	async (): Promise<CAFiles> => {
		try {
			await stat(certsDir)
		} catch {
			debug?.(`Creating ${certsDir}...`)
			await mkdir(certsDir, { recursive: true })
		}
		const caID = ulid()
		const caFiles = caLocation({
			certsDir,
		})
		try {
			await stat(caFiles.key)
			debug?.(`${caFiles.key} exists`)
		} catch {
			debug?.(`Generating key for CA ${caID}`)

			await run({
				command: 'openssl',
				args: ['genrsa', '-out', caFiles.key, '2048'],
				log: debug,
			})

			debug?.(`Generating certificate for CA ${caID}`)

			await run({
				command: 'openssl',
				args: [
					'req',
					'-x509',
					'-new',
					'-nodes',
					'-key',
					caFiles.key,
					'-sha256',
					'-days',
					`5000`,
					'-out',
					caFiles.cert,
					'-subj',
					`/OU=${caID}`,
				],
				log: debug,
			})

			await createCAVerificationCert({
				iot,
				certsDir,
				caCertificateFile: caFiles.cert,
				caCertificateKeyFile: caFiles.key,
				debug,
			})
		}

		return caFiles
	}
