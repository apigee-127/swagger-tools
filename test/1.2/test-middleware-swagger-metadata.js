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
var middleware = require('../../').middleware.v1_2.swaggerMetadata; // jshint ignore:line
var petJson = require('../../samples/1.2/pet.json');
var prepareText = require('../helpers').prepareText;
var request = require('supertest');
var resourceList = require('../../samples/1.2/resource-listing.json');

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

describe('Swagger Metadata Middleware v1.2', function () {
  it('should throw Error when passed the wrong arguments', function () {
    var errors = {
      'resourceList is required': [],
      'resourceList must be an object': ['resource-listing.json'],
      'resources is required': [resourceList],
      'resources must be an array': [resourceList, petJson]
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
      assert.ok(_.isFunction(middleware.apply(middleware, [
        resourceList,
        [petJson]
      ])));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should throw Error when passed resource with duplicate API paths', function () {
    var path1 = {path: '/foo'};
    var path2 = {path: '/foo/{bar}'};
    var path3 = {path: '/foo/{baz}'};

    [
      // Simple duplication, single resource
      [{apis: [path1, path1]}],
      // Complex duplication, single resource
      [{apis: [path2, path3]}],
      // Simple duplication, multiple resources
      [{apis: [path1]}, {apis: [path1]}],
      // Complex duplication, multiple resources
      [{apis: [path2]}, {apis: [path3]}]
    ].forEach(function (input, index) {
      try {
        middleware.apply(middleware, [resourceList, input]);
        assert.fail(null, null, 'Should had thrown an error');
      } catch (err) {
        if ([0, 2].indexOf(index) !== -1) {
          assert.equal(err.message, 'Duplicate API path/pattern: ' + path1.path);
        } else {
          assert.equal(err.message, 'Duplicate API path/pattern: ' + path3.path);
        }
      }
    });
  });

  it('should throw Error when passed resource with duplicate API operation methods', function () {
    try {
      middleware.apply(middleware, [
        resourceList,
        [{apis: [{path: '/foo', operations: [{method: 'GET'}, {method: 'GET'}]}]}]
      ]);
      assert.fail(null, null, 'Should had thrown an error');
    } catch (err) {
      assert.ok(err.message, 'Duplicate API operation (/foo) method: GET');
    }
  });

  it('should not add Swagger middleware to the request when there are no operations', function () {
    request(createServer(middleware(
        resourceList,
        [{apis: [{path: '/foo'}]}
      ]), function (req, res, next) {
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
    ['body', 'form'].forEach(function (type) {
      var app = require('connect')();

      app.use(middleware(resourceList, [
        {apis: [{path: '/foo', operations: [
          {method: 'POST', parameters: [{paramType: type, name: 'test'}]}
        ]}]}
      ]));

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

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));

    app.use(middleware(resourceList, [
      {apis: [{path: '/foo', operations: [
        {method: 'POST', parameters: [{paramType: 'query', name: 'test'}]}
      ]}]}
    ]));

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
    request(createServer(middleware(
        resourceList,
        [petJson]
      ), function (req, res, next) {
        var swagger = req.swagger;

        try {
          assert.ok(!_.isUndefined(swagger));
          assert.deepEqual(swagger.api, petJson.apis[0]);
          assert.deepEqual(swagger.authorizations, resourceList.authorizations || {});
          assert.deepEqual(swagger.models, petJson.models || {});
          assert.deepEqual(swagger.operation, petJson.apis[0].operations[0]);
          assert.deepEqual(swagger.params, {
            petId: {
              schema: petJson.apis[0].operations[0].parameters[0],
              value: '1'
            }
          });
        } catch (err) {
          return next(err.message);
        }

        res.end('OK');
      }))
      .get('/api/pet/1')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), 'OK');
      });
  });
});