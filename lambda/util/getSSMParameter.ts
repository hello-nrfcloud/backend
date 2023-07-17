import { type Settings } from '../../nrfcloud/settings.js'
import { Scope, settingsPath } from '../../util/settings.js'

/**
 * @see https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html
 */
export const getSSMParameter = async (
	args: Parameters<typeof settingsPath>[0],
): Promise<string | undefined> => {
	const name = settingsPath(args)
	const url = `http://localhost:${
		process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? '2773'
	}/systemsmanager/parameters/get/?${new URLSearchParams({
		name,
	}).toString()}`

	console.log(
		JSON.stringify({
			url,
		}),
	)
	try {
		const res = await fetch(url, {
			headers: {
				'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN ?? '',
			},
		})

		if (!res.ok) {
			console.error(
				`Fetching SSM Parameter ${name} failed: ${await res.text()}`,
			)
			return undefined
		}

		const {
			Parameter: { Value },
		} = await res.json()

		return Value
	} catch (err) {
		console.error(err)
		return undefined
	}
}

export const getNRFCloudSSMParameters = async (
	stackName: string,
	properties: (keyof Settings)[],
): Promise<(string | undefined)[]> =>
	Promise.all(
		properties.map(async (property) =>
			getSSMParameter({
				stackName,
				scope: Scope.NRFCLOUD_CONFIG,
				property,
			}),
		),
	)
