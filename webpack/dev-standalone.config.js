const path = require('path');
const merge = require('webpack-merge');
const common = require('./common.config');

module.exports = merge(common, {
  entry: {
    'swagger-tools': './src/index.js',
  },
  output: {
    filename: '[name]-standalone.js',
    chunkFilename: 'swagger-tools-standalone.vendors.js',
    path: path.resolve(path.join(__dirname, '..', 'dist'))
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'all',
        }
      }
    }
  }
});
