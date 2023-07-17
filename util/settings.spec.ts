import type { SSMClient } from '@aws-sdk/client-ssm'
import { Scope, getSettingsOptional } from './settings.js'

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
			scope: Scope.CDK_CONTEXT,
		})

		const result = await stackConfig({})
		expect(result).toEqual({})
	})
})
