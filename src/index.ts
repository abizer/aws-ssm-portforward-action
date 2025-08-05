import * as core from '@actions/core';
import { spawn } from 'child_process';
import { SSMClient, TerminateSessionCommand } from '@aws-sdk/client-ssm';

async function run() {
  let awsProcess: any = null;
  let sessionId = '';
  
  try {
    const target = core.getInput('target', { required: true });
    const host = core.getInput('host', { required: true });
    const localPort = core.getInput('local-port', { required: true });
    const remotePort = core.getInput('remote-port', { required: true });
    const awsRegion = core.getInput('aws-region', { required: true });
    const command = core.getInput('command', { required: true });

    core.info('Starting SSM port forwarding session...');

    // Start AWS CLI for port forwarding
    const awsArgs = [
      'ssm',
      'start-session',
      '--target', target,
      '--document-name', 'AWS-StartPortForwardingSessionToRemoteHost',
      '--parameters', `host=${host},portNumber=${remotePort},localPortNumber=${localPort}`,
      '--region', awsRegion
    ];

    core.info(`Running: aws ${awsArgs.join(' ')}`);

    awsProcess = spawn('aws', awsArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for tunnel to be established
    let tunnelReady = false;
    
    const tunnelPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!tunnelReady) {
          reject(new Error('Timeout waiting for port forwarding tunnel to be established'));
        }
      }, 60000); // 60 second timeout

      awsProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        core.info(`AWS CLI: ${output.trim()}`);
        
        // Extract session ID
        if (output.includes('Starting session with SessionId:')) {
          const match = output.match(/SessionId: ([a-zA-Z0-9-]+)/);
          if (match) {
            sessionId = match[1];
            core.info(`Session ID: ${sessionId}`);
          }
        }
        
        // Look for tunnel ready signal
        if (output.includes(`Port ${localPort} opened`) && output.includes('Waiting for connections')) {
          tunnelReady = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      awsProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        core.info(`AWS CLI stderr: ${output.trim()}`);
        
        if (output.toLowerCase().includes('error')) {
          clearTimeout(timeout);
          reject(new Error(`AWS CLI error: ${output}`));
        }
      });

      awsProcess.on('exit', (code: number) => {
        clearTimeout(timeout);
        if (code !== 0 && !tunnelReady) {
          reject(new Error(`AWS CLI exited with code ${code} before tunnel was ready`));
        }
      });
    });

    // Wait for tunnel to be ready
    await tunnelPromise;
    
    core.info('Port forwarding tunnel established! Running user command: ' + command);
    
    // Now run the user's command while the tunnel is active
    const userCommandResult = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
      const userProcess = spawn('bash', ['-c', command], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      userProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        core.info(`Command output: ${output.trim()}`);
      });

      userProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        core.info(`Command stderr: ${output.trim()}`);
      });

      userProcess.on('exit', (code: number) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
    });

    // Set outputs
    core.setOutput('command-exit-code', userCommandResult.exitCode.toString());
    core.setOutput('command-stdout', userCommandResult.stdout);
    core.setOutput('command-stderr', userCommandResult.stderr);

    if (userCommandResult.exitCode === 0) {
      core.info(`✅ Command completed successfully with exit code ${userCommandResult.exitCode}`);
    } else {
      core.warning(`⚠️ Command completed with exit code ${userCommandResult.exitCode}`);
      core.setFailed(`Command failed with exit code ${userCommandResult.exitCode}`);
    }

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  } finally {
    // Clean up: kill the AWS process and terminate the session
    core.info('Cleaning up port forwarding session...');
    
    if (awsProcess && !awsProcess.killed) {
      try {
        awsProcess.kill('SIGTERM');
        core.info('AWS CLI process terminated');
      } catch (killError) {
        core.warning(`Failed to kill AWS process: ${killError}`);
      }
    }

    // Also terminate the session via API if we have session ID
    if (sessionId) {
      try {
        const awsRegion = core.getInput('aws-region');
        const client = new SSMClient({ region: awsRegion });
        const command = new TerminateSessionCommand({ SessionId: sessionId });
        await client.send(command);
        core.info(`SSM session ${sessionId} terminated via API`);
      } catch (terminateError) {
        core.warning(`Failed to terminate session via API: ${terminateError}`);
      }
    }
    
    core.info('Cleanup completed');
  }
}

run();
