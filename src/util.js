const fs = require('fs')
const aws = require('@aws-sdk/client-s3')
const client = new aws.S3Client({region: 'eu-west-2'});
const bucket = 'potato-sim';

module.exports.readFile = async filePath => {
  const command = new aws.GetObjectCommand({
    Bucket: bucket,
    Key: filePath
  });
  const response = await client.send(command);
  return await response.Body.transformToString();
}

module.exports.writeFile = async (filePath, data) => {
  const command = new aws.PutObjectCommand({
    Bucket: bucket,
    Key: filePath,
    Body: data
  });
  await client.send(command);
}
