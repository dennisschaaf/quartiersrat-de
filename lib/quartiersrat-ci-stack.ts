import { Stack, type StackProps } from "aws-cdk-lib";
import { OpenIdConnectProvider, PolicyStatement, Role, WebIdentityPrincipal } from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

interface QuartiersratCiStackProps extends StackProps {
  // e.g. "dennisschaaf/quartiersrat-de"
  githubRepo: string;
  // CDK bootstrap qualifier (see CDKToolkit stack parameters), default "hnb659fds"
  cdkQualifier: string;
  // Regions the other stacks deploy into — the role needs to assume the
  // CDK bootstrap roles in each of them.
  deployRegions: string[];
}

// Lets GitHub Actions run `cdk deploy` without long-lived AWS access keys:
// GitHub's OIDC token is exchanged for temporary credentials via this role.
export class QuartiersratCiStack extends Stack {
  public readonly deployRole: Role;

  constructor(scope: Construct, id: string, props: QuartiersratCiStackProps) {
    super(scope, id, props);

    const provider = new OpenIdConnectProvider(this, "GithubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    // GitHub's sub claim appends immutable numeric IDs to the owner and repo
    // name (e.g. "repo:owner@123/repo@456:ref:refs/heads/main"), so the owner
    // and repo segments need wildcard suffixes rather than an exact match.
    const [githubOwner, githubRepoName] = props.githubRepo.split("/");

    this.deployRole = new Role(this, "GithubActionsDeployRole", {
      roleName: "quartiersrat-github-actions-deploy",
      description: "Assumed by GitHub Actions (via OIDC) to run `cdk deploy` for quartiersrat.de",
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${githubOwner}*/${githubRepoName}*:ref:refs/heads/main`,
        },
      }),
    });

    // CDK deploy doesn't touch resources directly — it assumes the bootstrap
    // roles that CDKToolkit already created in each target region.
    const bootstrapRoleArns = props.deployRegions.flatMap((region) => [
      `arn:aws:iam::${this.account}:role/cdk-${props.cdkQualifier}-deploy-role-${this.account}-${region}`,
      `arn:aws:iam::${this.account}:role/cdk-${props.cdkQualifier}-file-publishing-role-${this.account}-${region}`,
      `arn:aws:iam::${this.account}:role/cdk-${props.cdkQualifier}-lookup-role-${this.account}-${region}`,
    ]);

    this.deployRole.addToPolicy(
      new PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: bootstrapRoleArns,
      })
    );
  }
}
