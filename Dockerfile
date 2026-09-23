FROM node:22-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Kolkata
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
# Applies schema changes, creates default data + admin on first run, then starts the site
CMD ["sh", "-c", "npm run db:push && npm run db:seed && npm start"]
