#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
export ARTILLERY_ENGINE_PATH="$SCRIPT_DIR/../engines"

CMD="npm run load"

eval $CMD