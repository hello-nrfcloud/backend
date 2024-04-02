import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	Scope,
	getSettingsOptional,
	settingsPath,
	getSettings,
} from './settings.js'

void describe('getSettingsOptional()', () => {
	void it('should return the given default value if parameter does not exist', async () => {
		const stackConfig = getSettingsOptional<
			Record<string, string>,
			Record<string, never>
		>({
			ssm: {
				send: async () => Promise.resolve({ Parameters: undefined }),
			} as unknown as SSMClient,
			stackName: 'STACK_NAME',
			scope: Scope.STACK_CONFIG,
		})

		const result = await stackConfig({})
		assert.deepEqual(result, {})
	})
})

void describe('settingsPath()', () => {
	void it('should produce a fully qualified parameter name', () =>
		assert.equal(
			settingsPath({
				scope: Scope.STACK_CONFIG,
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
			'/hello-nrfcloud/stack/context/someProperty',
		))

	void it('should produce a fully qualified parameter name for valid string scope', () =>
		assert.equal(
			settingsPath({
				scope: 'thirdParty/elite',
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
			'/hello-nrfcloud/thirdParty/elite/someProperty',
		))

	void it('should error for invalid string scope', () => {
		assert.throws(() =>
			settingsPath({
				scope: 'invalidScope',
				stackName: 'hello-nrfcloud',
				property: 'someProperty',
			}),
		)
	})
})

void describe('getSettings()', () => {
	void it('should return the object with same scope', async () => {
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
				send: async () => Promise.resolve({ Parameters: returnedValues }),
			} as unknown as SSMClient,
			stackName: 'hello-nrfcloud',
			scope: Scope.STACK_CONFIG,
		})

		const result = await stackConfig()
		assert.deepEqual(result, {
			key1: 'value1',
			key2: 'value2',
			key3: 'value3',
		})
	})
})
