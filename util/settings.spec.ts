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
})

describe('getSettings()', () => {
	it('should return the object with same scope', async () => {
		const returnedValues = [
			{
				Name: `/${'STACK_NAME'}/${Scope.STACK_CONFIG}/key1`,
				Value: 'value1',
			},
			{
				Name: `/${'STACK_NAME'}/${Scope.STACK_CONFIG}/key2`,
				Value: 'value2',
			},
			{
				Name: `/${'STACK_NAME'}/${Scope.STACK_CONFIG}/key3`,
				Value: 'value3',
			},
		]

		const stackConfig = getSettings({
			ssm: {
				send: jest.fn().mockResolvedValue({ Parameters: returnedValues }),
			} as unknown as SSMClient,
			stackName: 'STACK_NAME',
			scope: Scope.STACK_CONFIG,
		})

		const result = await stackConfig()
		expect(result).toEqual({
			key1: 'value1',
			key2: 'value2',
			key3: 'value3',
		})
	})

	it('should return the nested value if parameters in the same scope contain slash', async () => {
		const returnedValues = [
			{
				Name: `/${'STACK_NAME'}/${Scope.STACK_CONFIG}/group1/key1`,
				Value: 'value1',
			},
			{
				Name: `/${'STACK_NAME'}/${Scope.STACK_CONFIG}/group1/key2`,
				Value: 'value2',
			},
			{
				Name: `/${'STACK_NAME'}/${Scope.STACK_CONFIG}/group2/key1`,
				Value: 'value3',
			},
			{
				Name: `/${'STACK_NAME'}/${Scope.STACK_CONFIG}/group3`,
				Value: 'value4',
			},
		]

		const stackConfig = getSettings({
			ssm: {
				send: jest.fn().mockResolvedValue({ Parameters: returnedValues }),
			} as unknown as SSMClient,
			stackName: 'STACK_NAME',
			scope: Scope.STACK_CONFIG,
		})

		const result = await stackConfig()
		expect(result).toEqual({
			group1: { key1: 'value1', key2: 'value2' },
			group2: { key1: 'value3' },
			group3: 'value4',
		})
	})
})
