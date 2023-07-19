import { restoreCertificatesFromSSM } from './certificatesSSM.js'
import type { CAFiles } from './caLocation.js'
import type { CertificateFiles } from './mqttBridgeCertificateLocation.js'
import { getSettingsOptional } from '../util/settings.js'

jest.mock('../util/settings.js', () => {
	const originalModule = jest.requireActual('../util/settings.js')

	return {
		...originalModule,
		putSettings: jest.fn().mockReturnValue(jest.fn()),
		getSettingsOptional: jest.fn().mockReturnValue(jest.fn()),
	}
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
			'test-prefix': {
				key: 'Key content',
				csr: 'CSR content',
				cert: 'Cert content',
			},
		})

		const writer = jest.fn()
		const restored = await restoreCertificatesFromSSM({
			ssm: jest.fn() as any,
			parameterNamePrefix,
			certificates,
			writer,
		})

		expect(restored).toBeTruthy()
		expect(writer).toHaveBeenCalledTimes(3)
		expect(writer).toHaveBeenCalledWith('/path/to/key.crt', 'Key content')
		expect(writer).toHaveBeenCalledWith('/path/to/csr.crt', 'CSR content')
		expect(writer).toHaveBeenCalledWith('/path/to/cert.crt', 'Cert content')
	})

	it('should not restore certificates if parameters are null', async () => {
		getSettingsOptionalFnMock.mockResolvedValue(null)

		const writer = jest.fn()
		const restored = await restoreCertificatesFromSSM({
			ssm: jest.fn() as any,
			parameterNamePrefix,
			certificates,
			writer,
		})

		expect(restored).toBeFalsy()
		expect(writer).not.toHaveBeenCalled()
	})
})
