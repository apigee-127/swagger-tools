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
var helpers = require('./lib/helpers');

var initializeMiddleware = function initializeMiddleware (rlOrSO, resources, callback) {
  var args;
  var spec;
  var swaggerVersion;

  if (_.isUndefined(rlOrSO)) {
    throw new Error('rlOrSO is required');
  } else if (!_.isPlainObject(rlOrSO)) {
    throw new TypeError('rlOrSO must be an object');
  }

  args = [rlOrSO];
  swaggerVersion = helpers.getSwaggerVersion(rlOrSO);

  if (!swaggerVersion) {
    throw new Error('Unable to identify the Swagger version based on rlOrSO');
  } else if (swaggerVersion === '1.2') {
    if (_.isUndefined(resources)) {
      throw new Error('resources is required');
    } else if (!_.isArray(resources)) {
      throw new TypeError('resources must be an array');
    }

    args.push(resources);
  } else {
    callback = arguments[1];
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  args.push(function (err, results) {
    if (results && results.errors.length + _.reduce(results.apiDeclarations || [], function (count, apiDeclaration) {
      return count += (apiDeclaration ? apiDeclaration.errors.length : 0);
    }, 0) > 0) {
      err = new Error('Swagger document(s) failed validation so the server cannot start');

      err.results = results;
    }

    if (err) {
      if (process.env.NODE_ENV === 'test') {
        throw err;
      } else {
        return helpers.printValidationResults(swaggerVersion, rlOrSO, resources, results, true, true);
      }
    }

    callback({
      // Create a wrapper to avoid having to pass the non-optional arguments back to the swaggerMetadata middleware
      swaggerMetadata: function () {
        var swaggerMetadata = require('./middleware/' + swaggerVersion + '/swagger-metadata');

        return swaggerMetadata.apply(undefined, args.slice(0, args.length - 1));
      },
      swaggerRouter: require('./middleware/' + swaggerVersion + '/swagger-router'),
      swaggerSecurity: require('./middleware/' + swaggerVersion + '/swagger-security'),
      // Create a wrapper to avoid having to pass the non-optional arguments back to the swaggerUi middleware
      swaggerUi: function (options) {
        var swaggerUi = require('./middleware/' + swaggerVersion + '/swagger-ui');
        var suArgs = [rlOrSO];

        if (swaggerVersion === '1.2') {
          suArgs.push(_.reduce(resources, function (map, resource) {
            map[resource.resourcePath] = resource;

            return map;
          }, {}));
        }

        suArgs.push(options || {});

        return swaggerUi.apply(undefined, suArgs);
      },
      swaggerValidator: require('./middleware/' + swaggerVersion + '/swagger-validator')
    });
  });

  spec = helpers.getSpec(helpers.getSwaggerVersion(rlOrSO));

  spec.validate.apply(spec, args);
};

module.exports = {
  initializeMiddleware: initializeMiddleware,
  specs: require('./lib/specs')
};
