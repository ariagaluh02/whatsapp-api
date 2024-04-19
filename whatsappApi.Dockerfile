# Use the official Node.js Alpine image as the base image
FROM node:20-slim

# Set the working directory
WORKDIR /usr/src/app

# Install Chromium
# ENV CHROME_BIN="/usr/bin/chromium-browser" \
ENV CHROME_BIN="/usr/bin/chromium" \
    # PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" \
    NODE_ENV="production" \
    TZ="Asia/Jakarta"

RUN apt-get update \
  && apt-get install -y \
  gconf-service \
  libgbm-dev \
  libasound2 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgcc1 \
  libgconf-2-4 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  ca-certificates \
  fonts-liberation \
  libappindicator1 \
  libnss3 \
  lsb-release \
  xdg-utils \
  chromium \
  tzdata \
  && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the dependencies
RUN npm ci --only=production --ignore-scripts
# RUN npm i puppeteer

# Copy the rest of the source code to the working directory
COPY . .

# RUN npm install --prefix node_modules/whatsapp-web.js/node_modules/puppeteer
# USER node
# Expose the port the API will run on
EXPOSE 3000

# USER node

# Start the API
CMD ["npm", "start"]