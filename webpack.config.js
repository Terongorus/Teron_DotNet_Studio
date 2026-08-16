//@ts-check

'use strict';

const path = require('path');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
	mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: [
    {
      vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
      // modules added here also need to be added in the .vscodeignore file
    },
    // ssh2 (via ssh2-sftp-client) optionally requires a native perf/crypto addon that isn't
    // installed in this repo (no node-gyp/native build step here, and it's never shipped in the
    // packaged VSIX) - ssh2's own source wraps both requires in try/catch and falls back to a
    // pure-JS implementation when they're missing (confirmed by reading ssh2/lib/protocol/
    // crypto.js and constants.js directly), so externalizing them just turns webpack's "can't
    // bundle this" warning into the same real Node MODULE_NOT_FOUND that try/catch already
    // handles, instead of webpack's own missing-module stub doing the equivalent thing noisily.
    function ({ request }, callback) {
      if (request === 'cpu-features' || /crypto[\\/]build[\\/]Release[\\/]sshcrypto\.node$/.test(request)) {
        callback(null, 'commonjs ' + request);
        return;
      }
      callback();
    }
  ],
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};
module.exports = [ extensionConfig ];