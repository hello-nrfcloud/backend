import {
	backupCertificatesToSSM,
	restoreCertificatesFromSSM,
} from './certificatesSSM.js'
import type { CAFiles } from './caLocation.js'
import { readFile, writeFile } from 'node:fs/promises'
import type { CertificateFiles } from './mqttBridgeCertificateLocation.js'
import { putSettings, getSettingsOptional } from '../util/settings.js'

jest.mock('../util/settings.js', () => ({
	putSettings: jest.fn().mockReturnValue(jest.fn()),
	getSettingsOptional: jest.fn().mockReturnValue(jest.fn()),
}))
jest.mock('node:fs/promises')

describe('backupCertificatesToSSM', () => {
	let parameterNamePrefix: string
	let certificates: CAFiles | CertificateFiles
	const putSettingsFnMock = jest.fn()

	beforeEach(() => {
		parameterNamePrefix = 'test-prefix'
		certificates = {
			key: '/path/to/key.crt',
			csr: '/path/to/csr.crt',
			cert: '/path/to/cert.crt',
		}
		;(putSettings as jest.Mock).mockReturnValue(putSettingsFnMock)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	it('should backup the certificates to SSM', async () => {
		;(readFile as jest.Mock)
			.mockResolvedValueOnce('Content1')
			.mockResolvedValueOnce('Content2')
			.mockResolvedValueOnce('Content3')

		await backupCertificatesToSSM({
			ssm: jest.fn() as any,
			parameterNamePrefix,
			certificates,
		})

		expect(readFile).toHaveBeenCalledWith('/path/to/key.crt', {
			encoding: 'utf-8',
		})
		expect(readFile).toHaveBeenCalledWith('/path/to/csr.crt', {
			encoding: 'utf-8',
		})
		expect(readFile).toHaveBeenCalledWith('/path/to/cert.crt', {
			encoding: 'utf-8',
		})

		expect(putSettingsFnMock).toHaveBeenCalledWith({
			property: 'test-prefix_key',
			value: 'Content1',
		})
		expect(putSettingsFnMock).toHaveBeenCalledWith({
			property: 'test-prefix_csr',
			value: 'Content2',
		})
		expect(putSettingsFnMock).toHaveBeenCalledWith({
			property: 'test-prefix_cert',
			value: 'Content3',
		})
	})
})

describe('restoreCertificatesFromSSM', () => {
	let parameterNamePrefix: string
	let certificates: CAFiles | CertificateFiles
	const getSettingsOptionalFnMock = jest.fn()

	beforeEach(() => {
		parameterNamePrefix = 'test-prefix'
		certificates = {
			key: '/path/to/key.crt',
			csr: '/path/to/csr.crt',
			cert: '/path/to/cert.crt',
		}
		;(getSettingsOptional as jest.Mock).mockReturnValue(
			getSettingsOptionalFnMock,
		)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	it('should restore certificates from SSM', async () => {
		getSettingsOptionalFnMock.mockResolvedValue({
			'test-prefix_key': 'Key content',
			'test-prefix_csr': 'CSR content',
			'test-prefix_cert': 'Cert content',
		})

		const restored = await restoreCertificatesFromSSM({
			ssm: jest.fn() as any,
			parameterNamePrefix,
			certificates,
		})

		expect(restored).toBeTruthy()
		expect(writeFile).toHaveBeenCalledTimes(3)
		expect(writeFile).toHaveBeenCalledWith('/path/to/key.crt', 'Key content', {
			encoding: 'utf-8',
		})
		expect(writeFile).toHaveBeenCalledWith('/path/to/csr.crt', 'CSR content', {
			encoding: 'utf-8',
		})
		expect(writeFile).toHaveBeenCalledWith(
			'/path/to/cert.crt',
			'Cert content',
			{
				encoding: 'utf-8',
			},
		)
	})

	it('should not restore certificates if parameters are null', async () => {
		getSettingsOptionalFnMock.mockResolvedValue(null)

		const restored = await restoreCertificatesFromSSM({
			ssm: jest.fn() as any,
			parameterNamePrefix,
			certificates,
		})

		expect(restored).toBeFalsy()
		expect(writeFile).not.toHaveBeenCalled()
	})
})
