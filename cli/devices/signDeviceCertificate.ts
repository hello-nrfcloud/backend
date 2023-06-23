import chalk from 'chalk'
import { run } from '../../util/run.js'
import { deviceCertificateLocations } from '../certificates.js'

export const signDeviceCertificate = async ({
	dir,
	deviceId,
	caCertificateLocation,
	caPrivateKeyLocation,
}: {
	dir: string
	deviceId: string
	caCertificateLocation: string
	caPrivateKeyLocation: string
}): Promise<void> => {
	const { CSR: deviceCSRLocation, signedCert: deviceSignedCertLocation } =
		deviceCertificateLocations(dir, deviceId)

	await run({
		command: 'openssl',
		args: [
			'x509',
			'-req',
			'-CA',
			caCertificateLocation,
			'-CAkey',
			caPrivateKeyLocation,
			'-in',
			deviceCSRLocation,
			'-out',
			deviceSignedCertLocation,
			'-days',
			'10957',
		],
	})
	console.log(
		chalk.yellow(
			'Signed device certificate',
			chalk.blue(deviceSignedCertLocation),
		),
	)
	console.log(
		await run({
			command: 'openssl',
			args: ['x509', '-text', '-noout', '-in', deviceSignedCertLocation],
		}),
	)
}
