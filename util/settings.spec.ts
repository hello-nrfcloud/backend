import type { SSMClient } from '@aws-sdk/client-ssm'
import { Scope, getSettingsOptional, settingsPath } from './settings.js'

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
