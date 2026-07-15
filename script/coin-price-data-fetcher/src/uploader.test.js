// @flow
process.env.PRICE_DATA_S3_BUCKET_NAME = 'price-bucket';
process.env.PRICE_DATA_S3_REGION = 'us-east-1';
process.env.PRICE_DATA_S3_ACCESS_KEY_ID = 'access-key';
process.env.PRICE_DATA_S3_SECRET_ACCESS_KEY = 'secret-key';

const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const uploader = require('./uploader');

const ticker = {
  from: 'ADA',
  timestamp: 1234567890,
  signature: 'signature',
  prices: {
    USD: 0.5,
  },
};

afterEach(() => jest.restoreAllMocks());

test('uploads ticker data with an S3 PutObject command', async () => {
  const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ ETag: '"etag"' });

  await uploader.upload(ticker);

  expect(send).toHaveBeenCalledTimes(1);

  const command = send.mock.calls[0][0];
  expect(command).toBeInstanceOf(PutObjectCommand);
  expect(command.input).toEqual({
    Body: JSON.stringify(ticker),
    Bucket: 'price-bucket',
    Key: 'prices-ADA-1234567890.json',
  });
});
