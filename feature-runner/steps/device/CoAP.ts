import {
	IoTDataPlaneClient,
	PayloadFormatIndicator,
	PublishCommand,
} from '@aws-sdk/client-iot-data-plane'
import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { Encoder } from 'cbor-x'

// @see https://www.rfc-editor.org/rfc/rfc8428.html#section-6
const senmlKeys = {
	bs: -6,
	bv: -5,
	bu: -4,
	bt: -3,
	bn: -2,
	bver: -1,
	n: 0,
	u: 1,
	v: 2,
	vs: 3,
	vb: 4,
	s: 5,
	t: 6,
	ut: 7,
	vd: 8,
}
const senmlCbor = new Encoder({ keyMap: senmlKeys })

export const steps = ({
	iotData,
}: {
	iotData: IoTDataPlaneClient
}): StepRunner<Record<string, string>>[] => [
	regExpMatchedStep(
		{
			regExp:
				/^the device `(?<id>[^`]+)` does a `(?<method>[^`]+)` to this CoAP resource `(?<resource>[^`]+)` with this SenML payload$/,
			schema: Type.Object({
				id: Type.String(),
				method: Type.Union(
					['GET', 'POST', 'PUT', 'DELETE'].map((m) => Type.Literal(m)),
				),
				resource: Type.RegExp(/^\/msg\/d2c.+/),
			}),
		},
		async ({ match: { id, resource, method }, log: { progress }, step }) => {
			const message = JSON.parse(codeBlockOrThrow(step).code)

			progress(`Device id ${id} ${method}s to ${resource}`)
			// The message bridge receives messages from nRF Cloud and publishes them under the data/ topic
			const mqttTopic = `data/m/d/${id}${resource.replace(/^\/msg/, '')}`
			const payload = JSON.stringify({
				data: senmlCbor.encode(message).toString('base64'),
			})
			progress('publishing', message, mqttTopic, payload)
			await iotData.send(
				new PublishCommand({
					topic: mqttTopic,
					contentType: 'application/json',
					payloadFormatIndicator: PayloadFormatIndicator.UTF8_DATA,
					payload,
				}),
			)
		},
	),
]
