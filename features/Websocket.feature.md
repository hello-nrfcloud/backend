# Websocket

> As the author of a software component  
> I want to verify that websocket client can connect to API gateway with valid
> code

## Verify data is saved into DB

When I create simulator device with this JSON

```json
{
  "deviceId": "test-device-id",
  "secret": "my-secret"
}
```

Then I query database with key `test-device-id`, it should equal to this JSON

```json
{
  "deviceId": "test-device-id",
  "secret": "my-secret"
}
```

## The websocket should be successfully connected and receive device detail with the correct code

Given I create simulator device with this JSON

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

When I connect websocket to `${websocketUri}` with code `my-secret`

Then the websocket response should equal to this JSON

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
