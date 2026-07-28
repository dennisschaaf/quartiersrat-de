import { Stack, type StackProps } from "aws-cdk-lib";
import { Certificate, CertificateValidation, type ICertificate } from "aws-cdk-lib/aws-certificatemanager";
import type { IHostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

interface QuartiersratCertStackProps extends StackProps {
  domainName: string;
  zone: IHostedZone;
}

export class QuartiersratCertStack extends Stack {
  public readonly certificate: ICertificate;

  constructor(scope: Construct, id: string, props: QuartiersratCertStackProps) {
    super(scope, id, props);

    this.certificate = new Certificate(this, "SiteCertificate", {
      domainName: props.domainName,
      // Wildcard covers all current and future subdomains (e.g. harthof.quartiersrat.de)
      subjectAlternativeNames: [`www.${props.domainName}`, `*.${props.domainName}`],
      validation: CertificateValidation.fromDns(props.zone),
    });
  }
}
