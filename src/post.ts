import * as core from '@actions/core';
import { SSMClient, TerminateSessionCommand } from '@aws-sdk/client-ssm';

async function run() {
  try {
    const sessionId = core.getState('session-id');
    const awsRegion = core.getState('aws-region');
    const pluginPid = core.getState('plugin-pid');

    // First, try to kill the session-manager-plugin process if we have a PID
    if (pluginPid) {
      try {
        const pid = parseInt(pluginPid);
        process.kill(pid, 'SIGTERM');
        core.info(`session-manager-plugin process (PID: ${pid}) terminated.`);
      } catch (processError) {
        core.warning(`Failed to terminate session-manager-plugin process: ${processError}`);
      }
    }

    // Then terminate the SSM session via AWS API
    if (sessionId) {
      const client = new SSMClient({ region: awsRegion });
      const command = new TerminateSessionCommand({ SessionId: sessionId });
      await client.send(command);
      core.info(`SSM session ${sessionId} terminated successfully.`);
    }

    if (!sessionId && !pluginPid) {
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
