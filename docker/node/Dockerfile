FROM node:22

WORKDIR /app

COPY node-api/package*.json ./

RUN npm install

COPY node-api /app

EXPOSE 3000

CMD ["npm", "run", "dev"]
