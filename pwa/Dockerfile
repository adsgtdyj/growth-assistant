FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install --omit=dev

COPY server.js ./
COPY public ./public

EXPOSE 3001

CMD ["npm", "start"]