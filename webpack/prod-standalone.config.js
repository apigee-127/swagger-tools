const path = require('path');
const merge = require('webpack-merge');
const common = require('./common.config');

module.exports = merge([common, {
  entry: {
    'swagger-tools': './src/index.js',
  },
  output: {
    filename: '[name]-standalone.min.js',
    chunkFilename: 'swagger-tools-standalone.vendors.min.js',
    path: path.resolve(path.join(__dirname, '..', 'dist'))
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          // test: /[\\/]node_modules[\\/](async|js-yaml|lodash|spark-md5|traverse|z-schema|path-to-regexp|json-refs)[\\/]/,
          name: 'vendor',
          chunks: 'all',
        }
      }
    }
  }
}]);
