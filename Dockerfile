FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
ENV PORT=8080 DATA_DIR=/data TRUST_PROXY=1
RUN mkdir -p /data && chown node:node /data /app
USER node
EXPOSE 8080
CMD ["node", "server.js"]
