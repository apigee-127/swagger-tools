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
 * @param {object} swaggerObject - The Swagger object
 * @param {object} [options] - The configuration options
 * @param {string=/api-docs} [options.apiDocs] - The relative path to serve your Swagger documents from
 * @param {string=/docs} [options.swaggerUi] - The relative path to serve Swagger UI from
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerUIMiddleware (swaggerObject, options) {
  var staticMiddleware = serveStatic(path.join(__dirname, '..', 'swagger-ui'), staticOptions);
  var apiDocs;

  // Validate arguments
  if (_.isUndefined(swaggerObject)) {
    throw new Error('swaggerObject is required');
  } else if (!_.isPlainObject(swaggerObject)) {
    throw new TypeError('swaggerObject must be an object');
  }

  apiDocs = JSON.stringify(swaggerObject, null, 2);

  // Set the defaults
  options = _.defaults(options || {}, defaultOptions);

  // Sanitize values
  if (options.apiDocs.charAt(options.apiDocs.length -1) === '/') {
    options.apiDocs = options.apiDocs.substring(0, options.apiDocs.length - 1);
  }

  if (options.swaggerUi.charAt(options.swaggerUi.length -1) === '/') {
    options.swaggerUi = options.swaggerUi.substring(0, options.swaggerUi.length - 1);
  }

  return function swaggerUI (req, res, next) {
    var path = parseurl(req).pathname;

    if (path === options.apiDocs || path === options.apiDocs + '/') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(apiDocs);
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
