import { stat } from 'node:fs/promises'
import { run } from '../util/run.js'
import {
	deviceCertificateLocations,
	simulatorCALocations,
} from './certificates.js'
import { signDeviceCertificate } from './devices/signDeviceCertificate.js'

export const createCA = async (
	dest: string,
): Promise<{
	privateKey: string
	certificate: string
}> => {
	// CA certificate
	const certificates = simulatorCALocations(dest)

	// Create a CA private key
	try {
		await stat(certificates.certificate)
	} catch {
		await run({
			command: 'openssl',
			args: ['genrsa', '-out', certificates.privateKey, '2048'],
		})
		await run({
			command: 'openssl',
			args: [
				'req',
				'-x509',
				'-new',
				'-nodes',
				'-key',
				certificates.privateKey,
				'-sha256',
				'-days',
				'10957',
				'-out',
				certificates.certificate,
				'-subj',
				'/OU=Cellular IoT Applications Team, CN=Device Simulator',
			],
		})
	}
	return certificates
}

export const createDeviceCertificate = async ({
	dest,
	caCertificates,
	deviceId,
}: {
	dest: string
	caCertificates: {
		privateKey: string
		certificate: string
	}
	deviceId: string
}): Promise<{
	privateKey: string
	certificate: string
	CSR: string
	signedCert: string
}> => {
	const deviceCertificates = deviceCertificateLocations(dest, deviceId)

	// Device private key
	await run({
		command: 'openssl',
		args: [
			'ecparam',
			'-out',
			deviceCertificates.privateKey,
			'-name',
			'prime256v1',
			'-genkey',
		],
	})

	// Device certificate
	await run({
		command: 'openssl',
		args: [
			'req',
			'-x509',
			'-new',
			'-nodes',
			'-key',
			deviceCertificates.privateKey,
			'-sha256',
			'-days',
			'10957',
			'-out',
			deviceCertificates.certificate,
			'-subj',
			`/CN=${deviceId}`,
		],
	})

	// Create CSR
	await run({
		command: 'openssl',
		args: [
			'req',
			'-key',
			deviceCertificates.privateKey,
			'-new',
			'-out',
			deviceCertificates.CSR,
			'-subj',
			`/CN=${deviceId}`,
		],
	})

	// Sign device cert
	await signDeviceCertificate({
		dir: dest,
		deviceId,
		caCertificateLocation: caCertificates.certificate,
		caPrivateKeyLocation: caCertificates.privateKey,
	})

	return deviceCertificates
}
