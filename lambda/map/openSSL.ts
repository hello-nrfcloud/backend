import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { run } from '../../util/run.js'
import {
	createCA,
	createDeviceCertificate,
} from '../../cli/createCertificate.js'

/**
 * Allows to use OpenSSL
 */
export const handler = async (event: {
	id: string
	email: string
}): Promise<{
	privateKey: string
	certificate: string
} | null> => {
	console.log(JSON.stringify({ event }))
	const { id, email } = event
	if (id === undefined || email === undefined) {
		console.debug(`Missing email and id.`)
		return null
	}

	console.log(`Creating certificate for email ${email} and id ${id} ...`)

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'certs-'))
	const caCertificates = await createCA(tempDir, 'Custom Device', email)
	const deviceCertificates = await createDeviceCertificate({
		dest: tempDir,
		caCertificates,
		deviceId: id,
	})

	console.log(
		await run({
			command: 'openssl',
			args: ['x509', '-in', deviceCertificates.signedCert, '-text', '-noout'],
		}),
	)

	const [privateKey, certificate] = (await Promise.all(
		[deviceCertificates.privateKey, deviceCertificates.signedCert].map(
			async (f) => fs.readFile(f, 'utf-8'),
		),
	)) as [string, string]

	return {
		privateKey,
		certificate,
	}
}
