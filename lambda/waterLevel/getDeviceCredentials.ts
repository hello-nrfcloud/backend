import { getSettings } from '../../util/settings'
import { ssm } from './waterLevelLambda'

export const getDeviceCredentials = async (key: string) => {
	const credentials = getSettings({
		ssm: ssm,
		stackName: 'hello-nrfcloud-waterlevel',
		scope: key,
	})
	return await credentials()
}
