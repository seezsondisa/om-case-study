import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import fs from 'fs-extra';
import path from 'path';

/**
 * A scaffolder action, id `my:custom:action`, that creates a new file in
 * the template's temp workspace directory.
 */
export const createMyCustomAction = () =>
  createTemplateAction({
    id: 'my:custom:action',
    description: 'Creates a new file in the temp workspace',
    schema: {
      input: {
        filename: (zImpl) =>
          zImpl
            .string()
            .optional()
            .describe('Name of the file to create (default: my-custom-action.txt)'),
        content: (zImpl) =>
          zImpl.string().optional().describe('Content to write into the file'),
      },
      output: {
        path: (zImpl) =>
          zImpl.string().describe('Path to the created file, relative to the workspace'),
      },
    },
    async handler(ctx) {
      const filename = ctx.input.filename ?? 'my-custom-action.txt';
      const content = ctx.input.content ?? 'Created by my:custom:action\n';

      const targetPath = path.join(ctx.workspacePath, filename);
      await fs.writeFile(targetPath, content);

      ctx.logger.info(`my:custom:action wrote ${filename} to the workspace`);

      ctx.output('path', filename);
    },
  });
