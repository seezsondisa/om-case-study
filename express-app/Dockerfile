FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY express.js ./

EXPOSE 4567

CMD ["node", "express.js"]
