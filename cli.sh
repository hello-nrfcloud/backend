#!/usr/bin/env bash

export NODE_NO_WARNINGS=1
node --import tsx ./cli/cli.ts "$@"
