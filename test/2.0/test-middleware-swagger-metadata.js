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
var petStoreJson = require('../../samples/2.0/petstore.json');
var request = require('supertest');
var spec = require('../../lib/helpers').getSpec('2.0');

describe('Swagger Metadata Middleware v2.0', function () {
  it('should return an error for an improperly configured server for body/form parameter validation', function (done) {
    async.map(['body', 'form'], function (paramType, callback) {
      helpers.createServer([petStoreJson], {
        useBodyParser: false,
        useQuery: false
      }, function (app) {
        request(app)
        .post('/api/pets')
        .expect(500)
        .end(function (err, res) {
          callback(err, res);
        });
      });
    }, function (err, responses) {
      if (err) {
        throw err;
      }

      _.each(responses, function (res) {
        helpers.expectContent('Server configuration error: req.body is not defined but is required')(undefined, res);
      });

      done();
    });
  });

  it('should return an error for an improperly configured server for query parameter validation', function (done) {
    helpers.createServer([petStoreJson], {
      useQuery: false
    }, function (app) {
      request(app)
      .get('/api/pets')
      .expect(500)
      .end(helpers.expectContent('Server configuration error: req.query is not defined but is required', done));
    });
  });

  it('should not add Swagger middleware to the request when there is no route match', function (done) {
    helpers.createServer([petStoreJson], {
      handler: function (req, res, next) {
        if (req.swagger) {
          return next('This should not happen');
        }
        res.end('OK');
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
                   value: '1'
                 },
                 mock: {
                   path: ['paths', '/pets/{id}', 'get', 'parameters', '0'],
                   schema: rPath.get.parameters[0],
                   value: 'false'
                 }
               });
               assert.deepEqual(swagger.swaggerObject, resolved);
             } catch (err) {
               return next(err.message);
             }

             res.end('OK');
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

  it('should populate parameter values for formData elements',
    function (done) {
      var cPetStoreJson = _.cloneDeep(petStoreJson);

      // Add an operation parameter
      cPetStoreJson.paths['/pets'].post.parameters = [
        {
          'in': 'formData',
          'name': 'mock',
          'description': 'Mock mode',
          'required': false,
          'type': 'boolean'
        }
      ];

      helpers.createServer([cPetStoreJson], {
        handler: function (req, res) {
          assert(req.swagger.params.mock.value, false);
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
                value: '1'
              },
              mock: {
                path: ['paths', '/pets/{id}', 'get', 'parameters', '0'],
                schema: resolved.parameters.mock,
                value: 'false'
              }
            });
          } catch (err) {
            return next(err);
          }

          res.end('OK');
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
              value: 'fake'
            });
          } catch (err) {
            console.log(err);
            return next(err.message);
          }

          res.end('OK');
        }
      }, function (app) {
        request(app)
        .get('/api/pets')
        .set('Auth-Token', 'fake')
        .expect(200)
        .end(helpers.expectContent('OK', done));
      });
    });
  });
});
