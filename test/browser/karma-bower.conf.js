/* Karma configuration for Bower build */

'use strict';

module.exports = function (config) {
  console.log();
  console.log('Browser (Bower) Tests');
  console.log();

  config.set({
    basePath: '.',
    frameworks: ['mocha'],
    files: [
      {pattern: 'vendor/async.min.js', watch: false, included: true},
      {pattern: 'vendor/debug.js', watch: false, included: true},
      {pattern: 'vendor/js-yaml.min.js', watch: false, included: true},
      {pattern: 'vendor/lodash.min.js', watch: false, included: true},
      {pattern: 'vendor/spark-md5.min.js', watch: false, included: true},
      {pattern: 'vendor/swagger-converter.min.js', watch: false, included: true},
      {pattern: 'vendor/traverse.js', watch: false, included: true},
      {pattern: 'vendor/ZSchema-browser-min.js', watch: false, included: true},
      {pattern: 'vendor/path-loader-min.js', watch: false, included: true},
      {pattern: 'vendor/json-refs-min.js', watch: false, included: true},
      {pattern: 'swagger-tools.js', watch: false, included: true},
      {pattern: 'test-browser.js', watch: false, included: true}
    ],
    client: {
      mocha: {
        reporter: 'html',
        timeout: 5000,
        ui: 'bdd'
      }
    },
    plugins: [
      'karma-mocha',
      'karma-mocha-reporter',
      'karma-phantomjs-launcher'
    ],
    browsers: ['PhantomJS'],
    reporters: ['mocha'],
    colors: true,
    autoWatch: false,
    singleRun: true
  });
};
