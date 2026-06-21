FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV HOST=0.0.0.0
ENV DATA_DIR=/data

EXPOSE 8765

CMD ["npm", "start"]
