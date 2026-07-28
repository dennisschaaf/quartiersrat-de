"use strict";

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const s3 = new S3Client({});
const ses = new SESClient({});
const ssm = new SSMClient({});

const FORWARD_TO = process.env.FORWARD_TO.split(",").map((s) => s.trim());
const FORWARD_TO_HARTHOF_PARAM = process.env.FORWARD_TO_HARTHOF_PARAM;
const FROM_EMAIL = process.env.FROM_EMAIL;

// Cache SSM value for 5 minutes across warm Lambda invocations
let harthofCache = { addresses: null, fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getHarthofAddresses() {
  if (!FORWARD_TO_HARTHOF_PARAM) return FORWARD_TO;
  const age = Date.now() - harthofCache.fetchedAt;
  if (harthofCache.addresses && age < CACHE_TTL_MS) return harthofCache.addresses;
  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: FORWARD_TO_HARTHOF_PARAM }));
  harthofCache = {
    addresses: Parameter.Value.split(",").map((s) => s.trim()),
    fetchedAt: Date.now(),
  };
  return harthofCache.addresses;
}

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
    const destinations = isHarthof ? await getHarthofAddresses() : FORWARD_TO;

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
    const rawMessage = { Data: Buffer.from(modified) };

    await Promise.allSettled(
      destinations.map((to) =>
        ses
          .send(new SendRawEmailCommand({ Source: FROM_EMAIL, Destinations: [to], RawMessage: rawMessage }))
          .catch((err) => console.error(`Failed to forward to ${to}:`, err.message))
      )
    );
  }
};
