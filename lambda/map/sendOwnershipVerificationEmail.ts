import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { consentDurationDays } from '../../map/consentDuration.js'

export const sendOwnershipVerificationEmail =
	(ses: SESClient, fromEmail: string) =>
	async ({
		email,
		deviceId,
		ownershipConfirmationToken,
	}: {
		email: string
		deviceId: string
		ownershipConfirmationToken: string
	}): Promise<void> => {
		await ses.send(
			new SendEmailCommand({
				Destination: {
					ToAddresses: [email],
				},
				Message: {
					Body: {
						Text: {
							Data: [
								`This is your token to verify your device ownership: ${ownershipConfirmationToken}`,
								``,
								`Note: you will need to re-verify your ownership every ${consentDurationDays} days.`,
								`A device that has not been confirmed will be removed from the application automatically.`,
								`You will receive another email a few days before the expiration date.`,
							].join('\n'),
						},
					},
					Subject: {
						Data: `[hello.nrfcloud.com] › Verify device ownership for device ${deviceId}`,
					},
				},
				Source: fromEmail,
			}),
		)
	}
