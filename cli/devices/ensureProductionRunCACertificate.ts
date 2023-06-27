import chalk from 'chalk'
import { stat } from 'node:fs/promises'
import { run } from '../../util/run.js'
import { productionRunCALocations } from '../certificates.js'

export const ensureProductionRunCACertificate = async (
	dir: string,
	productionRun: number,
): Promise<{
	privateKey: string
	certificate: string
}> => {
	const { privateKey, certificate } = productionRunCALocations(
		dir,
		productionRun,
	)
	try {
		await stat(certificate)
	} catch {
		// Create a CA private key
		await run({
			command: 'openssl',
			args: ['genrsa', '-out', privateKey, '2048'],
		})
		await run({
			command: 'openssl',
			args: [
				'req',
				'-x509',
				'-new',
				'-nodes',
				'-key',
				privateKey,
				'-sha256',
				'-days',
				'10957',
				'-out',
				certificate,
				'-subj',
				`/OU=Cellular IoT Applications Team, CN=Production Run ${productionRun}`,
			],
		})
	}
	console.log(
		chalk.yellow(
			`CA certificate for production run ${productionRun.toString(16)}:`,
		),
		chalk.blue(certificate),
	)
	return {
		privateKey,
		certificate,
	}
}
