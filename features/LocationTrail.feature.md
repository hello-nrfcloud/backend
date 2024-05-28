---
exampleContext:
  trailDevice: 92b.y7i24q
  trailDevice_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  ts: 1694503339523
  APIURL: https://r8hwx148u8.execute-api.eu-west-1.amazonaws.com/prod
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

When I `GET`
`${APIURL}/device/${trailDevice_deviceId}/history/14201/0?fingerprint=${trailDevice}&trail=1`

Then I should receive a
`https://github.com/hello-nrfcloud/proto/lwm2m/object/history` response

And `$.query` of the last response should match

```json
{
  "ObjectID": 14201,
  "ObjectVersion": "1.0",
  "ObjectInstanceID": 0,
  "deviceId": "${trailDevice_deviceId}",
  "binIntervalMinutes": 1
}
```

And `{"len": $count($.partialInstances)}` of the last response should match

```json
{ "len": 4 }
```

And `$.partialInstances[0]` of the last response should match

```json
{
  "0": 63.42198706744704,
  "1": 10.437808861037931,
  "3": 293.7028058347316,
  "6": "GNSS",
  "99": "$number{ts - 7000}"
}
```

And `$.partialInstances[1]` of the last response should match

```json
{
  "0": 63.43076160883743,
  "1": 10.487144544169565,
  "3": 0,
  "6": "GNSS",
  "99": "$number{ts - 3000}"
}
```

And `$.partialInstances[2]` of the last response should match

```json
{
  "0": 63.42215444775618,
  "1": 10.535387671151794,
  "3": 0,
  "6": "GNSS",
  "99": "$number{ts - 2000}"
}
```

And `$.partialInstances[3]` of the last response should match

```json
{
  "0": 63.42254450323275,
  "1": 10.630926224360818,
  "3": 0,
  "6": "GNSS",
  "99": "$number{ts - 1000}"
}
```
