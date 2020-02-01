const merge = require('webpack-merge');
const common = require('./common.config');

module.exports = merge(common, {
  entry: {
    'test-browser-1_2': './test/1.2/test-specs.js',
    'test-browser-2_0': './test/2.0/test-specs.js'
  },
});
