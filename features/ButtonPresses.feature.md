---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  ts: 1694503339523
  APIURL: https://api.hello.nordicsemi.cloud
---

# Publish Button presses

> Button presses are special in that they only have a Time resource and use the
> instance ID to signify the ID of the pressed button.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

## Receive published button press

Given I store `$millis()` into `ts`

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14220/1/",
    "bt": "$number{$floor(ts/1000)}"
  }
]
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14220,
  "ObjectInstanceID": 1,
  "Resources": {
    "99": "$number{$floor(ts/1000)}"
  }
}
```
