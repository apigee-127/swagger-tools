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
var debug = require('debug')('swagger-tools:middleware:ui');
var fs = require('fs');
var helpers = require('../lib/helpers');
var parseurl = require('parseurl');
var path = require('path');
var serveStatic = require('serve-static');

var defaultOptions = {
  apiDocs: '/api-docs',
  swaggerUi: '/docs'
};
var staticOptions = {};

/**
 * Middleware for serving the Swagger documents and Swagger UI.
 *
 * @param {object} rlOrSO - The Resource Listing (Swagger 1.2) or Swagger Object (Swagger 2.0)
 * @param {object[]} apiDeclarations - The array of API Declarations (Swagger 1.2)
 * @param {object} [options] - The configuration options
 * @param {string=/api-docs} [options.apiDocs] - The relative path to serve your Swagger documents from
 * @param {string=/docs} [options.swaggerUi] - The relative path to serve Swagger UI from
 * @param {string} [options.swaggerUiDir] - The filesystem path to your custom swagger-ui deployment to serve
 *
 * @returns the middleware function
 */
exports = module.exports = function (rlOrSO, apiDeclarations, options) {
  debug('Initializing swagger-ui middleware');

  var swaggerVersion = helpers.getSwaggerVersion(rlOrSO);
  var apiDocsCache = {}; // Swagger document endpoints cache
  var apiDocsPaths = [];
  var staticMiddleware;
  var swaggerApiDocsURL;
  var swaggerUiPath;

  if (swaggerVersion !== '1.2') {
    options = apiDeclarations;
    apiDeclarations = [];
  }

  // Set the defaults
  options = _.defaults(options || {}, defaultOptions);

  if (_.isUndefined(rlOrSO)) {
    throw new Error('rlOrSO is required');
  } else if (!_.isPlainObject(rlOrSO)) {
    throw new TypeError('rlOrSO must be an object');
  }

  if (swaggerVersion === '1.2') {
    if (_.isUndefined(apiDeclarations)) {
      throw new Error('apiDeclarations is required');
    } else if (!_.isPlainObject(apiDeclarations)) {
      throw new TypeError('apiDeclarations must be an object');
    }
  }

  swaggerUiPath = options.swaggerUiDir ?
    path.resolve(options.swaggerUiDir) :
    path.join(__dirname, 'swagger-ui');

  if (options.swaggerUiDir) {
    if (!fs.existsSync(swaggerUiPath)) {
      throw new Error('options.swaggerUiDir path does not exist: ' + swaggerUiPath);
    } else if (!fs.statSync(swaggerUiPath).isDirectory()) {
      throw new Error('options.swaggerUiDir path is not a directory: ' + swaggerUiPath);
    }
  }

  staticMiddleware = serveStatic(swaggerUiPath, staticOptions);

  // Sanitize values
  if (options.apiDocs.charAt(options.apiDocs.length -1) === '/') {
    options.apiDocs = options.apiDocs.substring(0, options.apiDocs.length - 1);
  }

  if (options.swaggerUi.charAt(options.swaggerUi.length -1) === '/') {
    options.swaggerUi = options.swaggerUi.substring(0, options.swaggerUi.length - 1);
  }

  debug('  Using swagger-ui from: %s', options.swaggerUiDir ? swaggerUiPath : 'internal');
  debug('  API Docs path: %s', options.apiDocs);

  // Add the Resource Listing or SwaggerObject to the response cache
  apiDocsCache[options.apiDocs] = JSON.stringify(rlOrSO, null, 2);

  // Add API Declarations to the response cache
  _.each(apiDeclarations, function (resource, resourcePath) {
    var adPath = options.apiDocs + resourcePath;

    // Respond with pretty JSON (Configurable?)
    apiDocsCache[adPath] = JSON.stringify(resource, null, 2);

    debug('    API Declaration path: %s', adPath);
  });

  apiDocsPaths = Object.keys(apiDocsCache);

  debug('  swagger-ui path: %s', options.swaggerUi);

  return function swaggerUI (req, res, next) {
    var path = parseurl(req).pathname;
    var isApiDocsPath = apiDocsPaths.indexOf(path) > -1 || (swaggerVersion !== '1.2' && path === options.apiDocsPath);
    var isSwaggerUiPath = path === options.swaggerUi || path.indexOf(options.swaggerUi + '/') === 0;

    if (_.isUndefined(swaggerApiDocsURL)) {
      // Start with the original path
      swaggerApiDocsURL = parseurl.original(req).pathname;

      // Remove the part after the mount point
      swaggerApiDocsURL = swaggerApiDocsURL.substring(0, swaggerApiDocsURL.indexOf(req.url));
      
      // Add the API docs path and remove any double dashes
      swaggerApiDocsURL = ((options.swaggerUiPrefix ? options.swaggerUiPrefix : '') + swaggerApiDocsURL + options.apiDocs).replace(/\/\//g, '/'); 
    }

    debug('%s %s', req.method, req.url);
    debug('  Will process: %s', isApiDocsPath || isSwaggerUiPath ? 'yes' : 'no');

    if (isApiDocsPath) {
      debug('  Serving API Docs');

      res.setHeader('Content-Type', 'application/json');

      return res.end(apiDocsCache[path]);
    } else if (isSwaggerUiPath) {
      debug('  Serving swagger-ui');

      res.setHeader('Swagger-API-Docs-URL', swaggerApiDocsURL);

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
