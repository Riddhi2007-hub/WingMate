# WingMate: builds the pages + server, then runs the server. Needs a persistent disk mounted at /data (the database lives there).
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    WINGMATE_DATA_DIR=/data WINGMATE_PUBLIC_DIR=/app/dist \
    WINGMATE_SECURE_COOKIES=1 WINGMATE_TRUST_PROXY=1
EXPOSE 3000
CMD ["node", "server-dist/server.mjs"]
