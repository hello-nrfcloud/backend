const alphabet = 'abcdefghijkmnpqrstuvwxyz' // Removed o,l
const numbers = '23456789' // Removed 0,1
export const generateCode = (len = 6): string => {
	const characters = `${alphabet}${numbers}`

	let code = ``
	for (let n = 0; n < len; n++) {
		code = `${code}${characters[Math.floor(Math.random() * characters.length)]}`
	}
	return code
}

export const CodeRegExp = new RegExp(`^[${alphabet}${numbers}]+$`)
