import path from 'node:path'
export type CAFiles = { key: string; cert: string; verificationCert: string }

export const caLocation = ({ certsDir }: { certsDir: string }): CAFiles => ({
	key: path.join(certsDir, 'CA.key'),
	cert: path.join(certsDir, 'CA.cert'),
	verificationCert: path.join(certsDir, 'CA.verification.cert'),
})
