import { consoleReporter } from '@nordicsemiconductor/bdd-markdown'

process.stdin.on('data', (data) => {
	const jsonData = JSON.parse(data.toString())
	consoleReporter(jsonData, console.log)

	if (jsonData.ok === false) process.exit(1)
})
