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
 *   * path: The Swagger path the request is associated with
 *   * operation: The Swagger path operation the request is associated with
 *   * params: The parameters for the request
 *     * schema: The resource API operation parameter definition
 *     * value: The value of the paramter from the request (Not converted to any particular type)
 *   * swaggerObject: The Swagger object itself
 *
 * This middleware requires that you use the appropriate middleware to populate req.body and req.query before this
 * middleware.  This middleware also makes no attempt to work around invalid Swagger documents.
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

  var paths = {};

  // Gather the paths, their path regex patterns and the corresponding operations
  _.each(swaggerObject.paths, function (path, pathName) {
    var keys = [];
    var re = pathToRegexp(expressStylePath(swaggerObject.basePath, pathName), keys);
    var reStr = re.toString();

    paths[reStr] = {
      apiPath: pathName,
      path: path,
      keys: keys,
      re: re,
      operations: {}
    };

    _.each(['get', 'put', 'post', 'delete', 'options', 'head', 'patch'], function (method) {
      var operation = path[method];

      if (!_.isUndefined(operation)) {
        paths[reStr].operations[method] = operation;
      }
    });
  });

  return function swaggerMetadata (req, res, next) {
    var rPath = parseurl(req).pathname;
    var match;
    var path = _.find(paths, function (path) {
      match = path.re.exec(rPath);
      return _.isArray(match);
    });
    var metadata = {
      apiPath : path ? path.apiPath : undefined,
      path: path ? path.path : undefined,
      operation: path ? path.operations[req.method.toLowerCase()] : undefined,
      params: {},
      swaggerObject: swaggerObject
    };

    // Attach Swagger metadata to the request
    if (!_.isUndefined(path)) {
      req.swagger = metadata;
    }

    // Collect the parameter values
    if (!_.isUndefined(metadata.operation)) {
      try {
        // Until Swagger 2.0 documentation comes out, I'm going to assume that you cannot override "path" parameters
        // with operation parameters.  That's why we start with the path parameters first and then the operation
        // parameters.  (Note: "path" in this context is a path entry at #/paths in the Swagger Object)
        _.each(_.union(metadata.path.parameters, metadata.operation.parameters), function (param) {
          var paramPath = ['paths', path.apiPath];
          var paramType = param.in;
          var findIndex = function (params, name) {
            var foundIndex;

            _.each(params, function (param, index) {
              if (param.in === paramType && param.name === name) {
                foundIndex = index;
                return false;
              }
            });

            return foundIndex;
          };
          var paramIndex = findIndex(metadata.path.parameters, param.name);
          var val;

          // Get the value to validate based on the operation parameter type
          switch (paramType) {
          case 'body':
          case 'formData':
            if (!req.body) {
              throw new Error('Server configuration error: req.body is not defined but is required');
            }

            if (helpers.isModelParameter('2.0', param)) {
              val = req.body;
            } else {
              val = req.body[param.name];
            }

            break;
          case 'header':
            val = req.headers[param.name];

            break;
          case 'path':
            _.each(path.keys, function (key, index) {
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
          if (_.isUndefined(val) && !_.isUndefined(param.schema) && !_.isUndefined(param.schema.default)) {
            val = param.schema.default;
          }

          // Figure out the parameter path
          if (_.isUndefined(paramIndex)) {
            paramPath.push(req.method.toLowerCase());

            paramIndex = findIndex(metadata.operation.parameters, param.name);
          }

          paramPath.push('parameters', paramIndex);

          metadata.params[param.name] = {
            path: paramPath,
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
