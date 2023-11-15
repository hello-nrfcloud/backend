import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { parseDateTimeFromLogToTimestamp } from './parseDateTimeFromLogToTimestamp.js'

void describe('parseDateTimeFromLogToTimestamp', () => {
	void it('should return a timestamp when a valid log string is provided', () => {
		const dateUTCStr = `2023-11-15 01:53:06.148Z`
		const expected =
			Date.parse(dateUTCStr) + new Date().getTimezoneOffset() * 60 * 1000

		const logString =
			'2023-11-15 01:53:06,148 INFO [coap.nrfcloud.com/3.84.64.178:5684] Reconnected [CID:, peerCID:cdf04e555d32fa5cbb5d, peer-cert:CN=coap.nrfcloud.com, cipher-suite:TLS-ECDHE-ECDSA-WITH-AES-256-GCM-SHA384]'
		const result = parseDateTimeFromLogToTimestamp(logString)

		assert.notEqual(result, null)
		assert.equal(result, expected)
	})

	void it('should return null when an invalid log string is provided', () => {
		const logString = 'Invalid log string'
		const result = parseDateTimeFromLogToTimestamp(logString)

		assert.equal(result, null)
	})
})
