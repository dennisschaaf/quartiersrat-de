"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");

const s3 = new S3Client({});
const ses = new SESClient({});

const FORWARD_TO = process.env.FORWARD_TO.split(",").map((s) => s.trim());
const FROM_EMAIL = process.env.FROM_EMAIL;

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const rawEmail = await Body.transformToString();

    // Extract original sender for Reply-To
    const originalFrom = (rawEmail.match(/^From:\s*(.+)/im) ?? [])[1]?.trim() ?? "";

    // Rewrite From to our verified domain address; preserve original sender as Reply-To
    let modified = rawEmail.replace(
      /^From:.*$/im,
      `From: Quartiersrat Weiterleitung <${FROM_EMAIL}>`
    );

    if (/^Reply-To:/im.test(rawEmail)) {
      modified = modified.replace(/^Reply-To:.*$/im, `Reply-To: ${originalFrom}`);
    } else {
      modified = modified.replace(/^(From:.*)/im, `$1\r\nReply-To: ${originalFrom}`);
    }

    await ses.send(
      new SendRawEmailCommand({
        Destinations: FORWARD_TO,
        RawMessage: { Data: Buffer.from(modified) },
      })
    );
  }
};
