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

var _ = {
  cloneDeep: require('lodash.clonedeep'),
  each: require('lodash.foreach'),
  isFunction: require('lodash.isfunction'),
  isUndefined: require('lodash.isundefined'),
  times: require('lodash.times')
};
var assert = require('assert');
var helpers = require('../helpers');
var middleware = require('../../').middleware.v2_0.swaggerValidator; // jshint ignore:line
var petStoreJson = require('../../samples/2.0/petstore.json');
var request = require('supertest');

var createServer = helpers.createServer;
var prepareText = helpers.prepareText;

describe('Swagger Validator Middleware v2.0', function () {
  it('should return a function when passed the right arguments', function () {
    try {
      assert.ok(_.isFunction(middleware()));
    } catch (err) {
      assert.fail(null, null, err.message);
    }
  });

  it('should not validate request when there are no operations', function () {
    request(createServer([petStoreJson], [middleware()]))
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
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].post.consumes = ['application/json'];

    request(createServer([swaggerObject], [middleware()]))
      .post('/api/pets')
      .expect(400)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text),
                     'Invalid content type (application/octet-stream).  These are valid: application/json');
      });
  });

  it('should not return an error for invalid request content type for non-POST/PUT', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.consumes = ['application/json'];

    request(createServer([swaggerObject]))
      .get('/api/pets')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        if (err) {
          throw err;
        }
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should not return an error for valid request content type', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.consumes = ['application/json'];

    request(createServer([swaggerObject], [middleware()]))
      .post('/api/pets/1')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should not return an error for valid request content type with charset', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.consumes = ['application/json'];

    request(createServer([swaggerObject], [middleware()]))
      .post('/api/pets/1')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send({})
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should return an error for missing required parameters', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets/{id}'].get.parameters = [
      {
        name: 'mock',
        in: 'query',
        description: 'Whether or not to use mock mode',
        required: true,
        type: 'boolean'
      }
    ];

    request(createServer([swaggerObject], [middleware()]))
      .get('/api/pets/1')
      .expect(400)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'Parameter (mock) is required');
      });
  });

  it('should not return an error for missing required parameters with defaultValue', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets/{id}'].get.parameters = [
      {
        name: 'mock',
        in: 'query',
        description: 'Whether or not to use mock mode',
        required: true,
        schema: {
          type: 'boolean',
          default: 'true'
        }
      }
    ];

    request(createServer([swaggerObject], [middleware()]))
      .get('/api/pet/1')
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should not return an error for provided required parameters', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets/{id}'].get.parameters = [
      {
        name: 'mock',
        in: 'query',
        description: 'Whether or not to use mock mode',
        required: true,
        type: 'boolean'
      }
    ];

    request(createServer([swaggerObject], [middleware()]))
      .get('/api/pets/1')
      .expect(200)
      .query({mock: 'true'})
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });

  it('should return an error for invalid parameter values based on type/format', function () {
    var argName = 'arg0';
    var badValue = 'fake';
    var testScenarios = [
      {in: 'query', name: argName, type: 'boolean'},
      {in: 'query', name: argName, type: 'integer'},
      {in: 'query', name: argName, type: 'number'},
      {in: 'query', name: argName, type: 'string', format: 'date'},
      {in: 'query', name: argName, type: 'string', format: 'date-time'},
      {in: 'query', name: argName, type: 'array', items: {type: 'integer'}}
    ];

    _.each(testScenarios, function (scenario) {
      _.times(2, function (n) {
        var swaggerObject = _.cloneDeep(petStoreJson);
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
            // We have to put this into the 'schema' object
            delete clonedS.format;
            delete clonedS.type;

            clonedS.schema = {
              default: badValue
            };

            if (scenario.format) {
              clonedS.schema.format = scenario.format;
            }

            if (scenario.type) {
              clonedS.schema.type = scenario.type;
            }
          }
        }

        swaggerObject.paths['/pets/{id}'].get.parameters = [
          clonedS
        ];

        app = createServer([swaggerObject], [middleware()]);
        r = request(app)
          .get('/api/pets/1')
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
      {in: 'query', name: argName, type: 'boolean'},
      {in: 'query', name: argName, type: 'integer'},
      {in: 'query', name: argName, type: 'number'},
      {in: 'query', name: argName, type: 'string', format: 'date'},
      {in: 'query', name: argName, type: 'string', format: 'date-time'},
    ];
    var values = [
      'true',
      '1',
      '1.1',
      '1981-03-12',
      '1981-03-12T08:16:00-04:00'
    ];

    _.each(testScenarios, function (scenario, index) {
      _.times(2, function (n) {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var clonedS = _.cloneDeep(scenario);
        var content = {};
        var value = values[index];

        if (n === 0) {
          content = {arg0: value};
        } else {
          clonedS.schema = {
            default: value,
            type: scenario.type
          };

          delete clonedS.type;

          if (clonedS.format) {
            delete clonedS.format;

            clonedS.format = scenario.format;
          }
        }

        swaggerObject.paths['/pets/{id}'].get.parameters = [
          clonedS
        ];

        request(createServer([swaggerObject], [middleware()]))
          .get('/api/pets/1')
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
      {enum: ['1', '2', '3'], type: 'string'},
      {maximum: '1.0', type: 'integer'},
      {maximum: '1.0', exclusiveMaximum: true, type: 'integer'},
      {maxItems: '1', type: 'array', items: {type: 'string'}},
      {maxLength: '1', type: 'string'},
      {minimum: '1.0', type: 'integer'},
      {minimum: '1.0', exclusiveMinimum: true, type: 'integer'},
      {minItems: '2', type: 'array', items: {type: 'string'}},
      {minLength: '2', type: 'string'},
      {pattern: '[bc]+', type: 'string'},
      {type: 'array', items: {type: 'string'}, uniqueItems: true}
    ];
    var values = [
      'fake',
      '2',
      '1',
      ['1', '2'],
      'fake',
      '0',
      '1',
      ['1'],
      'f',
      'fake',
      ['fake', 'fake']
    ];
    var errors = [
      'Parameter (' + argName + ') is not an allowable value (1, 2, 3): fake',
      'Parameter (' + argName + ') is greater than the configured maximum (1.0): 2',
      'Parameter (' + argName + ') is greater than or equal to the configured maximum (1.0): 1',
      'Parameter (' + argName + ') contains more items than allowed: 1',
      'Parameter (' + argName + ') is longer than allowed: 1',
      'Parameter (' + argName + ') is less than the configured minimum (1.0): 0',
      'Parameter (' + argName + ') is less than or equal to the configured minimum (1.0): 1',
      'Parameter (' + argName + ') contains fewer items than allowed: 2',
      'Parameter (' + argName + ') is shorter than allowed: 2',
      'Parameter (' + argName + ') does not match required pattern: [bc]+',
      'Parameter (' + argName + ') does not allow duplicate values: fake, fake'
    ];

    _.each(testScenarios, function (scenario, index) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.paths['/pets/{id}'].get.parameters = [
        {in: 'query', name: argName, schema: scenario}
      ];

      request(createServer([swaggerObject], [middleware()]))
        .get('/api/pets/1')
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
      {enum: ['1', '2', '3'], type: 'string'},
      {maximum: '1.0', type: 'integer'},
      {maximum: '1.0', exclusiveMaximum: true, type: 'integer'},
      {maxItems: '1', type: 'array', items: {type: 'string'}},
      {maxLength: '1', type: 'string'},
      {minimum: '1.0', type: 'integer'},
      {minimum: '1.0', exclusiveMinimum: true, type: 'integer'},
      {minItems: '2', type: 'array', items: {type: 'string'}},
      {minLength: '2', type: 'string'},
      {pattern: '[abc]+', type: 'string'},
      {type: 'array', items: {type: 'string'}, uniqueItems: true}
    ];
    var values = [
      '1',
      '1',
      '0',
      ['1'],
      'a',
      '2',
      '2',
      ['1', '2'],
      'fake',
      'fake',
      ['fake', 'faker']
    ];

    _.each(testScenarios, function (scenario, index) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.paths['/pets/{id}'].get.parameters = [
        {in: 'query', name: argName, schema: scenario}
      ];

      request(createServer([swaggerObject], [middleware()]))
        .get('/api/pets/1')
        .query({arg0: values[index]})
        .expect(200)
        .end(function(err, res) { // jshint ignore:line
          assert.equal(prepareText(res.text), 'OK');
        });
    });
  });

  it('should return an error for an invalid model parameter', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    request(createServer([swaggerObject], [middleware()]))
      .post('/api/pets')
      .send({})
      .expect(400)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'Parameter (pet) is not a valid #/definitions/newPet model');
      });
  });

  it('should not return an error for a valid model parameter', function () {
    var swaggerObject = _.cloneDeep(petStoreJson);

    request(createServer([swaggerObject], [middleware()]))
      .post('/api/pets')
      .send({
        id: 1,
        name: 'Test Pet'
      })
      .expect(200)
      .end(function(err, res) { // jshint ignore:line
        assert.equal(prepareText(res.text), 'OK');
      });
  });
});
