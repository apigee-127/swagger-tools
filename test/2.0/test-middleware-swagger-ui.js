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
  each: require('lodash.foreach'),
  isFunction: require('lodash.isfunction')
};
var assert = require('assert');
var helpers = require('../helpers');
var middleware = require('../../').middleware.v2_0.swaggerUi; // jshint ignore:line
var request = require('supertest');
var createServer = helpers.createServer;
var prepareText = helpers.prepareText;

var swaggerObject = require('../../samples/2.0/petstore.json');

describe('Swagger UI Middleware v2.0', function () {
  it('should throw Error when passed the wrong arguments', function () {
    var errors = {
      'swaggerObject is required': [],
      'swaggerObject must be an object': ['petstore.json']
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
      assert.ok(_.isFunction(middleware(swaggerObject)));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should serve Swagger documents at /api-docs by default', function () {
    request(createServer([swaggerObject], [middleware(swaggerObject)]))
      .get('/api-docs')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.deepEqual(JSON.parse(prepareText(res.text)), swaggerObject);
      });
  });

  it('should serve Swagger documents at requested location', function () {
    var options = {
      apiDocs: '/api-docs2'
    };

    request(createServer([swaggerObject], [middleware(swaggerObject, options)]))
      .get('/api-docs2')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.deepEqual(JSON.parse(prepareText(res.text)), swaggerObject);
      });
  });

  it('should serve Swagger UI at /docs by default', function () {
    request(createServer([swaggerObject], [middleware(swaggerObject)]))
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
    request(createServer([swaggerObject], [middleware(swaggerObject, {swaggerUi: '/docs2'})]))
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
