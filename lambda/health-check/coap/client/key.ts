import { createPrivateKey } from 'node:crypto'

console.log(
	createPrivateKey(
		[
			`-----BEGIN EC PARAMETERS-----`,
			`BggqhkjOPQMBBw==`,
			`-----END EC PARAMETERS-----`,
			`-----BEGIN EC PRIVATE KEY-----`,
			`MHcCAQEEIMmVRAaMpBW903CckmWPsAYwzHHCSRAC9sKAlKlRuDJfoAoGCCqGSM49`,
			`AwEHoUQDQgAEioonmRDni8+0ra3xGGkbRaOzCzbPaXvuEpGtTBs2PChlsPngq71L`,
			`nX2GgQKu1AF2sZQc7v5kB1Knf+/IfdeN1g==`,
			`-----END EC PRIVATE KEY-----`,
		].join('\n'),
	)
		.export({
			format: 'pem',
			type: 'pkcs8',
		})
		.toString(),
)
