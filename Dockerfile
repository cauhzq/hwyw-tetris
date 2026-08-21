FROM node:18-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY data.json ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
