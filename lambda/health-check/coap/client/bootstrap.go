package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"strings"

	"time"

	"github.com/aws/aws-lambda-go/lambda"
	piondtls "github.com/pion/dtls/v2"
	"github.com/plgd-dev/go-coap/v3/dtls"
	"github.com/plgd-dev/go-coap/v3/message"
	"github.com/plgd-dev/go-coap/v3/message/codes"
	"github.com/plgd-dev/go-coap/v3/message/pool"

	"log"

	"github.com/golang-jwt/jwt"
)

type DeviceEvent struct {
	DeviceId   string `json:"deviceId"`
	PrivateKey string  `json:"privateKey"`
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int32  `json:"port"`
	Payload    string `json:"payload"`
}

func createJWTToken(privateKey *ecdsa.PrivateKey, deviceID string) (string, error) {

	expirationTime := time.Now().Add(10 * time.Minute).Unix()

	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.StandardClaims{
		Subject:   deviceID,
		ExpiresAt: expirationTime,
	})

	tokenString, err := token.SignedString(privateKey)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

type Response struct {
	StatusCode int32 `json:"statusCode"`
}


func HandleRequest(ctx context.Context, event *DeviceEvent) (*Response, error) {
	if event == nil {
		return &Response{StatusCode: 400}, fmt.Errorf("received nil event")
	}

	log.Println("DeviceId", event.DeviceId)
	log.Println("Payload", event.Payload)

	// Strip params
	_, rest := pem.Decode([]byte(event.PrivateKey))
	privateKey, err := jwt.ParseECPrivateKeyFromPEM(rest)
	check(err)

	token, err := createJWTToken(privateKey, event.DeviceId)
	if err != nil {
		log.Fatalf("Failed to create JWT token: %v", err)
	}
	log.Println("JWT Token:", token)

	// Connect to a DTLS server
	co, err := dtls.Dial("coap.nrfcloud.com:5684", &piondtls.Config{
		InsecureSkipVerify:    true,
		ConnectionIDGenerator: piondtls.OnlySendCIDGenerator(),
	})
	check(err)
	defer  co.Close()

	log.Println("Connected.")

	// Authenticate
	resp, err := co.Post(ctx, "/auth/jwt", message.TextPlain, strings.NewReader(token))
	check(err)
	checkResponse(resp, codes.Created)

	log.Println("Authenticated.")

	log.Printf("> /msg/d2c/raw: %s (hex encoded)\n", event.Payload)

	binaryPayload, err := hex.DecodeString(event.Payload)
	if err != nil {
		return &Response{StatusCode: 400}, fmt.Errorf("failed to decode hex encoded data: %v", err)
	}

	rawResp, err := co.Post(ctx, "/msg/d2c/raw", message.AppCBOR, bytes.NewReader(binaryPayload))
	check(err)
	checkResponse(rawResp, codes.Created)

	return &Response{StatusCode: 200}, nil
}

func main() {
	 lambda.Start(HandleRequest)
}

func check(e error) {
	if e != nil {
		panic(e)
	}
}

func checkResponse(resp *pool.Message, expected codes.Code) {
	if resp.Code() != expected {
		panic(fmt.Sprintf(`Request failed: %d`, resp.Code()))
	}
}
