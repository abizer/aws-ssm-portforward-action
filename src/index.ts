import * as core from '@actions/core';
import * as github from '@actions/github';
import { spawn } from 'child_process';
import { SSMClient, StartSessionCommand, StartSessionCommandInput } from '@aws-sdk/client-ssm';

async function run() {
  try {
    const target = core.getInput('target', { required: true });
    const host = core.getInput('host', { required: true });
    const localPort = core.getInput('local-port', { required: true });
    const remotePort = core.getInput('remote-port', { required: true });
    const awsRegion = core.getInput('aws-region', { required: true });

    core.info('Starting SSM port forwarding session via AWS SDK...');

    // First, start the session using AWS SDK to get session details
    const client = new SSMClient({
      region: awsRegion,
      customUserAgent: `gha-${github.context.repo.repo}`,
    });

    const sessionParams: StartSessionCommandInput = {
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

    if (!session.SessionId || !session.StreamUrl || !session.TokenValue) {
      throw new Error('Failed to start SSM session: Missing required session details from AWS response.');
    }

    core.info(`Session started with ID: ${session.SessionId}`);

    // Create session details for session-manager-plugin
    const sessionDetails = {
      SessionId: session.SessionId,
      TokenValue: session.TokenValue,
      StreamUrl: session.StreamUrl,
      Target: target,
      DocumentName: 'AWS-StartPortForwardingSessionToRemoteHost',
      Parameters: {
        host: [host],
        portNumber: [remotePort],
        localPortNumber: [localPort],
      }
    };

    // Start session-manager-plugin with the session details
    const pluginArgs = [
      JSON.stringify(sessionDetails),
      awsRegion,
      'StartSession'
    ];

    core.info('Starting session-manager-plugin...');
    const pluginProcess = spawn('session-manager-plugin', pluginArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });

    // Detach the process so it doesn't prevent the action from completing
    pluginProcess.unref();

    // Save the process PID and session details for cleanup
    core.saveState('plugin-pid', pluginProcess.pid?.toString() || '');
    core.saveState('session-id', session.SessionId);
    core.saveState('aws-region', awsRegion);

    // Monitor the process output and wait for the tunnel to be established
    let tunnelEstablished = false;
    let errorOccurred = false;

    const outputPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!tunnelEstablished && !errorOccurred) {
          reject(new Error('Timeout waiting for port forwarding tunnel to be established'));
        }
      }, 30000); // 30 second timeout

      pluginProcess.stdout.on('data', (data) => {
        const output = data.toString();
        core.info(`session-manager-plugin stdout: ${output}`);
        
        // Look for the message indicating the port is open
        if (output.includes(`Port ${localPort} opened`) && output.includes('Waiting for connections')) {
          tunnelEstablished = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      pluginProcess.stderr.on('data', (data) => {
        const output = data.toString();
        core.info(`session-manager-plugin stderr: ${output}`);
        
        // Check for error messages
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
          errorOccurred = true;
          clearTimeout(timeout);
          reject(new Error(`session-manager-plugin error: ${output}`));
        }
      });

      pluginProcess.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0 && !tunnelEstablished) {
          errorOccurred = true;
          reject(new Error(`session-manager-plugin exited with code ${code}`));
        }
      });
    });

    // Wait for the tunnel to be established
    await outputPromise;

    core.info('Port forwarding tunnel has been successfully established.');
    core.info(`Local port ${localPort} is now forwarding to ${host}:${remotePort} via ${target}`);
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
