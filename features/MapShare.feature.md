---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  publicDeviceId: outfling-swanherd-attaghan
  shareDeviceAPI: "https://share-device.lambda-url.eu-west-1.on.aws/"
  confirmOwnershipAPI: "https://confirm-ownership.lambda-url.eu-west-1.on.aws/"
  sharingStatusAPI: "https://sharing-status.lambda-url.eu-west-1.on.aws/"
  devicesAPI: "https://confirm-ownership.lambda-url.eu-west-1.on.aws/"
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
---

# Sharing a device on the map

> As a user I can share a device of which I know the fingerprint, so the data
> can be compared with other devices and can be observed by users without
> needing to know the fingerprint.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And I have a user's email in `email`

## Share the device

> Using the device ID I can share the device

When I `POST` to `${shareDeviceAPI}` with

```json
{
  "deviceId": "${fingerprint_deviceId}",
  "model": "PCA20035+solar",
  "email": "${email}"
}
```

Then I should receive a
`https://github.com/hello-nrfcloud/proto/map/share-device-request` response

And I store `id` of the last response into `publicDeviceId`

## Confirm the email

When I `POST` to `${confirmOwnershipAPI}` with

```json
{
  "deviceId": "${fingerprint_deviceId}",
  "token": "123456"
}
```

Then I should receive a
`https://github.com/hello-nrfcloud/proto/map/share-device-ownership-confirmed`
response

## The devices publishes data

> Once a device has been shared, its data will be publicly available.  
> Devices publish using their own protocol, and it is converted to LwM2M
> according to the definitions in https://github.com/hello-nrfcloud/proto-lwm2m/

Given I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

And the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "data": "3.123457",
  "ts": "$number{ts}"
}
```

## Access devices using their public ID

> The public id will be shown on the map, and users can also provide a list of
> public ids to select a set of devices they are interested in

When I `POST` to `${devicesAPI}?ids=${publicDeviceId}`

Then I should receive a `https://github.com/hello-nrfcloud/proto/map/devices`
response

And `$.devices[id="${publicDeviceId}"]` of the last response should match

```json
{
  "id": "${publicDeviceId}",
  "model": "PCA20035+solar",
  "state": [
    {
      "ObjectID": 14210,
      "ObjectVersion": "1.0",
      "Resources": {
        "0": 3.123457,
        "99": "${tsISO}"
      }
    }
  ]
}
```

## The sharing status of a device can be checked using the device ID

> Users should be able to determine whether a certain device is sharing data

When I `GET` to `${sharingStatusAPI}?id=${fingerprint_deviceId}`

Then I should receive a `https://github.com/hello-nrfcloud/proto/map/device`
response

And the last response should match

```json
{
  "id": "${publicDeviceId}",
  "model": "PCA20035+solar"
}
```
