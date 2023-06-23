import type { Environment } from 'aws-cdk-lib'
import { mkdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Provide the directory to store certificates
 */
export const ensureCertificateDir = (env: Required<Environment>): string => {
	const dirName = path.join(
		process.cwd(),
		'certificates',
		`${env.account}@${env.region}`,
	)
	try {
		statSync(dirName)
	} catch {
		mkdirSync(dirName, { recursive: true })
	}
	return dirName
}

export const simulatorCALocations = (
	certificatesDir: string,
): {
	privateKey: string
	certificate: string
} => ({
	privateKey: path.join(certificatesDir, 'simulator.CA.key'),
	certificate: path.join(certificatesDir, 'simulator.CA.pem'),
})

export const productionRunCALocations = (
	certificatesDir: string,
	productionRun: number,
): {
	privateKey: string
	certificate: string
} => ({
	privateKey: path.join(
		certificatesDir,
		`production-${productionRun.toString(16)}.CA.key`,
	),
	certificate: path.join(
		certificatesDir,
		`production-${productionRun.toString(16)}.CA.pem`,
	),
})

export const deviceCertificateLocations = (
	certificatesDir: string,
	deviceId: string,
): {
	privateKey: string
	certificate: string
	CSR: string
	signedCert: string
} => ({
	privateKey: path.join(certificatesDir, `${deviceId}.key`),
	certificate: path.join(certificatesDir, `${deviceId}.pem`),
	CSR: path.join(certificatesDir, `${deviceId}.csr`),
	signedCert: path.join(certificatesDir, `${deviceId}.signed.pem`),
})
