const A = require('async')
const mqtt = require('mqtt')
const debug = require('debug')('engine:mqtt')
const { faker } = require('@faker-js/faker')

const _get = (object, path) => {
	const keys = path.split('.')
	let index = 0
	const length = keys.length
	while (object !== null && index < length) {
		object = object[keys[index++]]
	}

	return index && index == length ? object : undefined
}

class MqttEngine {
	// Artillery initializes each engine with the following arguments:
	//
	// - script is the entire script object, with .config and .scenarios properties
	// - events is an EventEmitter we can use to subscribe to events from Artillery, and
	//   to report custom metrics
	// - helpers is a collection of utility functions
	constructor(script, ee, helpers) {
		this.script = script
		this.ee = ee
		this.helpers = helpers
		this.config = script.config.mqtt ?? {}
		this.target = script.config.target

		// Convert node template to artillery template
		if (this.config.auth) {
			for (const key in this.config.auth) {
				const value = this.config.auth[key] ?? ''
				this.config.auth[key] = value.replace(
					/\$\{(?=[^\}]+\})([^\}]+)\}/g,
					`{{ $1 }}`,
				)
			}
		}

		return this
	}

	// For each scenario in the script using this engine, Artillery calls this function
	// to create a VU function
	createScenario(scenarioSpec, ee) {
		const self = this
		const tasks = scenarioSpec.flow.map((rs) => this.step(rs, ee))

		return function scenario(initialContext, callback) {
			ee.emit('started')

			function vuInit(callback) {
				// We can run custom VU-specific init code here
				const parsedAuth = self.helpers.template(
					self.config.auth,
					initialContext,
				)
				const { auth, ...rest } = self.config
				debug('mqtt is connecting as', parsedAuth.clientId)
				const mqttClient = mqtt.connect(self.target, {
					...rest,
					...parsedAuth,
				})

				mqttClient.once('connect', () => {
					debug('mqtt is connected')
					initialContext.mqtt = mqttClient

					ee.emit('counter', 'mqtt.connect', 1)
					return callback(null, initialContext)
				})

				// Throw error fast if connection is failed
				mqttClient.once('error', () => {
					debug('mqtt error', error)
					return callback(error)
				})

				// Capture on going events
				mqttClient
					.on('error', (error) => {
						debug('mqtt error', error)
						ee.emit('error', error.message || error.code)
					})
					.on('reconnect', () => {
						debug('mqtt is reconnecting')
						ee.emit(
							'counter',
							`mqtt.reconnect.${mqttClient.options.clientId}`,
							1,
						)
					})
			}

			const steps = [vuInit].concat(tasks)

			A.waterfall(steps, function done(error, context) {
				if (error) {
					debug('request spec end error', error)
					return callback(error, context)
				}

				if (context && context.mqtt) {
					debug('mqtt is ending')
					context.mqtt.end((error) => {
						if (error) {
							ee.emit('counter', 'mqtt.error.close', 1)
						} else {
							ee.emit('counter', 'mqtt.close', 1)
						}

						return callback(error, context)
					})
				} else {
					return callback(error, context)
				}
			})
		}
	}

	// This is a convenience function where we delegate common actions like loop, log, and think,
	// and handle actions which are custom for our engine, i.e. the "doSomething" action in this case
	step(rs, ee) {
		const self = this

		if (rs.loop) {
			const steps = rs.loop.map((loopStep) => this.step(loopStep, ee))

			return this.helpers.createLoopWithCount(rs.count || -1, steps, {
				loopValue: rs.loopValue || '$loopCount',
				overValues: rs.over,
				whileTrue: self.config.processor
					? self.config.processor[rs.whileTrue]
					: undefined,
			})
		}

		if (rs.log) {
			return function log(context, callback) {
				console.log(chalk.blue(self.helpers.template(rs.log, context)))
				return process.nextTick(function () {
					callback(null, context)
				})
			}
		}

		if (rs.think) {
			return this.helpers.createThink(rs, self.config?.defaults?.think || {})
		}

		if (rs.function) {
			return function (context, callback) {
				let func = self.script.config.processor[rs.function]
				if (!func) {
					return process.nextTick(function () {
						callback(null, context)
					})
				}

				return func(context, ee, function () {
					return callback(null, context)
				})
			}
		}

		//
		// This is our custom action:
		//
		// TODO::PUD implement publish function
		if (rs.publish) {
			return function publish(context, callback) {
				const topic = self.helpers.template(rs.publish.topic, context)
				const payload = self.helpers.template(rs.publish.payload, context)

				debug('publish topic', topic)
				debug('publish payload', payload)
				context.mqtt.publish(
					topic,
					typeof payload === 'string' ? payload : JSON.stringify(payload),
					rs.publish.options,
					(error) => {
						if (error) {
							ee.emit('error', error.message || error.code)
							return callback(error)
						}

						ee.emit('counter', 'mqtt.publish_count', 1)
						ee.emit('rate', 'mqtt.publish_rate')
						return callback(null, context)
					},
				)
			}
		}

		if (rs.faker) {
			return function (context, callback) {
				const name = rs.faker.name
				const args = rs.faker.parameters
				const variable = rs.faker.store

				// TONOTE:: Hack using timestamp
				if (name === 'timestamp') {
					context.vars[variable] = Date.now()
					return callback(null, context)
				} else {
					const func = _get(faker, name)
					if (!func) {
						return process.nextTick(function () {
							callback(null, context)
						})
					}
					context.vars[variable] = args ? func.call(func, ...args) : func()
					return callback(null, context)
				}
			}
		}

		//
		// Ignore any unrecognized actions:
		//
		return function doNothing(context, callback) {
			return callback(null, context)
		}
	}
}

module.exports = MqttEngine
