import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { MxRecord, type IHostedZone } from "aws-cdk-lib/aws-route53";
import { BlockPublicAccess, Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import { EmailIdentity, Identity, ReceiptRuleSet, TlsPolicy } from "aws-cdk-lib/aws-ses";
import { S3 as S3Action } from "aws-cdk-lib/aws-ses-actions";
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources";
import type { Construct } from "constructs";

interface QuartiersratEmailStackProps extends StackProps {
  domainName: string;
  zone: IHostedZone;
  // Comma-separated list of addresses to forward all incoming mail to
  forwardTo: string;
}

export class QuartiersratEmailStack extends Stack {
  constructor(scope: Construct, id: string, props: QuartiersratEmailStackProps) {
    super(scope, id, props);

    // ── S3 bucket for raw email storage ────────────────────────────────
    const emailBucket = new Bucket(this, "EmailBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{ expiration: Duration.days(30) }],
    });

    // SES needs permission to put objects into the bucket
    emailBucket.addToResourcePolicy(
      new PolicyStatement({
        principals: [new ServicePrincipal("ses.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [emailBucket.arnForObjects("emails/*")],
        conditions: {
          StringEquals: { "aws:Referer": this.account },
        },
      })
    );

    // ── Forwarder Lambda ────────────────────────────────────────────────
    const forwarder = new Function(this, "Forwarder", {
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: Code.fromAsset("lib/email-forwarder"),
      environment: {
        FORWARD_TO: props.forwardTo,
        FROM_EMAIL: `noreply@${props.domainName}`,
      },
      timeout: Duration.seconds(30),
    });

    emailBucket.grantRead(forwarder);

    forwarder.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ses:SendRawEmail"],
        resources: ["*"],
      })
    );

    // Trigger Lambda whenever SES drops a new email into the bucket
    emailBucket.addEventNotification(
      EventType.OBJECT_CREATED,
      new LambdaDestination(forwarder),
      { prefix: "emails/" }
    );

    // ── SES domain identity + DKIM (records added automatically to zone) ─
    new EmailIdentity(this, "DomainIdentity", {
      identity: Identity.publicHostedZone(props.zone),
      mailFromDomain: `mail.${props.domainName}`,
    });

    // ── MX records pointing to SES inbound endpoint ─────────────────────
    // SES email receiving is not available in eu-central-1; this stack runs in eu-west-1
    const inboundSmtp = `inbound-smtp.${this.region}.amazonaws.com`;
    new MxRecord(this, "InboundMx", {
      zone: props.zone,
      values: [{ hostName: inboundSmtp, priority: 10 }],
    });
    new MxRecord(this, "HarthofInboundMx", {
      zone: props.zone,
      recordName: `harthof.${props.domainName}`,
      values: [{ hostName: inboundSmtp, priority: 10 }],
    });

    // ── SES receipt rule set ────────────────────────────────────────────
    const ruleSet = new ReceiptRuleSet(this, "RuleSet");

    ruleSet.addRule("ForwardAll", {
      recipients: [props.domainName, `harthof.${props.domainName}`],
      actions: [new S3Action({ bucket: emailBucket, objectKeyPrefix: "emails/" })],
      enabled: true,
      scanEnabled: true,
      tlsPolicy: TlsPolicy.OPTIONAL,
    });

    // CloudFormation cannot activate a rule set natively; use a custom resource
    new AwsCustomResource(this, "ActivateRuleSet", {
      installLatestAwsSdk: false,
      onCreate: {
        service: "SES",
        action: "setActiveReceiptRuleSet",
        parameters: { RuleSetName: ruleSet.receiptRuleSetName },
        physicalResourceId: PhysicalResourceId.of("ActivateRuleSet"),
      },
      onUpdate: {
        service: "SES",
        action: "setActiveReceiptRuleSet",
        parameters: { RuleSetName: ruleSet.receiptRuleSetName },
        physicalResourceId: PhysicalResourceId.of("ActivateRuleSet"),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }
}
