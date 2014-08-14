/* global describe, it */

/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Module requirements
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
      _.each(['pet.json', 'store.json', 'user.json'], function (name) {
        assert.ok(_.isUndefined(spec.validate(allSampleFiles['resource-listing.json'], [allSampleFiles[name]])));
      });
    });

    it('should return errors for structurally invalid JSON files', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var petErrors = [
        {
          code: 'VALIDATION_FAILED',
          message: 'Validation error: enum',
          data: 'body',
          path: ['apis', '1', 'operations', '0', 'parameters', '1', 'paramType']
        }
      ];
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var rlErrors = [
        {
          code: 'VALIDATION_OBJECT_REQUIRED',
          message: 'Missing required property: apis',
          path: ['apis']
        }
      ];
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var storeErrors = [
        {
          code: 'VALIDATION_INVALID_TYPE',
          message: 'Invalid type: boolean should be string',
          data: false,
          path: ['models', 'Order', 'description']
        }
      ];
      var userJson = _.cloneDeep(allSampleFiles['user.json']);
      var userErrors = [
        {
          code: 'VALIDATION_ADDITIONAL_PROPERTIES',
          message: 'Additional properties not allowed: extra',
          data: 'value',
          path: ['apis', '0', 'operations', '0', 'authorizations', 'oauth2', '0', 'extra']
        }
      ];

      // Wrong enum value
      petJson.apis[1].operations[0].parameters[1].paramType = 'body';

      // Missing required
      delete rlJson.apis;

      // Wrong type
      storeJson.models.Order.description = false;

      // Extra property
      userJson.apis[0].operations[0].authorizations.oauth2[0].extra = 'value';

      // Validate the resource listing first
      assert.deepEqual(spec.validate(rlJson, [petJson]).errors, rlErrors);
      assert.equal(spec.validate(rlJson, [petJson]).warnings, 0);

      rlJson = allSampleFiles['resource-listing.json'];

      // Make sure the resource listing is no longer failing
      assert.deepEqual(spec.validate(rlJson, [petJson]).errors.length, 0);
      assert.equal(spec.validate(rlJson, [petJson]).warnings.length, 0);

      // Validate the invalid API Declarations
      assert.deepEqual(spec.validate(rlJson, [petJson]).apiDeclarations[0].errors, petErrors);
      assert.equal(spec.validate(rlJson, [petJson]).apiDeclarations[0].warnings.length, 0);
      assert.deepEqual(spec.validate(rlJson, [storeJson]).apiDeclarations[0].errors, storeErrors);
      assert.equal(spec.validate(rlJson, [storeJson]).apiDeclarations[0].warnings.length, 0);
      assert.deepEqual(spec.validate(rlJson, [userJson]).apiDeclarations[0].errors, userErrors);
      assert.equal(spec.validate(rlJson, [userJson]).apiDeclarations[0].warnings.length, 0);
    });
  });
});
