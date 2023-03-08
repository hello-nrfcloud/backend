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

import {
	IOT_CERT_PARAM,
	IOT_ENDPOINT_PARAM,
	IOT_KEY_PARAM,
	STACK_NAME,
} from '../../cdk/stacks/stackConfig'

type CertificateCredentials = {
	clientCert: string
	privateKey: string
}

const Iot = new IoTClient({})
const SSM = new SSMClient({})

async function getIoTEndpoint(): Promise<string | undefined> {
	const result = await Iot.send(
		new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }),
	)

	return result.endpointAddress
}

async function getIotCredentialsSSM(): Promise<CertificateCredentials> {
	const iotClientCertResponse = await SSM.send(
		new GetParameterCommand({
			Name: `/${STACK_NAME}/${IOT_CERT_PARAM}`,
		}),
	).catch(() => null)
	const iotClientKeyResponse = await SSM.send(
		new GetParameterCommand({
			Name: `/${STACK_NAME}/${IOT_KEY_PARAM}`,
		}),
	).catch(() => null)

	return {
		clientCert: iotClientCertResponse?.Parameter?.Value ?? '',
		privateKey: iotClientKeyResponse?.Parameter?.Value ?? '',
	}
}

async function generateIotCredentials(): Promise<CertificateCredentials> {
	const policyName = `${STACK_NAME}-mqtt-bridge-policy-${new Date()
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
				Name: `/${STACK_NAME}/${IOT_ENDPOINT_PARAM}`,
				Value: iotEndpoint,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
		SSM.send(
			new PutParameterCommand({
				Name: `/${STACK_NAME}/${IOT_CERT_PARAM}`,
				Value: credentials.clientCert,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
		SSM.send(
			new PutParameterCommand({
				Name: `/${STACK_NAME}/${IOT_KEY_PARAM}`,
				Value: credentials.privateKey,
				Type: ParameterType.STRING,
				Overwrite: true,
			}),
		),
	])
}

export {
	getIoTEndpoint,
	getIotCredentialsSSM,
	generateIotCredentials,
	saveIotCredentialsSSM,
}
