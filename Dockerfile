FROM node:18-slim

WORKDIR /app

COPY package.json .
RUN npm install

COPY public ./public

EXPOSE 5001

CMD ["npm", "start"]
