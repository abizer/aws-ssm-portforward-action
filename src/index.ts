import * as core from '@actions/core';
import { spawn } from 'child_process';

async function run() {
  try {
    const target = core.getInput('target', { required: true });
    const host = core.getInput('host', { required: true });
    const localPort = core.getInput('local-port', { required: true });
    const remotePort = core.getInput('remote-port', { required: true });
    const awsRegion = core.getInput('aws-region', { required: true });

    core.info('Starting SSM port forwarding session...');

    // Use AWS CLI directly - it handles both the API call and session-manager-plugin invocation
    const awsArgs = [
      'ssm',
      'start-session',
      '--target', target,
      '--document-name', 'AWS-StartPortForwardingSessionToRemoteHost',
      '--parameters', `host=${host},portNumber=${remotePort},localPortNumber=${localPort}`,
      '--region', awsRegion
    ];

    core.info(`Running: aws ${awsArgs.join(' ')}`);

    // Start AWS CLI in background
    const awsProcess = spawn('aws', awsArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });

    // Detach so the action can complete
    awsProcess.unref();

    // Save process info for cleanup
    core.saveState('aws-process-pid', awsProcess.pid?.toString() || '');
    core.saveState('aws-region', awsRegion);

    // Monitor output briefly to confirm startup, then let it run
    let sessionStarted = false;
    let sessionId = '';

    const startupPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!sessionStarted) {
          reject(new Error('Timeout waiting for session to start'));
        }
      }, 30000);

      awsProcess.stdout.on('data', (data) => {
        const output = data.toString();
        core.info(`AWS CLI output: ${output.trim()}`);
        
        // Look for session start confirmation
        if (output.includes('Starting session with SessionId:')) {
          const match = output.match(/SessionId: ([a-zA-Z0-9-]+)/);
          if (match) {
            sessionId = match[1];
            core.saveState('session-id', sessionId);
          }
        }
        
        // Look for port forwarding confirmation
        if (output.includes(`Port ${localPort} opened`) || output.includes('Waiting for connections')) {
          sessionStarted = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      awsProcess.stderr.on('data', (data) => {
        const output = data.toString();
        core.info(`AWS CLI error: ${output.trim()}`);
        
        if (output.toLowerCase().includes('error')) {
          clearTimeout(timeout);
          reject(new Error(`AWS CLI error: ${output}`));
        }
      });

      awsProcess.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0 && !sessionStarted) {
          reject(new Error(`AWS CLI exited with code ${code} before session was established`));
        }
      });
    });

    // Wait for session to start, then let the action complete
    await startupPromise;

    core.info('Port forwarding session established successfully!');
    core.info(`Local port ${localPort} is now forwarding to ${host}:${remotePort} via ${target}`);
    if (sessionId) {
      core.info(`Session ID: ${sessionId}`);
    }
    core.info('Subsequent steps can now connect to the remote host via localhost on the specified port.');

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
