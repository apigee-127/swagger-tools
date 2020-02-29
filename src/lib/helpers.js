/* eslint-disable no-console */
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

const _ = require('lodash');
const JsonRefs = require('json-refs');
const traverse = require('traverse');
const ZSchema = require('z-schema');

const customJsonSchemaFormats = [
  'byte',
  'double',
  'float',
  'int32',
  'int64',
  'mime-type',
  'uri-template',
];
const draft04Json = require('../schemas/json-schema-draft-04.json');

const draft04Url = 'http://json-schema.org/draft-04/schema';
const specCache = {};

const registerCustomFormats = json => {
  traverse(json).forEach(() => {
    const name = this.key;
    const format = this.node;

    if (
      name === 'format' &&
      _.indexOf(ZSchema.getRegisteredFormats(), format) === -1
    ) {
      ZSchema.registerFormat(format, () => {
        return true;
      });
    }
  });
};

const createJsonValidator = schemas => {
  const validator = new ZSchema({
    breakOnFirstError: false,
    reportPathAsArray: true,
  });
  let result;

  // Add the draft-04 spec
  validator.setRemoteReference(draft04Url, draft04Json);

  // Swagger uses some unsupported/invalid formats so just make them all pass
  _.each(customJsonSchemaFormats, format => {
    ZSchema.registerFormat(format, () => {
      return true;
    });
  });

  // Compile and validate the schemas
  if (!_.isUndefined(schemas)) {
    result = validator.compileSchema(schemas);

    // If there is an error, it's unrecoverable so just blow the eff up
    if (result === false) {
      console.error(
        `JSON Schema file${schemas.length > 1 ? 's are' : ' is'} invalid:`,
      );

      _.each(validator.getLastErrors(), err => {
        console.error(
          `  ${
            _.isArray(err.path) ? JsonRefs.pathToPtr(err.path) : err.path
          }: ${err.message}`,
        );
      });

      throw new Error('Unable to create validator due to invalid JSON Schema');
    }
  }

  return validator;
};

const formatResults = origResults => {
  let results = origResults;
  if (results) {
    // Update the results based on its content to indicate success/failure accordingly
    results =
      results.errors.length +
        results.warnings.length +
        _.reduce(
          results.apiDeclarations,
          (origCount, aResult) => {
            let count = origCount;
            if (aResult) {
              count += aResult.errors.length + aResult.warnings.length;
            }

            return count;
          },
          0,
        ) >
      0
        ? results
        : undefined;
  }

  return results;
};

const getErrorCount = results => {
  let errors = 0;

  if (results) {
    errors = results.errors.length;

    _.each(results.apiDeclarations, adResults => {
      if (adResults) {
        errors += adResults.errors.length;
      }
    });
  }

  return errors;
};

const coerceVersion = origVersion => {
  let version = origVersion;
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
const getSpec = (origVersion, throwError) => {
  let spec;
  let version = origVersion;

  version = coerceVersion(version);
  spec = specCache[version];

  if (_.isUndefined(spec)) {
    switch (version) {
      case '1.2':
        // eslint-disable-next-line global-require
        spec = require('./specs').v1_2; // jshint ignore:line

        break;

      case '2.0':
        // eslint-disable-next-line global-require
        spec = require('./specs').v2_0; // jshint ignore:line

        break;

      default:
        if (throwError === true) {
          throw new Error(`Unsupported Swagger version: ${version}`);
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
const getSwaggerVersion = document => {
  return _.isPlainObject(document)
    ? coerceVersion(document.swaggerVersion || document.swagger)
    : undefined;
};

const printValidationResults = (
  version,
  apiDOrSO,
  apiDeclarations,
  results,
  printSummary,
) => {
  const hasErrors = getErrorCount(results) > 0;
  const stream = hasErrors ? console.error : console.log;

  const pluralize = (string, count) => {
    return count === 1 ? string : `${string}s`;
  };

  const printErrorsOrWarnings = (header, entries, indent) => {
    if (header) {
      stream(`${header}:`);
      stream();
    }

    _.each(entries, entry => {
      stream(
        `${new Array(indent + 1).join(' ') + JsonRefs.pathToPtr(entry.path)}: ${
          entry.message
        }`,
      );

      if (entry.inner) {
        printErrorsOrWarnings(undefined, entry.inner, indent + 2);
      }
    });

    if (header) {
      stream();
    }
  };

  let errorCount = 0;
  let warningCount = 0;

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
    results.apiDeclarations.forEach((adResult, index) => {
      if (!adResult) {
        return;
      }

      const name = apiDeclarations[index].resourcePath || index;

      if (adResult.errors.length > 0) {
        errorCount += adResult.errors.length;

        printErrorsOrWarnings(
          `  API Declaration (${name}) Errors`,
          adResult.errors,
          4,
        );
      }

      if (adResult.warnings.length > 0) {
        warningCount += adResult.warnings.length;

        printErrorsOrWarnings(
          `  API Declaration (${name}) Warnings`,
          adResult.warnings,
          4,
        );
      }
    });
  }

  if (printSummary) {
    if (errorCount > 0) {
      stream(
        `${errorCount} ${pluralize(
          'error',
          errorCount,
        )} and ${warningCount} ${pluralize('warning', warningCount)}`,
      );
    } else {
      stream(
        `Validation succeeded but with ${warningCount} ${pluralize(
          'warning',
          warningCount,
        )}`,
      );
    }
  }

  stream();
};

const swaggerOperationMethods = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
];

module.exports = {
  registerCustomFormats,
  createJsonValidator,
  formatResults,
  getErrorCount,
  coerceVersion,
  getSpec,
  getSwaggerVersion,
  printValidationResults,
  swaggerOperationMethods,
};
