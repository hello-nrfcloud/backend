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

## Connect with a valid code

When I connect websocket with code `my-secret`

Then the connection response should equal to this JSON

```json
{
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
```

And I close connection
