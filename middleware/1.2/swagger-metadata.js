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
 * This middleware requires that you use the appropriate middleware to populate req.body and req.query before this
 * middleware.  This middleware also makes no attempt to work around invalid Swagger documents.
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

  var apis = {};

  // Gather the apis, their path regex patterns and the corresponding operations
  _.each(resources, function (resource, index) {
    _.each(resource.apis, function (api) {
      var keys = [];
      var re = pathToRegexp(expressStylePath(resource.basePath, api.path), keys);
      var reStr = re.toString();

      if (Object.keys(apis).indexOf(reStr) !== -1) {
        throw new Error('Duplicate API path/pattern: ' + api.path);
      }

      apis[reStr] = {
        api: api,
        keys: keys,
        re: re,
        resourceIndex: index,
        operations: {}
      };

      _.each(api.operations, function (operation) {
        var method = operation.method;

        if (!_.isUndefined(apis[reStr][method])) {
          throw new Error('Duplicate API operation (' + api.path + ') method: ' + method);
        }

        apis[reStr].operations[method] = operation;
      });
    });
  });

  return function swaggerMetadata (req, res, next) {
    var path = parseurl(req).pathname;
    var match;
    var api = _.find(apis, function (api) {
      match = api.re.exec(path);
      return _.isArray(match);
    });
    var metadata = {
      api: api ? api.api : undefined,
      apiDeclaration: api ? resources[api.resourceIndex] : undefined,
      authorizations: resourceList.authorizations || {},
      models: api ? resources[api.resourceIndex].models || {} : {},
      operation: api ? api.operations[req.method] : undefined,
      params: {},
      resourceListing: resourceList
    };

    // Attach Swagger metadata to the request
    if (!_.isUndefined(api)) {
      req.swagger = metadata;
    }

    // Collect the parameter values
    if (!_.isUndefined(metadata.operation)) {
      try {
        _.each(metadata.operation.parameters, function (param) {
          var val;

          // Get the value to validate based on the operation parameter type
          switch (param.paramType) {
          case 'body':
          case 'form':
            if (!req.body) {
              throw new Error('Server configuration error: req.body is not defined but is required');
            }

            if (helpers.isModelParameter('1.2', param)) {
              val = req.body;
            } else {
              val = req.body[param.name];
            }

            break;
          case 'header':
            val = req.headers[param.name];

            break;
          case 'path':
            _.each(api.keys, function (key, index) {
              if (key.name === param.name) {
                val = match[index + 1];
              }
            });

            break;
          case 'query':
            if (!req.query) {
              throw new Error('Server configuration error: req.query is not defined but is required');
            }

            val = req.query[param.name];

            break;
          }

          // Use the default value when necessary
          if (_.isUndefined(val) && !_.isUndefined(param.defaultValue)) {
            val = param.defaultValue;
          }

          metadata.params[param.name] = {
            schema: param,
            value: val
          };
        });
      } catch (err) {
        return next(err);
      }
    }

    return next();
  };
};
