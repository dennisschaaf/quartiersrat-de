import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type { ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  CachePolicy,
  Distribution,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ARecord, type IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";

interface QuartiersratStackProps extends StackProps {
  domainName: string;
  zone: IHostedZone;
  certificate: ICertificate;
}

export class QuartiersratStack extends Stack {
  constructor(scope: Construct, id: string, props: QuartiersratStackProps) {
    super(scope, id, props);

    // ── Root site: quartiersrat.de ──────────────────────────────────────
    const rootBucket = new Bucket(this, "RootBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const rootDistribution = new Distribution(this, "RootDistribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(rootBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: "index.html",
      domainNames: [props.domainName, `www.${props.domainName}`],
      certificate: props.certificate,
    });

    const rootAliasTarget = RecordTarget.fromAlias(new CloudFrontTarget(rootDistribution));
    new ARecord(this, "RootApexAlias", {
      zone: props.zone,
      target: rootAliasTarget,
    });
    new ARecord(this, "RootWwwAlias", {
      zone: props.zone,
      recordName: `www.${props.domainName}`,
      target: rootAliasTarget,
    });

    new BucketDeployment(this, "DeployRootSite", {
      sources: [Source.asset("static/root")],
      destinationBucket: rootBucket,
      distribution: rootDistribution,
      distributionPaths: ["/*"],
    });

    // ── Harthof subdomain: harthof.quartiersrat.de ─────────────────────
    const harthofBucket = new Bucket(this, "HarthofBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const harthofDistribution = new Distribution(this, "HarthofDistribution", {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(harthofBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: "index.html",
      domainNames: [`harthof.${props.domainName}`],
      certificate: props.certificate,
    });

    new ARecord(this, "HarthofAlias", {
      zone: props.zone,
      recordName: `harthof.${props.domainName}`,
      target: RecordTarget.fromAlias(new CloudFrontTarget(harthofDistribution)),
    });

    new BucketDeployment(this, "DeployHarthofSite", {
      sources: [Source.asset("static/harthof")],
      destinationBucket: harthofBucket,
      distribution: harthofDistribution,
      distributionPaths: ["/*"],
    });

    // ── Outputs ────────────────────────────────────────────────────────
    new CfnOutput(this, "RootBucketName", { value: rootBucket.bucketName });
    new CfnOutput(this, "RootDistributionDomain", {
      value: rootDistribution.distributionDomainName,
    });
    new CfnOutput(this, "HarthofBucketName", { value: harthofBucket.bucketName });
    new CfnOutput(this, "HarthofDistributionDomain", {
      value: harthofDistribution.distributionDomainName,
    });
  }
}
