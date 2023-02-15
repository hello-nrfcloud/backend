FROM node:18-alpine as builder
WORKDIR /app
COPY ./src/package*.json /app/
RUN npm install
COPY ./src /app
RUN npm run build


FROM node:18-alpine
RUN apk add --no-cache tini openssl
WORKDIR /app
ENV NODE_ENV production
COPY ./src/package*.json /app/
RUN npm ci --only=production
COPY --from=builder --chown=node:node /dist /app
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]


