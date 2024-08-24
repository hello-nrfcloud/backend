import type { FOTAJobType } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import type { Static } from '@sinclair/typebox'

export type NrfCloudFOTAJob = {
	parentJobId: string
	deviceId: string
	jobId: string
	status: string
	createdAt: string
	nextUpdateAt: string
	account: string
	lastUpdatedAt: string
	statusDetail: Static<typeof FOTAJobType>['statusDetail'] | null
	firmware: Static<typeof FOTAJobType>['firmware'] | null
	target: Static<typeof FOTAJobType>['target'] | null
}
