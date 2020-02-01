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

const $ = require('gulp-load-plugins')();
const browserify = require('browserify');
const buffer = require('vinyl-buffer');
const del = require('del');
const exposify = require('exposify');
const fs = require('fs');
const gulp = require('gulp');
const { Server: KarmaServer } = require('karma');
const path = require('path');
const runSequence = require('run-sequence');
const source = require('vinyl-source-stream');

let runningAllTests = false;

function displayCoverageReport(display) {
  if (display) {
    gulp.src([]).pipe($.istanbul.writeReports());
  }
}

gulp.task('browserify', function () {
  function browserifyBuild(isStandalone, useDebug) {
    return function () {
      return new Promise(function (resolve, reject) {
        var b = browserify('./src/lib/specs.js', {
          debug: useDebug,
          standalone: 'SwaggerTools.specs',
        });

        if (!isStandalone) {
          // Expose Bower modules so they can be required
          exposify.config = {
            async: 'async',
            debug: 'debug',
            'json-refs': 'JsonRefs',
            'js-yaml': 'jsyaml',
            lodash: '_',
            'spark-md5': 'SparkMD5',
            'swagger-converter': 'SwaggerConverter.convert',
            traverse: 'traverse',
            'z-schema': 'ZSchema',
          };

          b.transform('exposify');
        }

        b.bundle()
          .pipe(
            source(
              'swagger-tools' +
              (isStandalone ? '-standalone' : '') +
              (!useDebug ? '-min' : '') +
              '.js'
            )
          )
          .pipe($.if(!useDebug, buffer()))
          .pipe($.if(!useDebug, $.uglify()))
          .pipe(gulp.dest('browser/'))
          .on('error', reject)
          .on('end', resolve);
      });
    };
  }

  return (
    Promise.resolve()
      // Standalone build with source maps and complete source
      .then(browserifyBuild(true, true))
      // Standalone build minified and without source maps
      .then(browserifyBuild(true, false))
      // Bower build with source maps and complete source
      .then(browserifyBuild(false, true))
      // Bower build minified and without source maps
      .then(browserifyBuild(false, false))
  );
});

gulp.task('lint', function () {
  return gulp
    .src([
      './bin/swagger-tools',
      './index.js',
      './src/lib/**/*.js',
      './src/middleware/helpers.js',
      './src/middleware/swagger-*.js',
      './test/**/*.js',
      './gulpfile.js',
      '!./src/middleware/swagger-ui/**/*.js',
      '!./test/**/test-specs-browser.js',
      '!./test/browser/vendor/*.js',
    ])
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'))
    .pipe($.jshint.reporter('fail'));
});

gulp.task('eslint', function () {
  return gulp
    .src([
      './bin/swagger-tools',
      './index.js',
      './src/lib/**/*.js',
      './src/middleware/helpers.js',
      './src/middleware/swagger-*.js',
      './test/**/*.js',
      './gulpfile.js',
      '!./src/middleware/swagger-ui/**/*.js',
      '!./test/**/test-specs-browser.js',
      '!./test/browser/vendor/*.js',
    ])
    .pipe($.prettierPlugin())
    .pipe($.eslint())
    .pipe($.eslint.format())
    .pipe($.eslint.failAfterError());
});

gulp.task('test-node', function () {
  return new Promise(function (resolve, reject) {
    gulp
      .src([
        './index.js',
        './src/lib/**/*.js',
        './src/middleware/helpers.js',
        './src/middleware/swagger-*.js',
        '!./src/middleware/swagger-ui/**/*.js',
        '!./test/**/test-specs-browser.js',
      ])
      .pipe($.istanbul())
      .pipe($.istanbul.hookRequire()) // Force `require` to return covered files
      .on('finish', function () {
        gulp
          .src(['./test/**/test-*.js', '!./test/**/test-specs-browser.js'])
          .pipe($.mocha({ reporter: 'spec', timeout: 5000 }))
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

gulp.task('test-browser', ['browserify'], async () => {
  const cleanUpEach = () => del(['./test/browser/test-browser.js']);

  const cleanUpAll = async () => {
    await cleanUpEach();
    return del([
      './test/browser/swagger-tools.js',
      './test/browser/swagger-tools-standalone.js',
    ]);
  };

  const finisher = async err => {
    await cleanUpAll();
    displayCoverageReport(runningAllTests);
    if (err) {
      console.log('Finisher error:', err);
    }
    return err;
  };

  const bundle = version => new Promise((resolve, reject) => {
    const b = browserify([`./test/${version}/test-specs.js`], {
      debug: true,
    });

    return b.bundle()
      .pipe(source('test-browser.js'))
      .pipe(gulp.dest('./test/browser'))
      .on('error', reject)
      .on('end', resolve);
  });

  const copyFile = (source, dest) => {
    return new Promise((resolve, reject) => {
      return fs.copyFile(source, dest, (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });
  };

  const karmaTest = configFile => {
    return new Promise((resolve, reject) =>
      new KarmaServer(
        {
          configFile,
          singleRun: true,
        },
        err => {
          if (err) {
            return reject(err);
          }
          return resolve();
        }
      ).start());
  };

  const makeTest = async (version, standalone) => {
    await cleanUpEach();
    await bundle(version);

    const configFile = path.join(
      __dirname,
      'test/browser/karma-' +
      (standalone ? 'standalone' : 'bower') +
      '.conf.js'
    );
    return karmaTest(configFile);
  };
  
  try {
    await cleanUpAll();
    await copyFile('./browser/swagger-tools.js', './test/browser/swagger-tools.js');
    await copyFile('./browser/swagger-tools-standalone.js', './test/browser/swagger-tools-standalone.js');
    await makeTest('1.2', false);
    await makeTest('1.2', true);
    await makeTest('2.0', false);
    await makeTest('2.0', true);
    await finisher();
  } catch (err) {
    await finisher(err);
  }
});

gulp.task('test', function (cb) {
  runningAllTests = true;

  // Done this way to ensure that test-node runs prior to test-browser.  Since both of those tasks are independent,
  // doing this 'The Gulp Way' isn't feasible.

  runSequence('test-node', 'test-browser', cb);
});

// gulp.task('default', ['eslint', 'test']);
gulp.task('default', ['lint', 'test']);
