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
var spec = require('../').v1_2; // jshint ignore:line

var allSchemaFiles = [
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
];
var allSampleFiles = {};

// Load the sample files from disk
fs.readdirSync(path.join(__dirname, '..', 'samples', '1.2'))
  .filter(function (name) {
    return name.match(/^(.*)\.json$/);
  })
  .forEach(function (name) {
    allSampleFiles[name] = require('../samples/1.2/' + name);
  });

describe('swagger-tools v1.2 Specification', function () {
  describe('metadata', function () {
    it('should have proper docsUrl, options, schemasUrl and verison properties', function () {
      assert.deepEqual(spec.options, {
        useDefault: false,
        useCoerce: false,
        checkRequired: true,
        removeAdditional: false
      });
      assert.strictEqual(spec.docsUrl, 'https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md');
      assert.strictEqual(spec.schemasUrl, 'https://github.com/wordnik/swagger-spec/tree/master/schemas/v1.2');
      assert.strictEqual(spec.version, '1.2');
    });
  });

  describe('schemas', function () {
    it('should contain all schema files', function () {
      assert.deepEqual(Object.keys(spec.schemas), allSchemaFiles);
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
      assert.deepEqual(Object.keys(spec.validators), allSchemaFiles);
    });
  });

  describe('#validate', function () {
    it('should return true for valid JSON files', function () {
      Object.keys(allSampleFiles).forEach(function (name) {
        var result;

        switch (name) {
        case 'pet.json':
        case 'store.json':
        case 'user.json':
          result = spec.validate(allSampleFiles[name]);

          break;
        case 'resource-listing.json':
          result = spec.validate(allSampleFiles[name], 'resourceListing.json');

          break;
        default:
          throw new Error('Unexpected sample file: ' + name);
        }

        assert.ok(_.isUndefined(result));
      });
    });

    it('should return false for invalid JSON files', function () {
      var petJson = _.cloneDeep(allSampleFiles['pet.json']);
      var petErrors = [
        {
          code: 'VALIDATION_FAILED',
          message: 'Validation error: enum',
          data: 'body',
          path: '$.apis[1].operations[0].parameters[1].paramType'
        }
      ];
      var rlJson = _.cloneDeep(allSampleFiles['resource-listing.json']);
      var rlErrors = [
        {
          code: 'VALIDATION_OBJECT_REQUIRED',
          message: 'Missing required property: apis',
          path: '$.apis'
        }
      ];
      var storeJson = _.cloneDeep(allSampleFiles['store.json']);
      var storeErrors = [
        {
          code: 'VALIDATION_INVALID_TYPE',
          message: 'Invalid type: boolean should be string',
          data: false,
          path: '$.models.Order.description'
        }
      ];
      var userJson = _.cloneDeep(allSampleFiles['user.json']);
      var userErrors = [
        {
          code: 'VALIDATION_ADDITIONAL_PROPERTIES',
          message: 'Additional properties not allowed: extra',
          data: 'value',
          path: '$.apis[0].operations[0].authorizations.oauth2[0].extra'
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

      assert.deepEqual(spec.validate(petJson), petErrors);
      assert.deepEqual(spec.validate(rlJson, 'resourceListing.json'), rlErrors);
      assert.deepEqual(spec.validate(storeJson), storeErrors);
      assert.deepEqual(spec.validate(userJson), userErrors);
    });
  });
});
