---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  ts: 1694503339523
  pastTs: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
  pastTsISO: 2023-09-12T00:00:00.000Z
---

# Device location history

> When devices publish their location information (GNSS and GROUND_FIX) via
> CoAP, those messages (and the GROUND_FIX resolution) are not available on the
> MQTT message bridge.  
> Currently, nRF Cloud does not implement a push API for these messages.  
> Therefore, the
> [location history REST API](https://api.nrfcloud.com/v1#tag/Location-History/operation/GetLocationHistory)
> has to be polled to acquire the location data of devices.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

Given I store `ts - 60 * 1000` into `pastTs`

And I store `$fromMillis(${pastTs})` into `pastTsISO`

And this nRF Cloud API is queued for a `GET /v1/location/history` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "items": [
    {
      "deviceId": "${fingerprint_deviceId}",
      "id": "42115b99-7df7-4eb2-8a2c-58af44730324",
      "insertedAt": "${tsISO}",
      "lat": "63.4213475",
      "lon": "10.4377896",
      "meta": {},
      "serviceType": "WIFI",
      "uncertainty": "14.042"
    },
    {
      "deviceId": "${fingerprint_deviceId}",
      "id": "61b0d775-8384-4867-a25a-0a77f71f07ca",
      "insertedAt": "${pastTsISO}",
      "lat": "63.42061758",
      "lon": "10.43720484",
      "meta": {},
      "serviceType": "SCELL",
      "uncertainty": "366"
    }
  ]
}

```

## The history is fetched

> For observed devices, the history is fetched, and the latest is published.

When I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches after 20 retries

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14201,
  "ObjectInstanceID": 1,
  "Resources": {
    "0": 63.4213475,
    "1": 10.4377896,
    "3": 14.042,
    "6": "WIFI",
    "99": "$number{ts}"
  }
}
```

Soon the nRF Cloud API should have been called with

```
POST /v1/location/history?deviceId=${fingerprint_deviceId} HTTP/1.1
```

## The latest location should be persisted in the device shadow

Given I reconnect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "reported": [
    {
      "ObjectID": 14201,
      "ObjectInstanceID": 1,
      "Resources": {
        "0": 63.4213475,
        "1": 10.4377896,
        "3": 14.042,
        "6": "WIFI",
        "99": "$number{ts}"
      }
    }
  ]
}
```
