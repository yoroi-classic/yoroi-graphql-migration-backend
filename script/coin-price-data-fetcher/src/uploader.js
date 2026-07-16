// @flow
const config = require('config');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const logger = require('./logger');

import type { Ticker } from './types';

let _S3 = null;

function getS3() {
  if (_S3) {
    return _S3;
  }

  _S3 = new S3Client({
    region: config.get('s3.region'),
    credentials: {
      accessKeyId: config.get('s3.accessKeyId'),
      secretAccessKey: config.get('s3.secretAccessKey'),
    },
  });

  return _S3;
}

const RETRY_COUNT = 3;

async function upload(ticker: Ticker): Promise<void> {
  const S3 = getS3();
  const fileName = `prices-${ticker.from}-${ticker.timestamp}.json`;
  const uploadParams = {
    Body: JSON.stringify(ticker),
    Key: fileName,
    Bucket: config.get('s3.bucketName'),
  };
  for (let i = 0; i < RETRY_COUNT; i++) {
    let resp;
    if (config.dryRun) {
      logger.info('dry run:', uploadParams);
    } else {
      try {
        resp = await S3.send(new PutObjectCommand(uploadParams));
      } catch (error) {
        logger.error('upload failed:', error);
        continue;
      }
      logger.info('price data uploaded:', resp);
    }
    break;
  }
}

module.exports = { upload };
