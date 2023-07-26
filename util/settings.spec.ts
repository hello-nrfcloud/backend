import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	Scope,
	getSettingsOptional,
	settingsPath,
	getSettings,
} from './settings.js'

describe('getSettingsOptional()', () => {
	it('should return the given default value if parameter does not exist', async () => {
		const stackConfig = getSettingsOptional<
			Record<string, string>,
			Record<string, never>
		>({
			ssm: {
				send: jest.fn().mockResolvedValue({ Parameters: undefined }),
			} as unknown as SSMClient,
			stackName: 'STACK_NAME',
			scope: Scope.STACK_CONFIG,
		})

		const result = await stackConfig({})
		expect(result).toEqual({})
	})
})

describe('settingsPath()', () => {
	it('should produce a fully qualified parameter name', () =>
		expect(
			settingsPath({
				scope: Scope.STACK_CONFIG,
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
		).toEqual('/hello-nrfcloud/stack/context/someProperty'))

	it('should produce a fully qualified parameter name for valid string scope', () =>
		expect(
			settingsPath({
				scope: 'thirdParty/exeger',
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
		).toEqual('/hello-nrfcloud/thirdParty/exeger/someProperty'))

	it('should error for invalid string scope', () => {
		expect(() =>
			settingsPath({
				scope: 'invalidScope',
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
		).toThrowError()
	})
})

describe('getSettings()', () => {
	it('should return the object with same scope', async () => {
		const returnedValues = [
			{
				Name: `/hello-nrfcloud/stack/context/key1`,
				Value: 'value1',
			},
			{
				Name: `/hello-nrfcloud/stack/context/key2`,
				Value: 'value2',
			},
			{
				Name: `/hello-nrfcloud/stack/context/key3`,
				Value: 'value3',
			},
		]

		const stackConfig = getSettings({
			ssm: {
				send: jest.fn().mockResolvedValue({ Parameters: returnedValues }),
			} as unknown as SSMClient,
			stackName: 'hello-nrfcloud',
			scope: Scope.STACK_CONFIG,
		})

		const result = await stackConfig()
		expect(result).toEqual({
			key1: 'value1',
			key2: 'value2',
			key3: 'value3',
		})
	})
})
