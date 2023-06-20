import { type Settings } from '../../nrfcloud/settings.js'
import { settingsPath } from '../../util/settings.js'

/**
 * @see https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html
 */
export const getSSMParameter = async (
	args: Parameters<typeof settingsPath>[0],
): Promise<string | undefined> => {
	const url = `http://localhost:${
		process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? '2773'
	}/systemsmanager/parameters/get/?${new URLSearchParams({
		name: settingsPath(args),
	}).toString()}`

	console.log(
		JSON.stringify({
			url,
		}),
	)
	return fetch(url, {
		headers: {
			'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN ?? '',
		},
	})
		.then<{
			Parameter: {
				Value: string
			}
		}>(async (res) => {
			console.log(
				JSON.stringify({
					res: {
						status: res.status,
					},
				}),
			)
			if (res.ok !== true) throw new Error(`HTTP status: ${res.status}`)

			return res.json()
		})
		.then(async (payload) => {
			console.log(
				JSON.stringify({
					payload,
				}),
			)
			return payload.Parameter.Value
		})
		.catch((err) => {
			console.error(err)
			return undefined
		})
}

export const getNRFCloudSSMParameters = async (
	stackName: string,
	properties: (keyof Settings)[],
): Promise<(string | undefined)[]> =>
	Promise.all(
		properties.map(async (property) =>
			getSSMParameter({
				stackName,
				scope: 'thirdParty',
				system: 'nrfcloud',
				property,
			}),
		),
	)
