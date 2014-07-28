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
var invalidApiResourceListingJson = require('./json/v1_2-invalid-api-resource-listing.json');
var invalidApiResource1Json = require('./json/v1_2-invalid-api-resource1.json');
var invalidApiResource2Json = require('./json/v1_2-invalid-api-resource2.json');
var invalidApiResource3Json = require('./json/v1_2-invalid-api-resource3.json');
var invalidModelMiscJson = require('./json/v1_2-invalid-model-misc.json');
var invalidModelRefsJson = require('./json/v1_2-invalid-model-refs.json');
var invalidModelInheritanceJson = require('./json/v1_2-invalid-model-inheritance.json');
var invalidOperationMiscJson = require('./json/v1_2-invalid-operation-misc.json');
var findAllErrorsOrWarnings = function (type, code, results) {
  var arr = [];
  var finder = function (result) {
    if (result.code === code) {
      arr.push(result);
    }
  };

  if (_.isArray(results)) {
    results.forEach(function (resource) {
      resource[type].forEach(finder);
    });
  } else {
    results[type].forEach(finder);
  }

  return arr;
};
var petJson = require('../samples/1.2/pet.json');
var resourceListJson = require('../samples/1.2/resource-listing.json');

// Load the sample files from disk
fs.readdirSync(path.join(__dirname, '..', 'samples', '1.2'))
  .filter(function (name) {
    return name.match(/^(.*)\.json$/);
  })
  .forEach(function (name) {
    allSampleFiles[name] = require('../samples/1.2/' + name);
  });

describe('Specification v1.2', function () {
  describe('metadata', function () {
    it('should have proper docsUrl, primitives, options, schemasUrl and verison properties', function () {
      assert.strictEqual(spec.docsUrl, 'https://github.com/wordnik/swagger-spec/blob/master/versions/1.2.md');
      assert.deepEqual(spec.primitives, [
        'integer',
        'long',
        'float',
        'double',
        'number',
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
    it('should fail when passed the wrong arguments', function () {
      var errors = {
        'data is required': [],
        'data must be an object': ['wrongType']
      };

      _.each(errors, function (args, message) {
        try {
          spec.validate.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should throw error when using invalid schema name', function () {
      try {
        spec.validate(allSampleFiles['pet.json'], 'fakeSchema.json');
      } catch (err) {
        assert.equal(err.message, 'schemaName is not valid (fakeSchema.json).  Valid schema names: ' +
                     Object.keys(spec.schemas).join(', '));
      }
    });

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
        'MissingParamRef': ['apis', '0', 'operations', '0', 'parameters', '0', 'type'],
        'MissingParamItemsRef': ['apis', '0', 'operations', '0', 'parameters', '1', 'items', '$ref'],
        'MissingResponseMessageRef': ['apis', '0', 'operations', '0', 'responseMessages', '0', 'responseModel'],
        'MissingTypeRef': ['apis', '0', 'operations', '0', 'type'],
        'MissingTypeItemsRef': ['apis', '1', 'operations', '0', 'items', '$ref'],
        'MissingPropertyItemsRef': ['models', 'Animal', 'properties', 'breeds', 'items', '$ref'],
        'MissingSubTypeRef': ['models', 'Animal', 'subTypes', '1'],
        'MissingPropertyRef': ['models', 'Cat', 'properties', 'address', '$ref']
      };

      assert.equal(result.errors.length, Object.keys(expectedMissingModelRefs).length);

      result.errors.forEach(function (error) {
        assert.equal(error.code, 'UNRESOLVABLE_MODEL_REFERENCE');
        assert.equal(error.message, 'Model reference could not be resolved: ' + error.data);
        assert.deepEqual(error.path, expectedMissingModelRefs[error.data]);
      });
    });

    it('should return warnings for unused models in apiDeclaration files', function () {
      var result = spec.validate(invalidModelRefsJson);

      assert.equal(1, result.warnings.length);

      assert.deepEqual(result.warnings[0], {
        code: 'UNUSED_MODEL',
        message: 'Model is defined but is not used: Animal',
        data: 'Animal',
        path: ['models', 'Animal']
      });
    });

    it('should return errors for duplicate model ids in apiDeclaration files', function () {
      var result = spec.validate(invalidModelInheritanceJson);
      var errors = findAllErrorsOrWarnings('errors', 'DUPLICATE_MODEL_DEFINITION', result);

      assert.deepEqual(errors, [
        {
          code: 'DUPLICATE_MODEL_DEFINITION',
          message: 'Model already defined: A',
          data: 'A',
          path: ['models', 'J', 'id']
        }
      ]);
    });

    it('should return errors for cyclical model subTypes in apiDeclaration files', function () {
      var result = spec.validate(invalidModelInheritanceJson);
      var errors = findAllErrorsOrWarnings('errors', 'CYCLICAL_MODEL_INHERITANCE', result);

      assert.deepEqual(errors, [
        {
          code: 'CYCLICAL_MODEL_INHERITANCE',
          message: 'Model has a circular inheritance: C -> A -> D -> C',
          data: ['D'],
          path: ['models', 'C', 'subTypes']
        },
        {
          code: 'CYCLICAL_MODEL_INHERITANCE',
          message: 'Model has a circular inheritance: H -> I -> H',
          data: ['I', 'I'],
          path: ['models', 'H', 'subTypes']
        }
      ]);
    });

    it('should return errors for model multiple inheritance in apiDeclaration files', function () {
      var result = spec.validate(invalidModelInheritanceJson);
      var errors = findAllErrorsOrWarnings('errors', 'MULTIPLE_MODEL_INHERITANCE', result);

      assert.deepEqual(errors, [
        {
          code: 'MULTIPLE_MODEL_INHERITANCE',
          message: 'Child model is sub type of multiple models: A && E',
          data: invalidModelInheritanceJson.models.B,
          path: ['models', 'B']
        }
      ]);
    });

    it('should return errors for model subTypes redeclaring ancestor properties in apiDeclaration files', function () {
      var result = spec.validate(invalidModelInheritanceJson);
      var errors = findAllErrorsOrWarnings('errors', 'CHILD_MODEL_REDECLARES_PROPERTY', result);

      assert.deepEqual(errors, [
        {
          code: 'CHILD_MODEL_REDECLARES_PROPERTY',
          message: 'Child model declares property already declared by ancestor: fId',
          data: invalidModelInheritanceJson.models.G.properties.fId,
          path: ['models', 'G', 'properties', 'fId']
        }
      ]);
    });

    it('should return warning for model subTypes with duplicate entries in apiDeclaration files', function () {
      var result = spec.validate(invalidModelInheritanceJson);
      var warnings = findAllErrorsOrWarnings('warnings', 'DUPLICATE_MODEL_SUBTYPE_DEFINITION', result);

      assert.deepEqual(warnings, [
        {
          code: 'DUPLICATE_MODEL_SUBTYPE_DEFINITION',
          message: 'Model already has subType defined: I',
          data: 'I',
          path: ['models', 'H', 'subTypes', '1']
        }
      ]);
    });

    it('should return errors for model with invalid discriminator in apiDeclaration files', function () {
      var result = spec.validate(invalidModelMiscJson);
      var errors = findAllErrorsOrWarnings('errors', 'INVALID_MODEL_DISCRIMINATOR', result);

      assert.deepEqual(errors, [
        {
          code: 'INVALID_MODEL_DISCRIMINATOR',
          message: 'Model cannot have discriminator without subTypes: aId',
          data: 'aId',
          path: ['models', 'A', 'discriminator']
        }
      ]);
    });

    it('should return errors for model with missing required property in apiDeclaration files', function () {
      var result = spec.validate(invalidModelMiscJson);
      var errors = findAllErrorsOrWarnings('errors', 'MISSING_REQUIRED_MODEL_PROPERTY', result);

      assert.deepEqual(errors, [
        {
          'code': 'MISSING_REQUIRED_MODEL_PROPERTY',
          'message': 'Model requires property but it is not defined: bId',
          'data': 'bId',
          'path': ['models', 'A', 'required', '1']
        }
      ]);
    });

    it('should return warning for operations with duplicate method apiDeclaration files', function () {
      var result = spec.validate(invalidOperationMiscJson);
      var errors = findAllErrorsOrWarnings('errors', 'DUPLICATE_OPERATION_METHOD', result);

      assert.deepEqual(errors, [
        {
          code: 'DUPLICATE_OPERATION_METHOD',
          message: 'Operation method already defined: GET',
          data: 'GET',
          path: ['apis', '0', 'operations', '1', 'method']
        }
      ]);
    });

    it('should return warning for operations with duplicate nickname apiDeclaration files', function () {
      var result = spec.validate(invalidOperationMiscJson);
      var errors = findAllErrorsOrWarnings('errors', 'DUPLICATE_OPERATION_NICKNAME', result);

      assert.deepEqual(errors, [
        {
          code: 'DUPLICATE_OPERATION_NICKNAME',
          message: 'Operation method already defined: getGreeting',
          data: 'getGreeting',
          path: ['apis', '0', 'operations', '1', 'nickname']
        }
      ]);
    });

    it('should return warning for operations with responseMessage codes nickname apiDeclaration files', function () {
      var result = spec.validate(invalidOperationMiscJson);
      var errors = findAllErrorsOrWarnings('errors', 'DUPLICATE_OPERATION_RESPONSEMESSAGE_CODE', result);

      assert.deepEqual(errors, [
        {
          code: 'DUPLICATE_OPERATION_RESPONSEMESSAGE_CODE',
          message: 'Operation responseMessage code already defined: 400',
          data: 400,
          path: ['apis', '0', 'operations', '0', 'responseMessages', '1', 'code']
        }
      ]);
    });

    it('should return warning for operation with 121+ character summary length in apiDeclaration files', function () {
      var json = _.cloneDeep(invalidOperationMiscJson);
      var summary = new Array(122).join('.');
      var warnings = [];
      var result;

      json.apis[0].operations[1].summary = summary;

      result = spec.validate(json);
      warnings = findAllErrorsOrWarnings('warnings', 'OPERATION_SUMMARY_LONG', result);

      assert.deepEqual(warnings, [
        {
          code: 'OPERATION_SUMMARY_LONG',
          message: 'Operation summary is greater than 120 characters: 121',
          data: summary,
          path: ['apis', '0', 'operations', '1', 'summary']
        }
      ]);
    });

    it('should return errors for defaultValue related properties in apiDeclaration files', function () {
      var result = spec.validate(require('./json/v1_2-invalid-defaultValues.json'));
      var expectedErrors = [
        {
          code: 'ENUM_MISMATCH',
          message: 'Default value is not within enum values (A, B): C',
          data: 'C',
          path: ['apis', '0', 'operations', '0', 'parameters', '0', 'defaultValue']
        },
        {
          code: 'INVALID_TYPE',
          message: 'Invalid type (expected parseable number): NaN',
          data: 'NaN',
          path: ['apis', '0', 'operations', '0', 'parameters', '1', 'defaultValue']
        },
        {
          code: 'INVALID_TYPE',
          message: 'Invalid type (expected parseable number): NaN',
          data: 'NaN',
          path: ['apis', '0', 'operations', '0', 'parameters', '2', 'maximum']
        },
        {
          code: 'MAXIMUM',
          message: 'Default value is greater than maximum (1): 2',
          data: '2',
          path: ['apis', '0', 'operations', '0', 'parameters', '3', 'defaultValue']
        },
        {
          code: 'INVALID_TYPE',
          message: 'Invalid type (expected parseable number): NaN',
          data: 'NaN',
          path: ['apis', '0', 'operations', '0', 'parameters', '4', 'minimum']
        },
        {
          code: 'MINIMUM',
          message: 'Default value is less than minimum (2): 1',
          data: '1',
          path: ['apis', '0', 'operations', '0', 'parameters', '5', 'defaultValue']
        },
        {
          code: 'INVALID_TYPE',
          message: 'Invalid type (expected parseable boolean): NaN',
          data: 'NaN',
          path: ['apis', '0', 'operations', '0', 'parameters', '6', 'defaultValue']
        }
      ];

      assert.equal(result.errors.length, Object.keys(expectedErrors).length);
      assert.equal(result.warnings.length, 0);

      assert.deepEqual(result.errors, expectedErrors);
    });
  });

  describe('#validateApi', function () {
    it('should fail when passed the wrong arguments', function () {
      var errors = {
        'resourceList is required': [],
        'resourceList must be an object': ['wrongType'],
        'resources is required': [resourceListJson],
        'resources must be an array': [resourceListJson, petJson]
      };

      _.each(errors, function (args, message) {
        try {
          spec.validateApi.apply(spec, args);
        } catch (err) {
          assert.equal(message, err.message);
        }
      });
    });

    it('should succeed when passed the right arguments', function () {
      try {
        spec.validateApi.apply(spec, [
          resourceListJson, [petJson]
        ]);
      } catch (err) {
        assert.fail();
      }
    });

    it('should return errors for duplicate resource paths in resource listing JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);
      var errors = findAllErrorsOrWarnings('errors', 'DUPLICATE_RESOURCE_PATH', result);

      assert.deepEqual(errors, [
        {
          code: 'DUPLICATE_RESOURCE_PATH',
          message: 'Resource path already defined: /resource1',
          data: '/resource1',
          path: ['apis', '2', 'path']
        }
      ]);
    });

    it('should return errors for defined but unused resource paths in resource listing JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);
      var errors = findAllErrorsOrWarnings('errors', 'UNUSED_RESOURCE', result);

      assert.deepEqual(errors, [
        {
          code: 'UNUSED_RESOURCE',
          message: 'Resource is defined but is not used: /resource2',
          data: {
            description: 'Operations about resource2',
            path: '/resource2'
          },
          path: ['apis', '1']
        },
        {
          code: 'UNUSED_RESOURCE',
          message: 'Resource is defined but is not used: /resource4',
          data: {
            description: 'Operations about resource4',
            path: '/resource4'
          },
          path: ['apis', '3']
        }
      ]);
    });

    it('should return warnings for unused authorizations in resource listing JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);
      var warnings = findAllErrorsOrWarnings('warnings', 'UNUSED_AUTHORIZATION', result);

      assert.deepEqual(warnings, [
        {
          code: 'UNUSED_AUTHORIZATION',
          message: 'Authorization is defined but is not used: unusedBasicAuth',
          data: {
            type: 'basicAuth'
          },
          path: ['authorizations', 'unusedBasicAuth']
        }
      ]);
    });

    it('should return warnings for unused authorization scopes in resource listing JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);

      assert.deepEqual(findAllErrorsOrWarnings('warnings', 'UNUSED_AUTHORIZATION_SCOPE', result), [
        {
          code: 'UNUSED_AUTHORIZATION_SCOPE',
          message: 'Authorization scope is defined but is not used: scope2',
          data: {
            description: 'Scope 2',
            scope: 'scope2'
          },
          path: ['authorizations', 'oauth2', 'scopes', '1']
        }
      ]);
    });

    it('should return errors for missing authorization references in apiDeclaration JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);

      assert.deepEqual(findAllErrorsOrWarnings('errors', 'UNRESOLVABLE_AUTHORIZATION_REFERENCE', result.resources), [
        {
          code: 'UNRESOLVABLE_AUTHORIZATION_REFERENCE',
          message: 'Authorization reference could not be resolved: missingAuth',
          data: [],
          path: ['apis', '0', 'operations', '0', 'authorizations', 'missingAuth']
        }
      ]);
    });

    it('should return errors for missing authorization scope reference in apiDeclaration JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);

      assert.deepEqual(findAllErrorsOrWarnings('errors', 'UNRESOLVABLE_AUTHORIZATION_SCOPE_REFERENCE',
                                               result.resources), [
        {
          code: 'UNRESOLVABLE_AUTHORIZATION_SCOPE_REFERENCE',
          message: 'Authorization scope reference could not be resolved: missingScope',
          data: 'missingScope',
          path: ['apis', '1', 'operations', '0', 'authorizations', 'oauth2', 'scopes', '1']
        }
      ]);
    });

    it('should return errors for duplicate resource path in apiDeclaration JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);

      assert.deepEqual(findAllErrorsOrWarnings('errors', 'DUPLICATE_RESOURCE_PATH', result.resources), [
        {
          code: 'DUPLICATE_RESOURCE_PATH',
          message: 'Resource path already defined: /resource1',
          data: '/resource1',
          path: ['resourcePath']
        }
      ]);
    });

    it('should return errors for missing resource listing for resource path in apiDeclaration JSON files', function () {
      var result = spec.validateApi(invalidApiResourceListingJson, [
        invalidApiResource1Json,
        invalidApiResource2Json,
        invalidApiResource3Json
      ]);

      assert.deepEqual(findAllErrorsOrWarnings('errors', 'UNRESOLVABLE_RESOURCEPATH_REFERENCE', result.resources), [
        {
          code: 'UNRESOLVABLE_RESOURCEPATH_REFERENCE',
          message: 'Resource defined but not declared in resource listing: /resource3',
          data: '/resource3',
          path: ['resourcePath']
        }
      ]);
    });
  });
});
