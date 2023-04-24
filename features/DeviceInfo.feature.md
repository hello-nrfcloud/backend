# Device Info

> After connecting to the websocket with a device code, the device info is
> returned

## Background

Given There is a device as this JSON

```json
{
  "id": "nrf-test-device-id",
  "deviceId": "nrf-test-device-id",
  "code": "42.d3adbeef",
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
  "@context": "https://github.com/bifravst/nRF-Guide-backend/websocket-connection-success",
  "deviceId": "nrf-test-device-id",
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
