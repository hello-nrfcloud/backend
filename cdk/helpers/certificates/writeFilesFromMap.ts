import { writeFile } from 'node:fs/promises'

export const writeFilesFromMap = async (
	fileContents: Record<string, string>,
): Promise<void> => {
	await Promise.all(
		Object.entries(fileContents).map(async ([path, contents]) =>
			writeFile(path, contents, 'utf-8'),
		),
	)
}
