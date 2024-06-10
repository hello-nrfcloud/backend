import yauzl, { type Entry } from 'yauzl'

export const readDeviceCertificates = async (
	zipFileName: string,
): Promise<Map<string, { certificate: string; fingerprint: string }>> =>
	await new Promise((resolve, reject) => {
		yauzl.open(zipFileName, { lazyEntries: true }, (err, zipfile) => {
			if (err !== null) return reject(err)

			const certs: Map<string, { certificate: string; fingerprint: string }> =
				new Map()

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
							fingerprint: string
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
							if (certs.has(groups.IMEI)) {
								throw new Error(`Duplicate IMEI: ${groups.IMEI}!`)
							}
							certs.set(groups.IMEI, {
								certificate: data,
								fingerprint: groups.fingerprint,
							})
							zipfile.readEntry()
						})
					})
				}
			})
			zipfile.readEntry()

			zipfile.on('end', () => {
				resolve(certs)
			})
		})
	})
