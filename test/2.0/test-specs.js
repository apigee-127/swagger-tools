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

    describe('should return errors for structurally invalid JSON files', function () {
      it('extra property', function() {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.paths['/pets'].get.extra = 'value';

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.errors, [
          {
            code: 'VALIDATION_ADDITIONAL_PROPERTIES',
            message: 'Additional properties not allowed: extra',
            data: 'value',
            path: ['paths', '/pets', 'get', 'extra']
          }
        ]);
        assert.equal(result.warnings.length, 0);
      });

      it('invalid type', function() {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.info.contact.name = false;

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.errors, [
          {
            code: 'VALIDATION_INVALID_TYPE',
            message: 'Invalid type: boolean should be string',
            data: false,
            path: ['info', 'contact', 'name']
          }
        ]);
        assert.equal(result.warnings.length, 0);
      });

      it('missing required value', function() {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        delete swaggerObject.paths;

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.errors, [
          {
            code: 'VALIDATION_OBJECT_REQUIRED',
            message: 'Missing required property: paths',
            path: ['paths']
          }
        ]);
        assert.equal(result.warnings.length, 0);
      });

      it('wrong enum value', function() {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.schemes.push('fake');

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.errors, [
          {
            code: 'VALIDATION_ENUM_MISMATCH',
            message: 'No enum match (fake), expects: http, https, ws, wss',
            data: 'fake',
            path: ['schemes', '1']
          }
        ]);
        assert.equal(result.warnings.length, 0);
      });
    });

    describe('should return errors for semantically invalid JSON files', function () {
      it('duplicate global consumes', function () {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.consumes = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.warnings, [
          {
            code: 'DUPLICATE_API_CONSUMES',
            message: 'API consumes has duplicate items',
            data: swaggerObject.consumes,
            path: ['consumes']
          }
        ]);
        assert.equal(result.errors.length, 0);
      });

      it('duplicate global produces', function () {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.produces = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.warnings, [
          {
            code: 'DUPLICATE_API_PRODUCES',
            message: 'API produces has duplicate items',
            data: swaggerObject.produces,
            path: ['produces']
          }
        ]);
        assert.equal(result.errors.length, 0);
      });

      it('duplicate global schemes', function () {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.schemes.push('http');

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.warnings, [
          {
            code: 'DUPLICATE_API_SCHEMES',
            message: 'API schemes has duplicate items',
            data: swaggerObject.schemes,
            path: ['schemes']
          }
        ]);
        assert.equal(result.errors.length, 0);
      });

      // Should we be writing tests for the operation parameter constraints (default values) even though the same code
      // to validate them is the same one for swagger-validator which is already tested?

      it('duplicate api path (equivalent)', function () {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.paths['/pets/{petId}'] = _.cloneDeep(swaggerObject.paths['/pets/{id}']);

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.errors, [
          {
            code: 'DUPLICATE_API_PATH',
            message: 'API path (or equivalent) already defined: /pets/{petId}',
            data: '/pets/{petId}',
            path: ['paths', '/pets/{petId}']
          }
        ]);
        assert.equal(result.warnings.length, 0);
      });

      it('duplicate operation consumes', function () {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.paths['/pets'].get.consumes = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.warnings, [
          {
            code: 'DUPLICATE_OPERATION_CONSUMES',
            message: 'Operation consumes has duplicate items',
            data: swaggerObject.paths['/pets'].get.consumes,
            path: ['paths', '/pets', 'get', 'consumes']
          }
        ]);
        assert.equal(result.errors.length, 0);
      });

      it('duplicate operation produces', function () {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.paths['/pets'].get.produces = ['application/json', 'application/xml', 'application/json'];

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.warnings, [
          {
            code: 'DUPLICATE_OPERATION_PRODUCES',
            message: 'Operation produces has duplicate items',
            data: swaggerObject.paths['/pets'].get.produces,
            path: ['paths', '/pets', 'get', 'produces']
          }
        ]);
        assert.equal(result.errors.length, 0);
      });

      it('duplicate operation schemes', function () {
        var swaggerObject = _.cloneDeep(petStoreJson);
        var result;

        swaggerObject.paths['/pets'].get.schemes = ['http', 'http'];

        result = spec.validate(swaggerObject);

        assert.deepEqual(result.warnings, [
          {
            code: 'DUPLICATE_OPERATION_SCHEMES',
            message: 'Operation schemes has duplicate items',
            data: swaggerObject.paths['/pets'].get.schemes,
            path: ['paths', '/pets', 'get', 'schemes']
          }
        ]);
        assert.equal(result.errors.length, 0);
      });
    });
  });
});
