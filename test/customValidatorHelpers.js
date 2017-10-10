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

var _ = require('lodash-compat');
var Ajv = require('ajv');
var ZSchema = require('z-schema');

/**
 * Options for intialising ajv.
 * @see {@link https://github.com/epoberezkin/ajv#options}
 */
var AJV_OPTIONS = {
    /* Return all errors, not just the first one */
    allErrors: false,

    /* Validate formats fully. Slower by more correct than 'fast' mode */
    format: 'full',

    /* Throw exceptions during schema compilation for unknown formats */
    unknownFormats: true,

    /* Don't remove additional properties, so that we can detect they exist and fail validation */
    /* If removeAdditional = true, they are removed before they can be detected as additional */
    removeAdditional: false,

    /* Allow use of the default keyword. The default is cloned each time.*/
    useDefaults: true,

    /* Ensure all types are exactly as specified. E.g. this will not accept "1" as a number */
    coerceTypes: false,

    /* Additional formats allowed in swagger that are not in JSON schema. See http://swagger.io/specification/ */
    formats: {
        int32: function(val) {
            return _.inRange(_.parseInt(val), -1 * Math.pow(2, 31), Math.pow(2, 31));
        },
        int64: function(val) {
            console.log('Testing int64: ', val);
            // JS can't actually safely handle integers in the full 64 bit range
            // as they are actually IEE 754 doubles  See:
            // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
            return _.inRange(_.parseInt(val), -1 * Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        },
        float: function(val) {
            return _.isNaN(_.parseFloat(val));
        },
        double: function(val) {
            return _.isNaN(_.parseFloat(val));
        },
        string: function(val) {
            return _.isString(val);
        },
        'byte': /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
        binary: function() {
            return true;
        },
        'boolean': function(val) {
            return _.isBoolean(val);
        },
        password: function(val) {
            return _.isString(val);
        }
    }
};

/**
 * Options for intialising z-schema.
 * @see {@link https://github.com/zaggino/z-schema#options}
 */
var ZSCHEMA_OPTIONS = {
    breakOnFirstError: false,
    reportPathAsArray: true,
    customValidator: function(report, schema, json) {
        if (_.isBoolean(schema['x-is-even-length'])) {
            var checkEven = schema['x-is-even-length'];
            if (checkEven && (json.length % 2 !== 0)) {
                report.addCustomError(
                    'NON_EVEN_LENGTH_STRING',
                    '"{0}" is not an even number of chars',
                    [json], null, schema.description);
            }
        }
    }
};


/**
 * Creates and returns an appropriately wrapped version of the ajv validator.
 * This mimics the z-schema API for validate() and getLastErrors()
 *
 * @return {Object} object that mimics Z-Schema's validator
 */
module.exports.createAjv = function createCustomAjvValidator() {
    var ajv = new Ajv(AJV_OPTIONS);

    /**
     * To test the custom validation, we add a new test Format.
     * This format returns an error if the string as an `e` in it
     */
    ajv.addFormat('disallow-e', function(val) {
        return (val.indexOf('e') === -1);
    });

    /**
     * Add a new keyword to verify we can do that too.
     * This function checks a string is an even number of characters if set to true
     */
    ajv.addKeyword('x-is-even-length', {
        errors: false,
        async: false,
        metaSchema: {
            type: 'boolean'
        },
        compile: function isEven(schema) {
            var checkEven = schema;

            return function(data) {
                return !checkEven || (data.length % 2 === 0);
            };
        }
    });

    /**
     * Build an object with the required functions to match the Z-schema API
     */
    return {
        /**
         * Z-Sschema has the validate()) params in the opposite order to ajv,
         * so flip them round. Note that this does not support async validation.
         *
         * @param {any} json    - the JSON object to validate
         * @param {any} schema  - the schema or schema name to validate against
         *
         * @returns {boolean}   - true / false for success/fail.
         */
        validate: function zSchemaCompatValidate(json, schema) {
            return ajv.validate(schema, json);
        },

        /**
         * Z-schema has a function to get errors, while ajv has a property.
         *
         * @returns {array|null}  - an array of error objects, or null for no errors
         */
        getLastErrors: function zSchemaCompatGetLastErrors() {
            return ajv.errors;
        }
    };
};

/**
 * Creates and returns an appropriately initialised version of a custom Z-schema validator.
 *
 * @return {Object}   - z-schema validator instance
 */
module.exports.createZSchema = function createCustomZSchemaValidator() {
    var validator = new ZSchema(ZSCHEMA_OPTIONS);

    /**
     * To test the custom validation, we add a new test Format.
     * This format returns an error if the string as an `e` in it
     */
    ZSchema.registerFormat('disallow-e', function(val) {
        return (val.indexOf('e') === -1);
    });

    return validator;
};
