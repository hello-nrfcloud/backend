import { aws_events as Events } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class WebsocketEventBus extends Construct {
	public readonly eventBus: Events.IEventBus
	public constructor(parent: Construct) {
		super(parent, 'WebsocketEventBus')

		// Event bridge for publishing message though websocket
		this.eventBus = new Events.EventBus(this, 'eventBus', {})
	}
}
