FROM node:18-alpine as builder
WORKDIR /app
COPY . /app
RUN npm install
RUN npm run build

WORKDIR /app/loadtest
RUN npm install

FROM node:18-alpine
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV production
COPY package*.json /app/
RUN npm ci --omit=dev
COPY --from=builder --chown=node:node /app/dist /app
COPY --from=builder --chown=node:node /app/loadtest /loadtest
RUN touch data.csv && chown node:node data.csv

USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./bin/runner.sh"]

