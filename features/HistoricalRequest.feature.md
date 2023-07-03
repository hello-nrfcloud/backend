# Historical data request

> A client can request the history for the device.

## Background

Given I store
`$join(['nrf-historical-', $formatBase($random() * 10000000, 16)])` into
`deviceId`

And a `PCA20035+solar` device with the ID `${deviceId}` is registered with the
fingerprint `92b.d795c7`

## Verify I can query historical device data

Given I connect websocket with fingerprint `92b.d795c7`

And I store
`$toMillis($fromMillis($millis(), '[Y9999]-[M99]-[D99]T[H99]:[m]:00Z'))` into
`ts`

And I store the converted device messages of device ID `${deviceId}` into
timestream using `${ts}` and decrement the timestamp by `0.5` minutes as this
JSON

```json
[
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.40141
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.75718
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.73368
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.58041
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.79055
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.08613
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.52402
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.04496
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.40371
  },
  {
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "mA": 3.09479
  }
]
```

And I store `$join(['request-', $formatBase($random() * 10000000, 16)])` into
`requestId`

When I send websocket request as this JSON

```json
{
  "@id": "${requestId}",
  "type": "lastHour",
  "ts": ${ts},
  "message": "gain",
  "attributes": {
    "avgMA": { "attribute": "mA", "aggregate": "avg" }
  }
}
```

Then wait for `5` seconds

Then the historical response should match to this JSON

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/historical-data",
  "@id": "${requestId}",
  "attributes": {
    "avgMA": [
      {
        "mA": 3.579295
      },
      {
        "mA": 3.657045
      },
      {
        "mA": 3.43834
      },
      {
        "mA": 3.28449
      },
      {
        "mA": 3.24925
      }
    ]
  },
  "ts": ${ts}
}
```
