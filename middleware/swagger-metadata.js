/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var url = require('url');
var _ = require('lodash');
var parseurl = require('parseurl');
var pathToRegexp = require('path-to-regexp');

var expressStylePath = function expressStylePath (api) {
  // Since all path parameters must be required, no need to do any fancy parsing
  return (api.path || '').replace(/{/g, ':').replace(/}/g, '');
};

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
exports = module.exports = function swaggerMiddleware (resourceList, resources) {
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
    var basePrefix = (resource && resource.basePath) ? url.parse(resource.basePath).pathname : '';
    _.each(resource.apis, function (api) {
      var keys = [];
      var re = pathToRegexp(basePrefix + expressStylePath(api), keys);
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

  return function swagger (req, res, next) {
    var path = parseurl(req).pathname;
    var match;
    var api = _.find(apis, function (api) {
      match = api.re.exec(path);
      return _.isArray(match);
    });
    var swaggerMetadata = {
      api: api ? api.api : undefined,
      authorizations: resourceList.authorizations || {},
      models: api ? resources[api.resourceIndex].models || {} : {},
      operation: api ? api.operations[req.method] : undefined,
      params: {}
    };

    // Collect the parameter values
    if (!_.isUndefined(swaggerMetadata.operation)) {
      _.each(swaggerMetadata.operation.parameters, function (param) {
        var val;

        // Get the value to validate based on the operation parameter type
        switch (param.paramType) {
        case 'body':
        case 'form':
          if (!req.body) {
            return next('Server configuration error: req.body is not defined but is required');
          }

          val = req.body[param.name];

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
            return next('Server configuration error: req.query is not defined but is required');
          }

          val = req.query[param.name];

          break;
        }

        // Use the default value when necessary
        if (_.isUndefined(val) && !_.isUndefined(param.defaultValue)) {
          val = param.defaultValue;
        }

        swaggerMetadata.params[param.name] = {
          schema: param,
          value: val
        };
      });

      // Attach Swagger metadata to the request
      req.swagger = swaggerMetadata;
    }

    return next();
  };
};
