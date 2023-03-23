import path from 'node:path'
export type CertificateFiles = { key: string; csr: string; cert: string }

export const mqttBridgeCertificateLocation = ({
	certsDir,
}: {
	certsDir: string
}): CertificateFiles => ({
	key: path.join(certsDir, 'mqtt-bridge.key'),
	csr: path.join(certsDir, 'mqtt-bridge.csr'),
	cert: path.join(certsDir, 'mqtt-bridge.cert'),
})
