import { Context, type FOTAJobExecution } from '@hello.nrfcloud.com/proto/hello'
import type { Static } from '@sinclair/typebox'
import type { Job } from './Job.js'

export const toJobExecution = (job: Job): Static<typeof FOTAJobExecution> => ({
	'@context': Context.fotaJobExecution.toString(),
	deviceId: job.deviceId,
	lastUpdatedAt: job.lastUpdatedAt,
	status: job.status,
	statusDetails: job.statusDetails ?? undefined,
	version: job.firmare?.version ?? 'unknown',
})
