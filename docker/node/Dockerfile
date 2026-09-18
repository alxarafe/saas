FROM node:22

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/node-api

COPY node-api/package.json ./
RUN npm install

COPY node-api/ ./

EXPOSE 3000

CMD ["npm", "run", "dev"]
