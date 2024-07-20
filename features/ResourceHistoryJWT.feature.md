---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  publicDeviceId: d952c1bb-9028-4a0b-b8a8-94138ff7a93a
  jwtKeyId: 7de5c852-558e-4862-b12a-44cfa4faaf44
  APIURL: https://api.hello.nordicsemi.cloud
  mapAPIURL: https://api.nordicsemi.world/
  deviceJwt: eyJhbGciOiJFUzUxMiIsInR5cCI6IkpXVCIsImtpZCI6ImEyMGM0NzZkLTVlZjUtNDE1NS1iODllLTdkZWRiMzJjODVhNCJ9.eyJpZCI6ImQ0OThkNzZhLWQ0ZjktNGQ4YS1iMTYwLTNlODA5NGMzOGNmYSIsImRldmljZUlkIjoidGFsbXVkaWMtb3ZlcnJhdGUtcGVuc2l2ZWQiLCJtb2RlbCI6InRoaW5neTkxeCIsImlhdCI6MTcyMTI4NjA1NywiZXhwIjoxNzIxMjg5NjU3LCJhdWQiOiJoZWxsby5ucmZjbG91ZC5jb20ifQ.Afn2Vj7V4boatn3Dwf4yZCTh09lTpfAEfsaX2uTZv0z2EvcWVH3CeVVsEmvCtDb8mnpvxJcj88-l9PlJqShKzZF5AShz6Ps0Igkzm0PueGjK-nq12I8DTgraT6fdSB3v5ALzLC9ozwyuPN7kJDLMHMHkO3j24sveBvFLg2BLsharSRBN
needs:
  - History can be fetched for numeric LwM2M object resources
---

# Query device history authenticated by JWT

> The hello.nrfcloud.com/map backend can produce a JWT that attest that a device
> is publicly shared. For these devices the backend should return the history,
> when the JWT is presented as an authentication token.
>
> The public key to verify the JWT is published on
> https://api.nordicsemi.world/2024-04-15/.well-known/jwks.json

## Background

Given I have a random UUIDv4 in `jwtKeyId`

Given this is the JWT private key for the key `${jwtKeyId}`

```
-----BEGIN EC PARAMETERS-----
BgUrgQQAIw==
-----END EC PARAMETERS-----
-----BEGIN EC PRIVATE KEY-----
MIHcAgEBBEIAOrlZ3ie+Xjsi0EsPLAONxDvYSfuOWZQnTzMifvsilRiLze4Zq3I+
6YJt95T9O5BM5+BRWO7QU10VPOtHDcGnDeSgBwYFK4EEACOhgYkDgYYABAHBRbay
lOo5Og2vCbDHKaNrQMGkw35RZNkeiLdnuHyUL4x6X7NW/e3LX219MiiR3bYjJDwr
KVRvYGFTBGzjZqy8nwAsBc+r4aaIFpVjkHPWaWYej4NUjn8WKSuuTtS3VUZEhORj
d0jqKe99Cb5R20zBr5X1RvgOADQg4H41M97t3kWQ6w==
-----END EC PRIVATE KEY-----
```

And this HTTP API Mock response for
`GET ${mapAPIURL}/2024-04-15/.well-known/jwks.json` is queued

```
HTTP/1.1 200 OK
Content-type: application/json; charset=utf-8

{
  "@context": "https://datatracker.ietf.org/doc/html/rfc7517",
  "keys": [
    {
      "alg": "ES512",
      "kid": "${jwtKeyId}",
      "use": "sig",
      "key": "-----BEGIN PUBLIC KEY-----\nMIGbMBAGByqGSM49AgEGBSuBBAAjA4GGAAQBwUW2spTqOToNrwmwxymja0DBpMN+\nUWTZHoi3Z7h8lC+Mel+zVv3ty19tfTIokd22IyQ8KylUb2BhUwRs42asvJ8ALAXP\nq+GmiBaVY5Bz1mlmHo+DVI5/Fikrrk7Ut1VGRITkY3dI6invfQm+UdtMwa+V9Ub4\nDgA0IOB+NTPe7d5FkOs=\n-----END PUBLIC KEY-----\n"
    }
  ]
}
```

## Fetch history

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I have a random map public device id in `publicDeviceId`

And I have a JWT in `deviceJwt` signed with the key `${jwtKeyId}` and with this
payload

```json
{
  "id": "${publicDeviceId}",
  "deviceId": "${fingerprint_deviceId}",
  "model": "thingy91x",
  "aud": "hello.nrfcloud.com"
}
```

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/history/14202/0?jwt=${deviceJwt}&timeSpan=lastDay`

Then I should receive a
`https://github.com/hello-nrfcloud/proto/lwm2m/object/history` response
