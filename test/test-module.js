/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
