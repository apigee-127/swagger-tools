const path = require('path');

module.exports = {
  mode: 'development',
  optimization: {
    minimize: false,
  },
  devtool: 'inline-source-map',
  entry: {
    'test-browser-1_2': './test/1.2/test-specs.js',
    'test-browser-2_0': './test/2.0/test-specs.js',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(path.join(__dirname, '..', 'dist')),
    library: undefined,
    libraryTarget: 'umd',
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
};
