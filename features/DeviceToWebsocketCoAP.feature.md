---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
---

# Device to websocket (CoAP)

> LwM2M objects published via CoAP on nRF Cloud should be delivered to the
> websocket API

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

## Receive LwM2M updates published via CoAP on the Websocket connection

Given I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14201/0/",
    "bt": "$number(ts)",
    "n": "0",
    "v": 62.469414
  },
  { "n": "1", "v": 6.151946 },
  { "n": "3", "v": 1 },
  { "n": "6", "vs": "Fixed" }
]
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/resource/update",
  "ts": "${tsISO}",
  "ObjectID": 14201,
  "Resources": {
    "0": 62.469414,
    "1": 6.151946,
    "3": 1,
    "6": "Fixed",
    "99": "${tsISO}"
  }
}
```
