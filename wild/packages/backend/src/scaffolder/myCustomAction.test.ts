import { createMockActionContext } from '@backstage/plugin-scaffolder-node-test-utils';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { createMyCustomAction } from './myCustomAction';

describe('my:custom:action', () => {
  it('has the id required by the case study brief', () => {
    expect(createMyCustomAction().id).toBe('my:custom:action');
  });

  it('creates a file in the workspace with default name/content', async () => {
    const workspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'my-custom-action-'),
    );
    const action = createMyCustomAction();
    const ctx = createMockActionContext({
      input: {},
      workspacePath,
    });

    await action.handler(ctx);

    const written = await fs.readFile(
      path.join(workspacePath, 'my-custom-action.txt'),
      'utf8',
    );
    expect(written).toBe('Created by my:custom:action\n');
    expect(ctx.output).toHaveBeenCalledWith('path', 'my-custom-action.txt');

    await fs.remove(workspacePath);
  });

  it('respects a custom filename and content', async () => {
    const workspacePath = await fs.mkdtemp(
      path.join(os.tmpdir(), 'my-custom-action-'),
    );
    const action = createMyCustomAction();
    const ctx = createMockActionContext({
      input: { filename: 'hello.txt', content: 'hi there\n' },
      workspacePath,
    });

    await action.handler(ctx);

    const written = await fs.readFile(
      path.join(workspacePath, 'hello.txt'),
      'utf8',
    );
    expect(written).toBe('hi there\n');

    await fs.remove(workspacePath);
  });
});
