import type { FOTAJobType } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import type { Static } from '@sinclair/typebox'

export type Job = {
	deviceId: string
	jobId: string
	status: string
	createdAt: string
	nextUpdateAt: string
	account: string
	lastUpdatedAt: string
	statusDetails: Static<typeof FOTAJobType>['statusDetail'] | null
	firmare: Static<typeof FOTAJobType>['firmware'] | null
	target: Static<typeof FOTAJobType>['target'] | null
}
