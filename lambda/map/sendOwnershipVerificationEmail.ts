import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

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
								`This is your code to verify your device ownership: ${ownershipConfirmationToken}`,
								``,
								`Note: you will need to re-verify your ownership every 30 days.`,
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
