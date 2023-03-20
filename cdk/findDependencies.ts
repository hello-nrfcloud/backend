import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ts, { type ImportDeclaration, type StringLiteral } from 'typescript'

/**
 * Resolve project-level dependencies for the given file using TypeScript compiler API
 */
export const findDependencies = (
	sourceFile: string,
	imports: string[] = [],
	visited: string[] = [],
): string[] => {
	if (visited.includes(sourceFile)) return imports
	const fileNode = ts.createSourceFile(
		sourceFile,
		readFileSync(sourceFile, 'utf-8').toString(),
		ts.ScriptTarget.ES2022,
		/*setParentNodes */ true,
	)

	const parseChild = (node: ts.Node) => {
		if (node.kind !== ts.SyntaxKind.ImportDeclaration) return
		const moduleSpecifier = (
			(node as ImportDeclaration).moduleSpecifier as StringLiteral
		).text
		const file = moduleSpecifier.startsWith('.')
			? path
					.resolve(path.parse(sourceFile).dir, moduleSpecifier)
					.replace(/\.js$/, '.ts')
			: moduleSpecifier
		try {
			statSync(file)
			imports.push(file)
		} catch {
			// Module or file not found
			visited.push(file)
		}
	}
	ts.forEachChild(fileNode, parseChild)
	visited.push(sourceFile)

	for (const file of imports) {
		findDependencies(file, imports, visited)
	}

	return imports
}
