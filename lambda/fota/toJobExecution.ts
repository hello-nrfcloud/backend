import { Context, type FOTAJob } from '@hello.nrfcloud.com/proto/hello'
import type { Static } from '@sinclair/typebox'
import type { PersistedJob } from './jobRepo.js'

export const toJob = (job: PersistedJob): Static<typeof FOTAJob> => ({
	'@context': Context.fotaJob.toString(),
	id: job.id,
	deviceId: job.deviceId,
	timestamp: job.timestamp,
	status: job.status,
	statusDetail: job.statusDetail ?? undefined,
	reportedVersion: job.reportedVersion,
	upgradePath: job.upgradePath,
})
