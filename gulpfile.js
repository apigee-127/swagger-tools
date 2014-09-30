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

var _ = {
  times: require('lodash.times')
};
var browserify = require('browserify');
var gulp = require('gulp');
var jshint = require('gulp-jshint');
var mocha = require('gulp-mocha');
var source = require('vinyl-source-stream');

gulp.task('browserify', function () {
  _.times(2, function (n) {
    var b = browserify('./lib/specs.js', {
      debug: n === 0,
      standalone: 'SwaggerTools.specs'
    });

    if (n === 1) {
      b.transform({global: true}, 'uglifyify');
    }

    b.transform('brfs')
      .bundle()
      .pipe(source('swagger-tools' + (n === 1 ? '-min' : '') + '.js'))
      .pipe(gulp.dest('./browser/'));
  });
});

gulp.task('lint', function () {
  return gulp.src([
      './index.js',
      './lib/**/*.js',
      './middleware/**/*.js',
      './test/1.2/*.js',
      './test/2.0/*.js',
      './gulpfile.js',
      '!./middleware/swagger-ui/**/*.js'
    ])
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'));
});

gulp.task('test', function () {
    return gulp.src('test/**/test-*.js')
        .pipe(mocha({reporter: 'spec'}));
});

gulp.task('default', ['lint', 'test']);
gulp.task('dist', ['default', 'browserify']);
