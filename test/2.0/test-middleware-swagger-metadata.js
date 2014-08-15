/* global describe, it */

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

// Here to quiet down Connect logging errors
process.env.NODE_ENV = 'test';

var _ = require('lodash');
var assert = require('assert');
var middleware = require('../../').middleware.v2_0.swaggerMetadata; // jshint ignore:line
var petstoreJson = require('../../samples/2.0/petstore.json');
var prepareText = require('../helpers').prepareText;
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

  it('should not add Swagger middleware to the request when there are no operations', function () {
    request(createServer(middleware({paths: {'/pets': {}}}), function (req, res, next) {
        if (req.swagger) {
          return next('This should not happen');
        }
        res.end('OK');
      }))
      .get('/foo')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), 'OK');
      });
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
        .end(function(err, res) { // jshint ignore:line
          assert.equal(prepareText(res.text),
                       'Server configuration error: req.body is not defined but is required');
        });
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
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text),
                     'Server configuration error: req.query is not defined but is required');
      });
  });

  it('should add Swagger middleware to the request when there are operations', function () {
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
            schema: json.paths['/pets/{id}'].parameters[0],
            value: '1'
          },
          mock: {
            schema: json.paths['/pets/{id}'].get.parameters[0],
            value: 'false'
          }
        });
      } catch (err) {
        console.log(err.stack);
        return next(err.message);
      }

      res.end('OK');
    }))
    .get('/api/pets/1')
    .query({mock: false})
    .expect(200)
    .end(function(err, res) {
      if (err) {
        throw err;
      }
      assert.equal(prepareText(res.text), 'OK');
    });
  });

  // TODO: Add tests to ensure parameters are located properly (And handle default values)
});