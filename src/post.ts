import * as core from '@actions/core';
import { SSMClient, TerminateSessionCommand } from '@aws-sdk/client-ssm';

async function run() {
  try {
    const sessionId = core.getState('session-id');
    const awsRegion = core.getState('aws-region');

    if (sessionId) {
      const client = new SSMClient({ region: awsRegion });
      const command = new TerminateSessionCommand({ SessionId: sessionId });
      await client.send(command);
      core.info(`SSM session ${sessionId} terminated successfully.`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred during session termination');
    }
  }
}

run();
