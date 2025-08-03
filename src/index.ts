import * as core from '@actions/core';
import * as github from '@actions/github';
import { SSMClient, StartSessionCommand } from '@aws-sdk/client-ssm';

async function run() {
  try {
    const target = core.getInput('target', { required: true });
    const host = core.getInput('host', { required: true });
    const localPort = core.getInput('local-port', { required: true });
    const remotePort = core.getInput('remote-port', { required: true });
    const awsRegion = core.getInput('aws-region', { required: true });

    core.info('Starting SSM session via AWS SDK');
    const client = new SSMClient({
      region: awsRegion,
      customUserAgent: `gha-${github.context.repo.repo}`,
    });

    const sessionParams = {
      Target: target,
      DocumentName: 'AWS-StartPortForwardingSessionToRemoteHost',
      Parameters: {
        host: [host],
        portNumber: [remotePort],
        localPortNumber: [localPort],
      },
    };

    const command = new StartSessionCommand(sessionParams);
    const session = await client.send(command);

    if (!session.SessionId) {
        throw new Error('Failed to start SSM session: SessionId is missing from the response.');
    }
    
    core.saveState('session-id', session.SessionId);
    core.saveState('aws-region', awsRegion);

    core.info(`SSM session ${session.SessionId} has been established.`);
    core.info('The port forwarding session is active.');
    core.info('Subsequent steps in this job can now connect to the remote host via localhost on the specified local port.');

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
