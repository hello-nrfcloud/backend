#!/bin/sh

CMD="node index.js simulate --table $TABLE_NAME --number $NUMBER --duration $DURATION"
eval $CMD

if [ $? -ne 0 ]; then
  exit 1
fi

if [ -d "../loadtest" ]; then
  ../loadtest/node_modules/artillery/bin/run run simulator.yml
else
  echo "Cannot find loadtest folder"
  exit 1
fi