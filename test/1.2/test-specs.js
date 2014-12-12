/* global describe, it */

/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the 'Software'), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var fs = require('fs');
var path = require('path');
var spec = require('../../').specs.v1_2; // jshint ignore:line

var allSampleFiles = {};

// Load the sample files from disk
fs.readdirSync(path.join(__dirname, '..', '..', 'samples', '1.2'))
  .filter(function (name) {
    return name.match(/^(.*)\.json$/);
  })
  .forEach(function (name) {
    allSampleFiles[name] = require('../../samples/1.2/' + name);
  });

describe('Specification v1.2', function () {
  describe('metadata', function () {
    it('should have proper docsUrl, primitives, options, schemasUrl and verison properties', function () {
      assert.strictEqual(spec.docsUrl, 'https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md');
      assert.deepEqual(spec.primitives, ['string', 'number', 'boolean', 'integer', 'array', 'void', 'File']);
      assert.strictEqual(spec.schemasUrl, 'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2');
      assert.strictEqual(spec.version, '1.2');
    });
  });

  describe('schemas', function () {
    it('should contain all schema files', function () {
      assert.deepEqual(Object.keys(spec.schemas), [
        'apiDeclaration.json',
        'authorizationObject.json',
        'dataType.json',
        'dataTypeBase.json',
        'infoObject.json',
        'modelsObject.json',
        'oauth2GrantType.json',
        'operationObject.json',
        'parameterObject.json',
        'resourceListing.json',
        'resourceObject.json'
      ]);
    });

    it('should contain the proper content for each schema file', function () {
      Object.keys(spec.schemas).forEach(function (schemaName) {
        var schema = spec.schemas[schemaName];

        assert.ok(schema.id.substring(schema.id.lastIndexOf('/') + 1), schemaName + '#');
      });
    });
  });

  // Test validators
  describe('validators', function () {
    it('should contain all validators', function () {
      assert.equal(2, Object.keys(spec.validators).length);
      assert.ok(!_.isUndefined(spec.validators['resourceListing.json']));
      assert.ok(!_.isUndefined(spec.validators['apiDeclaration.json']));
    });
  });

  describe('#validate', function () {
    it('should fail when passed the wrong arguments', function () {
      var errors = {
        'resourceListing is required': [],
        'resourceListing must be an object': ['wrongType'],
        'apiDeclarations is required': [allSampleFiles['resource-listing.json']],
        'apiDeclarations must be an array': [allSampleFiles['resource-listing.json'], 'wrongType'],
        'callback is required': [allSampleFiles['resource-listing.json'], []],
        'callback must be a function': [allSampleFiles['resource-listing.json'], [], 'wrongType']
      };

      _.each(errors, function (args, message) {
        try {
          spec.validate.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should return undefined for valid JSON files', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
        assert.ok(_.isUndefined(err));
        assert.ok(_.isUndefined(result));

        done();
      });
    });

    describe('should return errors for structurally invalid JSON files', function () {
      it('extra property', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        // Extra property
        userJson.apis[0].operations[0].authorizations.oauth2[0].extra = 'value';

        spec.validate(rlJson, [userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'OBJECT_ADDITIONAL_PROPERTIES',
              message: 'Additional properties not allowed: extra',
              path: ['apis', '0', 'operations', '0', 'authorizations', 'oauth2', '0']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('invalid type', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);

        storeJson.models.Order.description = false;

        spec.validate(rlJson, [storeJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'INVALID_TYPE',
              message: 'Expected type string but found type boolean',
              path: ['models', 'Order', 'description']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('missing required value', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);

        delete rlJson.apis;

        spec.validate(rlJson, [petJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'OBJECT_MISSING_REQUIRED_PROPERTY',
              message: 'Missing required property: apis',
              path: []
            }
          ]);
          assert.equal(result.warnings, 0);

          done();
        });
      });

      it('wrong enum value', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);

        petJson.apis[1].operations[0].parameters[1].paramType = 'fake';

        spec.validate(rlJson, [petJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'ONE_OF_MISSING',
              message: 'Data does not match any schemas from \'oneOf\'',
              path: [
                'apis',
                '1',
                'operations',
                '0',
                'parameters',
                '1'
              ],
              description: 'type File requires special paramType and consumes',
              inner: [
                {
                  code: 'NOT_PASSED',
                  message: 'Data matches schema from \'not\'',
                  path: [
                    'apis',
                    '1',
                    'operations',
                    '0',
                    'parameters',
                    '1',
                    'type'
                  ]
                },
                {
                  code: 'ENUM_MISMATCH',
                  message: 'No enum match for: fake',
                  path: [
                    'apis',
                    '1',
                    'operations',
                    '0',
                    'parameters',
                    '1',
                    'paramType'
                  ]
                }
              ]
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });
    });

    describe('should return errors for semantically invalid JSON files', function () {
      it('duplicate api paths in resource listing', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        rlJson.apis.push(rlJson.apis[0]);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'DUPLICATE_RESOURCE_PATH',
              message: 'Resource path already defined: /pet',
              path: ['apis', '3', 'path']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('unused api path in resource listing', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        rlJson.apis.push({
          description: 'Operations on people',
          path: '/people'
        });

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'UNUSED_RESOURCE_PATH',
              message: 'Resource path is defined but is not used: /people',
              path: ['apis', '3', 'path']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('duplicate resource path in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        userJson.resourcePath = petJson.resourcePath;

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[2].errors, [
            {
              code: 'DUPLICATE_RESOURCE_PATH',
              message: 'Resource path already defined: /pet',
              path: ['resourcePath']
            }
          ]);
          assert.equal(result.apiDeclarations[2].warnings.length, 0);

          done();
        });
      });

      it('unresolvable resource path in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newResourcePath = userJson.resourcePath + '/fake';

        userJson.resourcePath = newResourcePath;

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[2].errors, [
            {
              code: 'UNRESOLVABLE_RESOURCE_PATH',
              message: 'Resource path could not be resolved: ' + newResourcePath,
              path: ['resourcePath']
            }
          ]);
          assert.equal(result.apiDeclarations[2].warnings.length, 0);

          done();
        });
      });

      it('duplicate api paths (verbatim) in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newPath = _.cloneDeep(petJson.apis[0]);

        petJson.apis.push(newPath);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_API_PATH',
              message: 'API path (or equivalent) already defined: /pet/{petId}',
              path: ['apis', petJson.apis.length - 1, 'path']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('duplicate api paths (equivalent) in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newPath = petJson.apis[0];

        newPath.path = newPath.path.replace(/petId/, 'id');

        _.each(newPath.operations, function (operation) {
          _.each(operation.parameters, function (parameter) {
            if (parameter.paramType === 'path' && parameter.name === 'petId') {
              parameter.name = 'id';
            }
          });
        });

        petJson.apis.push(newPath);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_API_PATH',
              message: 'API path (or equivalent) already defined: /pet/{id}',
              path: ['apis', petJson.apis.length - 1, 'path']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('duplicate operation method in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[1].method = petJson.apis[0].operations[0].method;

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_OPERATION_METHOD',
              message: 'Operation method already defined: GET',
              path: ['apis', '0', 'operations', '1', 'method']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('duplicate authorization scope definition', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var scope = rlJson.authorizations.oauth2.scopes[0];

        rlJson.authorizations.oauth2.scopes.push(scope);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'DUPLICATE_AUTHORIZATION_SCOPE_DEFINITION',
              message: 'Authorization scope definition already defined: ' + scope.scope,
              path: ['authorizations', 'oauth2', 'scopes', (rlJson.authorizations.oauth2.scopes.length - 1).toString(), 'scope']
            }
            ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      // TODO: Validate duplicate authorization scope reference (API Declaration)
      //  Not possible due to https://github.com/swagger-api/swagger-spec/issues/159

      it('duplicate authorization scope reference (operation)', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var scope = petJson.apis[0].operations[1].authorizations.oauth2[0];

        petJson.apis[0].operations[1].authorizations.oauth2.push(scope);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].warnings, [
            {
              code: 'DUPLICATE_AUTHORIZATION_SCOPE_REFERENCE',
              message: 'Authorization scope reference already defined: ' + scope.scope,
              path: ['apis', '0', 'operations', '1', 'authorizations', 'oauth2',
                     petJson.apis[0].operations[1].authorizations.oauth2.length - 1, 'scope']
            }
          ]);
          assert.equal(result.apiDeclarations[0].errors.length, 0);

          done();
        });
      });

      it('unresolvable authorization', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[1].authorizations.oauth3 =
          _.cloneDeep(petJson.apis[0].operations[1].authorizations.oauth2);

        delete petJson.apis[0].operations[1].authorizations.oauth2;

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'UNRESOLVABLE_AUTHORIZATION',
              message: 'Authorization could not be resolved: oauth3',
              path: ['apis', '0', 'operations', '1', 'authorizations', 'oauth3']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('unresolvable authorization scope', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[1].authorizations.oauth2[0].scope = 'fake';

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'UNRESOLVABLE_AUTHORIZATION_SCOPE',
              message: 'Authorization scope could not be resolved: fake',
              path: ['apis', '0', 'operations', '1', 'authorizations', 'oauth2', '0', 'scope']
            }
            ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('unused authorization', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        rlJson.authorizations = {
          apiKey: {
            type: 'apiKey',
            passAs: 'header',
            keyname: 'Fake-Auth-Header'
          }
        };

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'UNUSED_AUTHORIZATION',
              message: 'Authorization is defined but is not used: apiKey',
              path: ['authorizations', 'apiKey']
            }
          ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      it('unused authorization scope', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        rlJson.authorizations.oauth2.scopes.push({
          description: 'Fake authorization scope',
          scope: 'fake'
        });

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'UNUSED_AUTHORIZATION_SCOPE',
              message: 'Authorization scope is defined but is not used: fake',
              path: ['authorizations', 'oauth2', 'scopes', '3']
            }
            ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      describe('operation constraint validation', function () {
        it('wrong type', function (done) {
          var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
          var petJson = _.cloneDeep(allSampleFiles['pet.json']);
          var storeJson = _.cloneDeep(allSampleFiles['store.json']);
          var userJson = _.cloneDeep(allSampleFiles['user.json']);

          petJson.apis[0].operations[0].type = 'integer';
          petJson.apis[0].operations[0].defaultValue = 'fake';

          spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.apiDeclarations[0].errors, [
              {
                code: 'INVALID_TYPE',
                message: 'Not a valid integer: fake',
                path: ['apis', '0', 'operations', '0', 'defaultValue']
              }
            ]);
            assert.equal(result.apiDeclarations[0].warnings.length, 0);

            done();
          });
        });

        it('enum mismatch', function (done) {
          var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
          var petJson = _.cloneDeep(allSampleFiles['pet.json']);
          var storeJson = _.cloneDeep(allSampleFiles['store.json']);
          var userJson = _.cloneDeep(allSampleFiles['user.json']);

          petJson.apis[0].operations[0].type = 'string';
          petJson.apis[0].operations[0].enum = ['A', 'B'];
          petJson.apis[0].operations[0].defaultValue = 'fake';

          spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.apiDeclarations[0].errors, [
              {
                code: 'ENUM_MISMATCH',
                message: 'Not an allowable value (A, B): fake',
                path: ['apis', '0', 'operations', '0', 'defaultValue']
              }
            ]);
            assert.equal(result.apiDeclarations[0].warnings.length, 0);

            done();
          });
        });

        // Cannot validate default values for models because the schema does not allow it

        it('maximum', function (done) {
          var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
          var petJson = _.cloneDeep(allSampleFiles['pet.json']);
          var storeJson = _.cloneDeep(allSampleFiles['store.json']);
          var userJson = _.cloneDeep(allSampleFiles['user.json']);

          petJson.apis[0].operations[0].defaultValue = '1';
          petJson.apis[0].operations[0].maximum = '0';
          petJson.apis[0].operations[0].type = 'integer';

          spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.apiDeclarations[0].errors, [
              {
                code: 'MAXIMUM',
                message: 'Greater than the configured maximum (0): 1',
                path: ['apis', '0', 'operations', '0', 'defaultValue']
              }
            ]);
            assert.equal(result.apiDeclarations[0].warnings.length, 0);

            done();
          });

          it('minimum', function (done) {
            var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
            var petJson = _.cloneDeep(allSampleFiles['pet.json']);
            var storeJson = _.cloneDeep(allSampleFiles['store.json']);
            var userJson = _.cloneDeep(allSampleFiles['user.json']);

            petJson.apis[0].operations[0].defaultValue = '0';
            petJson.apis[0].operations[0].minimum = '1';
            petJson.apis[0].operations[0].type = 'integer';

            spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.apiDeclarations[0].errors, [
                {
                  code: 'MAXIMUM',
                  message: 'Less than the configured minimum (1): 0',
                  path: ['apis', '0', 'operations', '0', 'defaultValue']
                }
              ]);
              assert.equal(result.apiDeclarations[0].warnings.length, 0);

              done();
            });
          });
        });
      });

      describe('parameter constraint validation', function () {
        it('wrong type', function (done) {
          var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
          var petJson = _.cloneDeep(allSampleFiles['pet.json']);
          var storeJson = _.cloneDeep(allSampleFiles['store.json']);
          var userJson = _.cloneDeep(allSampleFiles['user.json']);

          petJson.apis[0].operations[0].parameters[0].defaultValue = 'fake';

          spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.apiDeclarations[0].errors, [
              {
                code: 'INVALID_TYPE',
                message: 'Not a valid int64 integer: fake',
                path: ['apis', '0', 'operations', '0', 'parameters', '0', 'defaultValue']
              }
            ]);
            assert.equal(result.apiDeclarations[0].warnings.length, 0);

            done();
          });
        });

        // Testing all other constraints is unnecessary since the same code that validates them is tested above
      });

      it('duplicate operation responseMessage code in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[0].responseMessages.push(petJson.apis[0].operations[0].responseMessages[0]);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_RESPONSE_MESSAGE_CODE',
              message: 'Response message code already defined: ' + petJson.apis[0].operations[0].responseMessages[0].code,
              path: ['apis', '0', 'operations', '0', 'responseMessages', '2', 'code']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('duplicate operation parameter in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[0].parameters.push(petJson.apis[0].operations[0].parameters[0]);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_PARAMETER',
              message: 'Parameter already defined: petId',
              path: ['apis', '0', 'operations', '0', 'parameters', '1', 'name']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('unresolvable operation path parameter in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newParam = _.cloneDeep(petJson.apis[0].operations[0].parameters[0]);

        newParam.name = 'fake';

        petJson.apis[0].operations[0].parameters.push(newParam);

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'UNRESOLVABLE_API_PATH_PARAMETER',
              message: 'API path parameter could not be resolved: ' + newParam.name,
              path: ['apis', '0', 'operations', '0', 'parameters', '1', 'name']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('missing operation path parameter in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[0].parameters = [];

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'MISSING_API_PATH_PARAMETER',
              message: 'API requires path parameter but it is not defined: petId',
              path: ['apis', '0', 'path']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('unresolvable operation responseMessage responseModel in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[0].responseMessages[0].responseModel = 'FakeError';

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'UNRESOLVABLE_MODEL',
              message: 'Model could not be resolved: FakeError',
              path: ['apis', '0', 'operations', '0', 'responseMessages', '0', 'responseModel']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('missing required model property in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.models.Category.required = ['name', 'tags'];

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'MISSING_REQUIRED_MODEL_PROPERTY',
              message: 'Model requires property but it is not defined: tags',
              path: ['models', 'Category', 'required', '1']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('unresolvable model in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.apis[0].operations[0].type = 'Fake';

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'UNRESOLVABLE_MODEL',
              message: 'Model could not be resolved: Fake',
              path: ['apis', '0', 'operations', '0', 'type']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('unused model in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.models.Person = {
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

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].warnings, [
            {
              code: 'UNUSED_MODEL',
              message: 'Model is defined but is not used: Person',
              path: ['models', 'Person']
            }
          ]);
          assert.equal(result.apiDeclarations[0].errors.length, 0);

          done();
        });
      });

      it('child model redeclares property in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.models.Person = {
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

        petJson.models.Tag.discriminator = 'name';
        petJson.models.Tag.subTypes = ['Person'];

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'CHILD_MODEL_REDECLARES_PROPERTY',
              message: 'Child model declares property already declared by ancestor: name',
              path: ['models', 'Person', 'properties', 'name']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('model multiple inheritance in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        petJson.models.Person = {
          id: 'Person',
          properties: {
            age: {
              type: 'integer'
            }
          }
        };

        petJson.models.Human = {
          id: 'Human',
          properties: {
            gender: {
              type: 'string'
            }
          },
          discriminator: 'gender',
          subTypes: ['Person']
        };

        petJson.models.Tag.discriminator = 'name';
        petJson.models.Tag.subTypes = ['Person'];

        // Add a reference so an error isn't thrown for a missing reference
        petJson.apis[0].operations[0].type = 'Human';

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'MULTIPLE_MODEL_INHERITANCE',
              message: 'Child model is sub type of multiple models: Tag && Human',
              path: ['models', 'Person']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('cyclical model inheritance in API declaration', function (done) {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);

        _.merge(petJson.models, {
          Bar: {
            id: 'Bar',
            properties: {
              bar: {
                type: 'string'
              }
            },
            discriminator: 'bar',
            subTypes: ['Baz']
          },
          Baz: {
            id: 'Baz',
            properties: {
              baz: {
                type: 'string'
              }
            },
            discriminator: 'baz',
            subTypes: ['Bar']
          }
        });

        spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'CYCLICAL_MODEL_INHERITANCE',
              message: 'Model has a circular inheritance: Bar -> Baz -> Bar',
              path: ['models', 'Bar', 'subTypes']
            },
            {
              code: 'CYCLICAL_MODEL_INHERITANCE',
              message: 'Model has a circular inheritance: Baz -> Bar -> Baz',
              path: ['models', 'Baz', 'subTypes']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      describe('model property constraint validation', function () {
        it('wrong type', function (done) {
          var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
          var petJson = _.cloneDeep(allSampleFiles['pet.json']);
          var storeJson = _.cloneDeep(allSampleFiles['store.json']);
          var userJson = _.cloneDeep(allSampleFiles['user.json']);

          petJson.models.Pet.properties.fake = {
            type: 'integer',
            defaultValue: 'fake'
          };

          spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.apiDeclarations[0].errors, [
              {
                code: 'INVALID_TYPE',
                message: 'Not a valid integer: fake',
                path: ['models', 'Pet', 'properties', 'fake', 'defaultValue']
              }
            ]);
            assert.equal(result.apiDeclarations[0].warnings.length, 0);

            done();
          });
        });

        // Testing all other constraints is unnecessary since the same code that validates them is tested above
      });
    });
  });

  describe('#composeSchema', function () {
    it('should fail when passed the wrong arguments', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var errors = {
        'apiDeclaration is required': [],
        'apiDeclaration must be an object': ['wrongType'],
        'modelId is required': [petJson],
        'callback is required': [petJson, 'Pet'],
        'callback must be a function': [petJson, 'Pet', 'wrongType']
      };

      _.each(errors, function (args, message) {
        try {
          spec.composeModel.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should return undefined for unresolvable model', function (done) {
      spec.composeModel(_.cloneDeep(allSampleFiles['pet.json']), 'Liger', function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should throw an Error for an API Declaration that has invalid models', function (done) {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);

      petJson.models.Person = {
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

      petJson.models.Tag.discriminator = 'name';
      petJson.models.Tag.subTypes = ['Person'];

      spec.composeModel(petJson, 'Person', function (err, result) {
        assert.equal('The Swagger document(s) are invalid', err.message);
        assert.equal(1, err.errors.length);
        assert.equal(0, err.warnings.length);
        assert.deepEqual({
          code: 'CHILD_MODEL_REDECLARES_PROPERTY',
          message: 'Child model declares property already declared by ancestor: name',
          path: ['models', 'Person', 'properties', 'name']
        }, err.errors[0]);

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should return a valid composed model', function (done) {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var ePet = _.cloneDeep(petJson.models.Pet);
      var eResults = [];
      var eCompany;
      var eEmployee;
      var ePerson;

      petJson.models.Person = {
        id: 'Person',
        properties: {
          age: {
            type: 'integer'
          },
          name: {
            type: 'string'
          }
        },
        required: ['name'],
        discriminator: 'name',
        subTypes: ['Employee']
      };

      petJson.models.Employee = {
        id: 'Employee',
        properties: {
          company: {
            type: 'string'
          },
          email: {
            type: 'string'
          }
        },
        required: ['company', 'email']
      };

      petJson.models.Company = {
        id: 'Company',
        properties: {
          name: {
            type: 'string'
          },
          employees: {
            type: 'array',
            items: {
              $ref: 'Employee'
            }
          }
        }
      };

      // Create expected Employee
      eEmployee = _.cloneDeep(petJson.models.Employee);

      eEmployee.title = 'Composed Employee';
      eEmployee.type = 'object';
      eEmployee.allOf = [
        _.cloneDeep(petJson.models.Person)
      ];

      eEmployee.allOf[0].title = 'Composed Person';
      eEmployee.allOf[0].type = 'object';

      delete eEmployee.id;
      delete eEmployee.allOf[0].id;
      delete eEmployee.allOf[0].subTypes;

      // Create expected Person
      ePerson = _.cloneDeep(petJson.models.Person);

      ePerson.title = 'Composed Person';
      ePerson.type = 'object';

      delete ePerson.id;
      delete ePerson.subTypes;

      // Create expected Company
      eCompany = _.cloneDeep(petJson.models.Company);

      eCompany.title = 'Composed Company';
      eCompany.type = 'object';
      eCompany.properties.employees.items = {
        title: 'Composed Employee',
        type: 'object',
        allOf: [
          _.cloneDeep(petJson.models.Person)
        ],
        properties: _.cloneDeep(petJson.models.Employee.properties),
        required: _.cloneDeep(petJson.models.Employee.required)
      };

      delete eCompany.id;
      delete eCompany.properties.employees.items.allOf[0].id;
      delete eCompany.properties.employees.items.allOf[0].subTypes;

      eCompany.properties.employees.items.allOf[0].title = 'Composed Person';
      eCompany.properties.employees.items.allOf[0].type = 'object';

      // Create expected Pet
      ePet.title = 'Composed Pet';
      ePet.type = 'object';
      ePet.properties.category = _.cloneDeep(petJson.models.Category);
      ePet.properties.id.maximum = 100;
      ePet.properties.id.minimum = 0;
      ePet.properties.tags = {
        items: {
          title: 'Composed Tag',
          type: 'object',
          properties: _.cloneDeep(petJson.models.Tag.properties)
        },
        type: 'array'
      };

      delete ePet.id;
      delete ePet.properties.category.id;

      ePet.properties.category.title = 'Composed Category';
      ePet.properties.category.type = 'object';

      // Collect our expected results
      eResults.push(eEmployee);
      eResults.push(ePerson);
      eResults.push(eCompany);
      eResults.push(ePet);

      async.map(['Employee', 'Person', 'Company', 'Pet'], function (modelId, callback) {
        spec.composeModel(petJson, modelId, function (err, results) {
          callback(err, results);
        });
      }, function (err, results) {
        if (err) {
          throw err;
        }

        _.each(results, function (result, index) {
          assert.deepEqual(eResults[index], result);
        });

        done();
      });
    });
  });

  describe('#validateModel', function () {
    it('should fail when passed the wrong arguments', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var errors = {
        'apiDeclaration is required': [],
        'apiDeclaration must be an object': ['wrongType'],
        'modelId is required': [petJson],
        'data is required': [petJson, 'Pet'],
        'callback is required': [petJson, 'Pet', {}],
        'callback must be a function': [petJson, 'Pet', {}, 'wrongType']
      };

      _.each(errors, function (args, message) {
        try {
          spec.validateModel.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should throw an Error for an API Declaration that has invalid models', function (done) {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);

      petJson.models.Person = {
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

      petJson.models.Tag.discriminator = 'name';
      petJson.models.Tag.subTypes = ['Person'];

      spec.validateModel(petJson, 'Person', {}, function (err, result) {
        assert.equal('The Swagger document(s) are invalid', err.message);
        assert.equal(1, err.errors.length);
        assert.equal(0, err.warnings.length);
        assert.deepEqual({
          code: 'CHILD_MODEL_REDECLARES_PROPERTY',
          message: 'Child model declares property already declared by ancestor: name',
          path: ['models', 'Person', 'properties', 'name']
        }, err.errors[0]);

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should return errors/warnings for invalid model', function (done) {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);

      spec.validateModel(petJson, 'Pet', {
        id: 1
      }, function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.errors, [
          {
            code: 'OBJECT_MISSING_REQUIRED_PROPERTY',
            message: 'Missing required property: name',
            path: []
          }
        ]);

        done();
      });
    });

    it('should return undefined for valid model', function (done) {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      spec.validateModel(petJson, 'Pet', {
        id: 1,
        name: 'Jeremy'
      }, function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });
  });

  describe('#resolve', function () {
    it('should throw errors for invalid arguments', function () {
      var errors = {
        'document is required': [],
        'document must be an object': ['resource-listing.json'],
        'callback is required': [{}],
        'callback must be a function': [{}, 'wrong-type'],
        'ptr must be a JSON Pointer string': [{}, [], function () {}],
        'Swagger 1.2 is not supported': [_.cloneDeep(allSampleFiles['pet.json']), function () {}]
      };

      _.each(errors, function (args, message) {
        try {
          spec.resolve.apply(undefined, args);

          assert.fail(null, null, 'Should had failed above');
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });
  });

  describe('issues', function () {
    // This should be removed when the upstream bug in the Swagger schema is fixed
    //   https://github.com/swagger-api/swagger-spec/issues/174
    it('missing items property for operation array type (Issue 61)', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      delete petJson.apis[0].operations[2].items;

      spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'OBJECT_MISSING_REQUIRED_PROPERTY',
            message: 'Missing required property: items',
            path: ['apis', '0', 'operations', '2']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);

        done();
      });
    });

    it('missing items property for parameter array type (Issue 61)', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      petJson.apis[0].operations[0].parameters.push({
        paramType: 'query',
        type: 'array',
        name: 'fake'
      });

      spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'OBJECT_MISSING_REQUIRED_PROPERTY',
            message: 'Missing required property: items',
            path: ['apis', '0', 'operations', '0', 'parameters', '1']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);

        done();
      });
    });

    it('model id mismatch API declaration (Issue 71)', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      petJson.models.Category.id = 'NotCategory';

      spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'MODEL_ID_MISMATCH',
            message: 'Model id does not match id in models object: ' + petJson.models.Category.id,
            path: ['models', 'Category', 'id']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);

        done();
      });
    });

    it('should handle path parameters that are not path segments (Issue 72)', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      petJson.apis.push({
        operations: [
          {
            authorizations: {},
            method: 'GET',
            nickname: 'exportData',
            notes: 'Allow user to export data in supported format',
            parameters: [
              {
                description: 'Collection name',
                name: 'collection',
                paramType: 'path',
                type: 'string'
              },
              {
                description: 'The export format',
                name: 'format',
                paramType: 'path',
                type: 'string'
              }
            ],
            summary: 'Export data in requested format',
            type: 'string'
          }
        ],
        path: '/export/{collection}.{format}'
      });

      spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });
  });

  describe('#convert', function () {
    it('should fail when passed the wrong arguments', function () {
      var errors = {
        'resourceListing is required': [],
        'resourceListing must be an object': ['wrongType'],
        'apiDeclarations must be an array': [allSampleFiles['resource-listing.json'], 'wrongType'],
        'callback is required': [allSampleFiles['resource-listing.json'], []],
        'callback must be a function': [allSampleFiles['resource-listing.json'], [], 'wrongType']
      };

      _.each(errors, function (args, message) {
        try {
          spec.validate.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should throw an Error for Swagger document(s) with errors', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      petJson.models.Person = {
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

      petJson.models.Tag.discriminator = 'name';
      petJson.models.Tag.subTypes = ['Person'];

      spec.convert(rlJson, [petJson, storeJson, userJson], function (err, converted) {
        assert.equal('The Swagger document(s) are invalid', err.message);
        assert.equal(0, err.errors.length);
        assert.equal(0, err.warnings.length);
        assert.deepEqual({
          code: 'CHILD_MODEL_REDECLARES_PROPERTY',
          message: 'Child model declares property already declared by ancestor: name',
          path: ['models', 'Person', 'properties', 'name']
        }, err.apiDeclarations[0].errors[0]);

        assert.ok(_.isUndefined(converted));

        done();
      });
    });

    it('should throw an Error for Swagger document(s) with only warnings', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      petJson.models.Person = {
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

      spec.convert(rlJson, [petJson, storeJson, userJson], true, function (err, converted) {
        assert.ok(_.isUndefined(err));
        assert.ok(_.isPlainObject(converted));

        done();
      });
    });

    it('should throw an Error for Swagger document(s) with errors when skipping validation', function (done) {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      petJson.models.Person = {
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

      petJson.models.Tag.discriminator = 'name';
      petJson.models.Tag.subTypes = ['Person'];

      spec.convert(rlJson, [petJson, storeJson, userJson], true, function (err, converted) {
        assert.ok(_.isUndefined(err));
        assert.ok(_.isPlainObject(converted));

        done();
      });
    });
  });
});
