import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { run } from '../../util/run.js'

/**
 * Allows to use OpenSSL
 */
export const handler = async (event: {
	id: string
	email: string
}): Promise<{
	key: string
	cert: string
} | null> => {
	console.log(JSON.stringify({ event }))
	const { id, email } = event
	if (id === undefined || email === undefined) {
		console.debug(`Missing email and id.`)
		return null
	}

	console.log(`Creating certificate for email ${email} and id ${id} ...`)

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), path.sep))

	await run({
		command: 'openssl',
		args: [
			'ecparam',
			'-name',
			'prime256v1',
			'-genkey',
			'-param_enc',
			'explicit',
			'-out',
			path.join(tempDir, `${id}.key`),
		],
	})

	await run({
		command: 'openssl',
		args: [
			'req',
			'-new',
			'-days',
			'10957',
			'-x509',
			'-subj',
			`/C=NO/ST=Trondelag/L=Trondheim/O=Nordic Semiconductor ASA/OU=hello.nrfcloud.com/emailAddress=${email}/CN=${id}`,
			'-key',
			path.join(tempDir, `${id}.key`),
			'-out',
			path.join(tempDir, `${id}.pem`),
		],
	})

	const key = await fs.readFile(path.join(tempDir, `${id}.key`), 'utf-8')

	const cert = await fs.readFile(path.join(tempDir, `${id}.pem`), 'utf-8')

	console.log(
		await run({
			command: 'openssl',
			args: ['x509', '-in', path.join(tempDir, `${id}.pem`), '-text', '-noout'],
		}),
	)

	return {
		key,
		cert,
	}
}
