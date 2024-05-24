import type { IoTClient } from '@aws-sdk/client-iot'
import { GetRegistrationCodeCommand } from '@aws-sdk/client-iot'
import { randomUUID } from 'crypto'
import { unlink } from 'fs/promises'
import path from 'path'
import { type logFn } from '../cli/log.js'
import run from '@bifravst/run'
import { caLocation } from './caLocation.js'

export const createCAVerificationCert = async ({
	iot,
	certsDir,
	caCertificateFile,
	caCertificateKeyFile,
	debug,
}: {
	certsDir: string
	iot: IoTClient
	caCertificateFile: string
	caCertificateKeyFile: string
	debug?: logFn
}): Promise<void> => {
	const verificationCertId = randomUUID()
	const verificationKeyFile = path.join(certsDir, `${verificationCertId}.key`)
	const csrFile = path.join(certsDir, `${verificationCertId}.csr`)
	const caFiles = caLocation({ certsDir })

	await run({
		command: 'openssl',
		args: ['genrsa', '-out', verificationKeyFile, '2048'],
		log: { debug },
	})

	const registrationCode = await iot
		.send(new GetRegistrationCodeCommand({}))
		.then(({ registrationCode }) => registrationCode)

	debug?.('CA Registration code', registrationCode)

	await run({
		command: 'openssl',
		args: [
			'req',
			'-new',
			'-key',
			verificationKeyFile,
			'-out',
			csrFile,
			'-subj',
			`/CN=${registrationCode}`,
		],
		log: { debug },
	})

	await run({
		command: 'openssl',
		args: [
			'x509',
			'-req',
			'-in',
			csrFile,
			'-CA',
			caCertificateFile,
			'-CAkey',
			caCertificateKeyFile,
			'-CAcreateserial',
			'-out',
			caFiles.verificationCert,
			'-days',
			`1`,
			'-sha256',
		],
		log: { debug },
	})

	await Promise.all([unlink(verificationKeyFile), unlink(csrFile)])
}
