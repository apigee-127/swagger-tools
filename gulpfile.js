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

var _ = require('lodash');
var async = require('async');
var bower = require('bower');
var browserify = require('browserify');
var del = require('del');
var exposify = require('exposify');
var fs = require('fs');
var gulp = require('gulp');
var istanbul = require('gulp-istanbul');
var jshint = require('gulp-jshint');
var mocha = require('gulp-mocha');
var mochaPhantomJS = require('gulp-mocha-phantomjs');
var source = require('vinyl-source-stream');
var versions = ['1.2', '2.0'];
var browserTestsPaths = _.reduce(versions, function (paths, version) {
  return paths.concat('./test/' + version + '/browser/');
}, []);

gulp.task('browserify', function (cb) {
  // Builds 4 browser binaries:
  //
  // 1 (swagger-tools.js): Bower build without uglification and including source maps
  // 2 (swagger-tools-min.js): Bower build uglified and without source maps
  // 3 (swagger-tools-standalone.js): Standalone build without uglification and including source maps
  // 4 (swagger-tools-standalone-min.js): Standalone build uglified and without source maps

  async.map([0,1,2,3], function (n, callback) {
    var useDebug = n === 0 || n === 2;
    var isStandalone = n >= 2;
    var b = browserify('./lib/specs.js', {
      debug: useDebug,
      standalone: 'SwaggerTools.specs'
    });

    if (!useDebug) {
      b.transform({global: true}, 'uglifyify');
    }

    if (!isStandalone) {
      // Expose Bower modules so they can be required
      exposify.config = {
        'async': 'async',
        'debug': 'debug',
        'json-refs': 'JsonRefs',
        'lodash': '_',
        'spark-md5': 'SparkMD5',
        'swagger-converter': 'SwaggerConverter.convert',
        'traverse': 'traverse',
        'z-schema': 'ZSchema'
      };

      b.transform('exposify');
    }

    b.transform('brfs')
      .bundle()
      .pipe(source('swagger-tools' + (isStandalone ? '-standalone' : '') + (!useDebug ? '-min' : '') + '.js'))
      .pipe(gulp.dest('./browser/'))
      .on('error', function (err) {
        callback(err);
      })
      .on('end', function () {
        callback();
      });
  }, function (err) {
    cb(err);
  });
});

gulp.task('browserify-test', function (cb) {
  async.map(versions, function (version, callback) {
    var basePath = './test/' + version + '/';
    var b = browserify(basePath + 'test-specs.js', {
      debug: true
    });

    b.transform('brfs')
      .bundle()
      .pipe(source('test-specs-browser.js'))
      .pipe(gulp.dest(basePath + 'browser/'))
      .on('error', function (err) {
        callback(err);
      })
      .on('end', function () {
        callback();
      });
  }, function (err) {
    cb(err);
  });
});

gulp.task('lint', function () {
  return gulp.src([
    './bin/swagger-tools',
    './index.js',
    './lib/**/*.js',
    'middleware/helpers.js',
    './middleware/swagger-*.js',
    './test/1.2/*.js',
    './test/2.0/*.js',
    './gulpfile.js',
    '!./middleware/swagger-ui/**/*.js',
    '!./test/**/test-specs-browser.js'
  ])
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'));
});

gulp.task('test-node', function () {
  return gulp.src([
    './index.js',
    'lib/**/*.js',
    'middleware/helpers.js',
    'middleware/swagger-*.js',
    '!./middleware/swagger-ui/**/*.js',
    '!./test/**/test-specs-browser.js'
  ])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire()) // Force `require` to return covered files
    .on('finish', function () {
      gulp.src([
        'test/**/test-*.js',
        '!./test/**/test-specs-browser.js'
      ]).pipe(mocha({reporter: 'spec'}));
    });
});

gulp.task('clean-tests', function (cb) {
  del(browserTestsPaths, cb);
});

gulp.task('test-prepare', ['browserify', 'clean-tests'], function (cb) {
  async.map(versions, function (version, callback) {
    var basePath = './test/' + version + '/browser/';

    // Create browser test directory
    fs.mkdirSync(basePath);

    // Copy test HTML files
    _.each(['test-bower.html', 'test-standalone.html'], function (fileName) {
      fs.createReadStream('./test/browser/' + fileName).pipe(fs.createWriteStream(basePath + fileName));
    });

    // Copy bower.json to the test directory
    fs.createReadStream('./bower.json').pipe(fs.createWriteStream(basePath + 'bower.json'));

    bower.commands.install([], {}, {cwd: basePath})
      .on('end', function () {
        var b = browserify(basePath + '../test-specs.js', {
          debug: true
        });

        b.transform('brfs')
          .bundle()
          .pipe(source('test-specs-browser.js'))
          .pipe(gulp.dest(basePath))
          .on('error', function (err) {
            callback(err);
          })
          .on('end', function () {
            // Copy the Swagger Tools browser builds to the test directory
            fs.createReadStream('./browser/swagger-tools.js').pipe(fs.createWriteStream(basePath + 'swagger-tools.js'));
            fs.createReadStream('./browser/swagger-tools-standalone.js')
              .pipe(fs.createWriteStream(basePath + 'swagger-tools-standalone.js'));

            callback();
        });
      })
      .on('error', function (err) {
        callback(err);
      });
  }, cb);
});

gulp.task('test-browser', ['browserify', 'test-prepare'], function (cb) {
  gulp
    .src(_.reduce(browserTestsPaths, function (paths, basePath) {
      return paths.concat([
        basePath + 'test-bower.html',
        basePath + 'test-standalone.html'
      ]);
    }, []))
    .pipe(mochaPhantomJS({
      phantomjs: {
        settings: {
          localToRemoteUrlAccessEnabled: true,
          webSecurityEnabled: false
        }
      }
    }))
    .on('error', function (err) {
      cb(err);
    })
    .on('finish', function () {
      // Clean up
      del(browserTestsPaths, cb);
    });
});

gulp.task('test', ['test-node', 'test-browser'], function () {
  gulp.src([])
    .pipe(istanbul.writeReports());
});
gulp.task('default', ['lint', 'test']);
