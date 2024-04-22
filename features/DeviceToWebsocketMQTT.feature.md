---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
---

# Device to websocket (MQTT)

> Device messages published via MQTT on nRF Cloud should be delivered to the
> websocket API.
>
> Note: this is a legacy API and will be removed. See
> https://github.com/hello-nrfcloud/proto/issues/137

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

## Receive messages published via MQTT on the Websocket connection

Given I store `$millis()` into `ts`

When the device `${fingerprint_deviceId}` publishes this message to the MQTT
topic `m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "ts": "$number{ts}",
  "data": "3.123456"
}
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
  "ts": "$number{ts}",
  "mA": 3.123456
}
```
