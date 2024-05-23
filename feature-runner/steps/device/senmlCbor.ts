import { Encoder } from 'cbor-x'

// @see https://www.rfc-editor.org/rfc/rfc8428.html#section-6
const senmlKeys = {
	bs: -6,
	bv: -5,
	bu: -4,
	bt: -3,
	bn: -2,
	bver: -1,
	n: 0,
	u: 1,
	v: 2,
	vs: 3,
	vb: 4,
	s: 5,
	t: 6,
	ut: 7,
	vd: 8,
}
const senmlCbor = new Encoder({ keyMap: senmlKeys })

export const encode = (value: unknown): Buffer => senmlCbor.encode(value)
