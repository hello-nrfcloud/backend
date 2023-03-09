import {
	CertificateStatus,
	DeleteCertificateCommand,
	DeletePolicyCommand,
	DetachPolicyCommand,
	IoTClient,
	ListPoliciesCommand,
	ListTargetsForPolicyCommand,
	UpdateCertificateCommand,
} from '@aws-sdk/client-iot'
import {
	DeleteParametersCommand,
	GetParametersByPathCommand,
	SSMClient,
} from '@aws-sdk/client-ssm'

import { STACK_NAME } from '../../../cdk/stacks/stackConfig.js'

const SSM = new SSMClient({})
const Iot = new IoTClient({})

export async function cleanup(): Promise<void> {
	// Clean parameter store
	const parameters = await SSM.send(
		new GetParametersByPathCommand({
			Path: `/${STACK_NAME}`,
		}),
	)

	const names = parameters.Parameters?.map((p) => p.Name)
	if (names !== undefined && names?.length > 0) {
		await SSM.send(
			new DeleteParametersCommand({
				Names: names as string[],
			}),
		)
	}

	// Clean IoT policies
	const allPolicies = await Iot.send(
		new ListPoliciesCommand({
			ascendingOrder: false,
		}),
	)
	const policies = allPolicies.policies?.filter((policy) =>
		policy.policyName?.startsWith(STACK_NAME),
	)

	// Find all certificates attached to these policies
	for (const policy of policies ?? []) {
		const targets = await Iot.send(
			new ListTargetsForPolicyCommand({
				policyName: policy.policyName,
			}),
		)

		for (const target of targets.targets ?? []) {
			console.log(`Detaching "${policy.policyName}" policy from ${target}`)
			await Iot.send(
				new DetachPolicyCommand({
					policyName: policy.policyName,
					target,
				}),
			)

			const certificateId = target.split('/')[1]
			console.log(`De-activating certificate "${certificateId}"`)
			await Iot.send(
				new UpdateCertificateCommand({
					certificateId,
					newStatus: CertificateStatus.INACTIVE,
				}),
			)

			console.log(`Deleting certificate "${certificateId}"`)
			await Iot.send(
				new DeleteCertificateCommand({
					certificateId,
					forceDelete: true,
				}),
			)
		}

		console.log(`Deleting "${policy.policyName}" policy`)
		await Iot.send(
			new DeletePolicyCommand({
				policyName: policy.policyName,
			}),
		)
	}
}
