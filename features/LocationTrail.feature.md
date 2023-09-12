---
exampleContext:
  trailDevice: 92b.y7i24q
  trailDevice_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
---

# Location trail

> In order to show a trail of coordinates the backend can provide the location
> history of the device. But because when a device is stationary, it can create
> a lot of GNSS fixes that are very close by, and this provides no meaningful
> data to show on the map, there is a feature that allows to reduce the GNSS
> location history to individual positions that are at least a certain amount
> apart.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `trailDevice`

And I store `$millis()` into `ts`

## Scenario Outline: Device publishes location data

Given I store `ts - ${deductSFromTS}` into `pastTs`

And the device `${trailDevice_deviceId}` publishes this message to the topic
`m/d/${trailDevice_deviceId}/d2c`

```json
{
  "appId": "GNSS",
  "messageType": "DATA",
  "ts": "$number{pastTs}",
  "data": {
    "lng": "$number{lng}",
    "lat": "$number{lat}",
    "acc": 20,
    "alt": 0,
    "spd": 0,
    "hdg": 0
  }
}
```

### Examples

| location                           | lat                | lng                | deductSFromTS |
| ---------------------------------- | ------------------ | ------------------ | ------------- |
| Nordic Office                      | 63.42198706744704  | 10.437808861037931 | 7000          |
| Roundabout 100m to the south west  | 63.419843636135205 | 10.436831426327439 | 6000          |
| Roundabout ~250m to the north east | 63.42394407014264  | 10.440180476283883 | 5000          |
| Tyholtårnet                        | 63.42237916512731  | 10.431970701200813 | 4000          |
| E6 to the east                     | 63.43076160883743  | 10.487144544169565 | 3000          |
| Ranheim Papirfabrikk               | 63.42215444775618  | 10.535387671151794 | 2000          |
| Leistadkrysset                     | 63.42254450323275  | 10.630926224360818 | 1000          |

<!-- @retry:delayExecution=5000 -->

## Retrieve location trail

When I connect to the websocket using fingerprint `${trailDevice}`

And I send this message via the websocket

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/historical-data-request",
    "@id": "46156b60-529d-473a-96d7-97cdc9d2cdbc",
    "type": "lastHour",
    "message": "locationTrail",
    "minDistanceKm": 1,
    "attributes": {
      "lat": { "attribute": "lat" },
      "lng": { "attribute": "lng" },
      "count": { "attribute": "count" },
      "radiusKm": { "attribute": "radiusKm" },
      "ts": { "attribute": "ts" }
    }
  }
}
```

<!-- @retry:tries=5,initialDelay=1000,delayFactor=2 -->

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/historical-data-response",
  "@id": "46156b60-529d-473a-96d7-97cdc9d2cdbc",
  "type": "lastHour",
  "message": "locationTrail",
  "attributes": [
    {
      "lat": 63.42198706744704,
      "lng": 10.437808861037931,
      "ts": "$number{ts - 7000}",
      "count": 4,
      "radiusKm": 0.2937028058347316
    },
    {
      "lat": 63.43076160883743,
      "lng": 10.487144544169565,
      "ts": "$number{ts - 3000}",
      "count": 1,
      "radiusKm": 0
    },
    {
      "lat": 63.42215444775618,
      "lng": 10.535387671151794,
      "ts": "$number{ts - 2000}",
      "count": 1,
      "radiusKm": 0
    },
    {
      "lat": 63.42254450323275,
      "lng": 10.630926224360818,
      "ts": "$number{ts - 1000}",
      "count": 1,
      "radiusKm": 0
    }
  ]
}
```
