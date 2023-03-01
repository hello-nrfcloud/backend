import { consoleReporter } from '@nordicsemiconductor/bdd-markdown'

process.stdin.on('data', (data) => {
	consoleReporter(JSON.parse(data.toString()), console.log)
})
