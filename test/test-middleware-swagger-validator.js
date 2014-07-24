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
var middleware = require('../middleware/swagger-validator');
var request = require('supertest');
var prepareText = require('./helpers').prepareText;
var swaggerMetadata = require('../middleware/swagger-metadata');

var createServer = function (resourceList, resources) {
  var app = require('connect')();
  var bodyParser = require('body-parser');
  var parseurl = require('parseurl');
  var qs = require('qs');

  // Required middleware
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(function (req, res, next) {
    if (!req.query) {
      req.query = req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
    }

    next();
  });

  app.use(swaggerMetadata(resourceList, resources));
  app.use(middleware());

  app.use(function(req, res){
    res.end('OK');
  });

  return app;
};

describe('Swagger Validator Middleware', function () {
  it('should return a function when passed the right arguments', function () {
    try {
      assert.ok(_.isFunction(middleware()));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should not validate request when there are no operations', function () {
    request(createServer({}, [
        {apis: [{path: '/foo'}]}
      ]))
      .get('/foo')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should return an error for invalid request content type based on POST/PUT operation consumes', function () {
    request(createServer({}, [
        {apis: [{path: '/foo', operations: [{method: 'POST', consumes: ['application/json']}]}]}
      ]))
      .post('/foo')
      .expect(400)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text),
                     'Invalid content type (application/octet-stream).  These are valid: application/json');
      });
  });

  it('should not return an error for invalid request content type for non-POST/PUT', function () {
    request(createServer({}, [
        {apis: [{path: '/foo', operations: [
          {method: 'GET', consumes: ['application/json']}
        ]}]}
      ]))
      .get('/foo')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should return an error for invalid parameter values based on type/format', function () {
    var argName = 'arg0';
    var badValue = 'fake';
    var operations = [
      {method: 'POST', parameters: [{paramType: 'body', name: argName, type: 'boolean'}]},
      {method: 'POST', parameters: [{paramType: 'body', name: argName, type: 'boolean', defaultValue: badValue}]},
      {method: 'POST', parameters: [{paramType: 'form', name: argName, type: 'number'}]},
      {method: 'POST', parameters: [{paramType: 'form', name: argName, type: 'number', defaultValue: badValue}]},
      {method: 'POST', parameters: [{paramType: 'header', name: argName, type: 'number'}]},
      {method: 'POST', parameters: [{paramType: 'header', name: argName, type: 'number', defaultValue: badValue}]},
      {method: 'POST', parameters: [{paramType: 'path', name: argName, type: 'string', format: 'date'}]},
      // You can't test default value for path parameters as the URL will not match
      {method: 'POST', parameters: [{paramType: 'query', name: argName, type: 'string', format: 'date-time'}]},
      {method: 'POST', parameters: [
        {paramType: 'query', name: argName, type: 'string', format: 'date-time', defaultValue: badValue}
      ]}
    ];

    _.each(operations, function (operation) {
      var param = operation.parameters[0];
      var path = param.paramType === 'path' ? '/foo/{' + argName + '}' : '/foo';
      var content = {arg0: badValue};
      var app = createServer({}, [
        {apis: [{path: path, operations: [operation]}]}
      ]);
      var r = request(app)
        .post(path === '/foo' ? path : '/foo/' + (_.isUndefined(param.defaultValue) ? badValue : ''))
        .expect(400);

      if (_.isUndefined(param.defaultValue)) {
        switch (param.paramType) {
        case 'body':
        case 'form':
          r.send(content);
          break;
        case 'header':
          r.set(argName, badValue);
          break;
        case 'query':
          r.query(content);
          break;
        }
      }

      r.end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'Parameter (' + argName + ') is not a valid ' +
                     (_.isUndefined(param.format) ? '' : param.format + ' ') + param.type + ': ' + badValue);
      });
    });
  });

  it('should return an error for invalid parameter values not based on type/format', function () {
    var argName = 'arg0';
    var path = '/foo';
    var parameters = [
      {paramType: 'body', name: argName, enum: ['1', '2', '3'], type: 'string'},
      {paramType: 'body', name: argName, minimum: '1.0', type: 'integer'},
      {paramType: 'body', name: argName, maximum: '1.0', type: 'integer'},
      {paramType: 'body', name: argName, type: 'string', required: true},
      {paramType: 'body', name: argName, type: 'array', items: {type: 'integer'}},
      {paramType: 'body', name: argName, type: 'array', items: {type: 'string'}, uniqueItems: true}
    ];
    var values = [
      'fake',
      '0',
      '2',
      undefined,
      ['1', 'fake'],
      ['fake', 'fake']
    ];
    var errors = [
      'Parameter (' + argName + ') is not an allowable value (1, 2, 3): fake',
      'Parameter (' + argName + ') is less than the configured minimum (1.0): 0',
      'Parameter (' + argName + ') is greater than the configured maximum (1.0): 2',
      'Parameter (' + argName + ') is required',
      'Parameter (' + argName + ') at index 1 is not a valid integer: fake',
      'Parameter (' + argName + ') does not allow duplicate values: fake, fake'
    ];
    var statuses = [
      400,
      400,
      400,
      400,
      400,
      400
    ];

    _.each(parameters, function (parameter, index) {
      request(createServer({}, [
          {apis: [{path: path, operations: [{method: 'POST', parameters: [parameter]}]}]}
        ]))
        .post(path)
        .send({arg0: values[index]})
        .expect(statuses[index])
        .end(function(err, res) { // jshint ignore:line
          assert.equal(prepareText(res.text), errors[index]);
        });
    });
  });
});
