#!/bin/ash

set -e

# Dynamic vars
cmdname=$(basename "$(readlink -f "$0")")
dirname=$(dirname "$(readlink -f "$0")")
appname=${cmdname%.*}

# Colourisation support for logging and output.
_colour() {
  printf '\033[1;31;'${1}'m%b\033[0m' "$2"
}
green() { _colour "32" "$1"; }
red() { _colour "40" "$1"; }
yellow() { _colour "33" "$1"; }
blue() { _colour "34" "$1"; }

# Conditional logging
log() {
  echo "[$(blue "$appname")] [$(green info)] [$(date +'%Y%m%d-%H%M%S')] $1" >&2
}

warn() {
  echo "[$(blue "$appname")] [$(yellow WARN)] [$(date +'%Y%m%d-%H%M%S')] $1" >&2
}

error() {
  echo "[$(blue "$appname")] [$(red ERROR)] [$(date +'%Y%m%d-%H%M%S')] $1" >&2
}


log "Environment to file"
mkdir -p /mosquitto/security
for VAR in $(env); do
    if [ -n "$(echo "$VAR" | grep -E '^ENV__FILE__')" ]; then
      FILE_NAME=$(echo "$VAR" | sed -r "s/ENV__FILE__([^=]*)=.*/\1/g" | tr '[:upper:]' '[:lower:]')
      FILE_NAME_EXT=$(echo "$FILE_NAME" | sed -r "s/_([^_]+)$/.\1/g")
      VAR_FULL_NAME=$(echo "$VAR" | sed -r "s/([^=]*)=.*/\1/g")
      log "Extract value to '$FILE_NAME_EXT' from env: $VAR_FULL_NAME"
      eval "echo \"\${$VAR_FULL_NAME}\"" > "/mosquitto/security/$FILE_NAME_EXT"
    fi
done

log "Running: $@"
exec "$@"