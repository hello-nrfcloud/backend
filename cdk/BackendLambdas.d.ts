import type { PackedLambda } from './backend'

type BackendLambdas = {
	onConnect: PackedLambda
	onMessage: PackedLambda
	onDisconnect: PackedLambda
}
