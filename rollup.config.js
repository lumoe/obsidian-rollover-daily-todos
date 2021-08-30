import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const isProd = (process.env.BUILD === 'production');

export default {
  input: 'src/index.js',
  output: {
    file: 'main.js',
    sourcemap: 'inline',
    sourcemapExcludeSources: isProd,
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    nodeResolve({browser: true}),
    commonjs(),
  ]
};
