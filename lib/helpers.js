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
var JsonRefs = require('json-refs');
var traverse = require('traverse');
var Ajv = require('ajv');

var customJsonSchemaFormats = ['byte', 'double', 'float', 'int32', 'int64', 'mime-type', 'uri-template'];
var draft04Json = require('../schemas/json-schema-draft-04.json');
var draft04Url = 'http://json-schema.org/draft-04/schema';
var specCache = {};

const AJV_CODE_CONVERSION = {
  enum: 'ENUM_MISMATCH',
  type: 'INVALID_TYPE'
};

const URI_REGEX = /^(([^:/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;

// We need two instances of ajv because the main schemas (parameter of createJsonValidator) don't work with useDefault
var ajv = new Ajv({ allErrors: true, useDefaults: true });
var ajvMain = new Ajv({ allErrors: true });

// Fix ajv differences:
ajv.addFormat('uri', URI_REGEX);
ajvMain.addFormat('uri', URI_REGEX);

ajv.addMetaSchema(draft04Json);
ajvMain.addMetaSchema(draft04Json);

// Swagger uses some unsupported/invalid formats so just make them all pass
_.each(customJsonSchemaFormats, function (format) {
  ajv.addFormat(format, { test: () => true });
  ajvMain.addFormat(format, { test: () => true });
});

module.exports.registerCustomFormats = function (json) {
  const AJV_FORMATS = [
    'date', 'time', 'date-time', 'uri', 'uri-reference', 'uri-template',
    'url', 'email', 'hostname', 'ipv4', 'ipv6', 'regex', 'uuid', 'json-pointer', 'relative-json-pointer'
  ];

  traverse(json).forEach(function () {
    var name = this.key;
    var format = this.node;

    if (name === 'format' && _.indexOf(AJV_FORMATS, format) === -1) {
      // registering format: format
      ajv.addFormat(format, { test: () => true });
      ajvMain.addFormat(format, { test: () => true });
    }
  });
};

// cache the ajv compilations (memoization technique)
let memoizedSchemas = [];
let memoizedValidators = [];

// search if the validator has been pre-compiled or compile it
function getOrCompileValidator(schema) {
  let validator;

  for (let i = 0; i < memoizedSchemas.length; i++) {
    if (_.isEqual(memoizedSchemas[i], schema)) {
      validator = memoizedValidators[i];
      break;
    }
  }

  if (!validator) {
    try {
      validator = ajv.compile(schema);
    } catch (err) {
      // If there is an error, it's unrecoverable. make sure to log it using console.error as well
      console.error('validator creation error: ', err);
      throw err;
    }

    memoizedSchemas.push(schema);
    memoizedValidators.push(validator);
  }

  return validator;
}

// hash of pre-compiled mainValidators
const mainValidators = {};

// search if the mainValidator has been pre-compiled or compile it
function getOrCompileMainValidator(schema) {
  if (!schema.id) return;

  if (!mainValidators[schema.id]) {
    try {
      mainValidators[schema.id] = ajvMain.compile(schema);
    } catch (err) {
      // If there is an error, it's unrecoverable. make sure to log it using console.error as well
      console.error('validator creation error: ', err);
      throw err;
    }
  }

  return mainValidators[schema.id];
}

module.exports.createJsonValidator = function (schemas) {
  if (_.isUndefined(schemas)) {
    return undefined;
  }

  let lastValidator = {
    errors: null
  };

  let lastValue;

  // compile the main schemas (those passed in schemas)
  _.forEach(schemas, getOrCompileMainValidator);

  return {
    validate: function(v, schema) {
      let validator;

      if (_.isObject(schema)) {
        validator = getOrCompileValidator(schema);

      } else {
        // schema is a string:
        if (!mainValidators[schema]) throw new Error('Schema not found: ' + schema);
        validator = mainValidators[schema];
      }
      lastValidator = validator;
      lastValue = v;
      return validator(v);
    },
    getLastErrors: function() {
      const errors = lastValidator.errors;
      if (!errors) return null;
      _.forEach(errors, (e) => {
        // change format of the errors to have `path` property
        e.path = e.schemaPath.split('#/').slice(-1)[0].split('/').slice(1);
        if (e.keyword === e.path.slice(-1)[0]) e.path = e.path.slice(0, -1);
        const value = _.get(lastValue, e.dataPath.slice(1));
        e.message += ': ' + value;
        e.code = AJV_CODE_CONVERSION[e.keyword] || e.keyword.toUpperCase();
      });
      return errors;
    }

  };
};

module.exports.formatResults = function (results) {
  if (results) {
    // Update the results based on its content to indicate success/failure accordingly
    results = (results.errors.length + results.warnings.length +
    _.reduce(results.apiDeclarations, function (count, aResult) {
      if (aResult) {
        count += aResult.errors.length + aResult.warnings.length;
      }

      return count;
    }, 0) > 0) ? results : undefined;
  }

  return results;
};

var getErrorCount = module.exports.getErrorCount = function (results) {
  var errors = 0;

  if (results) {
    errors = results.errors.length;

    _.each(results.apiDeclarations, function (adResults) {
      if (adResults) {
        errors += adResults.errors.length;
      }
    });
  }

  return errors;
};

var coerceVersion = function (version) {
  // Convert the version to a number (Required for helpers.getSpec)
  if (version && !_.isString(version)) {
    version = version.toString();

    // Handle rounding issues (Only required for when Swagger version ends in '.0')
    if (version.indexOf('.') === -1) {
      version += '.0';
    }
  }

  return version;
};

/**
 * Returns the proper specification based on the human readable version.
 *
 * @param {string} version - The human readable Swagger version (Ex: 1.2)
 * @param {[boolean=false]} throwError - Throw an error if the version could not be identified
 *
 * @returns the corresponding Swagger Specification object or undefined if there is none
 */
module.exports.getSpec = function (version, throwError) {
  var spec;

  version = coerceVersion(version);
  spec = specCache[version];

  if (_.isUndefined(spec)) {
    switch (version) {
    case '1.2':
      spec = require('../lib/specs').v1_2; // jshint ignore:line

      break;

    case '2.0':
      spec = require('../lib/specs').v2_0; // jshint ignore:line

      break;

    default:
      if (throwError === true) {
        throw new Error('Unsupported Swagger version: ' + version);
      }
    }
  }

  return spec;
};

/**
 * Atempts to figure out the Swagger version from the Swagger document.
 *
 * @param {object} document - The Swagger document
 *
 * @returns the Swagger version or undefined if the document is not a Swagger document
 */
module.exports.getSwaggerVersion = function (document) {
  return _.isPlainObject(document) ? coerceVersion(document.swaggerVersion || document.swagger) : undefined;
};

module.exports.printValidationResults = function (version, apiDOrSO, apiDeclarations, results, printSummary) {
  var hasErrors = getErrorCount(results) > 0;
  var stream = hasErrors ? console.error : console.log;
  var pluralize = function (string, count) {
    return count === 1 ? string : string + 's';
  };
  var printErrorsOrWarnings = function (header, entries, indent) {
    if (header) {
      stream(header + ':');
      stream();
    }

    _.each(entries, function (entry) {
      stream(new Array(indent + 1).join(' ') + JsonRefs.pathToPtr(entry.path) + ': ' + entry.message);

      if (entry.inner) {
        printErrorsOrWarnings (undefined, entry.inner, indent + 2);
      }
    });

    if (header) {
      stream();
    }
  };
  var errorCount = 0;
  var warningCount = 0;

  stream();

  if (results.errors.length > 0) {
    errorCount += results.errors.length;

    printErrorsOrWarnings('API Errors', results.errors, 2);
  }

  if (results.warnings.length > 0) {
    warningCount += results.warnings.length;

    printErrorsOrWarnings('API Warnings', results.warnings, 2);
  }

  if (results.apiDeclarations) {
    results.apiDeclarations.forEach(function (adResult, index) {
      if (!adResult) {
        return;
      }

      var name = apiDeclarations[index].resourcePath || index;

      if (adResult.errors.length > 0) {
        errorCount += adResult.errors.length;

        printErrorsOrWarnings('  API Declaration (' + name + ') Errors', adResult.errors, 4);
      }

      if (adResult.warnings.length > 0) {
        warningCount += adResult.warnings.length;

        printErrorsOrWarnings('  API Declaration (' + name + ') Warnings', adResult.warnings, 4);
      }
    });
  }

  if (printSummary) {
    if (errorCount > 0) {
      stream(errorCount + ' ' + pluralize('error', errorCount) + ' and ' + warningCount + ' ' +
                    pluralize('warning', warningCount));
    } else {
      stream('Validation succeeded but with ' + warningCount + ' ' + pluralize('warning', warningCount));
    }
  }

  stream();
};

module.exports.swaggerOperationMethods = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT'
];
