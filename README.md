# AWS SSM Remote Port Forward Action

This GitHub Action provides a robust method for establishing an AWS Systems Manager (SSM) port forwarding session to a remote host. It is designed to run a specified command while the tunnel is active, making it suitable for workflows that require temporary access to private resources like databases or internal services within a VPC.

The action manages the entire lifecycle of the SSM session, including tunnel establishment, command execution, output capture, and cleanup.

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
    permissions:
      id-token: write
      contents: read
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
          target: 'i-1234567890abcdef0'  # EC2 instance ID or other valid SSM target
          host: 'your-rds-instance.cluster-abc123.us-east-2.rds.amazonaws.com'
          local-port: '3306'
          remote-port: '3306'
          aws-region: 'us-east-2'
          command: 'npx sequelize-cli db:migrate --url "mysql://user:password@127.0.0.1:3306/database"'
```

## Inputs

| Input         | Description                                                      | Required |
| ------------- | ---------------------------------------------------------------- | -------- |
| `target`      | The AWS SSM target to connect through (e.g., an EC2 instance ID). | `true`   |
| `host`        | The remote host endpoint to connect to (e.g., an RDS instance).    | `true`   |
| `local-port`  | The local port on the runner to bind the tunnel to.              | `true`   |
| `remote-port` | The port on the remote host to connect to.                       | `true`   |
| `aws-region`  | The AWS region where the SSM session will be initiated.          | `true`   |
| `command`     | The command to execute once the tunnel is established.           | `true`   |

## Outputs

| Output              | Description                                       |
| ------------------- | ------------------------------------------------- |
| `command-exit-code` | The exit code of the executed command.            |
| `command-stdout`    | The standard output (stdout) of the command.      |
| `command-stderr`    | The standard error (stderr) of the command.       |

## How it Works

The action automates the following sequence of operations:

1.  **Initiate SSM Session**: It spawns an AWS CLI process to run `ssm start-session` with the `AWS-StartPortForwardingSessionToRemoteHost` document.
2.  **Monitor Tunnel Status**: The action monitors the `stdout` of the AWS CLI process to confirm that the port forwarding tunnel has been successfully established. It also extracts the `SessionId` for later use. A 60-second timeout is in place to prevent indefinite waiting.
3.  **Execute Command**: Once the tunnel is ready, the action executes the provided `command` in the runner's default shell (`shell: true`). The working directory and environment variables of the workflow are passed to the command.
4.  **Capture Outputs**: Standard output, standard error, and the exit code from the command are captured.
5.  **Set Action Outputs**: The captured results are set as action outputs (`command-exit-code`, `command-stdout`, `command-stderr`) for use in subsequent workflow steps.
6.  **Guaranteed Cleanup**: A `finally` block ensures that cleanup is always performed. It first attempts to terminate the AWS CLI process gracefully (`SIGTERM`). It then uses the AWS SDK to send a `TerminateSession` API call, ensuring the SSM session on the AWS side is closed and preventing orphaned resources.

## Security Considerations

### Shell Execution (`shell: true`)

The `command` input is executed using Node.js's `spawn` function with the `shell: true` option. This enables the use of shell features like pipes, redirection, and executing multiple commands. However, it also carries security risks.

If the `command` is constructed using variables from an untrusted source (e.g., pull request titles, issue bodies), it may be vulnerable to **command injection**. An attacker could potentially inject malicious commands to be run on the GitHub Actions runner.

**Recommendation**: Always treat the `command` input as a sensitive value. Whenever possible, use static command strings. If you must construct the command dynamically, ensure that any variables are properly sanitized or come from a trusted source.

## Example: Database Health Check

This example demonstrates how to use the action's outputs to check the status of a command.

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
      echo "Database is healthy"
    else
      echo "Database check failed"
      # Optionally, fail the workflow
      # exit 1
    fi
```

## Prerequisites

-   AWS credentials must be configured for the runner. The recommended approach is to use `aws-actions/configure-aws-credentials`.
-   The target instance must have the SSM Agent installed, running, and have an IAM instance profile that allows SSM connections.
-   The target instance must have network connectivity to the specified remote `host` and `port`.

## IAM Permissions

The IAM role assumed by the action requires the following permissions to manage SSM sessions:

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

**Note**: For enhanced security, it is recommended to scope the `Resource` to the specific instances or ARNs that the workflow needs to access, rather than using `*`.

_Authored by Claude 4 Sonnet Thinking, Claude 4.1 Opus, and Gemini 2.5 Pro via Cursor Agent_