export const cellId = ({
	area,
	mccmnc,
	cell,
}: {
	area: number
	mccmnc: number
	cell: number
}): string => `${mccmnc}-${area}-${cell}`
