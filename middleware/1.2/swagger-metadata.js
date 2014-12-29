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
var parseurl = require('parseurl');
var pathToRegexp = require('path-to-regexp');

/**
 * Middleware for providing Swagger information to downstream middleware and request handlers.  'req.swagger' will be
 * added to the request of all routes that match routes defined in your Swagger resources.  Here is the structure of
 * 'req.swagger':
 *
 *   * api: The resource API the request is associated with
 *   * authorizations: Object containing the authorization definitions from the resource listing
 *   * models: The resource models for the API the request is associated with
 *   * operation: The resource API operation the request is associated with
 *   * params: The parameters for the request
 *     * schema: The resource API operation parameter definition
 *     * value: The value of the paramter from the request (Not converted to any particular type)
 *
 * @param {object} resourceListing - The resource listing object
 * @param {object[]} resources - The array of resources
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerMetadataMiddleware (resourceList, resources) {
  if (_.isUndefined(resourceList)) {
    throw new Error('resourceList is required');
  } else if (!_.isPlainObject(resourceList)) {
    throw new TypeError('resourceList must be an object');
  }

  if (_.isUndefined(resources)) {
    throw new Error('resources is required');
  } else if (!_.isArray(resources)) {
    throw new TypeError('resources must be an array');
  }

  var apiCache = {};

  // Gather the apis, their path regex patterns and the corresponding operations
  _.each(resources, function (resource, resourceIndex) {
    _.each(resource.apis, function (api, apiIndex) {
      var expressPath = helpers.expressStylePath(resource.basePath, api.path);
      var keys = [];
      var re = pathToRegexp(expressPath, keys);
      var cacheKey = re.toString();

      // This is an absolute path, use it as the cache key
      if (expressPath.indexOf('{') === -1) {
        cacheKey = expressPath;
      }

      // For absolute paths, store it instead of its regex
      apiCache[cacheKey] = {
        api: api,
        apiDeclaration: resource,
        apiIndex: apiIndex,
        keys: keys,
        params: {},
        re: re,
        operations: {},
        resourceIndex: resourceIndex,
        resourceListing: resourceList
      };

      _.each(api.operations, function (operation, operationIndex) {
        var method = operation.method;

        apiCache[cacheKey].operations[method] = {
          operation: operation,
          operationPath: ['apis', apiIndex.toString(), 'operations', operationIndex.toString()]
        };
      });
    });
  });

  return function swaggerMetadata (req, res, next) {
    var path = parseurl(req).pathname;
    var apiMetadata;
    var match;
    var metadata;

    try {
      apiMetadata = apiCache[path] || _.find(apiCache, function (metadata) {
        match = metadata.re.exec(path);
        return _.isArray(match);
      });

      // Request does not match an API defined in the Swagger document(s)
      if (!apiMetadata) {
        return next();
      }

      metadata = {
        api: apiMetadata.api,
        apiDeclaration: apiMetadata.apiDeclaration,
        apiIndex: apiMetadata.apiIndex,
        params: {},
        resourceIndex: apiMetadata.resourceIndex,
        resourceListing: apiMetadata.resourceListing
      };

      if (_.isPlainObject(apiMetadata.operations[req.method])) {
        metadata.operation = apiMetadata.operations[req.method].operation;
        metadata.operationPath = apiMetadata.operations[req.method].operationPath;
        metadata.authorizations = metadata.operation.authorizations || apiMetadata.apiDeclaration.authorizations;
      }

      req.swagger = metadata;

      if (metadata.operation) {
        // Process the operation parameters
        helpers.processOperationParameters('1.2', apiMetadata.keys, match, req, res, next);
      } else {
        return next();
      }
    } catch (err) {
      return next(err);
    }
  };
};
