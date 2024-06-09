import { isFingerprint } from '@hello.nrfcloud.com/proto/fingerprint'
import { readFile } from 'node:fs/promises'
import { isIMEI } from './commands/import-devices.js'
import yauzl, { type Entry } from 'yauzl'
import { isString } from 'lodash-es'
import chalk from 'chalk'

const devicesList = (
	await readFile(process.argv[process.argv.length - 2]!, 'utf-8')
)
	.trim()
	.split('\r\n')
	.map((s) => s.split(','))
	.slice(1)
	.map(([, model, , IMEI, , fingerprint, ,], n) => {
		if (!isFingerprint(fingerprint))
			throw new Error(`Invalid fingerprint: ${fingerprint} in line ${n}!`)
		if (!isIMEI(IMEI)) throw new Error(`Invalid IMEI: ${IMEI} in line ${n}!`)
		if (!isString(model))
			throw new Error(`Invalid model: ${model} in line ${n}!`)
		return {
			model,
			IMEI,
			fingerprint,
		}
	})
	.reduce<Map<string, { model: string; fingerprint: string }>>(
		(acc, device) => {
			acc.set(device.IMEI, {
				model: device.model,
				fingerprint: device.fingerprint,
			})
			return acc
		},
		new Map(),
	)

console.log(chalk.blue(`Found ${devicesList.size} devices in the list.`))

const deviceCertificates = await new Promise<Map<string, string>>(
	(resolve, reject) => {
		yauzl.open(
			process.argv[process.argv.length - 1]!,
			{ lazyEntries: true },
			(err, zipfile) => {
				if (err !== null) return reject(err)

				const certs: Map<string, string> = new Map()

				zipfile.on('entry', (entry: Entry) => {
					if (entry.fileName.endsWith('/')) {
						// Directory
						zipfile.readEntry()
					} else {
						if (entry.fileName.includes('/generated/') === false) {
							zipfile.readEntry()
							return
						}
						const filename = entry.fileName.split('/').pop()!
						const groups =
							/^(?<model>PCA[0-9]+)_(?<hwVersion>[0-9]+\.[0-9]+\.[0-9]+)_(?<IMEI>[0-9]+)_(?<CA>.+)_#(?<fingerprint>[^#]+)#\.signed\.cert/.exec(
								filename,
							)?.groups as {
								IMEI: string
							}
						if (groups === undefined) {
							return reject(new Error(`Failed to parse filename: ${filename}!`))
						}
						// file entry
						zipfile.openReadStream(entry, (err, readStream) => {
							if (err !== null) return reject(err)

							let data = ''
							readStream.on('data', (chunk) => {
								data += chunk
							})

							readStream.on('end', () => {
								certs.set(groups.IMEI, data)
								zipfile.readEntry()
							})
						})
					}
				})
				zipfile.readEntry()

				zipfile.on('end', () => {
					resolve(certs)
				})
			},
		)
	},
)

let hasAllCertificates = true
for (const [IMEI, { model, fingerprint }] of devicesList.entries()) {
	if (!deviceCertificates.has(IMEI)) {
		console.error(
			chalk.red(
				`Missing certificate for device ${IMEI} (${model}, ${fingerprint})!`,
			),
		)
		hasAllCertificates = false
	}
}
if (!hasAllCertificates) process.exit(1)

console.log(chalk.green(`All devices have certificates.`))
