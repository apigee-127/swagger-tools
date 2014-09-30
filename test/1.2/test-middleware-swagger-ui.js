/* global describe, it */

/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';

var _ = {
  cloneDeep: require('lodash.clonedeep'),
  each: require('lodash.foreach'),
  isFunction: require('lodash.isfunction')
};
var assert = require('assert');
var helpers = require('../helpers');
var middleware = require('../../').middleware.v1_2.swaggerUi; // jshint ignore:line
var request = require('supertest');
var createServer = helpers.createServer;
var prepareText = helpers.prepareText;

var rlJson = require('../../samples/1.2/resource-listing.json');
var petJson = require('../../samples/1.2/pet.json');
var storeJson = require('../../samples/1.2/store.json');
var userJson = require('../../samples/1.2/user.json');
var resourcesArg = {
  '/pet': petJson,
  '/store': storeJson,
  '/user': userJson
};
var middlewareArgs = [rlJson, [petJson, storeJson, userJson]];

describe('Swagger UI Middleware v1.2', function () {
  it('should throw Error when passed the wrong arguments', function () {
    var errors = {
      'resourceList is required': [],
      'resourceList must be an object': ['resource-listing.json'],
      'resources is required': [rlJson],
      'resources must be an object': [rlJson, 'pet.json']
    };

    _.each(errors, function (args, message) {
      try {
        middleware.apply(middleware, args);
        assert.fail(null, null, 'Should had thrown an error');
      } catch (err) {
        assert.equal(message, err.message);
      }
    });
  });

  it('should return a function when passed the right arguments', function () {
    try {
      assert.ok(_.isFunction(middleware(rlJson, resourcesArg)));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should throw Error when resource listing has duplicate API paths', function () {
    var clonedRl = _.cloneDeep(rlJson);

    clonedRl.apis[1].path = clonedRl.apis[0].path;

    try {
      middleware.apply(middleware, [clonedRl, resourcesArg]);
      assert.fail(null, null, 'Should had thrown an error');
    } catch (err) {
      assert.equal('API path declared multiple times: ' + clonedRl.apis[1].path, err.message);
    }
  });

  it('should throw Error when resource path is not defined in the resource listing', function () {
    try {
      middleware.apply(middleware, [rlJson, {
        '/pets': petJson
      }]);
      assert.fail(null, null, 'Should had thrown an error');
    } catch (err) {
      assert.equal('resource path is not defined in the resource listing: /pets', err.message);
    }
  });

  it('should serve Swagger documents at /api-docs by default', function () {
    request(createServer(middlewareArgs, [middleware(rlJson, resourcesArg)]))
      .get('/api-docs')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.deepEqual(JSON.parse(prepareText(res.text)), rlJson);
      });

    _.each(resourcesArg, function (json, path) {
      request(createServer(middlewareArgs, [middleware(rlJson, resourcesArg)]))
        .get('/api-docs' + path)
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          assert.deepEqual(JSON.parse(prepareText(res.text)), json);
        });
    });
  });

  it('should serve Swagger documents at requested location', function () {
    var options = {
      apiDocs: '/api-docs2'
    };

    request(createServer(middlewareArgs, [middleware(rlJson, resourcesArg, options)]))
      .get('/api-docs2')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.deepEqual(JSON.parse(prepareText(res.text)), rlJson);
      });

    _.each(resourcesArg, function (json, path) {
      request(createServer(middlewareArgs, [middleware(rlJson, resourcesArg, options)]))
        .post('/api-docs2' + path)
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          assert.deepEqual(JSON.parse(prepareText(res.text)), json);
        });
    });
  });

  it('should serve Swagger UI at /docs by default', function () {
    request(createServer(middlewareArgs, [middleware(rlJson, resourcesArg)]))
      .get('/docs/') // Trailing slash to avoid a 303
      .expect(200)
      .expect('content-type', 'text/html; charset=UTF-8')
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
      });
  });

  it('should serve Swagger UI at requested location', function () {
    request(createServer(middlewareArgs, [middleware(rlJson, resourcesArg, {swaggerUi: '/docs2'})]))
      .get('/docs2/') // Trailing slash to avoid a 303
      .expect(200)
      .expect('content-type', 'text/html; charset=UTF-8')
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
      });
  });
});
