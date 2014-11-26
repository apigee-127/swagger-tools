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
var async = require('async');
var helpers = require('../helpers');
var request = require('supertest');

var petStoreJson = require('../../samples/2.0/petstore.json');

describe('Swagger Validator Middleware v2.0', function () {
  it('should not validate request when there are no operations', function (done) {
    helpers.createServer([petStoreJson], {}, function (app) {
      request(app)
      .get('/api/foo')
      .expect(200)
      .end(helpers.expectContent('OK', done));
    });
  });

  it('should return an error for invalid request content type based on POST/PUT operation consumes', function (done) {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].post.consumes = ['application/xml'];

    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
        .post('/api/pets')
        .send({
          id: 1,
          name: 'Fake Pet'
        })
        .expect(400)
        .end(helpers.expectContent('Invalid content type (application/json).  These are valid: ' +
                                     'application/xml', done));
    });
  });

  it('should not return an error for invalid request content type for non-POST/PUT', function (done) {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].get.consumes = ['application/xml'];

    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
        .get('/api/pets')
        .expect(200)
        .end(helpers.expectContent('OK', done));
    });
  });

  it('should not return an error for valid request content type', function (done) {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].post.consumes = ['application/xml', 'application/json'];

    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
      .post('/api/pets')
      .send({
        id: 1,
        name: 'Fake Pet'
      })
      .expect(200)
      .end(helpers.expectContent('OK', done));
    });
  });

  it('should not return an error for valid request content type with charset', function (done) {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].post.consumes = ['application/xml', 'application/json'];

    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
      .post('/api/pets')
      .send({
        id: 1,
        name: 'Fake Pet'
      })
      .set('Content-Type', 'application/json; charset=utf-8')
      .expect(200)
      .end(helpers.expectContent('OK', done));
    });
  });

  it('should return an error for missing required parameters', function (done) {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].get.parameters[0].required = true;

    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
        .get('/api/pets')
        .expect(400)
        .end(helpers.expectContent('Parameter (status) is required', done));
    });
  });

  it('should not return an error for missing required parameters with a default value', function (done) {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].get.parameters[0].default = true;
    swaggerObject.paths['/pets'].get.parameters[0].required = true;

    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
        .get('/api/pets')
        .expect(200)
        .end(helpers.expectContent('OK', done));
    });
  });

  it('should not return an error for provided required parameters', function (done) {
    var swaggerObject = _.cloneDeep(petStoreJson);

    swaggerObject.paths['/pets'].get.parameters[0].required = true;

    helpers.createServer([swaggerObject], {}, function (app) {
      request(app)
      .get('/api/pets')
      .query({status: 'waiting'})
      .expect(200)
      .end(helpers.expectContent('OK', done));
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

    async.map(testScenarios, function (scenario, callback) {
      var cPetStore = _.cloneDeep(petStoreJson);
      var cScenario = _.cloneDeep(scenario);
      var content = {arg0: scenario.type === 'array' ? [1, 'fake'] : badValue};
      var expectedMessage;

      cPetStore.paths['/pets/{id}'].get.parameters = [cScenario];

      if (scenario.type === 'array') {
        expectedMessage = 'Parameter (' + argName + ') at index 1 is not a valid integer: fake';
      } else {
        expectedMessage = 'Parameter (' + scenario.name + ') is not a valid ' +
                            (_.isUndefined(scenario.format) ?
                               '' :
                               scenario.format + ' ') + scenario.type + ': ' + badValue;
      }

      helpers.createServer([cPetStore], {}, function (app) {
        request(app)
          .get('/api/pets/1')
          .query(content)
          .expect(400)
          .end(function (err, res) {
            if (res) {
              res.expectedMessage = expectedMessage;
            }

            callback(err, res);
          });
      });
    });
  });

  it('should not return an error for valid parameter values based on type/format', function (done) {
    var argName = 'arg0';
    var testScenarios = [
      {in: 'query', name: argName, type: 'boolean'},
      {in: 'query', name: argName, type: 'integer'},
      {in: 'query', name: argName, type: 'number'},
      {in: 'query', name: argName, type: 'string', format: 'date'},
      {in: 'query', name: argName, type: 'string', format: 'date-time'},
      {in: 'query', name: argName, type: 'array', items: {type: 'integer'}}
    ];
    var values = [
      true,
      1,
      1.1,
      '1981-03-12',
      '1981-03-12T08:16:00-04:00',
      [1, 2]
    ];
    var index = 0;

    async.map(testScenarios, function (scenario, callback) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var cScenario = _.cloneDeep(scenario);

      cPetStoreJson.paths['/pets/{id}'].get.parameters = [cScenario];

      helpers.createServer([cPetStoreJson], {}, function (app) {
        request(app)
          .get('/api/pets/1')
          .query({arg0: values[index]})
          .expect(200)
          .end(function (err, res) {
            if (err) {
              throw err;
            }

            helpers.expectContent('OK')(undefined, res);

            callback();
          });
      });

      index++;
    }, function (err) {
      if (err) {
        throw err;
      }

      done();
    });
  });

  it('should return an error for invalid parameter values not based on type/format', function (done) {
    var argName = 'arg0';
    var testScenarios = [
      {name: argName, in: 'query', enum: ['1', '2', '3'], type: 'string'},
      {name: argName, in: 'query', maximum: 1, type: 'integer'},
      {name: argName, in: 'query', maximum: 1, exclusiveMaximum: true, type: 'integer'},
      {name: argName, in: 'query', maxItems: 1, type: 'array', items: {type: 'string'}},
      {name: argName, in: 'query', maxLength: 1, type: 'string'},
      {name: argName, in: 'query', minimum: 1, type: 'integer'},
      {name: argName, in: 'query', minimum: 1, exclusiveMinimum: true, type: 'integer'},
      {name: argName, in: 'query', minItems: 2, type: 'array', items: {type: 'string'}},
      {name: argName, in: 'query', minLength: 2, type: 'string'},
      {name: argName, in: 'query', multipleOf: 3, type: 'integer'},
      {name: argName, in: 'query', pattern: '[bc]+', type: 'string'},
      {name: argName, in: 'query', type: 'array', items: {type: 'string'}, uniqueItems: true}
    ];
    var values = [
      'fake',
      2,
      1,
      ['1', '2'],
      'fake',
      0,
      1,
      ['1'],
      'f',
      5,
      'fake',
      ['fake', 'fake']
    ];
    var errors = [
      'Parameter (' + argName + ') is not an allowable value (1, 2, 3): fake',
      'Parameter (' + argName + ') is greater than the configured maximum (1): 2',
      'Parameter (' + argName + ') is greater than or equal to the configured maximum (1): 1',
      'Parameter (' + argName + ') is too long (2), maximum 1',
      'Parameter (' + argName + ') is too long (4 chars), maximum 1',
      'Parameter (' + argName + ') is less than the configured minimum (1): 0',
      'Parameter (' + argName + ') is less than or equal to the configured minimum (1): 1',
      'Parameter (' + argName + ') is too short (1), minimum 2',
      'Parameter (' + argName + ') is too short (1 chars), minimum 2',
      'Parameter (' + argName + ') is not a multiple of 3',
      'Parameter (' + argName + ') does not match required pattern: [bc]+',
      'Parameter (' + argName + ') does not allow duplicate values: fake, fake'
    ];
    var index = 0;

    async.map(testScenarios, function (scenario, callback) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var expectedMessage = errors[index];
      var testValue = values[index];

      cPetStoreJson.paths['/pets/{id}'].get.parameters = [scenario];

      helpers.createServer([cPetStoreJson], {}, function (app) {
        request(app)
          .get('/api/pets/1')
          .query({
            arg0: testValue
          })
          .expect(400)
          .end(function (err, res) {
            if (res) {
              res.expectedMessage = expectedMessage;
            }

            callback(err, res);
          });
      });

      index++;
    }, function (err, responses) {
      if (err) {
        throw err;
      }

      _.each(responses, function (res) {
        helpers.expectContent(res.expectedMessage)(undefined, res);
      });

      done();
    });
  });

  it('should not return an error for valid parameter values not based on type/format', function (done) {
    var argName = 'arg0';
    var testScenarios = [
      {name: argName, in: 'query', enum: ['1', '2', '3'], type: 'string'},
      {name: argName, in: 'query', maximum: 1, type: 'integer'},
      {name: argName, in: 'query', maximum: 1, exclusiveMaximum: true, type: 'integer'},
      {name: argName, in: 'query', maxItems: 1, type: 'array', items: {type: 'string'}},
      {name: argName, in: 'query', maxLength: 5, type: 'string'},
      {name: argName, in: 'query', minimum: 1, type: 'integer'},
      {name: argName, in: 'query', minimum: 0, exclusiveMinimum: true, type: 'integer'},
      {name: argName, in: 'query', minItems: 2, type: 'array', items: {type: 'string'}},
      {name: argName, in: 'query', minLength: 2, type: 'string'},
      {name: argName, in: 'query', multipleOf: 3, type: 'integer'},
      {name: argName, in: 'query', pattern: '[abc]+', type: 'string'},
      {name: argName, in: 'query', type: 'array', items: {type: 'string'}, uniqueItems: true}
    ];
    var values = [
      '2',
      1,
      0,
      ['1'],
      'fake',
      1,
      1,
      ['1', '2'],
      'fake',
      9,
      'fake',
      ['fake', 'faker']
    ];
    var index = 0;

    async.map(testScenarios, function (scenario, callback) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var testValue = values[index];

      cPetStoreJson.paths['/pets/{id}'].get.parameters = [scenario];

      helpers.createServer([cPetStoreJson], {}, function (app) {
        request(app)
        .get('/api/pets/1')
        .query({
          arg0: testValue
        })
        .expect(200)
        .end(helpers.expectContent('OK', callback));
      });

      index++;
    }, function (err) {
      if (err) {
        throw err;
      }

      done();
    });
  });

  it('should return an error for an invalid model parameter', function (done) {
    helpers.createServer([petStoreJson], {}, function (app) {
      request(app)
        .post('/api/pets')
        .send({})
        .expect(400)
        .end(helpers.expectContent('Parameter (pet) failed schema validation', done));
    });
  });

  it('should not return an error for a valid model parameter', function (done) {
    helpers.createServer([petStoreJson], {}, function (app) {
      request(app)
        .post('/api/pets')
        .send({
          id: 1,
          name: 'Fake Pet'
        })
        .expect(200)
        .end(helpers.expectContent('OK', done));
    });
  });
});
