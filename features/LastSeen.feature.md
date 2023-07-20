# Last seen

> I should receive a timestamp when the device last sent in data to the cloud so
> I can determine if the device is active.

## Background

Given I have the fingerprint under `exeger` account for a `PCA20035+solar`
device in `fingerprint`

<!-- The device sends in data to the cloud -->

And I store `$floor($millis()/1000)*1000` into `ts`

And the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "ts": "$number{ts}",
  "data": "3.123456"
}
```

## Retrieve last seen timestamp on connect

Given I store `$fromMillis(${ts})` into `tsISO`

When I connect to the websocket using fingerprint `${fingerprint}`

<!-- @retry:tries=5,initialDelay=5000,delayFactor=1 -->

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprint_deviceId}",
  "model": "PCA20035+solar",
  "lastSeen": "${tsISO}"
}
```
