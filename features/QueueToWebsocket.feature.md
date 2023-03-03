# SQS queue to websocket

> As the author of a software component  
> I want to verify that I can publish a message to SQS queue and the message
> will be delivered to websocket client

## Background

Given There is a device as this JSON

```json
{
  "id": "nrf-test-device-id",
  "deviceId": "nrf-test-device-id",
  "secret": "my-secret",
  "name": "nrf-test-device-id",
  "subType": "jitp-nordic-hardware",
  "tags": ["temperature", "warehouse-east"],
  "firmware": {
    "supports": ["APP", "MODEM"],
    "app": {
      "version": "0.0.0-development"
    },
    "modem": "mfw_nrf9160_1.3.3"
  },
  "type": "Generic"
}
```

## Verify a message published to SQS queue will be delivered to websocket client

When I connect websocket with code `my-secret`

And I send message to queue with this JSON

```json
{
  "sender": "nrf-test-device-id",
  "receivers": ["nrf-test-device-id"],
  "payload": {
    "sender": "nrf-test-device-id",
    "topic": "data/m/d/nrf-test-device-id/d2c",
    "payload": {
      "state": {
        "desired": {
          "pairing": {
            "state": "paired",
            "topics": {
              "d2c": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-device-id/d2c",
              "c2d": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-device-id/+/r"
            }
          },
          "nrfcloud_mqtt_topic_prefix": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/"
        }
      }
    }
  }
}
```

Then the response should equal to this JSON

```json
{
  "sender": "nrf-test-device-id",
  "topic": "data/m/d/nrf-test-device-id/d2c",
  "payload": {
    "state": {
      "desired": {
        "pairing": {
          "state": "paired",
          "topics": {
            "d2c": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-device-id/d2c",
            "c2d": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-device-id/+/r"
          }
        },
        "nrfcloud_mqtt_topic_prefix": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/"
      }
    }
  }
}
```
