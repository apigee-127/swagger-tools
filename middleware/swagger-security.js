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
var async = require('async');
var debug = require('debug')('swagger-tools:middleware:security');
var helpers = require('./helpers');

var getScopeOrAPIKey = function getScopeOrAPIKey (req, secDef, secName, secReq) {
  var swaggerVersion = req.swagger.swaggerVersion;
  var apiKeyPropName = swaggerVersion === '1.2' ? secDef.keyname : secDef.name;
  var apiKeyLocation = swaggerVersion === '1.2' ? secDef.passAs : secDef.in;
  var scopeOrKey;

  if (secDef.type === 'oauth2') {
    if (swaggerVersion === '1.2') {
      scopeOrKey = _.map(secReq[secName], function (scope) {
        return scope.scope;
      });
    } else {
      scopeOrKey = secReq[secName];
    }
  } else if (secDef.type === 'apiKey') {
    if (apiKeyLocation === 'query') {
      scopeOrKey = (req.query ? req.query : helpers.parseQueryString(req))[apiKeyPropName];
    } else if (apiKeyLocation === 'header') {
      scopeOrKey = req.headers[apiKeyPropName.toLowerCase()];
    }
  }

  return scopeOrKey;
};
var sendSecurityError = function sendSecurityError (err, res, next) {
  // Populate default values if not present
  if (!err.code) {
    err.code = 'server_error';
  }

  if (!err.statusCode) {
    err.statusCode = 403;
  }

  if (err.headers) {
    _.each(err.headers, function (header, name) {
      res.setHeader(name, header);
    });
  }

  res.statusCode = err.statusCode;

  next(err);
};

/**
 * Middleware for using Swagger security information to authenticate requests.
 *
 * This middleware also requires that you use the swagger-metadata middleware before this middleware. It is recommended
 * that this middleware is included before swagger-validator and swagger-router. This makes no attempt to work around
 * invalid Swagger documents.
 *
 *
 * A SecurityImplementation is essentially middleware must include 2 exported methods:
 *   configure (SecurityDefinition)
 *   authorize (request, response, SecurityRequirement)
 *
 * @param {object} [options] - The middleware options
 *                 [options.{name}={handler}] - the keys match SecurityDefinition names and the associated values are
 *                                              functions that accept the following parameters: (request,
 *                                              securityDefinition, scopes, callback) where callback accepts one
 *                                              argument - an Error if unauthorized. The Error may include "message",
 *                                              "state", and "code" fields to be conveyed to the client in the response
 *                                              body and a "headers" field containing an object representing headers
 *                                              to be set on the response to the client. In addition, if the Error has
 *                                              a statusCode field, the response statusCode will be set to match -
 *                                              otherwise, the statusCode will be set to 403.
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerSecurityMiddleware (options) {
  var handlers = options || {};

  debug('Initializing swagger-security middleware');
  debug('  Security handlers:%s', Object.keys(handlers).length > 0 ? '' : ' ' + Object.keys(handlers).length);

  _.each(options, function (func, name) {
    debug('    %s', name);
  });

  return function swaggerSecurity (req, res, next) {
    var operation = req.swagger ? req.swagger.operation : undefined;
    var securityReqs;

    debug('%s %s', req.method, req.url);
    debug('  Will process: %s', _.isUndefined(operation) ? 'no' : 'yes');

    if (operation) {
      securityReqs = req.swagger.swaggerVersion === '1.2' ?
        // Global (path level), authorization support is not possible:
        //   Not possible due to https://github.com/swagger-api/swagger-spec/issues/159
        _.reduce(req.swagger.operation.authorizations, function (arr, authorization, name) {
          var obj = {};

          obj[name] = _.map(authorization, function (scope) {
            return scope.scope;
          });

          return arr.concat(obj);
        }, []) :
      req.swagger.operation.security || req.swagger.swaggerObject.security;

      if (securityReqs && securityReqs.length > 0) {
        async.map(securityReqs, function(secReq, cb) { // logical OR - any one can allow
          var secName;

          async.map(Object.keys(secReq), function(name, cb) { // logical AND - all must allow
            var secDef = req.swagger.swaggerVersion === '1.2' ?
                  req.swagger.resourceListing.authorizations[name] :
                  req.swagger.swaggerObject.securityDefinitions[name];
            var handler = handlers[name];

            secName = name;

            if (!handler) {
              return cb(new Error('unknown security handler: ' + name));
            }

            return handler(req, secDef, getScopeOrAPIKey(req, secDef, name, secReq), cb);
          }, function (err) {
            debug('    Security check (%s): %s', secName, _.isUndefined(err) ? 'allowed' : 'denied');

            // swap normal err and result to short-circuit the logical OR
            if (err) {
              return cb(undefined, err);
            }

            return cb(new Error('OK'));
          });
        }, function (ok, errors) { // note swapped results
          var allowed = !_.isUndefined(ok) && ok.message === 'OK';

          debug('    Request allowed: %s', allowed);

          if (allowed) {
            return next();
          }

          return sendSecurityError(errors[0], res, next);
        });
      } else {
        return next();
      }
    } else {
      return next();
    }
  };
};
