import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { parseDateTimeFromLogToTimestamp } from './parseDateTimeFromLogToTimestamp.js'

void describe('parseDateTimeFromLogToTimestamp', () => {
	void it('should return a timestamp when a valid log string is provided', () => {
		const dateStr = `2023-11-15 01:53:06.148`
		const expected = Date.parse(dateStr)

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
