# Server Dockerfile
FROM node:20-slim

# Install R
RUN apt-get update && apt-get install -y r-base && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
