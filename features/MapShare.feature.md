---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  shareDeviceURL: "https://share-device.lambda-url.eu-west-1.on.aws/"
  confirmOwnershipURL: "https://confirm-ownership.lambda-url.eu-west-1.on.aws/"
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

When I `POST` to `${shareDeviceURL}` with

```json
{
  "deviceId": "${fingerprint_deviceId}",
  "model": "PCA20035+solar",
  "email": "${email}"
}
```

Then the response should be a
`https://github.com/hello-nrfcloud/backend/map/share-device-request`

## Confirm the email

When I `POST` to `${confirmOwnershipURL}` with

```json
{
  "id": "${fingerprint_deviceId}",
  "token": "123456"
}
```

Then the response should be a
`https://github.com/hello-nrfcloud/backend/map/share-device-ownership-confirmed`
