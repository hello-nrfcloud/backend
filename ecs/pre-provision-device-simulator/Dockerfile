FROM node:18-alpine

RUN apk add --no-cache tini openssl
ENV NODE_ENV production
WORKDIR /app
COPY ./src/package*.json /app/
RUN npm ci --only=production

COPY --chown=node:node ./src /app
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]


