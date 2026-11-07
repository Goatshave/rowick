import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Keep the embedded builds in sync with the source tabs during local work. */
export function previewExamples(): Plugin {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const script = path.join(root, 'scripts/build-doc-examples.mjs');
  const watched = new Set(
    [
      'website/.vitepress/theme/examples/framework-projects.ts',
      'website/.vitepress/theme/examples/example-model.ts',
      'website/.vitepress/theme/examples/inline-editor.ts',
      'website/.vitepress/theme/examples/example.css',
      'website/.vitepress/theme/examples/editor.css',
      'website/.vitepress/theme/examples/people.ts',
      'website/.vitepress/theme/demo-controls.css',
      'packages/theme/src/index.css',
      'packages/react-ui/src/index.css',
    ].map((file) => path.join(root, file)),
  );
  return {
    name: 'rowick-documentation-previews',
    apply: 'serve',
    configureServer(server) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let running = false;
      let queued = false;
      let closed = false;
      const rebuild = () => {
        if (closed) return;
        if (running) {
          queued = true;
          return;
        }
        running = true;
        execFile(process.execPath, [script], { cwd: root }, (error) => {
          running = false;
          if (closed) return;
          if (error)
            server.config.logger.error(
              `Example preview build failed: ${error.message}`,
            );
          else server.ws.send({ type: 'full-reload' });
          if (queued) {
            queued = false;
            rebuild();
          }
        });
      };
      const templates = path.join(root, 'website/.vitepress/theme/examples/templates');
      server.watcher.add([...watched, templates]);
      server.watcher.on('change', (file) => {
        if (!watched.has(file) && !file.startsWith(templates + path.sep)) return;
        clearTimeout(timer);
        timer = setTimeout(rebuild, 150);
      });
      server.httpServer?.once('close', () => {
        closed = true;
        clearTimeout(timer);
      });
    },
  };
}
