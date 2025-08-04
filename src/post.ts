import * as core from '@actions/core';
import { SSMClient, TerminateSessionCommand } from '@aws-sdk/client-ssm';

async function run() {
  try {
    const sessionId = core.getState('session-id');
    const awsRegion = core.getState('aws-region');
    const awsProcessPid = core.getState('aws-process-pid');

    // First, try to kill the AWS CLI process if we have a PID
    if (awsProcessPid) {
      try {
        const pid = parseInt(awsProcessPid);
        process.kill(pid, 'SIGTERM');
        core.info(`AWS CLI process (PID: ${pid}) terminated.`);
      } catch (processError) {
        core.warning(`Failed to terminate AWS CLI process: ${processError}`);
      }
    }

    // Then terminate the SSM session via AWS API
    if (sessionId && awsRegion) {
      const client = new SSMClient({ region: awsRegion });
      const command = new TerminateSessionCommand({ SessionId: sessionId });
      await client.send(command);
      core.info(`SSM session ${sessionId} terminated successfully.`);
    }

    if (!sessionId && !awsProcessPid) {
      core.info('No session or process to clean up.');
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
