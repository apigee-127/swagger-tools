const merge = require('webpack-merge');
const common = require('./common.config');

module.exports = merge([
  common,
  {
    output: {
      filename: '[name]-standalone.min.js',
    },
  },
]);
