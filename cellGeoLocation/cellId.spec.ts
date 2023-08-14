import { cellId } from './cellId.js'

describe('cellId', () => {
	it('should generate a cellId', () => {
		expect(
			cellId({
				area: 42,
				mccmnc: 53005,
				cell: 666,
			}),
		).toEqual('53005-42-666')
	})
})
