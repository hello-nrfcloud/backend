import { generateCode } from './generateCode.js'

export const fingerprintGenerator = (productionRun: number): (() => string) => {
	const productionRunCodes: string[] = []
	return (): string => {
		let code = generateCode()
		while (productionRunCodes.includes(code)) {
			code = generateCode()
		}
		productionRunCodes.push(code)
		return `${productionRun.toString(16)}.${code}`
	}
}
