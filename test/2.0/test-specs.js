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
var spec = require('../../').specs.v2_0; // jshint ignore:line

var petStoreJson = require('../../samples/2.0/petstore.json');

describe('Specification v2.0', function () {
  describe('metadata', function () {
    it('should have proper docsUrl, primitives, options, schemasUrl and verison properties', function () {
      assert.strictEqual(spec.docsUrl, 'https://github.com/reverb/swagger-spec/blob/master/versions/2.0.md');
      assert.deepEqual(spec.primitives, ['string', 'number', 'boolean', 'integer', 'array']);
      assert.strictEqual(spec.schemasUrl, 'https://github.com/reverb/swagger-spec/tree/master/schemas/v2.0');
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
    it('should fail when passed the wrong arguments', function () {
      var errors = {
        'swaggerObject is required': [],
        'swaggerObject must be an object': ['wrongType']
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
      assert.ok(_.isUndefined(spec.validate(petStoreJson)));
    });

    it('should return errors for structurally invalid JSON files', function () {
      var errors = [
        {
          code: 'VALIDATION_FAILED',
          message: 'Validation error: enum',
          data: 'fake',
          path: ['paths', '/pets/{id}', 'parameters', '0', 'in']
        },
        {
          code: 'VALIDATION_OBJECT_REQUIRED',
          message: 'Missing required property: paths',
          path: ['paths']
        },
        {
          code: 'VALIDATION_INVALID_TYPE',
          message: 'Invalid type: boolean should be string',
          data: false,
          path: ['info', 'contact', 'name']
        },
        {
          code: 'VALIDATION_ADDITIONAL_PROPERTIES',
          message: 'Additional properties not allowed: extra',
          data: 'value',
          path: ['paths', '/pets', 'get', 'extra']
        }
      ];
      var i = 0;
      var json;
      var error;
      var result;

      for (i; i < errors.length; i++) {
        json = _.cloneDeep(petStoreJson);
        error = errors[i];

        switch (i) {
        case 0:
          // Wrong enum value
          json.paths['/pets/{id}'].parameters[0].in = 'fake';

          break;

        case 1:
          // Missing required
          delete json.paths;

          break;

        case 2:
          // Wrong type
          json.info.contact.name = false;

          break;

        case 3:
          // Extra property
          json.paths['/pets'].get.extra = 'value';

          break;
        }
      }

      result = spec.validate(json);

      // Validate the invalid API Declarations
      assert.deepEqual(result.errors, [error]);
      assert.equal(result.warnings.length, 0);
    });
  });
});
