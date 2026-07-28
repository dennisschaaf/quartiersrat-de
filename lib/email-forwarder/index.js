"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");

const s3 = new S3Client({});
const ses = new SESClient({});

const FORWARD_TO = process.env.FORWARD_TO.split(",").map((s) => s.trim());
const FORWARD_TO_HARTHOF = process.env.FORWARD_TO_HARTHOF
  ? process.env.FORWARD_TO_HARTHOF.split(",").map((s) => s.trim())
  : FORWARD_TO;
const FROM_EMAIL = process.env.FROM_EMAIL;

// Headers that SES adds on inbound or that would cause re-send failures
const DROP_HEADERS = /^(Return-Path|DKIM-Signature|X-SES-DKIM-SIGNATURE|X-SES-RECEIPT|X-SES-Spam-Verdict|X-SES-Virus-Verdict|Received-SPF|Authentication-Results|ARC-Seal|ARC-Message-Signature|ARC-Authentication-Results|Sender|Received|X-Google-DKIM-Signature|X-Forwarded-To|X-Original-To):/i;

function parseEmail(raw) {
  const normalised = raw.replace(/\r\n/g, "\n");
  const splitAt = normalised.indexOf("\n\n");
  const headerText = splitAt === -1 ? normalised : normalised.slice(0, splitAt);
  const body = splitAt === -1 ? "" : normalised.slice(splitAt);

  // Unfold multi-line headers
  const headers = [];
  for (const line of headerText.split("\n")) {
    if (/^\s/.test(line) && headers.length) {
      headers[headers.length - 1] += " " + line.trim();
    } else if (line.length) {
      headers.push(line);
    }
  }

  return { headers, body };
}

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const raw = await Body.transformToString();

    const { headers, body } = parseEmail(raw);

    const fromHeader = headers.find((h) => /^From:/i.test(h)) ?? "";
    const originalFrom = fromHeader.replace(/^From:\s*/i, "").trim();
    const hasReplyTo = headers.some((h) => /^Reply-To:/i.test(h));

    const toHeader = headers.find((h) => /^To:/i.test(h)) ?? "";
    const isHarthof = /harthof\./i.test(toHeader);
    const destinations = isHarthof ? FORWARD_TO_HARTHOF : FORWARD_TO;

    const newHeaders = [];
    for (const h of headers) {
      if (DROP_HEADERS.test(h)) continue;

      if (/^From:/i.test(h)) {
        newHeaders.push(`From: Quartiersrat Weiterleitung <${FROM_EMAIL}>`);
        if (!hasReplyTo) newHeaders.push(`Reply-To: ${originalFrom}`);
        continue;
      }
      if (/^Reply-To:/i.test(h)) {
        newHeaders.push(`Reply-To: ${originalFrom}`);
        continue;
      }

      newHeaders.push(h);
    }

    const modified = newHeaders.join("\r\n") + body.replace(/\n/g, "\r\n");

    await ses.send(
      new SendRawEmailCommand({
        Source: FROM_EMAIL,
        Destinations: destinations,
        RawMessage: { Data: Buffer.from(modified) },
      })
    );
  }
};
