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

Given I have the fingerprint for a `PCA20065` device in `trailDevice`

And I store `$millis()` into `ts`

## Scenario Outline: Device publishes location data

Given I store `ts - ${deductSFromTS}` into `pastTs`

When the device `${trailDevice_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14201/0/",
    "n": "0",
    "v": "$number{lat}",
    "bt": "$number{pastTs}"
  },
  { "n": "1", "v": "$number{lng}" },
  { "n": "2", "v": 0 },
  { "n": "3", "v": 20 },
  { "n": "4", "v": 0 },
  { "n": "5", "v": 0 },
  { "n": "6", "vs": "GNSS" }
]
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

## Retrieve location trail

When I connect to the websocket using fingerprint `${trailDevice}`

And I send this message via the websocket

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/location-history-request",
    "@id": "46156b60-529d-473a-96d7-97cdc9d2cdbc",
    "type": "lastHour",
    "minDistanceKm": 1
  }
}
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/location-history",
  "@id": "46156b60-529d-473a-96d7-97cdc9d2cdbc",
  "type": "lastHour",
  "partialInstances": [
    {
      "0": 63.42198706744704,
      "1": 10.437808861037931,
      "99": "$number{ts - 7000}",
      "3": 293.7028058347316
    },
    {
      "0": 63.43076160883743,
      "1": 10.487144544169565,
      "99": "$number{ts - 3000}",
      "3": 0
    },
    {
      "0": 63.42215444775618,
      "1": 10.535387671151794,
      "99": "$number{ts - 2000}",
      "3": 0
    },
    {
      "0": 63.42254450323275,
      "1": 10.630926224360818,
      "99": "$number{ts - 1000}",
      "3": 0
    }
  ]
}
```
