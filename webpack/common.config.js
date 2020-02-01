/* We want:
- test-browser-1_2.js
- test-browser-2_0.js
- swagger-tools.js
- swagger-tools.min.js
- swagger-tools-standalone.js
- swagger-tools-standalone.min.js
*/
const path = require('path');

const { NODE_ENV } = process.env;

module.exports = {
  mode: NODE_ENV === 'production' ? 'production' : 'development',
  optimization: {
    minimize: NODE_ENV === 'production',
  },
  devtool: NODE_ENV === 'production' ? false : 'inline-source-map',
  output: {
    filename: '[name].js',
    chunkFilename: '[name].bundle.js',
    path: path.resolve(path.join(__dirname, '..', 'dist'))
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  node: {
    fs: 'empty',
  },
};
