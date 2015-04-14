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
var swagger = require('../');

var middlewares = ['swaggerMetadata', 'swaggerRouter', 'swaggerSecurity', 'swaggerUi', 'swaggerValidator'];
var petJson = _.cloneDeep(require('../samples/1.2/pet.json'));
var petStoreJson = _.cloneDeep(require('../samples/2.0/petstore.json'));
var rlJson = _.cloneDeep(require('../samples/1.2/resource-listing.json'));
var storeJson = _.cloneDeep(require('../samples/1.2/store.json'));
var userJson = _.cloneDeep(require('../samples/1.2/user.json'));

describe('swagger-tools', function () {
  describe('initializeMiddlware', function () {
    it('should throw errors for invalid arguments (invalid Resource Listing or Swagger Object)', function () {
      try {
        swagger.initializeMiddleware({}, function() {
          assert.fail(null, null, 'Should had failed');
        });
      } catch (err) {
        assert.equal('Unsupported Swagger version: undefined', err.message);
      }
    });

    describe('Swagger 1.2', function () {
      it('should throw errors for invalid arguments', function () {
        var errors = {
          'rlOrSO is required': [],
          'rlOrSO must be an object': ['resource-listing.json'],
          'resources is required': [rlJson],
          'resources must be an array': [rlJson, petJson],
          'callback is required': [rlJson, [petJson, storeJson, userJson]],
          'callback must be a function': [rlJson, [petJson, storeJson, userJson], 'wrong-type']
        };

        _.each(errors, function (args, message) {
          try {
            swagger.initializeMiddleware.apply(undefined, args);

            assert.fail(null, null, 'Should had failed above');
          } catch (err) {
            assert.equal(message, err.message);
          }
        });
      });

      it('should throw errors for invalid Swagger documents', function (done) {
        var cRlJson = _.cloneDeep(rlJson);

        cRlJson.apis.push(cRlJson.apis[0]);

        try {
          swagger.initializeMiddleware(cRlJson, [petJson, storeJson, userJson], function () {
            assert.fail(null, null, 'Should had thrown an error');

            done();
          });
        } catch (err) {
          assert.deepEqual(err.results.errors, [
            {
              code: 'DUPLICATE_RESOURCE_PATH',
              message: 'Resource path already defined: /pet',
              path: ['apis', '3', 'path']
            }
          ]);
          assert.equal(err.results.warnings.length, 0);

          done();
        }
      });

      it('should not throw error when Swagger document have only warnings', function () {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.models.Person = {
          id: 'Person',
          properties: {
            age: {
              type: 'integer'
            },
            name: {
              type: 'string'
            }
          }
        };

        try {
          swagger.initializeMiddleware(rlJson, [cPetJson, storeJson, userJson], function(middleware) {
            _.each(Object.keys(middlewares), function (key) {
              assert.ok(!_.isFunction(middleware[key]));
            });
          });
        } catch (err) {
          assert.fail(null, null, 'Should not had failed');
        }
      });

      it('should not throw an error for valid arguments', function () {
        try {
          swagger.initializeMiddleware(rlJson, [petJson, storeJson, userJson], function(middleware) {
            _.each(Object.keys(middlewares), function (key) {
              assert.ok(!_.isFunction(middleware[key]));
            });
          });
        } catch (err) {
          assert.fail(null, null, 'Should not had failed');
        }
      });

      describe('issues', function () {
        it('should handle invalid swagger version (Issue 137)', function (done) {
          var cRlJson = _.cloneDeep(rlJson);

          cRlJson.swaggerVersion = 1.2;

          try {
            swagger.initializeMiddleware(cRlJson, [petJson, storeJson, userJson], function() {
              assert.fail(null, null, 'Should had failed');
            });
          } catch (err) {
            assert.equal('Swagger document(s) failed validation so the server cannot start', err.message);
            assert.deepEqual({
              errors: [
                {
                  code: 'ENUM_MISMATCH',
                  message: 'No enum match for: 1.2',
                  path: [
                    'swaggerVersion'
                  ]
                }
              ],
              warnings: []
            }, err.results);

            done();
          }
        });
      });
    });

    describe('Swagger 2.0', function () {
      it('should throw errors for invalid arguments', function () {
        var errors = {
          'rlOrSO is required': [],
          'rlOrSO must be an object': ['petstore.json'],
          'callback is required': [petStoreJson],
          'callback must be a function': [petStoreJson, 'wrong-type']
        };

        _.each(errors, function (args, message) {
          try {
            swagger.initializeMiddleware.apply(undefined, args);

            assert.fail(null, null, 'Should had failed above');
          } catch (err) {
            assert.equal(message, err.message);
          }
        });
      });

      it('should throw errors for invalid Swagger documents', function (done) {
        var cPetStoreJson = _.cloneDeep(petStoreJson);

        cPetStoreJson.paths['/pets/{petId}'] = _.cloneDeep(cPetStoreJson.paths['/pets/{id}']);
        cPetStoreJson.paths['/pets/{petId}'].parameters[0].name = 'petId';
        cPetStoreJson.paths['/pets/{petId}'].delete.parameters[0].name = 'petId';

        try {
          swagger.initializeMiddleware(cPetStoreJson, function () {
            assert.fail(null, null, 'Should had thrown an error');

            done();
          });
        } catch (err) {
          assert.deepEqual(err.results.errors, [
            {
              code: 'DUPLICATE_API_PATH',
              message: 'API path (or equivalent) already defined: /pets/{petId}',
              path: ['paths', '/pets/{petId}']
            }
            ]);
            assert.equal(err.results.warnings.length, 0);

            done();
        }
      });

      it('should not throw error when Swagger document have only warnings', function () {
        var cPetStoreJson = _.cloneDeep(petStoreJson);

        cPetStoreJson.definitions.Person = {
          properties: {
            age: {
              type: 'integer'
            },
            name: {
              type: 'string'
            }
          }
        };

        try {
          swagger.initializeMiddleware(cPetStoreJson, function(middleware) {
            _.each(Object.keys(middlewares), function (key) {
              assert.ok(!_.isFunction(middleware[key]));
            });
          });
        } catch (err) {
          assert.fail(null, null, 'Should not had failed');
        }
      });

      it('should not throw an error for valid arguments', function () {
        try {
          swagger.initializeMiddleware(petStoreJson, function(middleware) {
            _.each(Object.keys(middlewares), function (key) {
              assert.ok(!_.isFunction(middleware[key]));
            });
          });
        } catch (err) {
          assert.fail(null, null, 'Should not had failed');
        }
      });

      describe('issues', function () {
        it('should handle invalid swagger version (Issue 137)', function (done) {
          var cPetStoreJson = _.cloneDeep(petStoreJson);

          cPetStoreJson.swagger = 2.0;

          try {
            swagger.initializeMiddleware(cPetStoreJson, function() {
              assert.fail(null, null, 'Should had failed');
            });
          } catch (err) {
            assert.equal('Swagger document(s) failed validation so the server cannot start', err.message);
            assert.deepEqual({
              errors: [
                {
                  code: 'INVALID_TYPE',
                  message: 'Expected type string but found type integer',
                  path: [
                    'swagger'
                  ],
                  description: 'The Swagger version of this document.'
                },
                {
                  code: 'ENUM_MISMATCH',
                  message: 'No enum match for: 2',
                  path: [
                    'swagger'
                  ],
                  description: 'The Swagger version of this document.'
                }
              ],
              warnings: []
            }, err.results);

            done();
          }
        });
      });
    });
  });

  describe('specs', function () {
    it('should have proper exports', function () {
      assert.equal(0, _.difference(['v1', 'v1_2', 'v2', 'v2_0'], Object.keys(swagger.specs)).length);
    });
  });
});
