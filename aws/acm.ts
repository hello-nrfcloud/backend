import type { ACMClient } from '@aws-sdk/client-acm'
import { CertificateStatus, ListCertificatesCommand } from '@aws-sdk/client-acm'
import chalk from 'chalk'

export type DomainCert = {
	domain: string
	certificateArn: string
}

const getDomainCertificate =
	(acm: ACMClient) =>
	async (domain: string): Promise<DomainCert> => {
		const { CertificateSummaryList } = await acm.send(
			new ListCertificatesCommand({
				CertificateStatuses: [CertificateStatus.ISSUED],
			}),
		)
		const cert = (CertificateSummaryList ?? []).find(
			({ DomainName }) => DomainName === domain,
		)
		if (cert === undefined)
			throw new Error(`Failed to find certificate for ${domain}!`)
		return {
			domain,
			certificateArn: cert.CertificateArn as string,
		}
	}

export const getCertificateForDomain =
	(acm: ACMClient) =>
	async (domainName: string): Promise<DomainCert> => {
		try {
			return await getDomainCertificate(acm)(domainName)
		} catch (err) {
			console.error(
				chalk.red(
					`Failed to determine certificate for API domain ${domainName}!`,
				),
			)
			console.error(err)
			process.exit(1)
		}
	}
