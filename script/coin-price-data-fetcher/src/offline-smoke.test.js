// @flow
const modules = [
  './api',
  './fetch-timeout',
  './fetcher',
  './fiat-exchange-rate',
  './sign',
  './uploader',
  './utils',
];

test('loads offline coin price fetcher modules', () => {
  for (const modulePath of modules) {
    expect(() => require(modulePath)).not.toThrow();
  }
});
