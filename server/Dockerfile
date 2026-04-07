# Server Dockerfile
FROM node:20-slim

# Install R and jsonlite
RUN apt-get update && apt-get install -y r-base && \
    R -e "install.packages('jsonlite', repos='https://cloud.r-project.org')" && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc

EXPOSE 3001
CMD ["node", "dist/index.js"]
