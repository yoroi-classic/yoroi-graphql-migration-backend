const modules = [
  '../flow-files/src/api',
  '../flow-files/src/fetch-timeout',
  '../flow-files/src/fetcher',
  '../flow-files/src/fiat-exchange-rate',
  '../flow-files/src/sign',
  '../flow-files/src/uploader',
  '../flow-files/src/utils',
];

for (const modulePath of modules) {
  require(modulePath);
}
