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
      assert.strictEqual(spec.docsUrl, 'https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md');
      assert.deepEqual(spec.primitives, ['string', 'number', 'boolean', 'integer', 'array', 'void', 'File']);
      assert.strictEqual(spec.schemasUrl, 'https://github.com/wordnik/swagger-spec/tree/master/schemas/v1.2');
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
        'apiDeclarations must be an array': [allSampleFiles['resource-listing.json'], 'wrongType']
      };

      _.each(errors, function (args, message) {
        try {
          spec.validate.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should return true for valid JSON files', function () {
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var userJson = _.cloneDeep(allSampleFiles['user.json']);

      assert.ok(_.isUndefined(spec.validate(rlJson, [petJson, storeJson, userJson])));
    });

    describe('should return errors for structurally invalid JSON files', function () {
      it('extra property', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        // Extra property
        userJson.apis[0].operations[0].authorizations.oauth2[0].extra = 'value';

        result = spec.validate(rlJson, [userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'VALIDATION_ADDITIONAL_PROPERTIES',
            message: 'Additional properties not allowed: extra',
            data: 'value',
            path: ['apis', '0', 'operations', '0', 'authorizations', 'oauth2', '0', 'extra']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('invalid type', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var result;

        storeJson.models.Order.description = false;

        result = spec.validate(rlJson, [storeJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'VALIDATION_INVALID_TYPE',
            message: 'Invalid type: boolean should be string',
            data: false,
            path: ['models', 'Order', 'description']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('missing required value', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var result;

        delete rlJson.apis;

        result = spec.validate(rlJson, [petJson]);

        assert.deepEqual(result.errors, [
          {
            code: 'VALIDATION_OBJECT_REQUIRED',
            message: 'Missing required property: apis',
            path: ['apis']
          }
        ]);
        assert.equal(result.warnings, 0);
      });

      it('wrong enum value', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var result;

        petJson.apis[1].operations[0].parameters[1].paramType = 'fake';

        result = spec.validate(rlJson, [petJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'VALIDATION_FAILED',
            message: 'Validation error: enum',
            data: 'fake',
            path: ['apis', '1', 'operations', '0', 'parameters', '1', 'paramType']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });
    });

    describe('should return errors for semantically invalid JSON files', function () {
      it('duplicate api paths in resource listing', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        rlJson.apis[2].path = rlJson.apis[0].path;

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.errors, [
          {
            code: 'DUPLICATE_RESOURCE_PATH',
            message: 'Resource path already defined: /pet',
            data: rlJson.apis[0].path,
            path: ['apis', '2', 'path']
          }
        ]);
        assert.equal(result.warnings.length, 0);
      });

      it('unused api path in resource listing', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        rlJson.apis.push({
          description: 'Operations on people',
          path: '/people'
        });

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.errors, [
          {
            code: 'UNUSED_RESOURCE_PATH',
            message: 'Resource path is defined but is not used: /people',
            data: rlJson.apis[3].path,
            path: ['apis', '3', 'path']
          }
        ]);
        assert.equal(result.warnings.length, 0);
      });

      it('duplicate consumes in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.consumes = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].warnings, [
          {
            code: 'DUPLICATE_API_CONSUMES',
            message: 'API consumes has duplicate items',
            data: petJson.consumes,
            path: ['consumes']
          }
        ]);
        assert.equal(result.apiDeclarations[0].errors.length, 0);
      });

      it('duplicate produces in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.produces = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].warnings, [
          {
            code: 'DUPLICATE_API_PRODUCES',
            message: 'API produces has duplicate items',
            data: petJson.produces,
            path: ['produces']
          }
        ]);
        assert.equal(result.apiDeclarations[0].errors.length, 0);
      });

      it('duplicate resource path in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        userJson.resourcePath = petJson.resourcePath;

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[2].errors, [
          {
            code: 'DUPLICATE_RESOURCE_PATH',
            message: 'Resource path already defined: /pet',
            data: rlJson.apis[0].path,
            path: ['resourcePath']
          }
        ]);
        assert.equal(result.apiDeclarations[2].warnings.length, 0);
      });

      it('unresolvable resource path in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newResourcePath = userJson.resourcePath + '/fake';
        var result;

        userJson.resourcePath = newResourcePath;

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[2].errors, [
          {
            code: 'UNRESOLVABLE_RESOURCE_PATH',
            message: 'Resource path could not be resolved: ' + newResourcePath,
            data: newResourcePath,
            path: ['resourcePath']
          }
        ]);
        assert.equal(result.apiDeclarations[2].warnings.length, 0);
      });

      it('duplicate api paths (verbatim) in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newPath = _.cloneDeep(petJson.apis[0]);
        var result;

        petJson.apis.push(newPath);

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'DUPLICATE_API_PATH',
            message: 'API path (or equivalent) already defined: /pet/{petId}',
            data: newPath.path,
            path: ['apis', petJson.apis.length - 1, 'path']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('duplicate api paths (equivalent) in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newPath = petJson.apis[0];
        var result;

        newPath.path = newPath.path.replace(/petId/, 'id');

        _.each(newPath.operations, function (operation) {
          _.each(operation.parameters, function (parameter) {
            if (parameter.paramType === 'path' && parameter.name === 'petId') {
              parameter.name = 'id';
            }
          });
        });

        petJson.apis.push(newPath);

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'DUPLICATE_API_PATH',
            message: 'API path (or equivalent) already defined: /pet/{id}',
            data: newPath.path,
            path: ['apis', petJson.apis.length - 1, 'path']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('duplicate operation consumes in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[0].consumes = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].warnings, [
          {
            code: 'DUPLICATE_OPERATION_CONSUMES',
            message: 'Operation consumes has duplicate items',
            data: petJson.apis[0].operations[0].consumes,
            path: ['apis', '0', 'operations', '0', 'consumes']
          }
        ]);
        assert.equal(result.apiDeclarations[0].errors.length, 0);
      });

      it('duplicate operation produces in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[0].produces = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].warnings, [
          {
            code: 'DUPLICATE_OPERATION_PRODUCES',
            message: 'Operation produces has duplicate items',
            data: petJson.apis[0].operations[0].produces,
            path: ['apis', '0', 'operations', '0', 'produces']
          }
        ]);
        assert.equal(result.apiDeclarations[0].errors.length, 0);
      });

      it('duplicate operation method in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[1].method = petJson.apis[0].operations[0].method;

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'DUPLICATE_OPERATION_METHOD',
            message: 'Operation method already defined: GET',
            data: petJson.apis[0].operations[1].method,
            path: ['apis', '0', 'operations', '1', 'method']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('unresolvable operation authorization in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[1].authorizations.oauth3 =
          _.cloneDeep(petJson.apis[0].operations[1].authorizations.oauth2);

        delete petJson.apis[0].operations[1].authorizations.oauth2;

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'UNRESOLVABLE_AUTHORIZATION',
            message: 'Authorization could not be resolved: oauth3',
            data: 'oauth3',
            path: ['apis', '0', 'operations', '1', 'authorizations', 'oauth3']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('unresolvable operation authorization scope in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[1].authorizations.oauth2[0].scope = 'fake';

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'UNRESOLVABLE_AUTHORIZATION_SCOPE',
            message: 'Authorization scope could not be resolved: fake',
            data: 'fake',
            path: ['apis', '0', 'operations', '1', 'authorizations', 'oauth2', '0', 'scope']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      // Should we be writing tests for the operation parameter constraints (default values) even though the same code
      // to validate them is the same one for swagger-validator which is already tested?

      it('duplicate operation responseMessage code in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[0].responseMessages.push(petJson.apis[0].operations[0].responseMessages[0]);

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'DUPLICATE_RESPONSE_MESSAGE_CODE',
            message: 'Response message code already defined: ' + petJson.apis[0].operations[0].responseMessages[0].code,
            data: petJson.apis[0].operations[0].responseMessages[0].code,
            path: ['apis', '0', 'operations', '0', 'responseMessages', '2', 'code']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('duplicate model id in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.models.Duplicate = _.cloneDeep(petJson.models.Category);

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'DUPLICATE_MODEL_DEFINITION',
            message: 'Model already defined: ' + petJson.models.Category.id,
            data: petJson.models.Category.id,
            path: ['models', 'Duplicate', 'id']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      // Should we be writing tests for the model property constraints (default values) even though the same code to
      // validate them is the same one for swagger-validator which is already tested?

      it('missing required model property in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.models.Category.required = ['name', 'tags'];

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'MISSING_REQUIRED_MODEL_PROPERTY',
            message: 'Model requires property but it is not defined: tags',
            data: 'tags',
            path: ['models', 'Category', 'required', '1']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('unused authorization in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.authorizations = {
          apiKey: {
            type: 'apiKey',
            passAs: 'header',
            keyname: 'Fake-Auth-Header'
          }
        };

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].warnings, [
          {
            code: 'UNUSED_AUTHORIZATION',
            message: 'Authorization is defined but is not used: apiKey',
            data: petJson.authorizations.apiKey,
            path: ['authorizations', 'apiKey']
          }
        ]);
        assert.equal(result.apiDeclarations[0].errors.length, 0);
      });

      it('unused authorization scope in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.authorizations = _.cloneDeep(rlJson.authorizations);

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].warnings, [
          {
            code: 'UNUSED_AUTHORIZATION_SCOPE',
            message: 'Authorization scope is defined but is not used: test:anything',
            data: petJson.authorizations.oauth2.scopes[2],
            path: ['authorizations', 'oauth2', 'scopes', '2']
          }
        ]);
        assert.equal(result.apiDeclarations[0].errors.length, 0);
      });

      it('unresolvable model in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[0].type = 'Fake';

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'UNRESOLVABLE_MODEL',
            message: 'Model could not be resolved: Fake',
            data: 'Fake',
            path: ['apis', '0', 'operations', '0', 'type']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('unused model in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

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

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].warnings, [
          {
            code: 'UNUSED_MODEL',
            message: 'Model is defined but is not used: Person',
            data: petJson.models.Person,
            path: ['models', 'Person']
          }
        ]);
        assert.equal(result.apiDeclarations[0].errors.length, 0);
      });

      it('child model redeclares property in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

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

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'CHILD_MODEL_REDECLARES_PROPERTY',
            message: 'Child model declares property already declared by ancestor: name',
            data: petJson.models.Person.properties.name,
            path: ['models', 'Person', 'properties', 'name']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('model multiple inheritance in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

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

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'MULTIPLE_MODEL_INHERITANCE',
            message: 'Child model is sub type of multiple models: Tag && Human',
            data: petJson.models.Person,
            path: ['models', 'Person']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('cyclical model inheritance in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

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

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'CYCLICAL_MODEL_INHERITANCE',
            message: 'Model has a circular inheritance: Baz -> Bar -> Baz',
            data: ['Bar'],
            path: ['models', 'Baz', 'subTypes']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('duplicate operation parameter in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[0].parameters.push(petJson.apis[0].operations[0].parameters[0]);

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'DUPLICATE_OPERATION_PARAMETER',
            message: 'Operation parameter already defined: petId',
            data: 'petId',
            path: ['apis', '0', 'operations', '0', 'parameters', '1', 'name']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('unresolvable operation path parameter in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var newParam = _.cloneDeep(petJson.apis[0].operations[0].parameters[0]);
        var result;

        newParam.name = 'fake';

        petJson.apis[0].operations[0].parameters.push(newParam);

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'UNRESOLVABLE_API_PATH_PARAMETER',
            message: 'API path parameter could not be resolved: ' + newParam.name,
            data: newParam.name,
            path: ['apis', '0', 'operations', '0', 'parameters', '1', 'name']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      it('missing operation path parameter in API declaration', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        petJson.apis[0].operations[0].parameters = [];

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'MISSING_API_PATH_PARAMETER',
            message: 'API requires path parameter but it is not defined: petId',
            data: petJson.apis[0].path,
            path: ['apis', '0', 'path']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });

      // This should be removed when the upstream bug in the Swagger schema is fixed
      //   https://github.com/swagger-api/swagger-spec/issues/174
      it('missing items property for array type', function() {
        var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
        var petJson = _.cloneDeep(allSampleFiles['pet.json']);
        var storeJson = _.cloneDeep(allSampleFiles['store.json']);
        var userJson = _.cloneDeep(allSampleFiles['user.json']);
        var result;

        delete petJson.apis[0].operations[2].items;

        result = spec.validate(rlJson, [petJson, storeJson, userJson]);

        console.log(result.apiDeclarations[0].errors);

        assert.deepEqual(result.apiDeclarations[0].errors, [
          {
            code: 'OBJECT_MISSING_REQUIRED_PROPERTY',
            message: 'Missing required property: items',
            data: petJson.apis[0].operations[2],
            path: ['apis', '0', 'operations', '2']
          }
        ]);
        assert.equal(result.apiDeclarations[0].warnings.length, 0);
      });
    });
  });

  describe('#composeModel', function () {
    it('should fail when passed the wrong arguments', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var errors = {
        'apiDeclaration is required': [],
        'apiDeclaration must be an object': ['wrongType'],
        'modelId is required': [petJson]
      };

      _.each(errors, function (args, message) {
        try {
          spec.composeModel.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should return undefined for unresolvable model', function () {
      assert.ok(_.isUndefined(spec.composeModel(_.cloneDeep(allSampleFiles['pet.json']), 'Liger')));
    });

    it('should throw an Error for an API Declaration that has invalid models', function () {
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

      try {
        spec.composeModel(petJson, 'Person');
        assert.fail(null, null, 'Should had failed above');
      } catch (err) {
        assert.equal('The models are invalid and model composition is not possible', err.message);
        assert.equal(1, err.errors.length);
        assert.equal(0, err.warnings.length);
        assert.deepEqual({
          code: 'CHILD_MODEL_REDECLARES_PROPERTY',
          message: 'Child model declares property already declared by ancestor: name',
          data: petJson.models.Person.properties.name,
          path: ['models', 'Person', 'properties', 'name']
        }, err.errors[0]);
      }
    });

    it('should return a valid composed model', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var cPet = _.cloneDeep(petJson.models.Pet);

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

      // Add a reference so an error isn't thrown for a missing reference
      petJson.apis[0].operations[0].type = 'Person';

      assert.deepEqual(spec.composeModel(petJson, 'Employee'), {
        title: 'Composed Employee',
        type: 'object',
        properties: _.merge(_.cloneDeep(petJson.models.Person.properties),
                            _.cloneDeep(petJson.models.Employee.properties)),
        required: _.uniq([].concat(petJson.models.Person.required, petJson.models.Employee.required))
      });

      assert.deepEqual(spec.composeModel(petJson, 'Person'), {
        title: 'Composed Person',
        type: 'object',
        properties: petJson.models.Person.properties,
        required: petJson.models.Person.required
      });

      // Prepare our Pet for comparison

      delete cPet.id;

      cPet.title = 'Composed Pet';
      cPet.type = 'object';
      cPet.properties.category = {
        properties: petJson.models.Category.properties,
        type: 'object'
      };
      cPet.properties.tags = {
        items: {
          properties: petJson.models.Tag.properties,
          type: 'object'
        },
        type: 'array'
      };

      assert.deepEqual(spec.composeModel(petJson, 'Pet'), cPet);
    });
  });

  describe('#validateModel', function () {
    it('should throw an Error for an API Declaration that has invalid models', function () {
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

      try {
        spec.composeModel(petJson, 'Person');
        assert.fail(null, null, 'Should had failed above');
      } catch (err) {
        assert.equal('The models are invalid and model composition is not possible', err.message);
        assert.equal(1, err.errors.length);
        assert.equal(0, err.warnings.length);
        assert.deepEqual({
          code: 'CHILD_MODEL_REDECLARES_PROPERTY',
          message: 'Child model declares property already declared by ancestor: name',
          data: petJson.models.Person.properties.name,
          path: ['models', 'Person', 'properties', 'name']
        }, err.errors[0]);
      }
    });

    it('should return errors/warnings for invalid model', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var result = spec.validateModel(petJson, 'Pet', {
        id: 1
      });

      assert.deepEqual(result.errors, [
        {
          code: 'VALIDATION_OBJECT_REQUIRED',
          message: 'Missing required property: name',
          path: ['name']
        }
      ]);
    });

    it('should return undefined for valid model', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var result = spec.validateModel(petJson, 'Pet', {
        id: 1,
        name: 'Jeremy'
      });

      assert.ok(_.isUndefined(result));
    });
  });
});
