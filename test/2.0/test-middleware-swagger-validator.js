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

var petStoreJson = _.cloneDeep(require('../../samples/2.0/petstore.json'));

var samplePet = {
  id: 1,
  name: 'Test Pet'
};

describe('Swagger Validator Middleware v2.0', function () {
  describe('request validation', function () {
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

  describe('response validation', function () {
    it('should not validate response when there are no operations', function (done) {
      helpers.createServer([petStoreJson], {
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
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });

    it('should return an error for invalid response content type', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: invalid content type (application/x-yaml).  These ' +
                                       'are valid: application/json, application/xml, text/plain, text/html', done));
      });
    });

    it('should not return an error for valid response content type', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(200)
          .end(helpers.expectContent(samplePet, done));
      });
    });

    it('should return an error for model type not parsable', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: value expected to be an array/object but is not',
                                     done));
      });
    });

    it('should return an error for an invalid response primitive (void)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      delete cPetStoreJson.paths['/pets/{id}'].get.responses['200'].schema;

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: void does not allow a value', done));
      });
    });

    it('should return an error for an invalid response primitive (non-void)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      cPetStoreJson.paths['/pets/categories/count'] = {
        get: {
          'x-swagger-router-controller': 'Pets',
          operationId: 'getCategoryCount',
          responses: {
            '200': {
              description: 'Valid response',
              schema: {
                type: 'integer'
              }
            }
          }
        }
      };

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/categories/count')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: not a valid integer: Some value', done));
      });
    });

    it('should not return an error for an valid response primitive (non-void)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      cPetStoreJson.paths['/pets/categories/count'] = {
        get: {
          'x-swagger-router-controller': 'Pets',
          operationId: 'getCategoryCount',
          responses: {
            '200': {
              description: 'Valid response',
              schema: {
                type: 'integer'
              }
            }
          }
        }
      };

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getCategoryCount': function (req, res) {
              return res.end('1');
            }
          }
        },
        swaggerValidatorOptions: {
          validateResponse: true
        }
      }, function (app) {
        request(app)
          .get('/api/pets/categories/count')
          .expect(200)
          .end(helpers.expectContent('1', done));
      });
    });

    it('should return an error for an invalid response primitive (non-void)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      cPetStoreJson.paths['/pets/categories/count'] = {
        get: {
          'x-swagger-router-controller': 'Pets',
          operationId: 'getCategoryCount',
          responses: {
            '200': {
              description: 'Valid response',
              schema: {
                type: 'array',
                items: {
                  type: 'integer'
                }
              }
            }
          }
        }
      };

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/categories/count')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: value at index 1 is not a valid integer: Some value',
                                     done));
      });
    });

    it('should not return an error for an valid response primitive (non-void)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      cPetStoreJson.paths['/pets/categories/count'] = {
        get: {
          'x-swagger-router-controller': 'Pets',
          operationId: 'getCategoryCount',
          responses: {
            '200': {
              description: 'Valid response',
              schema: {
                type: 'array',
                items: {
                  type: 'integer'
                }
              }
            }
          }
        }
      };

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/categories/count')
          .expect(200)
          .end(helpers.expectContent([1, 2, 3],done));
      });
    });

    it('should return an error for an invalid response model (simple)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should not return an error for an valid response model (simple)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(200)
          .end(helpers.expectContent(samplePet, done));
      });
    });

    it('should return an error for an invalid response model (complex)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var cSamplePet = _.cloneDeep(samplePet);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      // Make name required
      cPetStoreJson.definitions.Tag.required = ['name'];

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should not return an error for a valid response model (complex)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var cSamplePet = _.cloneDeep(samplePet);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(200)
          .end(helpers.expectContent(cSamplePet, done));
      });
    });

    it('should return an error for an invalid response array of models (simple)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets'].get.operationId = 'getPets';

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPets': function (req, res) {
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
          .get('/api/pets')
            .query({status: 'available'})
            .expect(500)
            .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should not return an error for a valid response array of models (simple)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets'].get.operationId = 'getPets';

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPets': function (req, res) {
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
          .get('/api/pets')
          .query({status: 'available'})
          .expect(200)
          .end(helpers.expectContent([samplePet, samplePet, samplePet], done));
      });
    });

    it('should return an error for an invalid response array of models (complex)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var cSamplePet = _.cloneDeep(samplePet);

      cPetStoreJson.paths['/pets'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets'].get.operationId = 'getPets';

      // Make name required
      cPetStoreJson.definitions.Tag.required = ['name'];

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPets': function (req, res) {
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
          .get('/api/pets')
          .query({status: 'available'})
          .expect(500)
          .end(helpers.expectContent('Response validation failed: failed schema validation', done));
      });
    });

    it('should not return an error for a valid response array of models (complex)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var cSamplePet = _.cloneDeep(samplePet);

      cPetStoreJson.paths['/pets'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets'].get.operationId = 'getPets';

      cSamplePet.tags = [
        {id: 1, name: 'Tag 1'},
        {id: 2},
        {id: 3, name: 'Tag 3'},
      ];

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPets': function (req, res) {
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
          .get('/api/pets')
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
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';

      helpers.createServer([cPetStoreJson], {
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
          .get('/api/pets/1')
          .expect(500)
          .end(helpers.expectContent('Response validation failed: invalid content type (application/x-yaml).  These ' +
                                       'are valid: application/json, application/xml, text/plain, text/html', done));
      });
    });

    it('should not throw an error for responses that use the default response (Issue 99)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      cPetStoreJson.paths['/pets/{id}'].get['x-swagger-router-controller'] = 'Pets';
      cPetStoreJson.paths['/pets/{id}'].get.operationId = 'getPetById';
      cPetStoreJson.paths['/pets/{id}'].get.responses.default = cPetStoreJson.paths['/pets/{id}'].get.responses['200'];

      delete cPetStoreJson.paths['/pets/{id}'].get.responses['200'];

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function (req, res) {
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
          .get('/api/pets/1')
          .expect(200)
          .end(helpers.expectContent(samplePet, done));
      });
    });
  });
});
