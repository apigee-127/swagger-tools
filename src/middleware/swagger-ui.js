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
const debug = require('debug')('swagger-tools:middleware:ui');
const fs = require('fs');
const parseurl = require('parseurl');
const path = require('path');
const serveStatic = require('serve-static');

const helpers = require('../lib/helpers');

const defaultOptions = {
  apiDocs: '/api-docs',
  swaggerUi: '/docs',
};
const staticOptions = {};

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
module.exports = (rlOrSO, _apiDeclarations, _options) => {
  debug('Initializing swagger-ui middleware');

  let apiDeclarations = _apiDeclarations;
  let options = _options;

  const swaggerVersion = helpers.getSwaggerVersion(rlOrSO);
  const apiDocsCache = {}; // Swagger document endpoints cache
  let apiDocsPaths = [];
  let swaggerApiDocsURL;

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

  const swaggerUiPath = options.swaggerUiDir
    ? path.resolve(options.swaggerUiDir)
    : path.join(__dirname, 'swagger-ui');

  if (options.swaggerUiDir) {
    if (!fs.existsSync(swaggerUiPath)) {
      throw new Error(
        `options.swaggerUiDir path does not exist: ${swaggerUiPath}`,
      );
    } else if (!fs.statSync(swaggerUiPath).isDirectory()) {
      throw new Error(
        `options.swaggerUiDir path is not a directory: ${swaggerUiPath}`,
      );
    }
  }

  const staticMiddleware = serveStatic(swaggerUiPath, staticOptions);

  // Sanitize values
  if (options.apiDocs.charAt(options.apiDocs.length - 1) === '/') {
    options.apiDocs = options.apiDocs.substring(0, options.apiDocs.length - 1);
  }

  if (options.swaggerUi.charAt(options.swaggerUi.length - 1) === '/') {
    options.swaggerUi = options.swaggerUi.substring(
      0,
      options.swaggerUi.length - 1,
    );
  }

  debug(
    '  Using swagger-ui from: %s',
    options.swaggerUiDir ? swaggerUiPath : 'internal',
  );
  debug('  API Docs path: %s', options.apiDocs);

  // Add the Resource Listing or SwaggerObject to the response cache
  apiDocsCache[options.apiDocs] = JSON.stringify(rlOrSO, null, 2);

  // Add API Declarations to the response cache
  _.each(apiDeclarations, (resource, resourcePath) => {
    const adPath = options.apiDocs + resourcePath;

    // Respond with pretty JSON (Configurable?)
    apiDocsCache[adPath] = JSON.stringify(resource, null, 2);

    debug('    API Declaration path: %s', adPath);
  });

  apiDocsPaths = Object.keys(apiDocsCache);

  debug('  swagger-ui path: %s', options.swaggerUi);

  return function swaggerUI(req, res, next) {
    const { pathname: urlPath } = parseurl(req);
    const isApiDocsPath =
      apiDocsPaths.indexOf(urlPath) > -1 ||
      (swaggerVersion !== '1.2' && urlPath === options.apiDocsPath);
    const isSwaggerUiPath =
      urlPath === options.swaggerUi ||
      urlPath.indexOf(`${options.swaggerUi}/`) === 0;

    if (_.isUndefined(swaggerApiDocsURL)) {
      // Start with the original path
      swaggerApiDocsURL = parseurl.original(req).pathname;

      // Remove the part after the mount point
      swaggerApiDocsURL = swaggerApiDocsURL.substring(
        0,
        swaggerApiDocsURL.indexOf(req.url),
      );

      // Add the API docs path and remove any double dashes
      const prefix = options.swaggerUiPrefix ? options.swaggerUiPrefix : '';
      swaggerApiDocsURL = `${prefix}${swaggerApiDocsURL}${options.apiDocs}`.replace(
        /\/\//g,
        '/',
      );
    }

    debug('%s %s', req.method, req.url);
    debug(
      '  Will process: %s',
      isApiDocsPath || isSwaggerUiPath ? 'yes' : 'no',
    );

    if (isApiDocsPath) {
      debug('  Serving API Docs');

      res.setHeader('Content-Type', 'application/json');

      return res.end(apiDocsCache[urlPath]);
    }

    if (isSwaggerUiPath) {
      debug('  Serving swagger-ui');

      res.setHeader('Swagger-API-Docs-URL', swaggerApiDocsURL);

      if (
        urlPath === options.swaggerUi ||
        urlPath === `${options.swaggerUi}/`
      ) {
        req.url = '/';
      } else {
        req.url = req.url.substring(options.swaggerUi.length);
      }

      return staticMiddleware(req, res, next);
    }

    return next();
  };
};

exports = module.exports;
