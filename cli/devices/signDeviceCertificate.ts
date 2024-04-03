import run from '@bifravst/run'
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
}
