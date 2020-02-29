/* eslint-disable no-console */
/* eslint-disable prefer-rest-params */
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
const debug = require('debug')('swagger-tools:middleware');
const helpers = require('./lib/helpers');
const specs = require('./lib/specs');
const swaggerMetadata = require('./middleware/swagger-metadata');
const swaggerRouter = require('./middleware/swagger-router');
const swaggerSecurity = require('./middleware/swagger-security');
const swaggerUi = require('./middleware/swagger-ui');
const swaggerValidator = require('./middleware/swagger-validator');

const initializeMiddleware = function initializeMiddleware(
  rlOrSO,
  resources,
  origCallback,
) {
  let callback = origCallback;

  debug('Initializing middleware');

  if (_.isUndefined(rlOrSO)) {
    throw new Error('rlOrSO is required');
  } else if (!_.isPlainObject(rlOrSO)) {
    throw new TypeError('rlOrSO must be an object');
  }

  const args = [rlOrSO];
  const spec = helpers.getSpec(helpers.getSwaggerVersion(rlOrSO), true);

  debug('  Identified Swagger version: %s', spec.version);

  if (spec.version === '1.2') {
    if (_.isUndefined(resources)) {
      throw new Error('resources is required');
    } else if (!_.isArray(resources)) {
      throw new TypeError('resources must be an array');
    }

    debug('  Number of API Declarations: %d', resources.length);

    args.push(resources);
  } else {
    [, callback] = arguments;
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  args.push((origErr, results) => {
    let err = origErr;
    if (
      results &&
      results.errors.length +
        _.reduce(
          results.apiDeclarations || [],
          (count, apiDeclaration) => {
            const newCount =
              count + (apiDeclaration ? apiDeclaration.errors.length : 0);
            return newCount;
          },
          0,
        ) >
        0
    ) {
      err = new Error(
        'Swagger document(s) failed validation so the server cannot start',
      );

      err.failedValidation = true;
      err.results = results;
    }

    debug('  Validation: %s', err ? 'failed' : 'succeeded');

    try {
      if (err) {
        throw err;
      }

      callback({
        // Create a wrapper to avoid having to pass the non-optional arguments back to the swaggerMetadata middleware
        swaggerMetadata() {
          return swaggerMetadata(...args.slice(0, args.length - 1));
        },
        swaggerRouter,
        swaggerSecurity,
        // Create a wrapper to avoid having to pass the non-optional arguments back to the swaggerUi middleware
        swaggerUi(options) {
          const suArgs = [rlOrSO];

          if (spec.version === '1.2') {
            suArgs.push(
              resources.reduce(
                (map, resource) => ({
                  ...map,
                  [resource.resourcePath]: resource,
                }),
                {},
              ),
            );
          }

          suArgs.push(options || {});

          return swaggerUi(...suArgs);
        },
        swaggerValidator,
      });
    } catch (error) {
      if (process.env.RUNNING_SWAGGER_TOOLS_TESTS === 'true') {
        // When running the swagger-tools test suite, we want to return an error instead of exiting the process.  This
        // does not mean that this function is an error-first callback but due to json-refs using Promises, we have to
        // return the error to avoid the error being swallowed.
        callback(error);
      } else {
        if (error.failedValidation === true) {
          helpers.printValidationResults(
            spec.version,
            rlOrSO,
            resources,
            results,
            true,
          );
        } else {
          console.error('Error initializing middleware');
          console.error(error.stack);
        }

        process.exit(1);
      }
    }
  });

  spec.validate(...args);
};

module.exports = {
  initializeMiddleware,
  specs,
};
