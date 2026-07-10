FROM node:22.23.1-alpine
RUN apk add --no-cache git openssh python3 apk-cron make alpine-sdk shadow
RUN groupadd -g 1001 cardano
RUN useradd -rm -d /home/cardano -s /bin/sh -g 1001 -u 1001 cardano
RUN mkdir /home/cardano/app
RUN chown -R 1001:1001 /home/cardano/app
WORKDIR /home/cardano/app
COPY . .
RUN npm ci
RUN cd script/coin-price-data-fetcher && npm ci
RUN touch /var/log/cron.log
RUN echo "*/5 * * * * su -s /bin/sh cardano -c 'cd /home/cardano/app/script/coin-price-data-fetcher && npm run start-fetcher'" > /etc/crontabs/root
RUN echo "* * * * * su -s /bin/sh cardano -c 'cd /home/cardano/app && node ./dist/coin-price/poller.js'" >> /etc/crontabs/root
EXPOSE 8080
CMD ["sh", "-c", "crond -l 2 -f > /dev/stdout 2> /dev/stderr & su -s /bin/sh cardano -c 'node ./dist/index.js'"]
