import { build } from 'file:///C:/my-dev/photobooth-v1/node_modules/esbuild/lib/main.js';

await build({
  entryPoints: ['entry.jsx'],
  bundle: true,
  outdir: 'out',
  format: 'esm',
  jsx: 'automatic',
  nodePaths: ['C:/my-dev/photobooth-v1/node_modules'],
  loader: { '.jpg': 'file', '.png': 'file', '.svg': 'file', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
  external: ['/*'],
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [
    {
      name: 'stub-face-tracker',
      setup(b) {
        // Face detection pulls in a large model; previews use the default crop
        b.onResolve({ filter: /faceTracker$/ }, () => ({ path: 'faceTracker', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const detectImageFaces = async () => []; export const faceBounds = (f) => f;', loader: 'js' }));
      }
    }
  ],
  logLevel: 'warning'
});
console.log('built');
