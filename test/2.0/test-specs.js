/* global afterEach, describe, it */

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

var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var JsonRefs = require('json-refs');
var spec = (typeof window === 'undefined' ? require('../../') : SwaggerTools).specs.v2_0; // jshint ignore:line
var header = typeof window === 'undefined' ?
               '' :
               ' (Browser ' + (window.bowerTests ? 'Bower' : 'Standalone') + ' Build)';

var petStoreJson = _.cloneDeep(require('../../samples/2.0/petstore.json'));

describe('Specification v2.0' + header, function () {
  var server;

  afterEach(function () {
    if (server) {
      server.close();
    }

    server = undefined;
  });

  describe('metadata', function () {
    it('should have proper docsUrl, primitives, options, schemasUrl and verison properties', function () {
      assert.strictEqual(spec.docsUrl, 'https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md');
      assert.deepEqual(spec.primitives, ['string', 'number', 'boolean', 'integer', 'array', 'file']);
      assert.strictEqual(spec.schemasUrl, 'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0');
      assert.strictEqual(spec.version, '2.0');
    });
  });

  describe('schemas', function () {
    it('should contain all schema files', function () {
      assert.deepEqual(Object.keys(spec.schemas), [
        'schema.json'
      ]);
    });
  });

  // Test validators
  describe('validators', function () {
    it('should contain all validators', function () {
      assert.equal(1, Object.keys(spec.validators).length);
      assert.ok(!_.isUndefined(spec.validators['schema.json']));
    });
  });

  describe('#validate', function () {
    it('should throw an Error when passed the wrong arguments', function () {
      var errors = {
        'swaggerObject is required': [],
        'swaggerObject must be an object': ['wrongType'],
        'callback is required': [petStoreJson],
        'callback must be a function': [petStoreJson, 'wrongType']
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
      spec.validate(petStoreJson, function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(err));
        assert.ok(_.isUndefined(result));

        done();
      });
    });

    describe('should return errors for structurally invalid JSON files', function () {
      it('extra property', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.paths['/pets'].get.extra = 'value';

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'OBJECT_ADDITIONAL_PROPERTIES',
              message: 'Additional properties not allowed: extra',

              path: ['paths', '/pets', 'get']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('invalid reference', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.paths['/pets'].get.responses['200'].schema.items.$ref = 'Pet';

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'INVALID_REFERENCE',
              message: 'Not a valid JSON Reference',
              path: ['paths', '/pets', 'get', 'responses', '200', 'schema', 'items', '$ref']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('invalid type', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.info.contact.name = false;

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'INVALID_TYPE',
              // Visible because the schema provides it
              description: 'The identifying name of the contact person/organization.',
              message: 'Expected type string but found type boolean',
              path: ['info', 'contact', 'name']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('missing required value', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        delete swaggerObject.paths;

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'OBJECT_MISSING_REQUIRED_PROPERTY',
              message: 'Missing required property: paths',
              path: []
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('wrong enum value', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.schemes.push('fake');

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'ENUM_MISMATCH',
              message: 'No enum match for: fake',
              path: ['schemes', '1']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });
    });

    describe('should return errors for semantically invalid JSON files', function () {
      it('child model redeclares property', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.definitions.Person = {
          allOf: [
            {
              $ref: '#/definitions/Pet'
            }
          ],
          properties: {
            age: {
              type: 'integer'
            },
            name: {
              type: 'string'
            }
          }
        };

        swaggerObject.paths['/pets'].get.responses.default.schema.$ref = '#/definitions/Person';

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'CHILD_DEFINITION_REDECLARES_PROPERTY',
              message: 'Child definition declares property already declared by ancestor: name',
              path: ['definitions', 'Person', 'properties', 'name']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      describe('default value fails constraint/schema validation', function () {
        describe('definition property', function () {
          it('enum mismatch', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'string',
              enum: ['A', 'B'],
              default: 'fake'
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'ENUM_MISMATCH',
                  message: 'Not an allowable value (A, B): fake',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('maximum', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'integer',
              maximum: 0,
              default: 1
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MAXIMUM',
                  message: 'Greater than the configured maximum (0): 1',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('maximum (exclusive)', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'integer',
              maximum: 1,
              default: 1,
              exclusiveMaximum: true
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MAXIMUM_EXCLUSIVE',
                  message: 'Greater than or equal to the configured maximum (1): 1',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('maxItems', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'array',
              items: {
                type: 'string'
              },
              maxItems: 1,
              default: ['A', 'B']
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'ARRAY_LENGTH_LONG',
                  message: 'Array is too long (2), maximum 1',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('maxLength', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'string',
              maxLength: 3,
              default: 'fake'
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MAX_LENGTH',
                  message: 'String is too long (4 chars), maximum 3',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('maxProperties', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'object',
              maxProperties: 1,
              default: {
                a: 'a',
                b: 'b'
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MAX_PROPERTIES',
                  message: 'Number of properties is too many (2 properties), maximum 1',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('minimum', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'integer',
              minimum: 1,
              default: 0
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MINIMUM',
                  message: 'Less than the configured minimum (1): 0',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('minItems', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'array',
              items: {
                type: 'string'
              },
              minItems: 2,
              default: ['A']
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'ARRAY_LENGTH_SHORT',
                  message: 'Array is too short (1), minimum 2',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('minLength', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'string',
              minLength: 5,
              default: 'fake'
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MIN_LENGTH',
                  message: 'String is too short (4 chars), minimum 5',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('minProperties', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'object',
              minProperties: 2,
              default: {
                a: 'a'
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MIN_PROPERTIES',
                  message: 'Number of properties is too few (1 properties), minimum 2',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('multipleOf', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'integer',
              multipleOf: 3,
              default: 5
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'MULTIPLE_OF',
                  message: 'Not a multiple of 3',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('pattern', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'string',
              pattern: '^#.*',
              default: 'fake'
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'PATTERN',
                  message: 'Does not match required pattern: ^#.*',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('wrong type', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.Pet.properties.fake = {
              type: 'integer',
              default: 'fake'
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['definitions', 'Pet', 'properties', 'fake', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });
        });

        describe('parameter definition', function () {
          it('inline schema', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.parameters = {
              fake: {
                name: 'fake',
                type: 'integer',
                  in: 'query',
                default: 'fake'
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['parameters', 'fake', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_PARAMETER',
                  message: 'Parameter is defined but is not used: #/parameters/fake',
                  path: ['parameters', 'fake']
                }
              ]);

              done();
            });
          });

          it('schema object', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.parameters = {
              fake: {
                name: 'fake',
                  in: 'body',
                schema: {
                  type: 'integer',
                  default: 'fake'
                }
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['parameters', 'fake', 'schema', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_PARAMETER',
                  message: 'Parameter is defined but is not used: #/parameters/fake',
                  path: ['parameters', 'fake']
                }
              ]);

              done();
            });
          });

          it('schema reference', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.fake = {
              type: 'integer',
              default: 'fake'
            };
            swaggerObject.parameters = {
              fake: {
                name: 'fake',
                  in: 'body',
                schema: {
                  $ref: '#/definitions/fake'
                }
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['parameters', 'fake', 'schema', 'default']
                },
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['definitions', 'fake', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_PARAMETER',
                  message: 'Parameter is defined but is not used: #/parameters/fake',
                  path: ['parameters', 'fake']
                }
              ]);

              done();
            });
          });

          // Testing all other constraints is unnecessary since the same code that validates them is tested above
        });

        describe('operation parameter', function () {
          it('inline schema', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.paths['/pets'].post.parameters.push({
              name: 'fake',
              type: 'integer',
                in: 'query',
              default: 'fake'
            });

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'post', 'parameters', '1', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('schema object', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.paths['/pets'].post.parameters[0].schema = {
              type: 'integer',
              default: 'fake'
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'post', 'parameters', '0', 'schema', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_DEFINITION',
                  message: 'Definition is defined but is not used: #/definitions/newPet',
                  path: ['definitions', 'newPet']
                }
              ]);

              done();
            });
          });

          it('inline reference', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.parameters = {
              fake: {
                name: 'fake',
                  in: 'query',
                type: 'integer',
                default: 'fake'
              }
            };
            swaggerObject.paths['/pets'].post.parameters.push({
              $ref: '#/parameters/fake'
            });

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['parameters', 'fake', 'default']
                },
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'post', 'parameters', '1', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('schema reference', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.fake = {
              type: 'integer',
              default: 'fake'
            };
            swaggerObject.paths['/pets'].post.parameters[0].schema.$ref = '#/definitions/fake';

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['definitions', 'fake', 'default']
                },
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'post', 'parameters', '0', 'schema', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_DEFINITION',
                  message: 'Definition is defined but is not used: #/definitions/newPet',
                  path: ['definitions', 'newPet']
                }
              ]);

              done();
            });
          });

          // Testing all other constraints is unnecessary since the same code that validates them is tested above
        });

        describe('operation parameter (path level)', function () {
          it('inline schema', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.paths['/pets'].parameters = [
              {
                name: 'fake',
                type: 'integer',
                  in: 'query',
                default: 'fake'
              }
            ];

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              // Since this is a path level parameter, all operations will get the same error
              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'parameters', '0', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('schema object', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.paths['/pets'].parameters = [
              {
                name: 'fake',
                  in: 'body',
                schema: {
                  type: 'integer',
                  default: 'fake'
                }
              }
            ];

            delete swaggerObject.paths['/pets'].post.parameters;

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              // Since this is a path level parameter, all operations will get the same error
              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'parameters', '0', 'schema', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_DEFINITION',
                  message: 'Definition is defined but is not used: #/definitions/newPet',
                  path: ['definitions', 'newPet']
                }
              ]);

              done();
            });
          });

          it('inline reference', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.parameters = {
              fake: {
                name: 'fake',
                  in: 'query',
                type: 'integer',
                default: 'fake'
              }
            };
            swaggerObject.paths['/pets'].parameters = [
              {
                $ref: '#/parameters/fake'
              }
            ];

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              // Since this is a path level parameter, all operations will get the same error
              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['parameters', 'fake', 'default']
                },
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'parameters', '0', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('schema reference', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.fake = {
              type: 'integer',
              default: 'fake'
            };
            swaggerObject.paths['/pets'].parameters = [
              {
                name: 'fake',
                  in: 'body',
                schema: {
                  $ref: '#/definitions/fake'
                }
              }
            ];

            delete swaggerObject.paths['/pets'].post.parameters;

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              // Since this is a path level parameter, all operations will get the same error
              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['definitions', 'fake', 'default']
                },
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'parameters', '0', 'schema', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_DEFINITION',
                  message: 'Definition is defined but is not used: #/definitions/newPet',
                  path: ['definitions', 'newPet']
                }
              ]);

              done();
            });
          });

          // Testing all other constraints is unnecessary since the same code that validates them is tested above
        });

        describe('operation response', function () {
          it('schema object', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.paths['/pets'].get.responses['201'] = {
              description: 'Fake response',
              schema: {
                type: 'integer',
                default: 'fake'
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'get', 'responses', '201', 'schema', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          it('schema reference', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.fake = {
              type: 'integer',
              default: 'fake'
            };
            swaggerObject.paths['/pets'].get.responses['201'] = {
              description: 'Fake response',
              schema: {
                $ref: '#/definitions/fake'
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['definitions', 'fake', 'default']
                },
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['paths', '/pets', 'get', 'responses', '201', 'schema', 'default']
                }
              ]);
              assert.equal(result.warnings.length, 0);

              done();
            });
          });

          // Testing all other constraints is unnecessary since the same code that validates them is tested above
        });

        describe('response definition', function () {
          it('schema object', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.responses = {
              fake: {
                description: 'Fake response',
                schema: {
                  type: 'integer',
                  default: 'fake'
                }
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['responses', 'fake', 'schema', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_RESPONSE',
                  message: 'Response is defined but is not used: #/responses/fake',
                  path: ['responses', 'fake']
                }
              ]);

              done();
            });
          });

          it('schema reference', function (done) {
            var swaggerObject = _.cloneDeep(petStoreJson);

            swaggerObject.definitions.fake = {
              type: 'integer',
              default: 'fake'
            };
            swaggerObject.responses = {
              fake: {
                description: 'Fake response',
                schema: {
                  $ref: '#/definitions/fake'
                }
              }
            };

            spec.validate(swaggerObject, function (err, result) {
              if (err) {
                throw err;
              }

              assert.deepEqual(result.errors, [
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['responses', 'fake', 'schema', 'default']
                },
                {
                  code: 'INVALID_TYPE',
                  message: 'Not a valid integer: fake',
                  path: ['definitions', 'fake', 'default']
                }
              ]);
              assert.deepEqual(result.warnings, [
                {
                  code: 'UNUSED_RESPONSE',
                  message: 'Response is defined but is not used: #/responses/fake',
                  path: ['responses', 'fake']
                }
              ]);

              done();
            });
          });

          // Testing all other constraints is unnecessary since the same code that validates them is tested above
        });
      });

      it('duplicate API path (equivalent)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.paths['/pets/{petId}'] = _.cloneDeep(swaggerObject.paths['/pets/{id}']);
        swaggerObject.paths['/pets/{petId}'].parameters[0].name = 'petId';
        swaggerObject.paths['/pets/{petId}'].delete.parameters[0].name = 'petId';

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'DUPLICATE_API_PATH',
              message: 'API path (or equivalent) already defined: /pets/{petId}',
              path: ['paths', '/pets/{petId}']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      describe('duplicate operation parameter (name+in)', function () {
        it('path level', function (done) {
          var swaggerObject = _.cloneDeep(petStoreJson);
          var cParam = _.cloneDeep(swaggerObject.paths['/pets/{id}'].parameters[0]);

          // Make the parameter not identical but still having the same id
          cParam.type = 'string';

          delete cParam.format;

          swaggerObject.paths['/pets/{id}'].parameters.push(cParam);

          spec.validate(swaggerObject, function (err, result) {
            if (err) {
              throw err;
            }

            // Since this is a path level parameter, all operations that do not override the property will get the error
            assert.deepEqual(result.errors, [
              {
                code: 'DUPLICATE_PARAMETER',
                message: 'Parameter already defined: id',
                path: ['paths', '/pets/{id}', 'parameters', '1', 'name']
              },
              {
                code: 'DUPLICATE_PARAMETER',
                message: 'Parameter already defined: id',
                path: ['paths', '/pets/{id}', 'get', 'parameters', '1', 'name']
              }
            ]);
            assert.equal(result.warnings.length, 0);

            done();
          });
        });

        it('path level (remote)', function (done) {
          var swaggerObject = _.cloneDeep(petStoreJson);
          var cPath = _.cloneDeep(swaggerObject.paths['/pets/{id}']);
          var cParam = _.cloneDeep(cPath.parameters[0]);

          // Make the parameter not identical but still having the same id
          cParam.type = 'string';

          delete cParam.format;

          cPath.parameters.push(cParam);

          swaggerObject.paths['/people/{id}'] = {
            $ref: 'https://rawgit.com/apigee-127/swagger-tools/master/test/browser/people.json#/paths/~1people~1{id}'
          };

          spec.validate(swaggerObject, function (err, result) {
            if (err) {
              throw err;
            }

            // Since this is a path level parameter, all operations that do not override the property will get the error
            assert.deepEqual(result.errors, [
              {
                code: 'DUPLICATE_PARAMETER',
                message: 'Parameter already defined: id',
                path: ['paths', '/people/{id}', 'parameters', '1', 'name']
              },
              {
                code: 'DUPLICATE_PARAMETER',
                message: 'Parameter already defined: id',
                path: ['paths', '/people/{id}', 'get', 'parameters', '1', 'name']
              }
            ]);
            assert.equal(result.warnings.length, 0);

            done();
          });
        });

        it('operation level', function (done) {
          var swaggerObject = _.cloneDeep(petStoreJson);
          var cParam = _.cloneDeep(swaggerObject.paths['/pets/{id}'].delete.parameters[0]);

          // Make the parameter not identical but still having the same id
          cParam.type = 'string';

          delete cParam.format;

          swaggerObject.paths['/pets/{id}'].delete.parameters.push(cParam);

          spec.validate(swaggerObject, function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.errors, [
              {
                code: 'DUPLICATE_PARAMETER',
                message: 'Parameter already defined: id',
                path: ['paths', '/pets/{id}', 'delete', 'parameters', '1', 'name']
              }
            ]);
            assert.equal(result.warnings.length, 0);

            done();
          });
        });

        it('operation level (remote)', function (done) {
          var swaggerObject = _.cloneDeep(petStoreJson);

          // Make the parameter not identical but still having the same id
          swaggerObject.paths['/pets/{id}'].delete.parameters[0].type = 'string';

          delete swaggerObject.paths['/pets/{id}'].delete.parameters[0].format;

          swaggerObject.paths['/pets/{id}'].delete.parameters.push({
            $ref: 'https://rawgit.com/apigee-127/swagger-tools/master/test/browser/people.json#/paths/~1people~1{id}/delete/parameters/0'
          });

          spec.validate(swaggerObject, function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.errors, [
              {
                code: 'DUPLICATE_PARAMETER',
                message: 'Parameter already defined: id',
                path: ['paths', '/pets/{id}', 'delete', 'parameters', '1', 'name']
              }
            ]);
            assert.equal(result.warnings.length, 0);

            done();
          });
        });
      });

      it('missing operation path parameter', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        delete swaggerObject.paths['/pets/{id}'].parameters;
        delete swaggerObject.paths['/pets/{id}'].delete.parameters;

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          // Since this is a path level parameter, all operations will get the same error
          assert.deepEqual(result.errors, [
            {
              code: 'MISSING_API_PATH_PARAMETER',
              message: 'API requires path parameter but it is not defined: id',
              path: ['paths', '/pets/{id}', 'delete']
            },
            {
              code: 'MISSING_API_PATH_PARAMETER',
              message: 'API requires path parameter but it is not defined: id',
              path: ['paths', '/pets/{id}', 'get']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('missing required model property', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        delete swaggerObject.definitions.Pet.properties.name;

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'MISSING_REQUIRED_DEFINITION_PROPERTY',
              message: 'Definition requires property but it is not defined: name',
              path: ['definitions', 'Pet', 'required', '1']
            },
            {
              code: 'MISSING_REQUIRED_DEFINITION_PROPERTY',
              message: 'Definition requires property but it is not defined: name',
              path: ['definitions', 'newPet', 'required', '0']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('model is subtype of one of its subtypes (Circular Inheritance)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        _.merge(swaggerObject.definitions, {
          Bar: {
            allOf: [
              {
                $ref: '#/definitions/Baz'
              }
            ],
            properties: {
              bar: {
                type: 'string'
              }
            }
          },
          Baz: {
            allOf: [
              {
                $ref: '#/definitions/Bar'
              }
            ],
            properties: {
              baz: {
                type: 'string'
              }
            }
          }
        });

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'CYCLICAL_DEFINITION_INHERITANCE',
              message: 'Definition has a circular inheritance: #/definitions/Bar -> #/definitions/Baz -> ' +
                '#/definitions/Bar',
              path: ['definitions', 'Bar', 'allOf']
            },
            {
              code: 'CYCLICAL_DEFINITION_INHERITANCE',
              message: 'Definition has a circular inheritance: #/definitions/Baz -> #/definitions/Bar -> ' +
                '#/definitions/Baz',
              path: ['definitions', 'Baz', 'allOf']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('unresolvable operation path parameter', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var newParam = _.cloneDeep(swaggerObject.paths['/pets/{id}'].parameters[0]);

        newParam.name = 'petId';

        swaggerObject.paths['/pets/{id}'].delete.parameters.push(newParam);

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'UNRESOLVABLE_API_PATH_PARAMETER',
              message: 'API path parameter could not be resolved: ' + newParam.name,
              path: ['paths', '/pets/{id}', 'delete', 'parameters', '1', 'name']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      describe('unresolvable model', function () {
        it('model definition', function (done) {
          var swaggerObject = _.cloneDeep(petStoreJson);

          swaggerObject.definitions.Fake = {
            properties: {
              project: {
                $ref: '#/definitions/Project'
              }
            }
          };

          spec.validate(swaggerObject, function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.errors, [
              {
                code: 'UNRESOLVABLE_DEFINITION',
                message: 'Definition could not be resolved: #/definitions/Project',
                path: ['definitions', 'Fake', 'properties', 'project', '$ref']
              }
            ]);
            assert.deepEqual(result.warnings, [
              {
                code: 'UNUSED_DEFINITION',
                message: 'Definition is defined but is not used: #/definitions/Fake',
                path: [
                  'definitions',
                  'Fake'
                ]
              }
            ]);

            done();
          });
        });

        it('parameter', function (done) {
          var swaggerObject = _.cloneDeep(petStoreJson);

          swaggerObject.paths['/pets'].post.parameters[0].schema.$ref = '#/definitions/Fake';

          spec.validate(swaggerObject, function (err, result) {
            if (err) {
              throw err;
            }

            assert.deepEqual(result.errors, [
              {
                code: 'UNRESOLVABLE_DEFINITION',
                message: 'Definition could not be resolved: #/definitions/Fake',
                path: ['paths', '/pets', 'post', 'parameters', '0', 'schema', '$ref']
              }
            ]);
            assert.deepEqual(result.warnings, [
              {
                code: 'UNUSED_DEFINITION',
                message: 'Definition is defined but is not used: #/definitions/newPet',
                path: [
                  'definitions',
                  'newPet'
                ]
              }
            ]);

            done();
          });
        });
      });

      it('unresolvable security definition (global)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.security = [
          {
            oauth3: ['write']
          }
        ];

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'UNRESOLVABLE_SECURITY_DEFINITION',
              message: 'Security definition could not be resolved: #/securityDefinitions/oauth3',
              path: ['security', '0', 'oauth3']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('unresolvable security definition (operation)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.paths['/pets'].get.security = [
          {
            oauth3: ['write']
          }
        ];

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'UNRESOLVABLE_SECURITY_DEFINITION',
              message: 'Security definition could not be resolved: #/securityDefinitions/oauth3',
              path: ['paths', '/pets', 'get', 'security', '0', 'oauth3']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('unresolvable security definition scope (global)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.security = [
          {
            oauth2: ['fake']
          }
        ];

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'UNRESOLVABLE_SECURITY_DEFINITION_SCOPE',
              message: 'Security definition scope could not be resolved: #/securityDefinitions/oauth2/scopes/fake',
              path: ['security', '0', 'oauth2', '0']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });

      it('unresolvable security definition scope (operation)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.paths['/pets'].get.security = [
          {
            oauth2: ['fake']
          }
        ];

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.errors, [
            {
              code: 'UNRESOLVABLE_SECURITY_DEFINITION_SCOPE',
              message: 'Security definition scope could not be resolved: #/securityDefinitions/oauth2/scopes/fake',
              path: ['paths', '/pets', 'get', 'security', '0', 'oauth2', '0']
            }
          ]);
          assert.equal(result.warnings.length, 0);

          done();
        });
      });
    });

    describe('should return warnings for semantically invalid JSON files', function () {
      // TODO: Validate duplicate authorization scope reference (API Declaration)
      //  Not possible due to https://github.com/swagger-api/swagger-spec/issues/159

      it('duplicate security definition reference (global)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.security = [
          {
            oauth2: ['write']
          },
          {
            oauth2: ['read']
          }
        ];

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'DUPLICATE_SECURITY_DEFINITION_REFERENCE',
              message: 'Security definition reference already defined: oauth2',
              path: ['security', '1', 'oauth2']
            }
          ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      it('duplicate security definition reference (operation)', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.paths['/pets'].get.security = [
          {
            oauth2: ['write']
          },
          {
            oauth2: ['read']
          }
        ];

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'DUPLICATE_SECURITY_DEFINITION_REFERENCE',
              message: 'Security definition reference already defined: oauth2',
              path: ['paths', '/pets', 'get', 'security', '1', 'oauth2']
            }
          ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      it('unused model', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.definitions.Person = {
          properties: {
            age: {
              type: 'integer'
            },
            name: {
              type: 'string'
            }
          }
        };

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'UNUSED_DEFINITION',
              message: 'Definition is defined but is not used: #/definitions/Person',
              path: ['definitions', 'Person']
            }
          ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      it('unused parameter', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.parameters = {
          fake: {
            name: 'fake',
            type: 'string',
              in: 'path'
          }
        };

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.equal(result.errors.length, 0);
          assert.deepEqual(result.warnings, [
            {
              code: 'UNUSED_PARAMETER',
              message: 'Parameter is defined but is not used: #/parameters/fake',
              path: ['parameters', 'fake']
            }
          ]);


          done();
        });
      });

      it('unused response', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.responses = {
          fake: {
            description: 'Fake response',
            schema: {
              type: 'string'
            }
          }
        };

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.equal(result.errors.length, 0);
          assert.deepEqual(result.warnings, [
            {
              code: 'UNUSED_RESPONSE',
              message: 'Response is defined but is not used: #/responses/fake',
              path: ['responses', 'fake']
            }
          ]);

          done();
        });
      });

      it('unused security definition', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.securityDefinitions.internalApiKey = {
          type: 'apiKey',
            in: 'header',
          name: 'api_key'
        };

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'UNUSED_SECURITY_DEFINITION',
              message: 'Security definition is defined but is not used: #/securityDefinitions/internalApiKey',
              path: ['securityDefinitions', 'internalApiKey']
            }
          ]);
          assert.equal(result.errors.length, 0);

          done();
        });
      });

      it('unused security definition scope', function (done) {
        var swaggerObject = _.cloneDeep(petStoreJson);

        swaggerObject.securityDefinitions.oauth2.scopes.fake = 'Fake security scope';

        spec.validate(swaggerObject, function (err, result) {
          if (err) {
            throw err;
          }

          assert.deepEqual(result.warnings, [
            {
              code: 'UNUSED_SECURITY_DEFINITION_SCOPE',
              message: 'Security definition scope is defined but is not used: #/securityDefinitions/oauth2/scopes/fake',
              path: ['securityDefinitions', 'oauth2', 'scopes', 'fake']
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
      var swaggerObject = _.cloneDeep(petStoreJson);
      var errors = {
        'swaggerObject is required': [],
        'swaggerObject must be an object': ['wrongType'],
        'modelRef is required': [swaggerObject],
        'callback is required': [swaggerObject, '#/definitions/Pet'],
        'callback must be a function': [swaggerObject, '#/definitions/Pet', 'wrongType'],
        'modelRef must be a JSON Pointer': [swaggerObject, 'Pet', function() {}, 'wrongType']
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
      spec.composeModel(_.cloneDeep(petStoreJson), '#/definitions/Liger', function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should throw an Error for an API Declaration that has invalid models', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.definitions.Person = {
        allOf: [
          {
            $ref: '#/definitions/Pet'
          }
        ],
        properties: {
          age: {
            type: 'integer'
          },
          name: {
            type: 'string'
          }
        }
      };

      swaggerObject.paths['/pets'].get.responses.default.schema.$ref = '#/definitions/Person';

      spec.composeModel(swaggerObject, '#/definitions/Pet', function (err, result) {
        assert.ok(_.isUndefined(result));

        assert.equal('The Swagger document(s) are invalid', err.message);
        assert.equal(1, err.errors.length);
        assert.equal(0, err.warnings.length);
        assert.deepEqual({
          code: 'CHILD_DEFINITION_REDECLARES_PROPERTY',
          message: 'Child definition declares property already declared by ancestor: name',
          path: ['definitions', 'Person', 'properties', 'name']
        }, err.errors[0]);

        done();
      });
    });

    it('should return a valid composed model', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);
      var ePet = _.cloneDeep(swaggerObject.definitions.Pet);
      var eResults = [];
      var eCompany;
      var eEmployee;
      var ePerson;

      swaggerObject.definitions.Person = {
        properties: {
          age: {
            type: 'integer'
          },
          name: {
            type: 'string'
          }
        },
        required: ['name'],
        discriminator: 'name'
      };

      swaggerObject.definitions.Employee = {
        allOf: [
          {
            $ref: '#/definitions/Person'
          }
        ],
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

      swaggerObject.definitions.Company = {
        properties: {
          name: {
            type: 'string'
          },
          employees: {
            type: 'array',
            items: {
              $ref: '#/definitions/Employee'
            }
          }
        }
      };

      // Create expected Employee
      eEmployee = _.cloneDeep(swaggerObject.definitions.Employee);

      eEmployee.title = 'Composed #/definitions/Employee';
      eEmployee.allOf = [
      _.cloneDeep(swaggerObject.definitions.Person)
      ];

      delete eEmployee.id;
      delete eEmployee.allOf[0].id;
      delete eEmployee.allOf[0].subTypes;

      // Create expected Person
      ePerson = _.cloneDeep(swaggerObject.definitions.Person);

      ePerson.title = 'Composed #/definitions/Person';

      delete ePerson.id;
      delete ePerson.subTypes;

      // Create expected Company
      eCompany = _.cloneDeep(swaggerObject.definitions.Company);

      eCompany.title = 'Composed #/definitions/Company';
      eCompany.properties.employees.items = {
        allOf: [
        _.cloneDeep(swaggerObject.definitions.Person)
        ],
        properties: _.cloneDeep(swaggerObject.definitions.Employee.properties),
        required: _.cloneDeep(swaggerObject.definitions.Employee.required)
      };

      delete eCompany.id;
      delete eCompany.properties.employees.items.allOf[0].id;
      delete eCompany.properties.employees.items.allOf[0].subTypes;

      // Create expected Pet
      ePet.title = 'Composed #/definitions/Pet';
      ePet.properties.category = _.cloneDeep(swaggerObject.definitions.Category);
      ePet.properties.id.maximum = 100;
      ePet.properties.id.minimum = 0;
      ePet.properties.tags = {
        items: {
          properties: _.cloneDeep(swaggerObject.definitions.Tag.properties)
        },
        type: 'array'
      };

      delete ePet.id;
      delete ePet.properties.category.id;

      // Collect our expected results
      eResults.push(eEmployee);
      eResults.push(ePerson);
      eResults.push(eCompany);
      eResults.push(ePet);

      async.map(['Employee', 'Person', 'Company', 'Pet'], function (modelId, callback) {
        spec.composeModel(swaggerObject, '#/definitions/' + modelId, function (err, results) {
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
    it('should throw an Error for an API Declaration that has invalid models', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.definitions.Person = {
        allOf: [
          {
            $ref: '#/definitions/Pet'
          }
        ],
        properties: {
          age: {
            type: 'integer'
          },
          name: {
            type: 'string'
          }
        }
      };

      swaggerObject.paths['/pets'].get.responses.default.schema.$ref = '#/definitions/Person';

      spec.composeModel(swaggerObject, '#/definitions/Pet', function (err, result) {
        assert.ok(_.isUndefined(result));

        assert.equal('The Swagger document(s) are invalid', err.message);
        assert.equal(1, err.errors.length);
        assert.equal(0, err.warnings.length);
        assert.deepEqual({
          code: 'CHILD_DEFINITION_REDECLARES_PROPERTY',
          message: 'Child definition declares property already declared by ancestor: name',
          path: ['definitions', 'Person', 'properties', 'name']
        }, err.errors[0]);

        done();
      });
    });

    it('should return errors/warnings for invalid model', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      spec.validateModel(swaggerObject, '#/definitions/Pet', {
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
      var swaggerObject = _.cloneDeep(petStoreJson);

      spec.validateModel(swaggerObject, '#/definitions/Pet', {
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
        'ptr must be a JSON Pointer string': [{}, [], function () {}]
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

    it('should return the whole document when there is no pointer argument', function (done) {
      spec.resolve(petStoreJson, function (err, resolved) {
        if (err) {
          throw err;
        }

        JsonRefs.resolveRefs(petStoreJson, function (err, json) {
          if (err) {
            throw err;
          }

          assert.deepEqual(json, resolved);

          done();
        });
      });
    });

    it('should return the document fragment corresponding to the pointer argument', function (done) {
      spec.resolve(petStoreJson, '#/definitions/Pet', function (err, resolved) {
        if (err) {
          throw err;
        }

        assert.deepEqual(JsonRefs.resolveRefs(petStoreJson, function (err, json) {
          if (err) {
            throw err;
          }

          assert.deepEqual(json.definitions.Pet, resolved);

          done();
        }));
      });
    });
  });

  describe('#convert', function () {
    it('should throw an Error (unsupported)', function () {
      try {
        spec.convert();

        assert.fail(null, null, 'Should had failed above');
      } catch (err) {
        assert.equal(err.message, 'Specification#convert only works for Swagger 1.2');
      }
    });
  });

  describe('issues', function () {
    // This should be removed when the upstream bug in the Swagger schema is fixed
    //   https://github.com/swagger-api/swagger-spec/issues/174
    it('missing items property for array type (Issue 62)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      delete swaggerObject.paths['/pets'].get.responses['200'].schema.items;

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.errors, [
          {
            code: 'OBJECT_MISSING_REQUIRED_PROPERTY',
            message: 'Missing required property: items',
            path: ['paths', '/pets', 'get', 'responses', '200', 'schema']
          }
        ]);
        assert.equal(result.warnings.length, 0);

        done();
      });
    });

    it('should not report missing model for inlines model schemas (Issue 61)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.definitions.Pet.properties.extraCategories = {
        type: 'array',
        items: _.cloneDeep(swaggerObject.definitions.Category)
      };

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should handle path parameters that are not path segments (Issue 72)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.paths['/export/{collection}.{format}'] = {
        get: {
          operationId: 'exportData',
          parameters: [
            {
              description: 'Collection name',
              name: 'collection',
              in: 'path',
              type: 'string'
            },
            {
              description: 'The export format',
              name: 'format',
              in: 'path',
              type: 'string'
            }
          ],
          responses: {
            '200': {
              description: 'Exported data',
              schema: {
                type: 'string'
              }
            },
            default: {
              description: 'Unexpected error',
              schema: {
                $ref: '#/definitions/Error'
              }
            }
          },
          summary: 'Export data in requested format'
        }
      };

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should not report errofs for non-operation path-properties (Issue 103)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.paths['/pets/{id}']['x-swagger-router-controller'] = 'Pets';

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('should not throw a runtime Error for missing response reference (Issue 120)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.paths['/pets'].get.responses['200'] = {
        $ref: '#/responses/missing'
      };

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.errors, [
          {
            code: 'UNRESOLVABLE_RESPONSE',
            message: 'Response could not be resolved: #/responses/missing',
            path: ['paths', '/pets', 'get', 'responses', '200', '$ref']
          }
        ]);
        assert.equal(result.warnings.length, 0);

        done();
      });
    });

    it('should not throw a runtime Error for missing schema allOf reference (Issue 121)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.definitions.newPet.allOf[0].$ref = '#/definitions/missing';

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.errors, [
          {
            code: 'MISSING_REQUIRED_DEFINITION_PROPERTY',
            message: 'Definition requires property but it is not defined: name',
            path: ['definitions', 'newPet', 'required', '0']
          },
          {
            code: 'UNRESOLVABLE_DEFINITION',
            message: 'Definition could not be resolved: #/definitions/missing',
            path: ['definitions', 'newPet', 'allOf', '0', '$ref']
          }
        ]);
        assert.equal(result.warnings.length, 0);

        done();
      });
    });

    it('void support should be limited to responses (Issue 124)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.definitions.Person = {
        default: {
          name: 'Anonymous Person'
        },
        properties: {
          name: {
            type: 'string'
          }
        },
        required: ['name']
      };

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.warnings, [
          {
            code: 'UNUSED_DEFINITION',
            message: 'Definition is defined but is not used: #/definitions/Person',
            path: [
              'definitions',
              'Person'
            ]
          }
        ]);
        assert.equal(result.errors.length, 0);

        done();
      });
    });

    it('do not assume definitions have properties attributes (Issue 122)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      swaggerObject.definitions.UberPet = {
        allOf: [
          {
            $ref: '#/definitions/Pet'
          }
        ]
      };

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.warnings, [
          {
            code: 'UNUSED_DEFINITION',
            message: 'Definition is defined but is not used: #/definitions/UberPet',
            path: [
              'definitions',
              'UberPet'
            ]
          }
        ]);
        assert.equal(result.errors.length, 0);

        done();
      });
    });

    it('should throw an error for an operation having more than one body parameter (Issue 136)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);
      var cBodyParam = _.cloneDeep(swaggerObject.paths['/pets'].post.parameters[0]);

      cBodyParam.name = 'duplicateBody';

      swaggerObject.paths['/pets'].post.parameters.push(cBodyParam);

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.deepEqual(result.errors, [
          {
            code: 'DULPICATE_API_BODY_PARAMETER',
            message: 'API has more than one body parameter',
            path: ['paths', '/pets', 'post', 'parameters', '1']
          }
        ]);
        assert.equal(result.warnings.length, 0);

        done();
      });
    });

    it('should handle operations with an empty parameters array (Issue 189)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);
      var cOperation = _.cloneDeep(swaggerObject.paths['/pets'].post);

      cOperation.operationId = 'putPet';
      cOperation.parameters = [];

      swaggerObject.paths['/pets'].put = cOperation;

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });

    it('inline models used for inheritance should not be marked as unused (Issue 187)', function (done) {
      var swaggerObject = _.cloneDeep(petStoreJson);

      // Definition
      swaggerObject.paths['/pets'].get.responses.default.schema = {
        allOf: [
          {
            properties: {
              age: {
                type: 'integer'
              },
              name: {
                type: 'string'
              }
            }
          }
        ]
      };

      // Parameter
      swaggerObject.paths['/pets'].post.parameters[0].schema = {
        allOf: [
          {
            properties: {
              age: {
                type: 'integer'
              },
              name: {
                type: 'string'
              }
            }
          }
        ]
      };

      // Response
      swaggerObject.paths['/pets'].get.responses.default.schema = {
        allOf: [
          {
            properties: {
              age: {
                type: 'integer'
              },
              name: {
                type: 'string'
              }
            }
          }
        ]
      };

      // Remove reference to avoid unused warning
      delete swaggerObject.definitions.newPet;

      spec.validate(swaggerObject, function (err, result) {
        if (err) {
          throw err;
        }

        assert.ok(_.isUndefined(result));

        done();
      });
    });
  });
});
