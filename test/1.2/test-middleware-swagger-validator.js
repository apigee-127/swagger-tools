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
var async = require('async');
var helpers = require('../helpers');
var request = require('supertest');

var petJson = _.cloneDeep(require('../../samples/1.2/pet.json'));
var rlJson = _.cloneDeep(require('../../samples/1.2/resource-listing.json'));
var storeJson = _.cloneDeep(require('../../samples/1.2/store.json'));
var userJson = _.cloneDeep(require('../../samples/1.2/user.json'));

var samplePet = {
  id: 1,
  name: 'Test Pet'
};

describe('Swagger Validator Middleware v1.2', function () {
  describe('request validation', function () {
    it('should not validate request when there are no operations', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {}, function (app) {
        request(app)
          .get('/api/foo')
          .expect(200)
          .end(helpers.expectContent('OK', done));
        });
    });

    it('should return an error for invalid request content type based on POST/PUT operation consumes', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {}, function (app) {
        request(app)
          .post('/api/pet/1')
          .expect(400)
          .end(helpers.expectContent('Invalid content type (application/octet-stream).  These are valid: ' +
                                    'application/x-www-form-urlencoded', done));
      });
    });

    it('should not return an error for invalid request content type for non-POST/PUT', function (done) {
      var clonedP = _.cloneDeep(petJson);

      clonedP.consumes = ['application/json'];

      helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not return an error for valid request content type', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {}, function (app) {
        request(app)
          .post('/api/pet/1')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not return an error for valid request content type with charset', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {}, function (app) {
        request(app)
          .post('/api/pet/1')
          .set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should return an error for missing required parameters', function (done) {
      var clonedP = _.cloneDeep(petJson);

      clonedP.apis[0].operations[0].parameters.push({
        description: 'Whether or not to use mock mode',
        name: 'mock',
        paramType: 'query',
        required: true,
        type: 'boolean'
      });

      helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(400)
          .end(helpers.expectContent('Parameter (mock) is required', done));
      });
    });

    it('should not return an error for missing required parameters with a default value', function (done) {
      var clonedP = _.cloneDeep(petJson);

      clonedP.apis[0].operations[0].parameters.push({
        description: 'Whether or not to use mock mode',
        name: 'mock',
        paramType: 'query',
        required: true,
        type: 'boolean',
        defaultValue: 'false'
      });

      helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not return an error for provided required parameters', function (done) {
      var clonedP = _.cloneDeep(petJson);

      clonedP.apis[0].operations[0].parameters.push({
        description: 'Whether or not to use mock mode',
        name: 'mock',
        paramType: 'query',
        required: true,
        type: 'boolean'
      });

      helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
        request(app)
          .get('/api/pet/1')
          .query({mock: 'true'})
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should return an error for invalid parameter values based on type/format', function (done) {
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

      async.map(testScenarios, function (scenario, callback) {
        var clonedP = _.cloneDeep(petJson);
        var clonedS = _.cloneDeep(scenario);
        var content = {arg0: scenario.type === 'array' ? [1, 'fake'] : badValue};
        var expectedMessage;

        clonedP.apis[0].operations[0].parameters.push(clonedS);

        if (scenario.type === 'array') {
          expectedMessage = 'Parameter (' + argName + ') at index 1 is not a valid integer: fake';
        } else {
          expectedMessage = 'Parameter (' + scenario.name + ') is not a valid ' +
                              (_.isUndefined(scenario.format) ? '' : scenario.format + ' ') + scenario.type + ': ' +
                              badValue;
        }

        helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
          request(app)
            .get('/api/pet/1')
            .query(content)
            .expect(400)
            .end(function (err, res) {
              if (res) {
                res.expectedMessage = expectedMessage;
              }

              callback(err, res);
            });
        });
      }, function (err, responses) {
        if (err) {
          throw err;
        }

        _.each(responses, function (res) {
          if (res) {
            helpers.expectContent(res.expectedMessage)(undefined, res);
          }
        });

        done();
      });
    });

    it('should not return an error for valid parameter values based on type/format', function (done) {
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

      async.map(testScenarios, function (scenario, oCallback) {
        var clonedP = _.cloneDeep(petJson);

        clonedP.apis[0].operations[0].parameters.push(scenario);

        async.map([0, 1], function (n, callback) {
          var clonedS = _.cloneDeep(scenario);
          var content = {};

          if (n === 0) {
            delete clonedS.defaultValue;

            content = {arg0: scenario.defaultValue};
          }

          helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
            request(app)
              .get('/api/pet/1')
              .query(content)
              .expect(200)
              .end(callback);
          });
        }, function (err, responses) {
          if (err) {
            throw err;
          }

          _.each(responses, function (res) {
            helpers.expectContent('OK')(undefined, res);
          });

          oCallback();
        });
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
      var index = 0;

      async.map(testScenarios, function (scenario, callback) {
        var clonedP = _.cloneDeep(petJson);
        var expectedMessage = errors[index];

        clonedP.apis[0].operations[0].parameters.push(scenario);

        helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
          request(app)
          .get('/api/pet/1')
          .query({arg0: values[index]})
          .expect(400)
          .end(function (err, res) {
            if (res) {
              res.expectedMessage = expectedMessage;
            }

            callback(err, res);
          });

          index++;
        });
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
      var index = 0;

      async.map(testScenarios, function (scenario, callback) {
        var clonedP = _.cloneDeep(petJson);

        clonedP.apis[0].operations[0].parameters.push(scenario);

        helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
          request(app)
            .get('/api/pet/1')
            .query({arg0: values[index]})
            .expect(200)
            .end(callback);

          index++;
        });
      }, function (err, responses) {
        if (err) {
          throw err;
        }

        _.each(responses, function (res) {
          helpers.expectContent('OK')(undefined, res);
        });

        done();
      });
    });

    it('should return an error for an invalid model parameter', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {}, function (app) {
        request(app)
          .post('/api/pet')
          .send({})
          .expect(400)
          .end(helpers.expectContent('Parameter (body) failed schema validation', done));
      });
    });

    it('should not return an error for a valid model parameter', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {}, function (app) {
        request(app)
          .post('/api/pet')
          .send({
            id: 1,
            name: 'Test Pet'
          })
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should return an error for an invalid model parameter (array)', function (done) {
      var clonedP = _.cloneDeep(petJson);

      clonedP.models.Tag.required = ['name'];

      clonedP.apis.push({
        operations: [
          {
            authorizations: {},
            method: 'POST',
            nickname: 'createTag',
            parameters: [
              {
                name: 'body',
                paramType: 'body',
                required: true,
                type: 'array',
                items: {
                  $ref: 'Tag'
                }
              }
            ],
            responseMessages: [
              {
                code: 400,
                message: 'Invalid tag value'
              }
            ],
            type: 'void'
          }
        ],
        path: '/tags'
      });

      helpers.createServer([rlJson, [clonedP, storeJson, userJson]], {}, function (app) {
        request(app)
          .post('/api/tags')
          .send([
            {
              id: 1
            },
            {
              id: 2
            }
          ])
          .expect(400)
          .end(helpers.expectContent('Parameter (body) failed schema validation', done));
      });
    });

    it('should not return an error for a valid model parameter (array)', function (done) {
      var clonedP = _.cloneDeep(petJson);

      clonedP.models.Tag.required = ['name'];

      clonedP.apis.push({
        operations: [
          {
            authorizations: {},
            method: 'POST',
            nickname: 'createTag',
            parameters: [
              {
                name: 'body',
                paramType: 'body',
                required: true,
                type: 'array',
                items: {
                  $ref: 'Tag'
                }
              }
            ],
            responseMessages: [
              {
                code: 400,
                message: 'Invalid tag value'
              }
            ],
            type: 'void'
          }
        ],
        path: '/tags'
      });

      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {}, function (app) {
        request(app)
          .post('/api/tags')
          .send([
            {
              name: 'Tag 1'
            },
            {
              name: 'Tag 2'
            }
          ])
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });
  });

  describe('response validation', function () {
    it('should not validate response when there are no operations', function (done) {
      helpers.createServer([rlJson, [petJson, storeJson, userJson]], {
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/foo')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should not validate response when options.validateResponse is false', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        conrollers: {
          'Pets_getPetById': function (req, res) {
            res.end('OK');
          }
        },
        swaggerValidatorOptions: {
          validateResponse: false
        }
      }, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should return an error for invalid response content type', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              res.setHeader('Content-Type', 'application/x-yaml');
              res.end(samplePet);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: invalid content type (application/x-yaml).  These ' +
                                       'are valid: application/json, application/xml, text/plain, text/html', done));
      });
    });

    it('should not return an error for valid response content type', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              res.setHeader('Content-Type', 'application/json');
              res.end(samplePet);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(200)
          .end(helpers.expectContent(samplePet, done));
      });
    });

    it('should return an error for model type not parsable', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              res.end('OK');
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
        .get('/api/pet/1')
        .expect(500)
        .end(helpers.expectContent('Response validation failed: value expected to be an array/object but is not',
                                   done));
      });
    });

    it('should return an error for an invalid response primitive (void)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[1].nickname = 'Pets_deletePet';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_deletePet': function (req, res) {
              return res.end('Some value');
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .delete('/api/pet/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: void does not allow a value', done));
      });
    });

    it('should return an error for an invalid response primitive (non-void)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis.push({
        operations: [
          {
            authorizations: {},
            method: 'GET',
            nickname: 'Pets_getCategoryCount',
            parameters: [],
            type: 'integer'
          }
        ],
        path: '/pet/categories/count'
      });

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getCategoryCount': function (req, res) {
              return res.end('Some value');
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/categories/count')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: not a valid integer: Some value', done));
      });
    });

    it('should not return an error for a valid response primitive (non-void)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis.push({
        operations: [
          {
            authorizations: {},
            method: 'GET',
            nickname: 'Pets_getCategoryCount',
            parameters: [],
            type: 'integer'
          }
        ],
        path: '/pet/categories/count'
      });

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getCategoryCount': function (req, res) {
              return res.end(new Buffer('1'));
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/categories/count')
          .expect(200)
          .end(helpers.expectContent('1', done));
      });
    });

    it('should return an error for an invalid response primitive (non-void array)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis.push({
        operations: [
          {
            authorizations: {},
            method: 'GET',
            nickname: 'Pets_getCategoryCount',
            parameters: [],
            type: 'array',
            items: {
              type: 'integer'
            }
          }
        ],
        path: '/pet/categories/count'
      });

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getCategoryCount': function (req, res) {
              return res.end([1, 'Some value', 3]);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/categories/count')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: value at index 1 is not a valid integer: Some value',
                                     done));
      });
    });

    it('should not return an error for a valid response primitive (non-void array)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis.push({
        operations: [
        {
          authorizations: {},
          method: 'GET',
          nickname: 'Pets_getCategoryCount',
          parameters: [],
          type: 'array',
          items: {
            type: 'integer'
          }
        }
        ],
        path: '/pet/categories/count'
      });

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getCategoryCount': function (req, res) {
              return res.end([1, 2, 3]);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/categories/count')
          .expect(200)
          .end(helpers.expectContent([1, 2, 3], done));
      });
    });

    it('should return an error for an invalid response model (simple)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              return res.end({});
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should not return an error for an valid response model (simple)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              return res.end(samplePet);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(200)
          .end(helpers.expectContent(samplePet, done));
      });
    });

    it('should return an error for an invalid response model (complex)', function (done) {
      var cPetJson = _.cloneDeep(petJson);
      var cSamplePet = _.cloneDeep(samplePet);

      // Make name required
      cPetJson.models.Tag.required = ['name'];

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              return res.end(cSamplePet);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should return an error for an invalid response model (complex)', function (done) {
      var cPetJson = _.cloneDeep(petJson);
      var cSamplePet = _.cloneDeep(samplePet);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              return res.end(cSamplePet);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/1')
          .expect(200)
          .end(helpers.expectContent(cSamplePet, done));
      });
    });

    it('should return an error for an invalid response array of models (simple)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[3].operations[0].nickname = 'Pets_getPetsByStatus';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetsByStatus': function (req, res) {
              return res.end([
                samplePet,
                {},
                samplePet
              ]);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/findByStatus')
          .query({status: 'available'})
          .expect(500)
          .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should not return an error for an valid response array of models (simple)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[3].operations[0].nickname = 'Pets_getPetsByStatus';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetsByStatus': function (req, res) {
              return res.end([
                samplePet,
                samplePet,
                samplePet
              ]);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/findByStatus')
          .query({status: 'available'})
          .expect(200)
          .end(helpers.expectContent([
            samplePet,
            samplePet,
            samplePet
          ], done));
      });
    });

    it('should return an error for an invalid response array of models (complex)', function (done) {
      var cPetJson = _.cloneDeep(petJson);
      var cSamplePet = _.cloneDeep(samplePet);

      // Make name required
      cPetJson.models.Tag.required = ['name'];

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      cPetJson.apis[3].operations[0].nickname = 'Pets_getPetsByStatus';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetsByStatus': function (req, res) {
              return res.end([
                cSamplePet,
                {},
                  cSamplePet
              ]);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/findByStatus')
          .query({status: 'available'})
          .expect(500)
          .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should not return an error for an valid response array of models (complex)', function (done) {
      var cPetJson = _.cloneDeep(petJson);
      var cSamplePet = _.cloneDeep(samplePet);

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      cPetJson.apis[3].operations[0].nickname = 'Pets_getPetsByStatus';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetsByStatus': function (req, res) {
              return res.end([
                cSamplePet,
                cSamplePet,
                cSamplePet
              ]);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pet/findByStatus')
          .query({status: 'available'})
          .expect(200)
          .end(helpers.expectContent([
            cSamplePet,
            cSamplePet,
            cSamplePet
          ], done));
      });
    });
  });

  describe('issues', function () {
    it('should include original response in response validation errors (Issue 82)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis[0].operations[0].nickname = 'Pets_getPetById';

      helpers.createServer([rlJson, [cPetJson, storeJson, userJson]], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
              res.setHeader('Content-Type', 'application/x-yaml');
              res.end(samplePet);
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        app.use(function (err, req, res, next) {
          assert.deepEqual(err.originalResponse, samplePet);

          next();
        });

        request(app)
          .get('/api/pet/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: invalid content type (application/x-yaml).  These ' +
                                       'are valid: application/json, application/xml, text/plain, text/html', done));
      });
    });
  });
});
