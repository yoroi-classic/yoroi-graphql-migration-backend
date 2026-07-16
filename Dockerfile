FROM node:22.23.1-alpine AS builder
RUN apk add --no-cache alpine-sdk git make openssh python3
WORKDIR /home/cardano/app
COPY . .
RUN npm ci --ignore-scripts
RUN npm run build
RUN cd script/coin-price-data-fetcher && npm ci --ignore-scripts
RUN cd script/coin-price-data-fetcher && npm run flow-remove-types
RUN npm prune --omit=dev
RUN cd script/coin-price-data-fetcher && npm prune --omit=dev

FROM node:22.23.1-alpine
RUN apk add --no-cache apk-cron shadow
RUN groupadd -g 1001 cardano
RUN useradd -rm -d /home/cardano -s /bin/sh -g 1001 -u 1001 cardano
RUN mkdir -p /home/cardano/app/script/coin-price-data-fetcher
RUN chown -R 1001:1001 /home/cardano/app
WORKDIR /home/cardano/app
COPY --from=builder --chown=1001:1001 /home/cardano/app/package*.json ./
COPY --from=builder --chown=1001:1001 /home/cardano/app/config ./config
COPY --from=builder --chown=1001:1001 /home/cardano/app/dist ./dist
COPY --from=builder --chown=1001:1001 /home/cardano/app/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /home/cardano/app/script/coin-price-data-fetcher/package*.json ./script/coin-price-data-fetcher/
COPY --from=builder --chown=1001:1001 /home/cardano/app/script/coin-price-data-fetcher/config ./script/coin-price-data-fetcher/config
COPY --from=builder --chown=1001:1001 /home/cardano/app/script/coin-price-data-fetcher/flow-files ./script/coin-price-data-fetcher/flow-files
COPY --from=builder --chown=1001:1001 /home/cardano/app/script/coin-price-data-fetcher/node_modules ./script/coin-price-data-fetcher/node_modules
RUN touch /var/log/cron.log
RUN echo "*/5 * * * * su -s /bin/sh cardano -c 'cd /home/cardano/app/script/coin-price-data-fetcher && npm run start-fetcher'" > /etc/crontabs/root
RUN echo "* * * * * su -s /bin/sh cardano -c 'cd /home/cardano/app && node ./dist/coin-price/poller.js'" >> /etc/crontabs/root
EXPOSE 8080
# Alpine crond reads /etc/crontabs/root as root; every Node process is explicitly dropped to cardano.
CMD ["sh", "-c", "crond -l 2 -f > /dev/stdout 2> /dev/stderr & su -s /bin/sh cardano -c 'node ./dist/index.js'"]
