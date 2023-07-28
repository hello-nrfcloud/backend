export const toPairs = <Item extends Record<string, unknown>>(
	items: Item[],
): [Item, Item][] =>
	items.reduce<[Item, Item][]>((pairs, current, index, arr) => {
		if (index === 0) return pairs
		pairs.push([arr[index - 1] as Item, current])
		return pairs
	}, [])
