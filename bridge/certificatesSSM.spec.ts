import {
	backupCertificatesToSSM,
	restoreCertificatesFromSSM,
} from './certificatesSSM.js'
import type { CAFiles } from './caLocation.js'
import { readFile, writeFile } from 'node:fs/promises'
import type { CertificateFiles } from './mqttBridgeCertificateLocation.js'
import { putSettings } from '../util/settings.js'

jest.mock('node:fs/promises', () => {
	return {
		readFile: jest
			.fn()
			.mockResolvedValueOnce('Content1')
			.mockResolvedValueOnce('Content2')
			.mockResolvedValueOnce('Content3'),
		writeFile: jest.fn(),
	}
})

jest.mock('../util/settings.js', () => {
	return {
		getSettingsOptional: jest.fn().mockImplementation(() =>
			jest
				.fn()
				.mockResolvedValueOnce({
					'test-prefix_key': 'Key content',
					'test-prefix_csr': 'CSR content',
					'test-prefix_cert': 'Cert content',
				})
				.mockResolvedValueOnce(null),
		),
		putSettings: jest.fn().mockImplementation(() => jest.fn()),
	}
})

describe('backupCertificatesToSSM', () => {
	let parameterNamePrefix: string
	let certificates: CAFiles | CertificateFiles

	beforeEach(() => {
		parameterNamePrefix = 'test-prefix'
		certificates = {
			key: '/path/to/key.crt',
			csr: '/path/to/csr.crt',
			cert: '/path/to/cert.crt',
		}
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	it('should backup the certificates to SSM', async () => {
		await backupCertificatesToSSM({
			ssm: jest.fn() as any,
			parameterNamePrefix,
			certificates,
		})

		expect(readFile).toHaveBeenNthCalledWith(1, '/path/to/key.crt', {
			encoding: 'utf-8',
		})
		expect(readFile).toHaveBeenNthCalledWith(2, '/path/to/csr.crt', {
			encoding: 'utf-8',
		})
		expect(readFile).toHaveBeenNthCalledWith(3, '/path/to/cert.crt', {
			encoding: 'utf-8',
		})

		const putSettingsMock = (putSettings as jest.Mock).mock
		expect(putSettingsMock.results[0]?.value).toHaveBeenCalledWith({
			property: 'test-prefix_key',
			value: 'Content1',
		})
		expect(putSettingsMock.results[1]?.value).toHaveBeenCalledWith({
			property: 'test-prefix_csr',
			value: 'Content2',
		})
		expect(putSettingsMock.results[2]?.value).toHaveBeenCalledWith({
			property: 'test-prefix_cert',
			value: 'Content3',
		})
	})
})

describe('restoreCertificatesFromSSM', () => {
	let parameterNamePrefix: string
	let certificates: CAFiles | CertificateFiles

	beforeEach(() => {
		parameterNamePrefix = 'test-prefix'
		certificates = {
			key: '/path/to/key.crt',
			csr: '/path/to/csr.crt',
			cert: '/path/to/cert.crt',
		}
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	it('should restore certificates from SSM', async () => {
		await restoreCertificatesFromSSM({
			ssm: jest.fn() as any,
			parameterNamePrefix,
			certificates,
		})

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

	// it('should not restore certificates if parameters are null', async () => {
	// 	await restoreCertificatesFromSSM({
	// 		ssm: jest.fn() as any,
	// 		parameterNamePrefix,
	// 		certificates,
	// 	})

	// 	expect(writeFile).not.toHaveBeenCalled()
	// })
})
