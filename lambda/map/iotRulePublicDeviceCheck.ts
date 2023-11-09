export const handler = async (
	event: unknown,
): Promise<{
	public: boolean
}> => {
	console.log(JSON.stringify({ event }))
	return {
		public: false,
	}
}
