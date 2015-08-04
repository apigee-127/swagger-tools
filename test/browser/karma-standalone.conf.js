/* Karma configuration for standalone build */

'use strict';

module.exports = function (config) {
  console.log();
  console.log('Browser (Standalone) Tests');
  console.log();

  config.set({
    basePath: '.',
    frameworks: ['mocha'],
    files: [
      {pattern: 'swagger-tools-standalone.js', watch: false, included: true},
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
