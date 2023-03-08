# mosquitto

This docker image is inspired by
(Efrecon)[https://github.com/efrecon/docker-mosquitto] because it provides easy
configuration though environment variables.

## Changes

Since we need to inject some certificates to be used to connect nRF Cloud and
AWS IoT, we can do that via environment variables with prefix
`ENV__FILE__<filename>`. For example, `ENV__FILE__NRF_CLOUD_PUB_CRT` will create
file named `nrf_cloud_pub.crt` inside `/mosquitto/security/` folder
