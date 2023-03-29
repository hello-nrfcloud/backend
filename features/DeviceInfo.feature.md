# Device Info

> As the author of a software component  
> I want to verify that I can connect websocket with valid code and get device
> info

## Background

Given There is a device as this JSON

```json
{
  "id": "nrf-test-device-id",
  "deviceId": "nrf-test-device-id",
  "secret": "42.d3adbeef",
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

## Connect with a valid code

When I connect websocket with code `42.d3adbeef`

Then the connection response should equal to this JSON

```json
{
  "sender": "nrf-test-device-id",
  "topic": "connection",
  "payload": {
    "id": "nrf-test-device-id",
    "deviceId": "nrf-test-device-id",
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
}
```
