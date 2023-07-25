import {
	type SuiteResult,
	consoleReporter,
} from '@nordicsemiconductor/bdd-markdown'

const chunks: string[] = []

process.stdin.on('data', (data) => {
	chunks.push(data.toString())
})

const res = await new Promise<SuiteResult>((resolve) =>
	process.stdin.on('end', () => resolve(JSON.parse(chunks.join('')))),
)

consoleReporter(res, console.log, { withTimestamps: true })

if (!res.ok) process.exit(1)
