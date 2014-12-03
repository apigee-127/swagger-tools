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
 *                 [options.{name}={SecurityImplementation}] - the keys match SecurityDefinition names and associated
 *                                                             values are handler functions that accept the following:
 *                                                             (request, securityDefinition, scopes, callback) where
 *                                                             callback only takes one boolean argument (true for
 *                                                             authorized, false for not)
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerSecurityMiddleware(options) {

  var handlers = options || {};

  return function swaggerSecurity(req, res, next) {

    if (!req.swagger) { return next(); }

    var securityReqs = req.swagger.operation.security || req.swagger.swaggerObject.security;
    if (!securityReqs) { return next(); }

    async.any(securityReqs, function(secReq, cb) { // logical OR

      async.all(Object.keys(secReq), function(name, cb) { // logical AND

        var secDef = req.swagger.swaggerObject.securityDefinitions[name];
        var handler = handlers[name];

        if (!(secDef && handler)) { return cb(false); }

        handler(req, secDef, secReq[name], cb);
      },
        function(allow) {
          cb(allow);
        }
      );
    },
    function(allow) {
      if (allow) { return next(); }
      res.statusCode = 403;
      next(new Error('unauthorized'));
    });
  }
};
