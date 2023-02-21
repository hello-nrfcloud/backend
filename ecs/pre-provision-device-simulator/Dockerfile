FROM node:18-alpine as builder
WORKDIR /app
COPY . /app
RUN npm install
RUN npm run build

FROM node:18-alpine
RUN apk add --no-cache tini openssl
WORKDIR /app
ENV NODE_ENV production
COPY package*.json /app/
RUN npm ci --only=production
COPY --from=builder --chown=node:node /app/dist /app
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]


