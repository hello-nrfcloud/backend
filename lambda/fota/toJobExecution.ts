import { Context, type FOTAJobExecution } from '@hello.nrfcloud.com/proto/hello'
import type { Static } from '@sinclair/typebox'
import type { Job } from './Job.js'

export const toJobExecution = (job: Job): Static<typeof FOTAJobExecution> => ({
	'@context': Context.fotaJobExecution.toString(),
	id: job.jobId,
	deviceId: job.deviceId,
	lastUpdatedAt: job.lastUpdatedAt,
	status: job.status,
	statusDetail: job.statusDetail ?? undefined,
	version: job.firmware?.version ?? 'unknown',
})
