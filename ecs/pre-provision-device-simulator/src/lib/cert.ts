import { randomUUID } from 'crypto'
import { execa } from 'execa'
import { rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'

type StringBuffer = string | Buffer

const openssl = async (...args: readonly string[]): Promise<StringBuffer> => {
	const { stdout } = await execa('openssl', args)
	return stdout
}
const saveToTempDir = (data: StringBuffer): string => {
	const keyFile = resolve(tmpdir(), randomUUID())
	writeFileSync(keyFile, data)

	return keyFile
}
const removeFromTempDir = (file: string): void => {
	rmSync(file, { force: true })
}

async function getCACertificate(): Promise<{
	key: StringBuffer
	cert: StringBuffer
}> {
	const key = await openssl('genrsa', '2048')
	const keyFile = saveToTempDir(key)

	const cert = await openssl(
		'req',
		'-x509',
		'-new',
		'-nodes',
		'-sha256',
		'-days',
		'30',
		'-subj',
		'/OU=nRF Cloud Devices (Development)',
		'-key',
		keyFile,
	)

	removeFromTempDir(keyFile)
	return {
		key,
		cert,
	}
}

async function generateDeviceCertificate(
	caKey: StringBuffer,
	caCert: StringBuffer,
): Promise<{
	imei: string
	key: StringBuffer
	cert: StringBuffer
	signed: StringBuffer
}> {
	const imei = `3566642${Math.floor(1e7 + Math.random() * (1e7 - 1))}`
	const key = await openssl('ecparam', '-name', 'prime256v1', '-genkey')
	const keyFile = saveToTempDir(key)

	const cert = await openssl(
		'req',
		'-x509',
		'-new',
		'-nodes',
		'-sha256',
		'-days',
		'10680',
		'-subj',
		`/CN=${imei}`,
		'-key',
		keyFile,
	)

	const csr = await openssl(
		'req',
		'-new',
		'-subj',
		`/CN=${imei}`,
		'-key',
		keyFile,
	)
	const csrFile = saveToTempDir(csr)
	const caKeyFile = saveToTempDir(caKey)
	const caCertFile = saveToTempDir(caCert)
	const signed = await openssl(
		'x509',
		'-req',
		'-CAkey',
		caKeyFile,
		'-CA',
		caCertFile,
		'-in',
		csrFile,
	)

	removeFromTempDir(keyFile)
	removeFromTempDir(csrFile)
	removeFromTempDir(caKeyFile)
	removeFromTempDir(caCertFile)
	return {
		imei,
		key,
		cert,
		signed,
	}
}

export { getCACertificate, generateDeviceCertificate }
