import jsonata from 'jsonata'
import { EOL } from 'node:os'

const regex = /`(?<exp>[^`]+)`/g

export const codeBlockReplacer = async (
	code: string,
	context: { [key: string]: unknown },
): Promise<string> => {
	const replacedStrings: string[] = []
	for (let line of code.split(EOL) ?? []) {
		let m: RegExpExecArray | null
		while ((m = regex.exec(line)) !== null) {
			// This is necessary to avoid infinite loops with zero-width matches
			if (m.index === regex.lastIndex) {
				regex.lastIndex++
			}

			const { exp } = m.groups as { exp: string }
			const e = jsonata(exp)
			const ev = await e.evaluate(context)
			line = line.replace(m[0], ev)
		}
		replacedStrings.push(line)
	}

	return replacedStrings.join(EOL)
}
