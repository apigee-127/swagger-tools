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
var helpers = require('../helpers');
var expressStylePath = helpers.expressStylePath;
var parseurl = require('parseurl');
var pathToRegexp = require('path-to-regexp');
var spec = require('../../lib/helpers').getSpec('2.0');

var composeParameters = function composeParameters (apiPath, method, path, operation) {
  var cParams = [];
  var seenParams = [];

  _.each(operation.parameters, function (parameter, index) {
    cParams.push({
      path: apiPath.concat([method, 'parameters', index.toString()]),
      schema: parameter
    });

    seenParams.push(parameter.name + ':' + parameter.in);
  });

  _.each(path.parameters, function (parameter, index) {
    if (seenParams.indexOf(parameter.name + ':' + parameter.in) === -1) {
      cParams.push({
        path: apiPath.concat(['parameters', index.toString()]),
        schema: parameter
      });
    }
  });

  return cParams;
};

/**
 * Middleware for providing Swagger information to downstream middleware and request handlers.  'req.swagger' will be
 * added to the request of all routes that match routes defined in your Swagger resources.  Here is the structure of
 * 'req.swagger':
 *
 *   * path: The Swagger path the request is associated with
 *   * operation: The Swagger path operation the request is associated with
 *   * params: The parameters for the request
 *     * schema: The resource API operation parameter definition
 *     * value: The value of the paramter from the request (Not converted to any particular type)
 *   * swaggerObject: The Swagger object itself
 *
 * @param {object} swaggerObject - The Swagger object
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerMetadataMiddleware (swaggerObject) {
  if (_.isUndefined(swaggerObject)) {
    throw new Error('swaggerObject is required');
  } else if (!_.isPlainObject(swaggerObject)) {
    throw new TypeError('swaggerObject must be an object');
  }

  var apiCache = {};

  // To avoid running into issues with references throughout the Swagger object we will use the resolved version.
  // Getting the resolved version is an asynchronous process but since initializeMiddleware caches the resolved document
  // this is a synchronous action at this point.
  spec.resolve(swaggerObject, function (err, resolved) {
    // Gather the paths, their path regex patterns and the corresponding operations
    _.each(resolved.paths, function (path, pathName) {
      var expressPath = expressStylePath(resolved.basePath, pathName);
      var keys = [];
      var re = pathToRegexp(expressPath, keys);
      var cacheKey = re.toString();

      // This is an absolute path, use it as the cache key
      if (expressPath.indexOf('{') === -1) {
        cacheKey = expressPath;
      }

      apiCache[cacheKey] = {
        apiPath: pathName,
        path: path,
        keys: keys,
        re: re,
        operations: {},
        swaggerObject: {
          original: swaggerObject,
          resolved: resolved
        }
      };

      _.each(['get', 'put', 'post', 'delete', 'options', 'head', 'patch'], function (method) {
        var operation = path[method];

        if (!_.isUndefined(operation)) {
          apiCache[cacheKey].operations[method] = {
            operation: operation,
            parameters: composeParameters(['paths', pathName], method, path, operation)
          };
        }
      });
    });
  });

  return function swaggerMetadata (req, res, next) {
    var method = req.method.toLowerCase();
    var path = parseurl(req).pathname;
    var match;
    var metadata;
    var pathMetadata;

    try {
      pathMetadata = apiCache[path] || _.find(apiCache, function (metadata) {
        match = metadata.re.exec(path);
        return _.isArray(match);
      });

      // Request does not match an API defined in the Swagger document
      if (!pathMetadata) {
        return next();
      }

      metadata = {
        apiPath : pathMetadata.apiPath,
        path: pathMetadata.path,
        params: {},
        swaggerObject: pathMetadata.swaggerObject.resolved
      };

      if (_.isPlainObject(pathMetadata.operations[method])) {
        metadata.operation = pathMetadata.operations[method].operation;
        metadata.operationParameters = pathMetadata.operations[method].parameters || [];
        metadata.operationPath = ['paths', pathMetadata.apiPath, method];
        metadata.security = metadata.operation.security || metadata.swaggerObject.security || [];
      }

      req.swagger = metadata;

      if (metadata.operation) {
        // Process the operation parameters
        helpers.processOperationParameters('2.0', pathMetadata.keys, match, req, res, next);
      } else {
        return next();
      }
    } catch (err) {
      return next(err);
    }
  };
};
