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
var parseurl = require('parseurl');
var path = require('path');
var serveStatic = require('serve-static');

var defaultOptions = {
  apiDocs: '/api-docs',
  swaggerUi: '/docs'
};
var staticOptions = {};

/**
 * Middleware for serving the Swagger documents via an API and Swagger UI.
 *
 * @param {object} resourceListing - The resource listing object
 * @param {object} resources - The resources to serve and their relative endpoint paths (These must match API paths in
 *                             the resource listing.)
 * @param {object} [options] - The configuration options
 * @param {string=/api-docs} [options.apiDocs] - The relative path to serve your Swagger documents from
 * @param {string=/docs} [options.swaggerUi] - The relative path to serve Swagger UI from
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerUIMiddleware (resourceList, resources, options) {
  var apiDocsCache = {}; // Swagger document endpoints cache
  var apiDocsPaths = [];
  var rlApiPaths = [];
  var staticMiddleware = serveStatic(path.join(__dirname, '..', 'swagger-ui'), staticOptions);
  var apiDocsHandler = function apiDocsHandler (res, path) {
    res.setHeader('Content-Type', 'application/json');
    res.end(apiDocsCache[path]);
  };

  // Validate arguments
  if (_.isUndefined(resourceList)) {
    throw new Error('resourceList is required');
  } else if (!_.isPlainObject(resourceList)) {
    throw new TypeError('resourceList must be an object');
  }

  if (_.isUndefined(resources)) {
    throw new Error('resources is required');
  } else if (!_.isPlainObject(resources)) {
    throw new TypeError('resources must be an object');
  }

  // Set the defaults
  options = _.defaults(options || {}, defaultOptions);

  // Sanitize values
  if (options.apiDocs.charAt(options.apiDocs.length -1) === '/') {
    options.apiDocs = options.apiDocs.substring(0, options.apiDocs.length - 1);
  }

  if (options.swaggerUi.charAt(options.swaggerUi.length -1) === '/') {
    options.swaggerUi = options.swaggerUi.substring(0, options.swaggerUi.length - 1);
  }

  // Create the apiPaths list
  _.each(resourceList.apis, function (api) {
    if (rlApiPaths.indexOf(api.path) > -1) {
      throw new Error('API path declared multiple times: ' + api.path);
    }

    rlApiPaths.push(api.path);
  });

  // Add the Resource Listing to the response cache
  apiDocsCache[options.apiDocs] = JSON.stringify(resourceList, null, 2);

  // Add API Declarations to the response cache
  _.each(resources, function (resource, resourcePath) {
    if (rlApiPaths.indexOf(resourcePath) === -1) {
      throw new Error('resource path is not defined in the resource listing: ' + resourcePath);
    }

    // Respond with pretty JSON (Configurable?)
    apiDocsCache[options.apiDocs + resourcePath] = JSON.stringify(resource, null, 2);
  });

  apiDocsPaths = Object.keys(apiDocsCache);

  return function swaggerUI (req, res, next) {
    var path = parseurl(req).pathname;

    if (apiDocsPaths.indexOf(path) > -1) {
      return apiDocsHandler(res, path);
    } else if (path === options.swaggerUi || path.indexOf(options.swaggerUi + '/') === 0) {
      res.setHeader('Swagger-API-Docs-URL', options.apiDocs);

      if (path === options.swaggerUi || path === options.swaggerUi + '/') {
        req.url = '/';
      } else {
        req.url = req.url.substring(options.swaggerUi.length);
      }

      return staticMiddleware(req, res, next);
    }

    return next();
  };
};
