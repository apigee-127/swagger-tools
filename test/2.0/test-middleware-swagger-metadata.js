/* global describe, it */

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

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';

var _ = require('lodash');
var assert = require('assert');
var helpers = require('../helpers');
var middleware = require('../../').middleware.v2_0.swaggerMetadata; // jshint ignore:line
var petstoreJson = require('../../samples/2.0/petstore.json');
var request = require('supertest');

var createServer = function (middleware, handler) {
  var app = require('connect')();
  var bodyParser = require('body-parser');
  var parseurl = require('parseurl');
  var qs = require('qs');

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  app.use(function (req, res, next) {
    if (!req.query) {
      req.query = req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
    }

    next();
  });

  app.use(middleware);

  app.use(handler || function(req, res){
    res.end('OK');
  });

  return app;
};

describe('Swagger Metadata Middleware v2.0', function () {
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
      assert.ok(_.isFunction(middleware.apply(middleware, [petstoreJson])));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should return an error for an improperly configured server for body/form parameter validation', function () {
    ['body', 'formData'].forEach(function (type) {
      var app = require('connect')();
      var spec = {
        paths: {
          '/foo': {
            post: {
              parameters: [
                {
                  in: type,
                  name: 'test'
                }
              ]
            }
          }
        }
      };

      app.use(middleware(spec));

      app.use(function(req, res){
        res.end('OK');
      });

      request(app)
        .post('/foo')
        .expect(500)
        .end(helpers.expectContent('Server configuration error: req.body is not defined but is required'));
    });
  });

  it('should return an error for an improperly configured server for query parameter validation', function () {
    var app = require('connect')();
    var bodyParser = require('body-parser');
    var spec = {
      paths: {
        '/foo': {
          post: {
            parameters: [
              {
                in: 'query',
                name: 'test'
              }
            ]
          }
        }
      }
    };

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));

    app.use(middleware(spec));

    app.use(function(req, res){
      res.end('OK');
    });

    request(app)
      .post('/foo')
      .expect(500)
      .end(helpers.expectContent('Server configuration error: req.query is not defined but is required'));
  });

  it('should not add Swagger middleware to the request when there is no route match', function () {
    request(createServer(middleware({paths: {'/pets': {}}}), function (req, res, next) {
        if (req.swagger) {
          return next('This should not happen');
        }
        res.end('OK');
      }))
      .get('/foo')
      .expect(200)
      .end(helpers.expectContent('OK'));
  });

  it('should add Swagger middleware to the request when there is a route match but no operations', function () {
    request(createServer(middleware({paths: {'/pets': {}}}), function (req, res, next) {
        if (req.swagger) {
          res.end('OK');
        } else {
          return next('This should not happen');
        }
      }))
      .get('/pets')
      .expect(200)
      .end(helpers.expectContent('OK'));
  });

  it('should add Swagger middleware to the request when there is a route match and there are operations', function () {
    var json = _.cloneDeep(petstoreJson);

    // Add an operatoin parameter
    json.paths['/pets/{id}'].get.parameters = [
      {
        'in': 'query',
        'name': 'mock',
        'description': 'Mock mode',
        'required': false,
        'type': 'boolean'
      }
    ];

    request(createServer(middleware(json), function (req, res, next) {
      var swagger = req.swagger;

      try {
        assert.ok(!_.isUndefined(swagger));
        assert.deepEqual(swagger.path, json.paths['/pets/{id}']);
        assert.deepEqual(swagger.operation, json.paths['/pets/{id}'].get);
        assert.deepEqual(swagger.params, {
          id: {
            path: ['paths', '/pets/{id}', 'parameters', '0'],
            schema: json.paths['/pets/{id}'].parameters[0],
            value: '1'
          },
          mock: {
            path: ['paths', '/pets/{id}', 'get', 'parameters', '0'],
            schema: json.paths['/pets/{id}'].get.parameters[0],
            value: 'false'
          }
        });
      } catch (err) {
        return next(err.message);
      }

      res.end('OK');
    }))
    .get('/api/pets/1')
    .query({mock: false})
    .expect(200)
    .end(helpers.expectContent('OK'));
  });

  // TODO: Add tests to ensure parameters are located properly (And handle default values)
});
