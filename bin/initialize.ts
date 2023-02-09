import {
	AttachPolicyCommand,
	CreateKeysAndCertificateCommand,
	CreatePolicyCommand,
	DescribeEndpointCommand,
	IoTClient,
} from '@aws-sdk/client-iot'
import {
	GetParameterCommand,
	ParameterType,
	PutParameterCommand,
	SSMClient,
} from '@aws-sdk/client-ssm'
import { randomUUID } from 'crypto'
import needle from 'needle'
import {
	IOT_CERT_PARAM,
	IOT_ENDPOINT_PARAM,
	IOT_KEY_PARAM,
	NRFCLOUD_ACCOUNT_INFO_PARAM,
	NRFCLOUD_CLIENT_CERT_PARAM,
	NRFCLOUD_CLIENT_KEY_PARAM,
} from '../cdk/stacks/stackConfig'

type CliInput = {
	apiKey: string
	reset: boolean
	endpoint: string
}

type CertificateCredentials = {
	clientCert: string
	privateKey: string
}

type AccountInfo = {
	mqttEndpoint: string
	mqttTopicPrefix: string
	tenantId: string
	accountDeviceClientId: string
}

type Nullable<T> = {
	[K in keyof T]: T[K] | undefined | null
}

const Iot = new IoTClient({})
const SSM = new SSMClient({})

async function getAccountInfo({
	apiKey,
	endpoint,
}: CliInput): Promise<AccountInfo> {
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

async function getIoTEndpoint(): Promise<string | undefined> {
	const result = await Iot.send(
		new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }),
	)

	return result.endpointAddress
}

async function getNrfcloudCredentialsSSM(): Promise<
	Nullable<CertificateCredentials>
> {
	const nrfcloudClientCertResponse = await SSM.send(
		new GetParameterCommand({
			Name: NRFCLOUD_CLIENT_CERT_PARAM,
		}),
	).catch(() => null)
	const nrfcloudClientKeyResponse = await SSM.send(
		new GetParameterCommand({
			Name: NRFCLOUD_CLIENT_KEY_PARAM,
		}),
	).catch(() => null)

	return {
		clientCert: nrfcloudClientCertResponse?.Parameter?.Value,
		privateKey: nrfcloudClientKeyResponse?.Parameter?.Value,
	}
}

async function generateNrfcloudCredentials(
	input: CliInput,
): Promise<CertificateCredentials> {
	const accountDevice = await needle(
		'post',
		`${input.endpoint}/v1/devices/account`,
		null,
		{
			json: true,
			headers: {
				Authorization: `Bearer ${input.apiKey}`,
			},
		},
	)

	return {
		clientCert: accountDevice.body.clientCert,
		privateKey: accountDevice.body.privateKey,
	}
}

async function deleteNrfcloudCredentials(input: CliInput): Promise<void> {
	await needle('delete', `${input.endpoint}/v1/devices/account`, null, {
		json: true,
		headers: {
			Authorization: `Bearer ${input.apiKey}`,
		},
	})
}

async function saveNrfcloudCredentialsSSM(credentials: CertificateCredentials) {
	await Promise.all([
		SSM.send(
			new PutParameterCommand({
				Name: NRFCLOUD_CLIENT_CERT_PARAM,
				Value: credentials.clientCert,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
		SSM.send(
			new PutParameterCommand({
				Name: NRFCLOUD_CLIENT_KEY_PARAM,
				Value: credentials.privateKey,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
	])
}

async function saveNrfcloudAccountInfosSSM(info: AccountInfo) {
	await SSM.send(
		new PutParameterCommand({
			Name: NRFCLOUD_ACCOUNT_INFO_PARAM,
			Value: JSON.stringify(info),
			Type: ParameterType.STRING,
			Overwrite: true,
		}),
	)
}

async function ensureNrfcloudCredentials(
	input: CliInput,
	accountInfo: AccountInfo,
): Promise<void> {
	const res = await getNrfcloudCredentialsSSM()
	if (res.privateKey == null || res.clientCert == null || input.reset) {
		console.log('Deleting old account device credentials')
		await deleteNrfcloudCredentials(input)

		console.log('Generating new account device credentials')
		const credentials = await generateNrfcloudCredentials(input)
		await Promise.all([
			saveNrfcloudCredentialsSSM(credentials),
			saveNrfcloudAccountInfosSSM(accountInfo),
		])
		console.log(
			`Saved new account device credentials to ${NRFCLOUD_CLIENT_CERT_PARAM} and ${NRFCLOUD_CLIENT_KEY_PARAM}`,
		)
	} else {
		console.log(
			`Existing account device credentials were present in ${NRFCLOUD_CLIENT_CERT_PARAM} and ${NRFCLOUD_CLIENT_KEY_PARAM}`,
		)
	}
}

async function getIotCredentialsSSM(): Promise<CertificateCredentials> {
	const iotClientCertResponse = await SSM.send(
		new GetParameterCommand({
			Name: IOT_CERT_PARAM,
		}),
	).catch(() => null)
	const iotClientKeyResponse = await SSM.send(
		new GetParameterCommand({
			Name: IOT_KEY_PARAM,
		}),
	).catch(() => null)

	return {
		clientCert: iotClientCertResponse?.Parameter?.Value ?? '',
		privateKey: iotClientKeyResponse?.Parameter?.Value ?? '',
	}
}

async function generateIotCredentials(): Promise<CertificateCredentials> {
	const policyName = `nrfcloud-mqtt-bridge-policy-${new Date()
		.toISOString()
		.replace(/T.+$/, '')}-${randomUUID()}`
	console.log(`Creating iot policy ${policyName}`)
	await Iot.send(
		new CreatePolicyCommand({
			policyDocument:
				'{"Version": "2012-10-17","Statement": [{"Effect": "Allow","Action": "iot:*","Resource": "*"}]}',
			policyName,
		}),
	)
	const credentials = await Iot.send(
		new CreateKeysAndCertificateCommand({
			setAsActive: true,
		}),
	)
	await Iot.send(
		new AttachPolicyCommand({
			policyName,
			target: credentials.certificateArn,
		}),
	)

	return {
		clientCert: credentials.certificatePem ?? '',
		privateKey: credentials.keyPair?.PrivateKey ?? '',
	}
}

async function saveIotCredentialsSSM(
	credentials: CertificateCredentials,
	iotEndpoint: string,
): Promise<void> {
	await Promise.all([
		SSM.send(
			new PutParameterCommand({
				Name: IOT_ENDPOINT_PARAM,
				Value: iotEndpoint,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
		SSM.send(
			new PutParameterCommand({
				Name: IOT_CERT_PARAM,
				Value: credentials.clientCert,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
		SSM.send(
			new PutParameterCommand({
				Name: IOT_KEY_PARAM,
				Value: credentials.privateKey,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
	])
}

async function ensureIotCredentials(input: CliInput, iotEndpoint: string) {
	const res = await getIotCredentialsSSM()
	if (res.privateKey == null || res.clientCert == null || input.reset) {
		console.log('Generating new IoT credentials')
		const credentials = await generateIotCredentials()
		await saveIotCredentialsSSM(credentials, iotEndpoint)
		console.log(
			`Saved new iot credentials to ${IOT_CERT_PARAM} and ${IOT_KEY_PARAM}`,
		)
	} else {
		console.log(
			`Existing iot credentials were present in ${IOT_CERT_PARAM} and ${IOT_KEY_PARAM}`,
		)
	}
}

export async function initializeMQTTBridge(input: CliInput): Promise<void> {
	const accountInfo = await getAccountInfo(input)
	const iotEndpoint = await getIoTEndpoint()

	console.log(`AWS IoT endpoint: ${iotEndpoint}`)
	console.log('Retrieved Nrfcloud account info:')
	console.log(JSON.stringify(accountInfo, null, 2))

	await ensureNrfcloudCredentials(input, accountInfo)
	await ensureIotCredentials(input, iotEndpoint ?? '')

	console.log('All certificates have been saved on SSM')
}
