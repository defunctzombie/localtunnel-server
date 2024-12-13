FROM node:22-alpine

WORKDIR /app

COPY package.json /app/
COPY pnpm-lock.yaml /app/

RUN apk add --no-cache pnpm && \
    pnpm install --prod && \
    pnpm store prune

COPY . /app

ENV NODE_ENV production
ENTRYPOINT ["node", "./bin/server"]
