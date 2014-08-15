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
var helpers = require('../helpers');
var middleware = require('../../').middleware.v1_2.swaggerValidator; // jshint ignore:line
var petJson = require('../../samples/1.2/pet.json');
var request = require('supertest');
var rlJson = require('../../samples/1.2/resource-listing.json');
var createServer = helpers.createServer;
var prepareText = helpers.prepareText;

describe('Swagger Validator Middleware v1.2', function () {
  it('should return a function when passed the right arguments', function () {
    try {
      assert.ok(_.isFunction(middleware()));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should not validate request when there are no operations', function () {
    request(createServer([rlJson, [petJson]], [middleware()]))
      .get('/api/foo')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should return an error for invalid request content type based on POST/PUT operation consumes', function () {
    request(createServer([rlJson, [petJson]], [middleware()]))
      .post('/api/pet/1')
      .expect(400)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text),
                     'Invalid content type (application/octet-stream).  These are valid: ' +
                       'application/x-www-form-urlencoded');
      });
  });

  it('should not return an error for invalid request content type for non-POST/PUT', function () {
    var clonedRl = _.cloneDeep(rlJson);
    var clonedAd = _.cloneDeep(petJson);

    clonedAd.consumes = ['application/json'];

    request(createServer([clonedRl, [clonedAd]]))
      .get('/api/pet/1')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should not return an error for valid request content type', function () {
    request(createServer([rlJson, [petJson]], [middleware()]))
      .post('/api/pet/1')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should return an error for missing required parameters', function () {
    var clonedAd = _.cloneDeep(petJson);

    clonedAd.apis[0].operations[0].parameters.push({
      description: 'Whether or not to use mock mode',
      name: 'mock',
      paramType: 'query',
      required: true,
      type: 'boolean'
    });

    request(createServer([rlJson, [clonedAd]], [middleware()]))
      .get('/api/pet/1')
      .expect(400)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'Parameter (mock) is required');
      });
  });

  it('should not return an error for missing required parameters with defaultValue', function () {
    var clonedAd = _.cloneDeep(petJson);

    clonedAd.apis[0].operations[0].parameters.push({
      description: 'Whether or not to use mock mode',
      name: 'mock',
      paramType: 'query',
      required: true,
      defaultValue: 'false'
    });

    request(createServer([rlJson, [clonedAd]], [middleware()]))
      .get('/api/pet/1')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should not return an error for provided required parameters', function () {
    var clonedAd = _.cloneDeep(petJson);

    clonedAd.apis[0].operations[0].parameters.push({
      description: 'Whether or not to use mock mode',
      name: 'mock',
      paramType: 'query',
      required: true,
      type: 'boolean'
    });

    request(createServer([rlJson, [clonedAd]], [middleware()]))
      .get('/api/pet/1')
      .query({mock: 'true'})
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should return an error for invalid parameter values based on type/format', function () {
    var argName = 'arg0';
    var badValue = 'fake';
    var testScenarios = [
      {paramType: 'query', name: argName, type: 'boolean'},
      {paramType: 'query', name: argName, type: 'integer'},
      {paramType: 'query', name: argName, type: 'number'},
      {paramType: 'query', name: argName, type: 'string', format: 'date'},
      {paramType: 'query', name: argName, type: 'string', format: 'date-time'},
      {paramType: 'query', name: argName, type: 'array', items: {type: 'integer'}}
    ];

    _.each(testScenarios, function (scenario) {
      _.times(2, function (n) {
        var clonedAd = _.cloneDeep(petJson);
        var clonedS = _.cloneDeep(scenario);
        var content = {};
        var app;
        var r;

        // We don't test default value with arrays
        if (n === 0) {
          content = {arg0: scenario.type === 'array' ? [1, 'fake'] : badValue};
        } else if (n === 1) {
          if (scenario.type === 'array') {
            return;
          } else {
            clonedS.defaultValue = badValue;
          }
        }

        clonedAd.apis[0].operations[0].parameters.push(clonedS);

        app = createServer([rlJson, [clonedAd]], [middleware()]);
        r = request(app)
          .get('/api/pet/1')
          .query(content)
          .expect(400);

        r.end(function(err, res) { // jshint ignore:line
          var message;
          if (scenario.type === 'array') {
            message = 'Parameter (' + argName + ') at index 1 is not a valid integer: fake';
          } else {
            message = 'Parameter (' + scenario.name + ') is not a valid ' +
                         (_.isUndefined(scenario.format) ? '' : scenario.format + ' ') + scenario.type + ': ' +
                         badValue;
          }

          assert.equal(prepareText(res.text), message);
        });
      });
    });
  });

  it('should not return an error for valid parameter values based on type/format', function () {
    var argName = 'arg0';
    var testScenarios = [
      {paramType: 'query', name: argName, type: 'boolean', defaultValue: 'true'},
      {paramType: 'query', name: argName, type: 'integer', defaultValue: '1'},
      {paramType: 'query', name: argName, type: 'number', defaultValue: '1.1'},
      {paramType: 'query', name: argName, type: 'string', format: 'date', defaultValue: '1981-03-12'},
      {
        paramType: 'query',
        name: argName,
        type: 'string',
        format: 'date-time',
        defaultValue: '1981-03-12T08:16:00-04:00'
      },
    ];

    _.each(testScenarios, function (scenario) {
      var clonedAd = _.cloneDeep(petJson);

      clonedAd.apis[0].operations[0].parameters.push(scenario);

      _.times(2, function (n) {
        var clonedS = _.cloneDeep(scenario);
        var content = {};

        if (n === 0) {
          delete clonedS.defaultValue;

          content = {arg0: scenario.defaultValue};
        }

        request(createServer([rlJson, [clonedAd]], [middleware()]))
          .get('/api/pet/1')
          .query(content)
          .expect(200)
          .end(function(err, res) { // jshint ignore:line
            assert.equal(prepareText(res.text), 'OK');
          });
      });
    });
  });

  it('should return an error for invalid parameter values not based on type/format', function () {
    var argName = 'arg0';
    var testScenarios = [
      {paramType: 'query', name: argName, enum: ['1', '2', '3'], type: 'string'},
      {paramType: 'query', name: argName, minimum: '1.0', type: 'integer'},
      {paramType: 'query', name: argName, maximum: '1.0', type: 'integer'},
      {paramType: 'query', name: argName, type: 'array', items: {type: 'string'}, uniqueItems: true}
    ];
    var values = [
      'fake',
      '0',
      '2',
      ['fake', 'fake']
    ];
    var errors = [
      'Parameter (' + argName + ') is not an allowable value (1, 2, 3): fake',
      'Parameter (' + argName + ') is less than the configured minimum (1.0): 0',
      'Parameter (' + argName + ') is greater than the configured maximum (1.0): 2',
      'Parameter (' + argName + ') does not allow duplicate values: fake, fake'
    ];

    _.each(testScenarios, function (scenario, index) {
      var clonedAd = _.cloneDeep(petJson);

      clonedAd.apis[0].operations[0].parameters.push(scenario);

      request(createServer([rlJson, [clonedAd]], [middleware()]))
        .get('/api/pet/1')
        .query({arg0: values[index]})
        .expect(400)
        .end(function(err, res) { // jshint ignore:line
          assert.equal(prepareText(res.text), errors[index]);
        });
    });
  });

  it('should not return an error for valid parameter values not based on type/format', function () {
    var argName = 'arg0';
    var testScenarios = [
      {paramType: 'query', name: argName, enum: ['1', '2', '3'], type: 'string'},
      {paramType: 'query', name: argName, minimum: '1.0', type: 'integer'},
      {paramType: 'query', name: argName, maximum: '1.0', type: 'integer'},
      {paramType: 'query', name: argName, type: 'array', items: {type: 'string'}, uniqueItems: true}
    ];
    var values = [
      '1',
      '2',
      '1',
      ['fake', 'fake1']
    ];
    _.each(testScenarios, function (scenario, index) {
      var clonedAd = _.cloneDeep(petJson);

      clonedAd.apis[0].operations[0].parameters.push(scenario);

      request(createServer([rlJson, [clonedAd]], [middleware()]))
        .get('/api/pet/1')
        .query({arg0: values[index]})
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          assert.equal(prepareText(res.text), 'OK');
        });
    });
  });
});
