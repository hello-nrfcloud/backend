# Define custom function directory
ARG FUNCTION_DIR="/function"
ARG COAP_SIMULATOR_DOWNLOAD_URL

FROM node:21 as build-image

# Include global arg in this stage of the build
ARG FUNCTION_DIR
ARG COAP_SIMULATOR_DOWNLOAD_URL

# Install build dependencies
RUN apt-get update && \
  apt-get install -y \
  g++ \
  make \
  cmake \
  unzip \
  libcurl4-openssl-dev \
  wget \
  tar

ADD ${COAP_SIMULATOR_DOWNLOAD_URL} /tmp/coap.zip
RUN unzip /tmp/coap.zip -d /tmp

# Copy function code
RUN mkdir -p ${FUNCTION_DIR}

WORKDIR ${FUNCTION_DIR}

# Generate package.json
RUN echo '{"type": "module"}' > ${FUNCTION_DIR}/package.json

# Install the runtime interface client
RUN npm install aws-lambda-ric 

COPY src /tmp/src/

# FIXME: Remove pin once issue is resolved: https://github.com/swc-project/swc/issues/8988
RUN npm i @swc/core@1.5.7 @swc/cli@0.3.12 && npx swcx compile --config-json '{"jsc":{"target":"es2022"}}' --out-file ${FUNCTION_DIR}/handler.js /tmp/src/handler.ts

# Grab a fresh slim copy of the image to reduce the final size
FROM node:21-slim

RUN apt-get update && apt-get install -y openjdk-17-jre-headless

# Required for Node runtimes which use npm@8.6.0+ because
# by default npm writes logs under /home/.npm and Lambda fs is read-only
ENV NPM_CONFIG_CACHE=/tmp/.npm

# Include global arg in this stage of the build
ARG FUNCTION_DIR

# Set working directory to function root directory
WORKDIR ${FUNCTION_DIR}

# Copy in the built dependencies
COPY --from=build-image ${FUNCTION_DIR} ${FUNCTION_DIR}

COPY --from=build-image /tmp/coap-simulator ${FUNCTION_DIR}/coap-simulator

# Set runtime interface client as default command for the container runtime
ENTRYPOINT ["/usr/local/bin/npx", "aws-lambda-ric"]

# Pass the name of the function handler as an argument to the runtime
CMD ["handler.handler"]