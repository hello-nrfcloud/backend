# nRF Cloud device simulator

Simulates a pre-provisioned device on nRF Cloud that is ready to connect.

## Setup

Export your nRF Cloud API key and team ID (see [`.envrc.dist`](./.envrc.dist)).

## Generate Device certificates

```bash
mkdir ./certificates
```

### Generate a new CA

> All commands are for OpenSSL v3

```bash
CA_ID=`uuidgen | tr -d '\n'`
# CA Private key
openssl genrsa -out ./certificates/CA.${CA_ID}.key 2048
# CA Certificate
openssl req -x509 -new -nodes -key ./certificates/CA.${CA_ID}.key -sha256 -days 30 -out ./certificates/CA.${CA_ID}.cert -subj '/OU=nRF Cloud Devices (Development)'
```

### Generate a device certificate

```bash
# Generate IMEI
IMEI="3566642`shuf -i 10000000-99999999 -n 1 | tr -d '\n'`"
# Device Private key
openssl ecparam -out ./certificates/device.${IMEI}.key -name prime256v1 -genkey
# Device Certificate
openssl req -x509 -new -nodes -key ./certificates/device.${IMEI}.key -sha256 -days 10680 -out ./certificates/device.${IMEI}.cert -subj "/CN=${IMEI}"
```

### Sign key with cert

```bash
openssl req -key ./certificates/device.${IMEI}.key -new -out ./certificates/device.${IMEI}.csr -subj "/CN=${IMEI}"
openssl x509 -req -CA ./certificates/CA.${CA_ID}.cert -CAkey ./certificates/CA.${CA_ID}.key -in ./certificates/device.${IMEI}.csr -out ./certificates/device.${IMEI}.signed.cert -days 10680
```

### View signed cert

```bash
openssl x509 -text -noout -in ./certificates/device.${IMEI}.signed.cert
```

## Register device

```bash
node register-device.js ${IMEI}
```

## Connect device

```bash
node simulator.js ${IMEI}
```
