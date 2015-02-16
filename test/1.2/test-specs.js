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
var spec = (typeof window === 'undefined' ? require('../../') : SwaggerTools).specs.v1_2; // jshint ignore:line

var petJson = _.cloneDeep(require('../../samples/1.2/pet.json'));
var rlJson = _.cloneDeep(require('../../samples/1.2/resource-listing.json'));
var storeJson = _.cloneDeep(require('../../samples/1.2/store.json'));
var userJson = _.cloneDeep(require('../../samples/1.2/user.json'));
var header = typeof window === 'undefined' ?
               '' :
               ' (Browser ' + (window.bowerTests ? 'Bower' : 'Standalone') + ' Build)';

describe('Specification v1.2' + header, function () {
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
    it('should throw an Error when passed the wrong arguments', function () {
      var errors = {
        'resourceListing is required': [],
        'resourceListing must be an object': ['wrongType'],
        'apiDeclarations is required': [rlJson],
        'apiDeclarations must be an array': [rlJson, 'wrongType'],
        'callback is required': [rlJson, []],
        'callback must be a function': [rlJson, [], 'wrongType']
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
      spec.validate(rlJson, [petJson, storeJson, userJson], function (err, result) {
        assert.ok(_.isUndefined(err));
        assert.ok(_.isUndefined(result));

        done();
      });
    });

    describe('should return errors for structurally invalid JSON files', function () {
      it('extra property', function (done) {
        var cRlJson = _.cloneDeep(rlJson);
        var cUserJson = _.cloneDeep(userJson);

        // Extra property
        cUserJson.apis[0].operations[0].authorizations.oauth2[0].extra = 'value';

        spec.validate(cRlJson, [cUserJson], function (err, result) {
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
        var cRlJson = _.cloneDeep(rlJson);
        var cStoreJson = _.cloneDeep(storeJson);

        cStoreJson.models.Order.description = false;

        spec.validate(cRlJson, [cStoreJson], function (err, result) {
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
        var cRlJson = _.cloneDeep(rlJson);
        var cPetJson = _.cloneDeep(petJson);

        delete cRlJson.apis;

        spec.validate(cRlJson, [cPetJson], function (err, result) {
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
        var cRlJson = _.cloneDeep(rlJson);
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[1].operations[0].parameters[1].paramType = 'fake';

        spec.validate(cRlJson, [cPetJson], function (err, result) {
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
      it('child model redeclares property of an ancestor model', function (done) {
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

        cPetJson.models.Tag.discriminator = 'name';
        cPetJson.models.Tag.subTypes = ['Person'];

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      describe('default value fails constraint/schema validation', function () {
        describe('model property', function () {
          it('wrong type', function (done) {
            var cPetJson = _.cloneDeep(petJson);

            cPetJson.models.Pet.properties.fake = {
              type: 'integer',
              defaultValue: 'fake'
            };

            spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

        describe('operation', function () {
          it('enum mismatch', function (done) {
            var cPetJson = _.cloneDeep(petJson);

            cPetJson.apis[0].operations[0].type = 'string';
            cPetJson.apis[0].operations[0].enum = ['A', 'B'];
            cPetJson.apis[0].operations[0].defaultValue = 'fake';

            spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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
            var cPetJson = _.cloneDeep(petJson);

            cPetJson.apis[0].operations[0].defaultValue = '1';
            cPetJson.apis[0].operations[0].maximum = '0';
            cPetJson.apis[0].operations[0].type = 'integer';

            spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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
              var cPetJson = _.cloneDeep(petJson);

              cPetJson.apis[0].operations[0].defaultValue = '0';
              cPetJson.apis[0].operations[0].minimum = '1';
              cPetJson.apis[0].operations[0].type = 'integer';

              spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

            it('wrong type', function (done) {
              var cPetJson = _.cloneDeep(petJson);

              cPetJson.apis[0].operations[0].type = 'integer';
              cPetJson.apis[0].operations[0].defaultValue = 'fake';

              spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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
          });
        });

        describe('parameter', function () {
          it('wrong type', function (done) {
            var cPetJson = _.cloneDeep(petJson);

            cPetJson.apis[0].operations[0].parameters[0].defaultValue = 'fake';

            spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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
      });

      it('duplicate API path in the Resource Listing', function (done) {
        var cRlJson = _.cloneDeep(rlJson);

        cRlJson.apis.push(rlJson.apis[0]);

        spec.validate(cRlJson, [petJson, storeJson, userJson], function (err, result) {
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

      it('duplicate API path (equivalent) in an API Declaration', function (done) {
        var cPetJson = _.cloneDeep(petJson);
        var newPath = cPetJson.apis[0];

        newPath.path = newPath.path.replace(/petId/, 'id');

        _.each(newPath.operations, function (operation) {
          _.each(operation.parameters, function (parameter) {
            if (parameter.paramType === 'path' && parameter.name === 'petId') {
              parameter.name = 'id';
            }
          });
        });

        cPetJson.apis.push(newPath);

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_API_PATH',
              message: 'API path (or equivalent) already defined: /pet/{id}',
              path: ['apis', cPetJson.apis.length - 1, 'path']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('duplicate API path (verbatim) in an API Declaration', function (done) {
        var cPetJson = _.cloneDeep(petJson);
        var newPath = _.cloneDeep(cPetJson.apis[0]);

        cPetJson.apis.push(newPath);

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_API_PATH',
              message: 'API path (or equivalent) already defined: /pet/{petId}',
              path: ['apis', cPetJson.apis.length - 1, 'path']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('duplicate operation method', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[0].operations[1].method = cPetJson.apis[0].operations[0].method;

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('duplicate operation parameter (name+paramType)', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[0].operations[0].parameters.push(petJson.apis[0].operations[0].parameters[0]);

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('duplicate operation responseMessage code', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[0].operations[0].responseMessages.push(petJson.apis[0].operations[0].responseMessages[0]);

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DUPLICATE_RESPONSE_MESSAGE_CODE',
              message: 'Response message code already defined: ' +
                cPetJson.apis[0].operations[0].responseMessages[0].code,
              path: ['apis', '0', 'operations', '0', 'responseMessages', '2', 'code']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('duplicate resource path in an API Declaration', function (done) {
        var cPetJson = _.cloneDeep(petJson);
        var cUserJson = _.cloneDeep(userJson);

        cUserJson.resourcePath = cPetJson.resourcePath;

        spec.validate(rlJson, [cPetJson, storeJson, cUserJson], function (err, result) {
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

      // This should be removed when the upstream bug in the Swagger schema is fixed
      //   https://github.com/swagger-api/swagger-spec/issues/174
      it('missing items property for array type (operation) (Issue 61)', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        delete cPetJson.apis[0].operations[2].items;

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('missing items property for array type (parameter) (Issue 61)', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[0].operations[0].parameters.push({
          paramType: 'query',
          type: 'array',
          name: 'fake'
        });

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('missing operation path parameter in API declaration', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[0].operations[0].parameters = [];

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('missing required model property in API declaration', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.models.Category.required = ['name', 'tags'];

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('model id mismatch API declaration (Issue 71)', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.models.Category.id = 'NotCategory';

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'MODEL_ID_MISMATCH',
              message: 'Model id does not match id in models object: ' + cPetJson.models.Category.id,
              path: ['models', 'Category', 'id']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('model is a subtype of multiple models (Multiple Inheritance)', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.models.Person = {
          id: 'Person',
          properties: {
            age: {
              type: 'integer'
            }
          }
        };

        cPetJson.models.Human = {
          id: 'Human',
          properties: {
            gender: {
              type: 'string'
            }
          },
          discriminator: 'gender',
          subTypes: ['Person']
        };

        cPetJson.models.Tag.discriminator = 'name';
        cPetJson.models.Tag.subTypes = ['Person'];

        // Add a reference so an error isn't thrown for a missing reference
        cPetJson.apis[0].operations[0].type = 'Human';

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('model is a subtype of one of its subtypes (Circular Inheritance)', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        _.merge(cPetJson.models, {
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

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('multiple body parameters for an operation (Issue 136)', function (done) {
        var cPetJson = _.cloneDeep(petJson);
        var cBodyParam = _.cloneDeep(cPetJson.apis[2].operations[0].parameters[0]);

        cBodyParam.name = 'duplicateBody';

        cPetJson.apis[2].operations[0].parameters.push(cBodyParam);

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].errors, [
            {
              code: 'DULPICATE_API_BODY_PARAMETER',
              message: 'API has more than one body parameter',
              path: ['apis', '2', 'operations', '0', 'parameters', '1']
            }
          ]);
          assert.equal(result.apiDeclarations[0].warnings.length, 0);

          done();
        });
      });

      it('unresolvable authorization', function (done) {
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[0].operations[1].authorizations.oauth3 =
          _.cloneDeep(cPetJson.apis[0].operations[1].authorizations.oauth2);

        delete cPetJson.apis[0].operations[1].authorizations.oauth2;

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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
        var cPetJson = _.cloneDeep(petJson);

        cPetJson.apis[0].operations[1].authorizations.oauth2[0].scope = 'fake';

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      describe('unresolvable model', function () {
        it('operation parameter', function (done) {
          var cPetJson = _.cloneDeep(petJson);

          cPetJson.apis[2].operations[0].parameters[0].type = 'Fake';

          spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.apiDeclarations[0].errors, [
              {
                code: 'UNRESOLVABLE_MODEL',
                message: 'Model could not be resolved: Fake',
                path: ['apis', '2', 'operations', '0', 'parameters', '0', 'type']
              }
            ]);
            assert.equal(result.apiDeclarations[0].warnings.length, 0);

            done();
          });
        });

        it('operation response', function (done) {
          var cPetJson = _.cloneDeep(petJson);

          cPetJson.apis[0].operations[0].type = 'Fake';

          spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

        it('operation responseMessage', function (done) {
          var cPetJson = _.cloneDeep(petJson);

          cPetJson.apis[0].operations[0].responseMessages[0].responseModel = 'FakeError';

          spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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
      });

      it('unresolvable operation path parameter', function (done) {
        var cPetJson = _.cloneDeep(petJson);
        var newParam = _.cloneDeep(petJson.apis[0].operations[0].parameters[0]);

        newParam.name = 'fake';

        cPetJson.apis[0].operations[0].parameters.push(newParam);

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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

      it('unresolvable resource path in an API Declaration', function (done) {
        var cUserJson = _.cloneDeep(userJson);
        var newResourcePath = cUserJson.resourcePath + '/fake';

        cUserJson.resourcePath = newResourcePath;

        spec.validate(rlJson, [petJson, storeJson, cUserJson], function (err, result) {
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

      it('unused API path in the Resource Listing', function (done) {
        var cRlJson = _.cloneDeep(rlJson);

        cRlJson.apis.push({
          description: 'Operations on people',
          path: '/people'
        });

        spec.validate(cRlJson, [petJson, storeJson, userJson], function (err, result) {
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

      it('unused model', function (done) {
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

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
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
    });

    describe('should return warnings for semantically invalid JSON files', function () {
      it('duplicate authorization scope definition in the Resource Listing', function (done) {
        var cRlJson = _.cloneDeep(rlJson);
        var scope = cRlJson.authorizations.oauth2.scopes[0];

        cRlJson.authorizations.oauth2.scopes.push(scope);

        spec.validate(cRlJson, [petJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'DUPLICATE_AUTHORIZATION_SCOPE_DEFINITION',
              message: 'Authorization scope definition already defined: ' + scope.scope,
              path: ['authorizations', 'oauth2', 'scopes', (cRlJson.authorizations.oauth2.scopes.length - 1).toString(),
                     'scope']
            }
          ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      // TODO: Validate duplicate authorization scope reference (API Declaration)
      //  Not possible due to https://github.com/swagger-api/swagger-spec/issues/159

      it('duplicate authorization scope reference for an operation in an API Declaration', function (done) {
        var cPetJson = _.cloneDeep(petJson);
        var scope = cPetJson.apis[0].operations[1].authorizations.oauth2[0];

        cPetJson.apis[0].operations[1].authorizations.oauth2.push(scope);

        spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.apiDeclarations[0].warnings, [
            {
              code: 'DUPLICATE_AUTHORIZATION_SCOPE_REFERENCE',
              message: 'Authorization scope reference already defined: ' + scope.scope,
              path: ['apis', '0', 'operations', '1', 'authorizations', 'oauth2',
                     cPetJson.apis[0].operations[1].authorizations.oauth2.length - 1, 'scope']
            }
          ]);
          assert.equal(result.apiDeclarations[0].errors.length, 0);

          done();
        });
      });

      it('unused authorization', function (done) {
        var cRlJson = _.cloneDeep(rlJson);

        cRlJson.authorizations = {
          apiKey: {
            type: 'apiKey',
            passAs: 'header',
            keyname: 'Fake-Auth-Header'
          }
        };

        spec.validate(cRlJson, [petJson, storeJson, userJson], function (err, result) {
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
        var cRlJson = _.cloneDeep(rlJson);

        cRlJson.authorizations.oauth2.scopes.push({
          description: 'Fake authorization scope',
          scope: 'fake'
        });

        spec.validate(cRlJson, [petJson, storeJson, userJson], function (err, result) {
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
    });
  });

  describe('#composeSchema', function () {
    it('should fail when passed the wrong arguments', function () {
      var cPetJson = _.cloneDeep(petJson);
      var errors = {
        'apiDeclaration is required': [],
        'apiDeclaration must be an object': ['wrongType'],
        'modelId is required': [cPetJson],
        'callback is required': [cPetJson, 'Pet'],
        'callback must be a function': [cPetJson, 'Pet', 'wrongType']
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
      spec.composeModel(_.cloneDeep(petJson), 'Liger', function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should throw an Error for an API Declaration that has invalid models', function (done) {
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

      cPetJson.models.Tag.discriminator = 'name';
      cPetJson.models.Tag.subTypes = ['Person'];

      spec.composeModel(cPetJson, 'Person', function (err, result) {
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
      var cPetJson = _.cloneDeep(petJson);
      var ePet = _.cloneDeep(cPetJson.models.Pet);
      var eResults = [];
      var eCompany;
      var eEmployee;
      var ePerson;

      cPetJson.models.Person = {
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

      cPetJson.models.Employee = {
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

      cPetJson.models.Company = {
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
      eEmployee = _.cloneDeep(cPetJson.models.Employee);

      eEmployee.title = 'Composed Employee';
      eEmployee.allOf = [
        _.cloneDeep(cPetJson.models.Person)
      ];

      eEmployee.allOf[0].title = 'Composed Person';

      delete eEmployee.id;
      delete eEmployee.allOf[0].id;
      delete eEmployee.allOf[0].subTypes;

      // Create expected Person
      ePerson = _.cloneDeep(cPetJson.models.Person);

      ePerson.title = 'Composed Person';

      delete ePerson.id;
      delete ePerson.subTypes;

      // Create expected Company
      eCompany = _.cloneDeep(cPetJson.models.Company);

      eCompany.title = 'Composed Company';
      eCompany.properties.employees.items = {
        title: 'Composed Employee',
        allOf: [
          _.cloneDeep(cPetJson.models.Person)
        ],
        properties: _.cloneDeep(cPetJson.models.Employee.properties),
        required: _.cloneDeep(cPetJson.models.Employee.required)
      };

      delete eCompany.id;
      delete eCompany.properties.employees.items.allOf[0].id;
      delete eCompany.properties.employees.items.allOf[0].subTypes;

      eCompany.properties.employees.items.allOf[0].title = 'Composed Person';

      // Create expected Pet
      ePet.title = 'Composed Pet';
      ePet.properties.category = _.cloneDeep(cPetJson.models.Category);
      ePet.properties.id.maximum = 100;
      ePet.properties.id.minimum = 0;
      ePet.properties.tags = {
        items: {
          title: 'Composed Tag',
          properties: _.cloneDeep(cPetJson.models.Tag.properties)
        },
        type: 'array'
      };

      delete ePet.id;
      delete ePet.properties.category.id;

      ePet.properties.category.title = 'Composed Category';

      // Collect our expected results
      eResults.push(eEmployee);
      eResults.push(ePerson);
      eResults.push(eCompany);
      eResults.push(ePet);

      async.map(['Employee', 'Person', 'Company', 'Pet'], function (modelId, callback) {
        spec.composeModel(cPetJson, modelId, function (err, results) {
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
      var cPetJson = _.cloneDeep(petJson);
      var errors = {
        'apiDeclaration is required': [],
        'apiDeclaration must be an object': ['wrongType'],
        'modelId is required': [cPetJson],
        'data is required': [cPetJson, 'Pet'],
        'callback is required': [cPetJson, 'Pet', {}],
        'callback must be a function': [cPetJson, 'Pet', {}, 'wrongType']
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

      cPetJson.models.Tag.discriminator = 'name';
      cPetJson.models.Tag.subTypes = ['Person'];

      spec.validateModel(cPetJson, 'Person', {}, function (err, result) {
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
      var cPetJson = _.cloneDeep(petJson);

      spec.validateModel(cPetJson, 'Pet', {
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
      var cPetJson = _.cloneDeep(petJson);

      spec.validateModel(cPetJson, 'Pet', {
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
        'Swagger 1.2 is not supported': [_.cloneDeep(petJson), function () {}]
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

  describe('#convert', function () {
    it('should fail when passed the wrong arguments', function () {
      var errors = {
        'resourceListing is required': [],
        'resourceListing must be an object': ['wrongType'],
        'apiDeclarations must be an array': [rlJson, 'wrongType'],
        'callback is required': [rlJson, []],
        'callback must be a function': [rlJson, [], 'wrongType']
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

      cPetJson.models.Tag.discriminator = 'name';
      cPetJson.models.Tag.subTypes = ['Person'];

      spec.convert(rlJson, [cPetJson, storeJson, userJson], function (err, converted) {
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

      spec.convert(rlJson, [cPetJson, storeJson, userJson], true, function (err, converted) {
        assert.ok(_.isUndefined(err));
        assert.ok(_.isPlainObject(converted));

        done();
      });
    });

    it('should throw an Error for Swagger document(s) with errors when skipping validation', function (done) {
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

      cPetJson.models.Tag.discriminator = 'name';
      cPetJson.models.Tag.subTypes = ['Person'];

      spec.convert(rlJson, [cPetJson, storeJson, userJson], true, function (err, converted) {
        assert.ok(_.isUndefined(err));
        assert.ok(_.isPlainObject(converted));

        done();
      });
    });
  });

  describe('issues', function () {
    it('should handle path parameters that are not path segments (Issue 72)', function (done) {
      var cPetJson = _.cloneDeep(petJson);

      cPetJson.apis.push({
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

      spec.validate(rlJson, [cPetJson, storeJson, userJson], function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });
  });
});
