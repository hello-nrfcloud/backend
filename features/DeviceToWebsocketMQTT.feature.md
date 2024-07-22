---
exampleContext:
  fingerprintMQTT: 92b.y7i24q
  fingerprintMQTT_deviceId: oob-352656108602296
  tsMQTT: 1694503339523
  APIURL: https://api.hello.nordicsemi.cloud
---

# Device to websocket (MQTT)

> LwM2M objects published via MQTT on nRF Cloud should be delivered to the
> websocket API

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprintMQTT`

And I connect to the websocket using fingerprint `${fingerprintMQTT}`

## Receive LwM2M updates published via CoAP on the Websocket connection

Given I store `$millis()` into `tsMQTT`

When the device `${fingerprintMQTT_deviceId}` publishes this message to the
topic `m/d/${fingerprintMQTT_deviceId}/d2c/senml`

```json
[
  {
    "bn": "14201/0/",
    "bt": "$number{$floor(tsMQTT/1000)}",
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
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14201,
  "Resources": {
    "0": 62.469414,
    "1": 6.151946,
    "3": 1,
    "6": "Fixed"
  }
}
```

## Fetch the import logs

> The import logs can be used to debug issues with the sent data

When I `GET`
`${APIURL}/device/${fingerprintMQTT_deviceId}/senml-imports?fingerprint=${fingerprintMQTT}`

Then I should receive a `https://github.com/hello-nrfcloud/proto/senml/imports`
response

And `$` of the last response should match

```json
{
  "id": "${fingerprintMQTT_deviceId}"
}
```

And `$.imports[0]` of the last response should match

```json
{
  "success": true,
  "senML": [
    {
      "bn": "14201/0/",
      "bt": "$number{$floor(tsMQTT/1000)}",
      "n": "0",
      "v": 62.469414
    },
    { "n": "1", "v": 6.151946 },
    { "n": "3", "v": 1 },
    { "n": "6", "vs": "Fixed" }
  ],
  "lwm2m": [
    {
      "ObjectID": 14201,
      "Resources": {
        "0": 62.469414,
        "1": 6.151946,
        "3": 1,
        "6": "Fixed",
        "99": "$number{$floor(tsMQTT/1000)}"
      }
    }
  ]
}
```
