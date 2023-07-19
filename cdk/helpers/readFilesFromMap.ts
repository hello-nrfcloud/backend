import { readFile } from 'node:fs/promises'

export const readFilesFromMap = async (
	fileMap: Record<string, string>,
): Promise<Record<string, string>> => {
	const contents = await Promise.all(
		Object.entries(fileMap).map<Promise<[string, string]>>(
			async ([key, path]) => [key, await readFile(path, 'utf-8')],
		),
	)

	return contents.reduce(
		(contentsMap, [key, content]) => ({ ...contentsMap, [key]: content }),
		{},
	)
}
