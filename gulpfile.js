/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var $ = require('gulp-load-plugins')();
var browserify = require('browserify');
var buffer = require('vinyl-buffer');
var del = require('del');
var exposify = require('exposify');
var fs = require('fs');
var gulp = require('gulp');
var KarmaServer = require('karma').Server;
var path = require('path');
var runSequence = require('run-sequence');
var source = require('vinyl-source-stream');
var runningAllTests = false;

function displayCoverageReport (display) {
  if (display) {
    gulp.src([])
      .pipe($.istanbul.writeReports());
  }
}

gulp.task('browserify', function () {
  function browserifyBuild (isStandalone, useDebug) {
    return function () {
      return new Promise(function (resolve, reject) {
        var b = browserify('./lib/specs.js', {
          debug: useDebug,
          standalone: 'SwaggerTools.specs'
        });

        if (!isStandalone) {
          // Expose Bower modules so they can be required
          exposify.config = {
            'async': 'async',
            'debug': 'debug',
            'json-refs': 'JsonRefs',
            'js-yaml': 'jsyaml',
            'lodash': '_',
            'spark-md5': 'SparkMD5',
            'swagger-converter': 'SwaggerConverter.convert',
            'traverse': 'traverse',
            'z-schema': 'ZSchema'
          };

          b.transform('exposify');
        }

        b.bundle()
          .pipe(source('swagger-tools' + (isStandalone ? '-standalone' : '') + (!useDebug ? '-min' : '') + '.js'))
          .pipe($.if(!useDebug, buffer()))
          .pipe($.if(!useDebug, $.uglify()))
          .pipe(gulp.dest('browser/'))
          .on('error', reject)
          .on('end', resolve);
      });
    };
  }

  return Promise.resolve()
    // Standalone build with source maps and complete source
    .then(browserifyBuild(true, true))
    // Standalone build minified and without source maps
    .then(browserifyBuild(true, false))
    // Bower build with source maps and complete source
    .then(browserifyBuild(false, true))
    // Bower build minified and without source maps
    .then(browserifyBuild(false, false));
});

gulp.task('lint', function () {
  return gulp.src([
    './bin/swagger-tools',
    './index.js',
    './lib/**/*.js',
    './middleware/helpers.js',
    './middleware/swagger-*.js',
    './test/**/*.js',
    './gulpfile.js',
    '!./middleware/swagger-ui/**/*.js',
    '!./test/**/test-specs-browser.js',
    '!./test/browser/vendor/*.js'
  ])
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe($.jshint.reporter('fail'));
});

gulp.task('nsp', function (cb) {
  $.nsp({
    package: path.join(__dirname, 'package.json')
  }, cb);
});

gulp.task('test-node', function () {
  return new Promise(function (resolve, reject) {
    gulp.src([
      './index.js',
      './lib/**/*.js',
      './middleware/helpers.js',
      './middleware/swagger-*.js',
      '!./middleware/swagger-ui/**/*.js',
      '!./test/**/test-specs-browser.js'
    ])
      .pipe($.istanbul())
      .pipe($.istanbul.hookRequire()) // Force `require` to return covered files
      .on('finish', function () {
        gulp.src([
          './test/**/test-*.js',
          '!./test/**/test-specs-browser.js'
        ]).pipe($.mocha({reporter: 'spec', timeout: 5000}))
          .on('error', function (err) {
              reject(err);
            })
          .on('end', function () {
            displayCoverageReport(!runningAllTests);

            resolve();
          });
      });
    });
});

gulp.task('test-browser', ['browserify'], function () {
  function cleanUpEach () {
    del([
      './test/browser/test-browser.js'
    ]);
  }

  function cleanUpAll () {
    cleanUpEach();

    del([
      './test/browser/swagger-tools.js',
      './test/browser/swagger-tools-standalone.js'
    ]);
  }

  function finisher (err) {
    cleanUpAll();

    displayCoverageReport(runningAllTests);

    console.log(err);

    return err;
  }

  function makeTest (version, standalone) {
    return function () {
      return Promise.resolve()
        .then(cleanUpEach)
        .then(function () {
          return new Promise(function (resolve, reject) {
            var b = browserify([
              './test/' + version + '/test-specs.js'
            ], {
              debug: true
            });

            b.bundle()
              .pipe(source('test-browser.js'))
              .pipe(gulp.dest('./test/browser'))
              .on('error', reject)
              .on('end', resolve);
          });
        })
        .then(function () {
          return new Promise(function (resolve, reject) {
            new KarmaServer({
              configFile: path.join(__dirname,
                                    'test/browser/karma-' + (standalone ? 'standalone' : 'bower') + '.conf.js'),
              singleRun: true
            }, function (err) {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }).start();
          });
        });
    };
  }

  return Promise.resolve()
    .then(cleanUpAll)
    .then(function () {
      // Copy the Swagger Tools browser builds to the per-version test container
      fs.createReadStream('./browser/swagger-tools.js')
        .pipe(fs.createWriteStream('test/browser/swagger-tools.js'));
      fs.createReadStream('./browser/swagger-tools-standalone.js')
        .pipe(fs.createWriteStream('./test/browser/swagger-tools-standalone.js'));
    })
    .then(makeTest('1.2', false))
    .then(makeTest('1.2', true))
    .then(makeTest('2.0', false))
    .then(makeTest('2.0', true))
    .then(finisher, finisher);
});

gulp.task('test', function (cb) {
  runningAllTests = true;

  // Done this way to ensure that test-node runs prior to test-browser.  Since both of those tasks are independent,
  // doing this 'The Gulp Way' isn't feasible.
  runSequence('test-node', 'test-browser', cb);
});

gulp.task('default', ['lint', 'nsp', 'test']);
