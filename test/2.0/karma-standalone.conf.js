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
      { pattern: `../../${process.env.BUILD_DIR || 'browser'}/swagger-tools-standalone${process.env.MINIFIED === 'true' ? '.min' : ''}.js`, watch: false, included: true },
      { pattern: `../../${process.env.BUILD_DIR || 'browser'}/test-browser-2_0.js`, watch: false, included: true }
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
      'karma-chrome-launcher'
    ],
    browsers: ['Chrome'],
    reporters: ['mocha'],
    colors: true,
    autoWatch: false,
    singleRun: true
  });
};
