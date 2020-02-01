const path = require('path');
const merge = require('webpack-merge');
const common = require('./common.config');

module.exports = merge([common, {
  entry: {
    'swagger-tools': './src/index.js',
  },
  output: {
    filename: '[name].min.js',
    chunkFilename: '[name].bundle.min.js',
    path: path.resolve(path.join(__dirname, '..', 'dist'))
  },
}]);
