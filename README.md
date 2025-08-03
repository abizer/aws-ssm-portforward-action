# AWS SSM Remote Port Forward Action

This GitHub Action starts an AWS Systems Manager (SSM) port forwarding session to a remote host. This is useful for establishing a secure tunnel to a private resource, such as an RDS cluster, allowing subsequent steps in your workflow to access it.

## Usage

Here's an example of how to use this action in your workflow:

```yaml
name: 'Example Workflow'

on:
  push:
    branches:
      - main

jobs:
  run-migrations:
    runs-on: ubuntu-latest
    steps:
      - name: 'Checkout'
        uses: actions/checkout@v3

      - name: 'Configure AWS Credentials'
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/GitHubActionsRole
          role-session-name: GitHubActions-RemotePortForward
          aws-region: us-east-2

      - name: 'Start SSM Port Forwarding'
        uses: abizer/aws-ssm-remote-port-forward-action@v1
        with:
          target: 'ecs:your-cluster:your-task-id' # or an EC2 instance ID
          host: 'your-rds-instance.endpoint.amazonaws.com'
          local-port: '3306'
          remote-port: '3306'
          aws-region: 'us-east-2'

      - name: 'Run Database Migrations'
        run: |
          # Your migration command here, e.g.:
          # npx sequelize-cli db:migrate --url "mysql://user:password@127.0.0.1:3306/database"
          echo "Running migrations against localhost:3306"

```

## Inputs

| Input         | Description                                                      | Required |
| ------------- | ---------------------------------------------------------------- | -------- |
| `target`      | The AWS instance to port forward through (e.g., an EC2 instance ID or ECS task ARN) | `true`   |
| `host`        | The remote host to connect to (e.g., an RDS instance endpoint)     | `true`   |
| `local-port`  | The local port to forward to the remote host                      | `true`   |
| `remote-port` | The remote port on the host to connect to                          | `true`   |
| `aws-region`  | The AWS region to use                                            | `true`   |

## How it Works

This action uses the AWS SDK to initiate an SSM `start-session` command with the `AWS-StartPortForwardingSessionToRemoteHost` document. It runs the command in the background, allowing subsequent steps in your workflow to run. The session is automatically terminated when the job completes.