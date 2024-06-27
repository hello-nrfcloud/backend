---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  ts: 1694503339523
  APIURL: https://api.hello.nordicsemi.cloud
---

# Device to websocket (CoAP)

> LwM2M objects published via CoAP on nRF Cloud should be delivered to the
> websocket API

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

## Receive LwM2M updates published via CoAP on the Websocket connection

Given I store `$millis()` into `ts`

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14201/0/",
    "bt": "$number{$floor(ts/1000)}",
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
`${APIURL}/device/${fingerprint_deviceId}/senml-imports?fingerprint=${fingerprint}`

Then I should receive a `https://github.com/hello-nrfcloud/proto/senml/imports`
response

And `$` of the last response should match

```json
{
  "id": "${fingerprint_deviceId}"
}
```

And `$.imports[0]` of the last response should match

```json
{
  "success": true,
  "senML": [
    {
      "bn": "14201/0/",
      "bt": "$number{$floor(ts/1000)}",
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
        "99": "$number{$floor(ts/1000)}"
      }
    }
  ]
}
```
