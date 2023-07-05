import { codeBlockReplacer } from './codeBlockReplacer.js'

describe('codeBlockReplacer', () => {
	const context = {
		ts: 1688550420000,
		foo: 'bar',
	}

	it('should replace code blocks with evaluated expressions', async () => {
		const code = `
      This is \`foo\`
      with timestamp as \`ts\`
    `

		const result = await codeBlockReplacer(code, context)
		const expected = `
      This is bar
      with timestamp as 1688550420000
    `
		expect(result).toEqual(expected)
	})

	it('should handle multiple same code blocks in a single line', async () => {
		const code = '`ts` and `ts`'
		const result = await codeBlockReplacer(code, context)

		const expected = '1688550420000 and 1688550420000'
		expect(result).toEqual(expected)
	})

	it('should handle multiple code blocks in a single line', async () => {
		const code = '`ts` and `foo`'
		const result = await codeBlockReplacer(code, context)

		const expected = '1688550420000 and bar'
		expect(result).toEqual(expected)
	})

	it('should return the same code if there is no match', async () => {
		const code = `
			hello,
			world
		`
		const result = await codeBlockReplacer(code, context)

		const expected = `
			hello,
			world
		`
		expect(result).toEqual(expected)
	})

	it('should handle an empty code string', async () => {
		const code = ''
		const result = await codeBlockReplacer(code, context)

		const expected = ''
		expect(result).toEqual(expected)
	})
})
