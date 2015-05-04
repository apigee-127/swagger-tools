/* global beforeEach, describe, it */

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
var path = require('path');
var petStoreJson = _.cloneDeep(require('../../samples/2.0/petstore.json'));
var pkg = require('../../package.json');
var request = require('supertest');
var spec = require('../../lib/helpers').getSpec('2.0');

describe('Swagger Metadata Middleware v2.0', function () {
  it('should not add Swagger middleware to the request when there is no route match', function (done) {
    helpers.createServer([petStoreJson], {
      handler: function (req, res, next) {
        if (req.swagger) {
          return next('This should not happen');
        }

        res.end('OK');

        return next();
      }
    }, function (app) {
      request(app)
      .get('/foo')
      .expect(200)
      .end(helpers.expectContent('OK', done));
    });
  });

  it('should add Swagger middleware to the request when there is a route match and there are operations',
     function (done) {
       var cPetStoreJson = _.cloneDeep(petStoreJson);

       // Add an operation parameter
       cPetStoreJson.paths['/pets/{id}'].get.parameters = [
         {
           'in': 'query',
           'name': 'mock',
           'description': 'Mock mode',
           'required': false,
           'type': 'boolean'
         }
       ];

       // Add a global security and an operation security
       cPetStoreJson.security = [
         {
           oauth2: ['write']
         }
       ];
       cPetStoreJson.paths['/pets/{id}'].get.security = [
         {
           oauth2: ['read']
         }
       ];

       helpers.createServer([cPetStoreJson], {
         handler: function (req, res, next) {
           var swagger = req.swagger;

           spec.resolve(cPetStoreJson, function (err, resolved) {
             var rPath = resolved.paths['/pets/{id}'];

             try {
               assert.ok(!_.isUndefined(swagger));
               assert.equal('2.0', swagger.swaggerVersion);
               assert.deepEqual(swagger.apiPath, '/pets/{id}');
               assert.deepEqual(swagger.operation, rPath.get);
               assert.deepEqual(swagger.operationParameters, [
                 {
                   path: ['paths', '/pets/{id}', 'get', 'parameters', '0'],
                   schema: rPath.get.parameters[0]
                 },
                 {
                   path: ['paths', '/pets/{id}', 'parameters', '0'],
                   schema: rPath.parameters[0]
                 }
               ]);
               assert.deepEqual(swagger.operationPath, ['paths', '/pets/{id}', 'get']);
               assert.deepEqual(swagger.path, resolved.paths['/pets/{id}']);
               assert.deepEqual(swagger.security, [
                 {
                   oauth2: ['read']
                 }
               ]);

               assert.deepEqual(swagger.params, {
                 id: {
                   path: ['paths', '/pets/{id}', 'parameters', '0'],
                   schema: rPath.parameters[0],
                   originalValue: '1',
                   value: 1
                 },
                 mock: {
                   path: ['paths', '/pets/{id}', 'get', 'parameters', '0'],
                   schema: rPath.get.parameters[0],
                   originalValue: 'false',
                   value: false
                 }
               });
               assert.deepEqual(swagger.swaggerObject, resolved);
             } catch (err) {
               return next(err.message);
             }

             return res.end('OK');
           });
         }
       }, function (app) {
         request(app)
           .get('/api/pets/1')
           .query({mock: false})
           .expect(200)
           .end(helpers.expectContent('OK', done));
       });
  });

  it('should handle parameter references (Issue 79)', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);

    // Create a parameter definition
    cPetStoreJson.parameters = {
      mock: {
        'in': 'query',
        'name': 'mock',
        'description': 'Mock mode',
        'required': false,
        'type': 'boolean'
      }
    };

    // Add an operation parameter
    cPetStoreJson.paths['/pets/{id}'].get.parameters = [
      {
        $ref: '#/parameters/mock'
      }
    ];

    helpers.createServer([cPetStoreJson], {
      handler: function (req, res, next) {
        var swagger = req.swagger;

        spec.resolve(cPetStoreJson, function (err, resolved) {
          if (err) {
            return next(err);
          }

          try {
            assert.deepEqual(swagger.params, {
              id: {
                path: ['paths', '/pets/{id}', 'parameters', '0'],
                schema: resolved.paths['/pets/{id}'].parameters[0],
                originalValue: '1',
                value: 1
              },
              mock: {
                path: ['paths', '/pets/{id}', 'get', 'parameters', '0'],
                schema: resolved.parameters.mock,
                originalValue: 'false',
                value: false
              }
            });
          } catch (err) {
            return next(err);
          }

          res.end('OK');

          return next();
        });
      }
    }, function (app) {
      request(app)
        .get('/api/pets/1')
        .query({mock: false})
        .expect(200)
        .end(helpers.expectContent('OK', done));
    });
  });

  it('should handle body parameters', function (done) {
    var cPetStoreJson = _.cloneDeep(petStoreJson);

    // Negate the validation as we don't care about that right now
    cPetStoreJson.paths['/pets'].post.parameters[0].schema = {};

    helpers.createServer([cPetStoreJson], {
      handler: function (req, res, next) {
        var newPet = req.swagger.params.pet.value;

        assert.deepEqual(newPet, {name: 'Top Dog'});

        newPet.id = 1;

        res.end(JSON.stringify(newPet));

        return next();
      }
    }, function (app) {
      request(app)
        .post('/api/pets')
        .send({name: 'Top Dog'})
        .expect(200)
        .end(helpers.expectContent({id: 1, name: 'Top Dog'}, done));
    });
  });

  describe('non-multipart form parameters', function () {
    it('should handle primitives', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      // Add an operation parameter
      cPetStoreJson.paths['/pets'].post.parameters = [
        {
          in: 'formData',
          name: 'mock',
          description: 'Mock mode',
          required: false,
          type: 'boolean'
        }
      ];

      helpers.createServer([cPetStoreJson], {
        handler: function (req, res) {
          assert.equal(req.swagger.params.mock.value, false);
          res.end('OK');
        }
      }, function (app) {
        request(app)
          .post('/api/pets')
          .type('form')
          .send({mock: false})
          .expect(200)
          .end(helpers.expectContent('OK', done));
      });
    });
  });

  describe('multipart form parameters (Issue 60)', function () {
    it('should handle primitives', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var operation = _.cloneDeep(cPetStoreJson.paths['/pets']).post;

      operation.consumes = [
        'multipart/form-data'
      ];
      operation.parameters = [
        {
          name: 'id',
            in: 'path',
          required: true,
          type: 'string'
        },
        {
          name: 'name',
            in: 'formData',
          required: true,
          type: 'string'
        }
      ];
      operation.summary = 'Change Pet name.';

      cPetStoreJson.paths['/pets/{id}/name'] = {
        post: operation
      };

      helpers.createServer([cPetStoreJson], {
        handler: function (req, res, next) {
          assert.equal(req.swagger.params.name.value, 'Top Dog');

          res.end(JSON.stringify({
            id: req.swagger.params.id.value,
            name: req.swagger.params.name.value
          }));

          next();
        }
      }, function(app) {
        request(app)
          .post('/api/pets/1/name')
          .field('name', 'Top Dog')
          .expect(200)
          .end(helpers.expectContent({id: 1, name: 'Top Dog'}, done));
      });
    });

    it('should handle files', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);
      var operation = _.cloneDeep(cPetStoreJson.paths['/pets']).post;

      delete operation.responses['200'];

      operation.consumes = [
        'multipart/form-data'
      ];
      operation.parameters = [
        {
          name: 'id',
            in: 'path',
          required: true,
          type: 'string'
        },
        {
          name: 'file',
            in: 'formData',
          required: true,
          type: 'file'
        }
      ];
      operation.responses['201'] = {
        description: 'Created file response'
      };

      cPetStoreJson.paths['/pets/{id}/files'] = {
        post: operation
      };

      helpers.createServer([cPetStoreJson], {
        handler: function (req, res, next) {
          var file = req.swagger.params.file;

          assert.ok(_.isPlainObject(file));
          assert.equal(file.value.originalname, 'package.json');
          assert.equal(file.value.mimetype, 'application/json');
          assert.deepEqual(JSON.parse(file.value.buffer), pkg);

          res.statusCode = 201;
          res.end();

          next();
        }
      }, function(app) {
        request(app)
          .post('/api/pets/1/files')
          .attach('file', path.resolve(path.join(__dirname, '..', '..', 'package.json')), 'package.json')
          .expect(201)
          .end(done);
      });
    });
  });

  describe('issues', function () {
    it('should handle non-lowercase header parameteters (Issue 82)', function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      // Add a header parameter
      cPetStoreJson.paths['/pets'].get.parameters = [
        {
          description: 'Authentication token',
          name: 'Auth-Token',
          in: 'header',
          required: true,
          type: 'string'
        }
      ];

      helpers.createServer([cPetStoreJson], {
        handler: function (req, res, next) {
          try {
            assert.deepEqual(req.swagger.params['Auth-Token'], {
              path: ['paths', '/pets', 'get', 'parameters', '0'],
              schema: cPetStoreJson.paths['/pets'].get.parameters[0],
              originalValue: 'fake',
              value: 'fake'
            });
          } catch (err) {
            return next(err.message);
          }

          res.end('OK');

          return next();
        }
      }, function (app) {
        request(app)
        .get('/api/pets')
        .set('Auth-Token', 'fake')
        .expect(200)
        .end(helpers.expectContent('OK', done));
      });
    });

    it('should convert parameteter values to the proper type (Issue 119)', function (done) {
      var argName = 'arg0';
      var queryValues = {
        boolean: 'true',
        integer: '1',
        number: '1.1',
        string: 'swagger-tools',
        'string-date': '2014-06-16',
        'string-date-time': '2014-06-16T18:20:35-06:00'
      };
      var paramValues = {
        boolean: true,
        integer: 1,
        number: 1.1,
        string: 'swagger-tools',
        'string-date': new Date('2014-06-16'),
        'string-date-time': new Date('2014-06-16T18:20:35-06:00')
      };

      async.map(Object.keys(queryValues), function (type, callback) {
        var queryValue = queryValues[type];
        var paramValue = paramValues[type];
        var swaggerObject = _.cloneDeep(petStoreJson);
        var paramDef = {
          in: 'query',
          name: argName
        };
        var query = {};
        var typeParts = type.split('-');

        if (typeParts.length === 1) {
          paramDef.type = type;
        } else {
          paramDef.type = typeParts[0];
          paramDef.format = typeParts.slice(1).join('-');
        }

        query[argName] = queryValue;

        swaggerObject.paths['/pets/{id}']['x-swagger-router-controller'] = 'Pets';
        swaggerObject.paths['/pets/{id}'].get.parameters = [
          paramDef
        ];

        helpers.createServer([swaggerObject], {
          swaggerRouterOptions: {
            controllers: {
              'Pets_getPetById': function (req, res) {
                assert.deepEqual(paramValue, req.swagger.params[argName].value);

                res.end('OK');
              }
            }
          }
        }, function (app) {
          request(app)
            .get('/api/pets/1')
            .query(query)
            .expect(200)
            .end(callback);
        });
      }, function (err, responses) {
        if (err) {
          throw err;
        }

        _.each(responses, function (res) {
          assert.equal(res.text, 'OK');
        });

        done();
      });
    });
  });

  describe('x-swagger-router-handle-subpaths option', function() {
    var cPetStoreJson;
    var subPathedPet;

    beforeEach(function() {
      cPetStoreJson = _.cloneDeep(petStoreJson);

      var petIdPath = cPetStoreJson.paths['/pets/{id}'];

      petIdPath['x-swagger-router-controller'] = 'Pets';

      delete(petIdPath.get.security);
      delete(petIdPath.delete);

      subPathedPet = _.cloneDeep(petIdPath);
      subPathedPet['x-swagger-router-handle-subpaths'] = true;

      delete(subPathedPet.parameters);

      subPathedPet.get.operationId = 'getPetSubpath';

      delete(subPathedPet.get.parameters);

      cPetStoreJson.paths['/pets/9'] = subPathedPet;
    });

    it('should not match where there\'s a more specific path', function(done) {
      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function(req, res) {
              res.end('YES');
            },
            'Pets_getPetSubpath': function() {
              assert(false, 'should not get here');
            }
          }
        }
      }, function(app) {
        request(app)
          .get('/api/pets/1')
          .expect(200)
          .end(helpers.expectContent('YES', done));
      });
    });

    it('should match where there\'s not a more specific path', function(done) {
      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function() {
              assert(false, 'should not get here');
            },
            'Pets_getPetSubpath': function(req, res) {
              res.end('YES');
            }
          }
        }
      }, function(app) {
        request(app)
          .get('/api/pets/9')
          .expect(200)
          .end(helpers.expectContent('YES', done));
      });
    });

    it('should not match when not specified', function(done) {
      delete(subPathedPet['x-swagger-router-handle-subpaths']);

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function() {
              assert(false, 'should not get here');
            },
            'Pets_getPetSubpath': function() {
              assert(false, 'should not get here');
            }
          }
        }
      }, function(app) {
        request(app)
          .get('/api/pets/9/1')
          .expect(200)
          .end(helpers.expectContent('OK', done)); // OK is from default handler
      });
    });

    it('should not match when set to false', function(done) {
      subPathedPet['x-swagger-router-handle-subpaths'] = false;

      helpers.createServer([cPetStoreJson], {
        swaggerRouterOptions: {
          controllers: {
            'Pets_getPetById': function() {
              assert(false, 'should not get here');
            },
            'Pets_getPetSubpath': function() {
              assert(false, 'should not get here');
            }
          }
        }
      }, function(app) {
        request(app)
          .get('/api/pets/9/1')
          .expect(200)
          .end(helpers.expectContent('OK', done)); // OK is from default handler
      });
    });
  });
});
