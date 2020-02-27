/* We want:
- test-browser-1_2.js
- test-browser-2_0.js
- swagger-tools.js
- swagger-tools.min.js
- swagger-tools-standalone.js
- swagger-tools-standalone.min.js
*/
const path = require('path');
// eslint-disable-next-line import/no-extraneous-dependencies
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const { NODE_ENV } = process.env;

module.exports = {
  mode: NODE_ENV === 'production' ? 'production' : 'development',
  optimization: {
    minimize: NODE_ENV === 'production',
  },
  devtool: NODE_ENV === 'production' ? false : 'inline-source-map',
  entry: {
    'swagger-tools': './src/index.js',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(path.join(__dirname, '..', 'dist')),
    library: ['SwaggerTools', 'specs'],
    libraryTarget: 'umd',
    libraryExport: 'specs',
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
  plugins: [
    new BundleAnalyzerPlugin({ openAnalyzer: false, analyzerMode: 'static' }),
  ],
};
