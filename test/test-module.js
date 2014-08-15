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
var assert = require('assert');
var swagger = require('../');

var middlewares = ['swaggerMetadata', 'swaggerRouter', 'swaggerValidator'];

describe('swagger-tools', function () {
  describe('middleware', function () {
    it('should have proper exports', function () {
      assert.ok(_.isPlainObject(swagger.middleware.v1));
      assert.ok(_.isPlainObject(swagger.middleware.v1_2)); // jshint ignore:line
      assert.deepEqual(middlewares, Object.keys(swagger.middleware.v1));
      assert.deepEqual(middlewares, Object.keys(swagger.middleware.v1_2)); // jshint ignore:line
      assert.ok(_.isPlainObject(swagger.middleware.v2));
      assert.ok(_.isPlainObject(swagger.middleware.v2_0)); // jshint ignore:line
      assert.deepEqual(middlewares, Object.keys(swagger.middleware.v2));
      assert.deepEqual(middlewares, Object.keys(swagger.middleware.v2_0)); // jshint ignore:line
    });
  });

  describe('specs', function () {
    it('should have proper exports', function () {
      assert.equal(0, _.difference(['v1', 'v1_2', 'v2', 'v2_0'], Object.keys(swagger.specs)).length);
    });
  });
});
