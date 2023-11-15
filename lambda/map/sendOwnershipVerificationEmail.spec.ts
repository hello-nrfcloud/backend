import { describe, it, mock } from 'node:test'
import { sendOwnershipVerificationEmail } from './sendOwnershipVerificationEmail.js'
import { assertCall } from '../../util/test/assertCall.js'
void describe('sendOwnershipVerificationEmail()', () => {
	void it('should send an email with the ownership confirmation token to the provided email address', async () => {
		const sesClientMock = {
			send: mock.fn(),
		}
		const fromEmail = 'test@example.com'
		const email = 'user@example.com'
		const deviceId = 'device123'
		const ownershipConfirmationToken = 'token123'

		await sendOwnershipVerificationEmail(
			sesClientMock as any,
			fromEmail,
		)({
			email,
			deviceId,
			ownershipConfirmationToken,
		})

		assertCall(sesClientMock.send, {
			input: {
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
			},
		})
	})
})
