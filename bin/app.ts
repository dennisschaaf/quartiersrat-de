#!/usr/bin/env bun
import { App } from "aws-cdk-lib";
import { QuartiersratCertStack } from "../lib/quartiersrat-cert-stack.ts";
import { QuartiersratEmailStack } from "../lib/quartiersrat-email-stack.ts";
import { QuartiersratStack } from "../lib/quartiersrat-stack.ts";
import { QuartiersratZoneStack } from "../lib/quartiersrat-zone-stack.ts";

const account = "806941787553";
const domainName = "quartiersrat.de";

const app = new App();

// 1. Creates the Route53 hosted zone. After first deploy, point the domain's
//    nameservers to the values in the NameServers output.
const zoneStack = new QuartiersratZoneStack(app, "QuartiersratZone", {
  env: { account, region: "eu-central-1" },
  crossRegionReferences: true,
  domainName,
});

// 2. ACM certificate in us-east-1 (required for CloudFront).
//    Uses DNS validation — CDK writes the validation records into the hosted zone.
const certStack = new QuartiersratCertStack(app, "QuartiersratCerts", {
  env: { account, region: "us-east-1" },
  crossRegionReferences: true,
  domainName,
  zone: zoneStack.zone,
});

// 3. SES email receiving + forwarding (eu-west-1, the nearest region that supports SES inbound).
new QuartiersratEmailStack(app, "QuartiersratEmail", {
  env: { account, region: "eu-west-1" },
  crossRegionReferences: true,
  domainName,
  zone: zoneStack.zone,
  forwardTo: "dennis@dennisschaaf.com",
  forwardToHarthof: "dennis@dennisschaaf.com,uqu@gmx.de,e.hahn@etc-muenchen.de",
});

// 4. S3 + CloudFront for quartiersrat.de and harthof.quartiersrat.de.
new QuartiersratStack(app, "QuartiersratStack", {
  env: { account, region: "eu-central-1" },
  crossRegionReferences: true,
  domainName,
  zone: zoneStack.zone,
  certificate: certStack.certificate,
});
