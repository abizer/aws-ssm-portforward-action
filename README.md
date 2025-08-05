# AWS SSM Remote Port Forward Action

This GitHub Action establishes an AWS Systems Manager (SSM) port forwarding tunnel to a remote host and executes a command while the tunnel is active. This is useful for accessing private resources like RDS databases, ElastiCache clusters, or any other service behind a bastion host.

## Usage

```yaml
name: 'Database Migration Workflow'

on:
  push:
    branches:
      - master

jobs:
  run-migrations:
    runs-on: ubuntu-latest
    steps:
      - name: 'Checkout'
        uses: actions/checkout@v4

      - name: 'Configure AWS Credentials'
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/GitHubActionsRole
          role-session-name: GitHubActions-RemotePortForward
          aws-region: us-east-2

      - name: 'Run Database Migrations via Port Forward'
        uses: abizer/aws-ssm-remote-port-forward-action@v1
        with:
          target: 'i-1234567890abcdef0'  # EC2 instance ID or ECS task ARN
          host: 'your-rds-instance.cluster-abc123.us-east-2.rds.amazonaws.com'
          local-port: '3306'
          remote-port: '3306'
          aws-region: 'us-east-2'
          command: 'npx sequelize-cli db:migrate --url "mysql://user:password@127.0.0.1:3306/database"'
```

## Inputs

| Input         | Description                                                      | Required |
| ------------- | ---------------------------------------------------------------- | -------- |
| `target`      | The AWS instance to port forward through                         | `true`   |
| `host`        | The remote host to connect to (e.g., an RDS instance endpoint)     | `true`   |
| `local-port`  | The local port to forward to the remote host                      | `true`   |
| `remote-port` | The remote port on the host to connect to                          | `true`   |
| `aws-region`  | The AWS region to use                                            | `true`   |
| `command`     | The command to run while the port forwarding tunnel is active      | `true`   |

## Outputs

| Output              | Description                                       |
| ------------------- | ------------------------------------------------- |
| `command-exit-code` | The exit code of the command that was run        |
| `command-stdout`    | The stdout output of the command that was run    |
| `command-stderr`    | The stderr output of the command that was run    |

## How it Works

This action performs the following steps in an atomic operation:

1. **Establishes SSM Tunnel**: Uses the AWS CLI to start an SSM session with the `AWS-StartPortForwardingSessionToRemoteHost` document
2. **Waits for Ready**: Monitors the tunnel output until "Port X opened" is confirmed
3. **Executes Command**: Runs your specified command while the tunnel is active
4. **Captures Output**: Records the command's exit code, stdout, and stderr
5. **Automatic Cleanup**: Terminates both the tunnel process and the SSM session

This approach ensures your command has immediate access to the forwarded port without any timing issues or session timeouts.

### Using Outputs
```yaml
- name: 'Database Health Check'
  id: db-check
  uses: abizer/aws-ssm-remote-port-forward-action@v1
  with:
    target: 'i-1234567890abcdef0'
    host: 'mysql.cluster-abc123.us-east-2.rds.amazonaws.com'
    local-port: '3306'
    remote-port: '3306'
    aws-region: 'us-east-2'
    command: 'mysqladmin ping -h 127.0.0.1 -P 3306 --protocol=tcp'

- name: 'Check Results'
  run: |
    echo "Exit code: ${{ steps.db-check.outputs.command-exit-code }}"
    echo "Output: ${{ steps.db-check.outputs.command-stdout }}"
    if [ "${{ steps.db-check.outputs.command-exit-code }}" = "0" ]; then
      echo "✅ Database is healthy"
    else
      echo "❌ Database check failed"
    fi
```

## Prerequisites

- AWS credentials configured (via `aws-actions/configure-aws-credentials` or environment variables)
- Target instance must have SSM Agent installed and running
- Target instance must have network access to your remote host
- Appropriate IAM permissions for SSM sessions

## IAM Permissions

Your role needs the following permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:StartSession",
        "ssm:TerminateSession"
      ],
      "Resource": "*"
    }
  ]
}
```

_Authored by Claude 4 Sonnet Thinking via Cursor Agent_