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
var invalidModelRefsJson = require('./v1_2-invalid-model-refs.json');
var invalidModelsJson = require('./v1_2-invalid-models.json');

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
    it('should have proper docsUrl, primitives, options, schemasUrl and verison properties', function () {
      assert.deepEqual(spec.options, {
        validator: {
          useDefault: false,
          useCoerce: false,
          checkRequired: true,
          removeAdditional: false
        }
      });
      assert.strictEqual(spec.docsUrl, 'https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md');
      assert.deepEqual(spec.primitives, [
        'integer',
        'long',
        'float',
        'double',
        'string',
        'byte',
        'boolean',
        'date',
        'dateTime'
      ]);
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

    it('should return errors for structurally invalid JSON files', function () {
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

      assert.deepEqual(spec.validate(petJson).errors, petErrors);
      assert.equal(spec.validate(petJson).warnings, 0);
      assert.deepEqual(spec.validate(rlJson, 'resourceListing.json').errors, rlErrors);
      assert.equal(spec.validate(rlJson, 'resourceListing.json').warnings, 0);
      assert.deepEqual(spec.validate(storeJson).errors, storeErrors);
      assert.equal(spec.validate(storeJson).warnings, 0);
      assert.deepEqual(spec.validate(userJson).errors, userErrors);
      assert.equal(spec.validate(userJson).warnings, 0);
    });

    it('should return errors for missing model references in apiDeclaration files', function () {
      var result = spec.validate(invalidModelRefsJson);
      var expectedMissingModelRefs = {
        'MissingParamRef': '$.apis[0].operations[0].parameters[0].type',
        'MissingParamItemsRef': '$.apis[0].operations[0].parameters[1].items.$ref',
        'MissingResponseMessageRef': '$.apis[0].operations[0].responseMessages[0].responseModel',
        'MissingTypeRef': '$.apis[0].operations[0].type',
        'MissingTypeItemsRef': '$.apis[1].operations[0].items.$ref',
        'MissingPropertyItemsRef': '$.models[\'Animal\'].properties[\'breeds\'].items.$ref',
        'MissingSubTypeRef': '$.models[\'Animal\'].subTypes[1]',
        'MissingPropertyRef': '$.models[\'Cat\'].properties[\'address\'].$ref'
      };

      assert.equal(result.errors.length, Object.keys(expectedMissingModelRefs).length);

      result.errors.forEach(function (error) {
        assert.equal(error.code, 'UNRESOLVABLE_MODEL_REFERENCE');
        assert.equal(error.message, 'Model reference could not be resolved: ' + error.data);
        assert.equal(error.path, expectedMissingModelRefs[error.data]);
      });
    });

    it('should return warnings for unused models in apiDeclaration files', function () {
      var result = spec.validate(invalidModelRefsJson);

      assert.equal(1, result.warnings.length);

      assert.deepEqual(result.warnings[0], {
        code: 'UNUSED_MODEL',
        message: 'Model is defined but is not used: Animal',
        data: 'Animal',
        path: '$.models[\'Animal\']'
      });
    });

    it('should return errors for duplicate model ids in apiDeclaration files', function () {
      var errors = [];

      spec.validate(invalidModelsJson).errors.forEach(function (error) {
        if (error.code === 'DUPLICATE_MODEL_DEFINITION') {
          errors.push(error);
        }
      });

      assert.deepEqual(errors, [
        {
          code: 'DUPLICATE_MODEL_DEFINITION',
          message: 'Model already defined: A',
          data: 'A',
          path: '$.models[\'J\'].id'
        }
      ]);
    });

    it('should return errors for cyclical model subTypes in apiDeclaration files', function () {
      var errors = [];

      spec.validate(invalidModelsJson).errors.forEach(function (error) {
        if (error.code === 'CYCLICAL_MODEL_INHERITANCE') {
          errors.push(error);
        }
      });

      assert.deepEqual(errors, [
        {
          code: 'CYCLICAL_MODEL_INHERITANCE',
          message: 'Model has a circular inheritance: C -> A -> D -> C',
          data: ['D'],
          path: '$.models[\'C\'].subTypes'
        },
        {
          code: 'CYCLICAL_MODEL_INHERITANCE',
          message: 'Model has a circular inheritance: H -> I -> H',
          data: ['I', 'I'],
          path: '$.models[\'H\'].subTypes'
        }
      ]);
    });

    it('should return errors for model multiple inheritance in apiDeclaration files', function () {
      var errors = [];

      spec.validate(invalidModelsJson).errors.forEach(function (error) {
        if (error.code === 'MULTIPLE_MODEL_INHERITANCE') {
          errors.push(error);
        }
      });

      assert.deepEqual(errors, [
        {
          code: 'MULTIPLE_MODEL_INHERITANCE',
          message: 'Child model is sub type of multiple models: A && E',
          data: invalidModelsJson.models.B,
          path: '$.models[\'B\']'
        }
      ]);
    });

    it('should return errors for model subTypes redeclaring ancestor properties apiDeclaration files', function () {
      var errors = [];

      spec.validate(invalidModelsJson).errors.forEach(function (error) {
        if (error.code === 'CHILD_MODEL_REDECLARES_PROPERTY') {
          errors.push(error);
        }
      });

      assert.deepEqual(errors, [
        {
          code: 'CHILD_MODEL_REDECLARES_PROPERTY',
          message: 'Child model declares property already declared by ancestor: fId',
          data: invalidModelsJson.models.G.properties.fId,
          path: '$.models[\'G\'].properties[\'fId\']'
        }
      ]);
    });

    it('should return warning for model subTypes with duplicate entries apiDeclaration files', function () {
      var warnings = [];

      spec.validate(invalidModelsJson).warnings.forEach(function (warning) {
        if (warning.code === 'DUPLICATE_MODEL_SUBTYPE_DEFINITION') {
          warnings.push(warning);
        }
      });

      assert.deepEqual(warnings, [
        {
          code: 'DUPLICATE_MODEL_SUBTYPE_DEFINITION',
          message: 'Model already has subType defined: I',
          data: 'I',
          path: '$.models[\'H\'].subTypes[1]'
        }
      ]);
    });
  });
});
