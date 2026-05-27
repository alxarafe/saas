FROM node:22

WORKDIR /app/node-api

COPY node-api/package.json ./
RUN npm install

COPY node-api/ ./

EXPOSE 3000

CMD ["npm", "run", "dev"]
