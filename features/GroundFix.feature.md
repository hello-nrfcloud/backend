---
needs:
  - Device Info
---

# Ground fix

> Ground fix messages sent from a device to nRF Cloud should be resolved and the
> location should be published to the websocket

## Background

Given a `PCA20035+solar` device with the ID `nrf-groundfix-device-id` is
registered with the fingerprint `2a.b4ff3e`

And there is a ground fix API response as this JSON

```json
{
  "lat": 45.524098,
  "lon": -122.688408,
  "uncertainty": 300
}
```

## Verify a device sends a ground fix request to nRF Cloud, then I can receive the location via the websocket

Given I connect websocket with fingerprint `2a.b4ff3e`

When a device with id `nrf-groundfix-device-id` publishes to topic
`m/d/nrf-groundfix-device-id/d2c` with a message as this JSON

```json
{
  "appId": "GROUND_FIX",
  "messageType": "DATA",
  "data": {
    "lte": [
      {
        "eci": 21679616,
        "mcc": 242,
        "mnc": 1,
        "tac": 30401,
        "earfcn": 6400,
        "rsrp": -93,
        "rsrq": -9,
        "nmr": [
          {
            "earfcn": 6400,
            "pci": 128,
            "rsrp": -98,
            "rsrq": -13
          },
          {
            "earfcn": 6400,
            "pci": 105,
            "rsrp": -98,
            "rsrq": -14
          },
          {
            "earfcn": 1450,
            "pci": 468,
            "rsrp": -92,
            "rsrq": -9.5
          },
          {
            "earfcn": 1450,
            "pci": 334,
            "rsrp": -93,
            "rsrq": -10
          },
          {
            "earfcn": 300,
            "pci": 425,
            "rsrp": -110,
            "rsrq": -10
          }
        ]
      }
    ]
  }
}
```

Then the response should match this JSON

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location",
  "lat": 45.524098,
  "lng": -122.688408,
  "acc": 300
}
```
