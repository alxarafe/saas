FROM node:22 AS build

WORKDIR /app

COPY node-api/package.json ./
RUN npm install

COPY node-api/src ./src
COPY node-api/tsconfig.json ./
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
RUN npm install --omit=dev \
    && apk add --no-cache curl

EXPOSE 3000

CMD ["node", "dist/index.js"]