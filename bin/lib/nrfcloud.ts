import {
	GetParameterCommand,
	ParameterType,
	PutParameterCommand,
	SSMClient,
} from '@aws-sdk/client-ssm'
import needle from 'needle'
import {
	NRFCLOUD_ACCOUNT_INFO_PARAM,
	NRFCLOUD_CLIENT_CERT_PARAM,
	NRFCLOUD_CLIENT_KEY_PARAM,
	STACK_NAME,
} from '../../cdk/stacks/stackConfig'

export type CertificateCredentials = {
	clientCert: string
	privateKey: string
}

export type AccountInfo = {
	mqttEndpoint: string
	mqttTopicPrefix: string
	tenantId: string
	accountDeviceClientId: string
}

type Nullable<T> = {
	[K in keyof T]: T[K] | undefined | null
}

const SSM = new SSMClient({})

async function getAccountInfo({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: string
}): Promise<AccountInfo> {
	const accountInfo = await needle('get', `${endpoint}/v1/account`, {
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		json: true,
	})
	const tenantId = accountInfo.body.mqttTopicPrefix.split('/')[1]
	return {
		mqttEndpoint: accountInfo.body.mqttEndpoint,
		mqttTopicPrefix: accountInfo.body.mqttTopicPrefix,
		tenantId,
		accountDeviceClientId: `account-${tenantId}`,
	}
}

async function getNrfcloudCredentialsSSM(): Promise<
	Nullable<CertificateCredentials>
> {
	const nrfcloudClientCertResponse = await SSM.send(
		new GetParameterCommand({
			Name: `/${STACK_NAME}/${NRFCLOUD_CLIENT_CERT_PARAM}`,
		}),
	).catch(() => null)
	const nrfcloudClientKeyResponse = await SSM.send(
		new GetParameterCommand({
			Name: `/${STACK_NAME}/${NRFCLOUD_CLIENT_KEY_PARAM}`,
		}),
	).catch(() => null)

	return {
		clientCert: nrfcloudClientCertResponse?.Parameter?.Value,
		privateKey: nrfcloudClientKeyResponse?.Parameter?.Value,
	}
}

async function generateNrfcloudCredentials({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: string
}): Promise<CertificateCredentials> {
	const accountDevice = await needle(
		'post',
		`${endpoint}/v1/devices/account`,
		null,
		{
			json: true,
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		},
	)

	return {
		clientCert: accountDevice.body.clientCert,
		privateKey: accountDevice.body.privateKey,
	}
}

async function deleteNrfcloudCredentials({
	apiKey,
	endpoint,
}: {
	apiKey: string
	endpoint: string
}): Promise<void> {
	await needle('delete', `${endpoint}/v1/devices/account`, null, {
		json: true,
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	})
}

async function saveNrfcloudCredentialsSSM(
	credentials: CertificateCredentials,
): Promise<void> {
	await Promise.all([
		SSM.send(
			new PutParameterCommand({
				Name: `/${STACK_NAME}/${NRFCLOUD_CLIENT_CERT_PARAM}`,
				Value: credentials.clientCert,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
		SSM.send(
			new PutParameterCommand({
				Name: `/${STACK_NAME}/${NRFCLOUD_CLIENT_KEY_PARAM}`,
				Value: credentials.privateKey,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
	])
}

async function saveNrfcloudAccountInfosSSM(info: AccountInfo): Promise<void> {
	await SSM.send(
		new PutParameterCommand({
			Name: `/${STACK_NAME}/${NRFCLOUD_ACCOUNT_INFO_PARAM}`,
			Value: JSON.stringify(info),
			Type: ParameterType.STRING,
			Overwrite: true,
		}),
	)
}

async function getAccountInfoSSM(): Promise<AccountInfo> {
	const info = await SSM.send(
		new GetParameterCommand({
			Name: `/${STACK_NAME}/${NRFCLOUD_ACCOUNT_INFO_PARAM}`,
		}),
	)

	return JSON.parse(info.Parameter?.Value ?? 'null') as AccountInfo
}

export {
	getAccountInfo,
	getAccountInfoSSM,
	getNrfcloudCredentialsSSM,
	generateNrfcloudCredentials,
	deleteNrfcloudCredentials,
	saveNrfcloudCredentialsSSM,
	saveNrfcloudAccountInfosSSM,
}
