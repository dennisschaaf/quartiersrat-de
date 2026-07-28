import { CfnOutput, Fn, Stack, type StackProps } from "aws-cdk-lib";
import { HostedZone, type IHostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

interface QuartiersratZoneStackProps extends StackProps {
  domainName: string;
}

export class QuartiersratZoneStack extends Stack {
  public readonly zone: IHostedZone;

  constructor(scope: Construct, id: string, props: QuartiersratZoneStackProps) {
    super(scope, id, props);

    const hz = new HostedZone(this, "Zone", {
      zoneName: props.domainName,
    });
    this.zone = hz;

    // After first deployment: configure these nameservers at your domain registrar
    new CfnOutput(this, "NameServers", {
      value: Fn.join(", ", hz.hostedZoneNameServers!),
      description: "Point quartiersrat.de to these nameservers at your registrar",
    });

    new CfnOutput(this, "HostedZoneId", {
      value: this.zone.hostedZoneId,
    });
  }
}
