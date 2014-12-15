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
var helpers = require('../helpers');
var send400 = helpers.send400;
var validators = require('../../lib/validators');

/**
 * Middleware for using Swagger information to validate API requests/responses.
 *
 * This middleware also requires that you use the swagger-metadata middleware before this middleware.  This middleware
 * also makes no attempt to work around invalid Swagger documents.
 *
 * @param {object} [options] - The middleware options
 * @param {boolean} [options.validateResponse=false] - Whether or not to validate responses
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerValidatorMiddleware (options) {
  if (_.isUndefined(options)) {
    options = {};
  }

  return function swaggerValidator (req, res, next) {
    var operation = req.swagger ? req.swagger.operation : undefined;

    if (!_.isUndefined(operation)) {
      var paramName; // Here since we use it in the catch block
      var paramPath; // Here since we use it in the catch block

      // If necessary, override 'res.send'
      if (options.validateResponse === true) {
        helpers.wrapEnd('2.0', req, res, next);
      }

      // Validate the request
      try {
        // Validate the content type
        validators.validateContentType(req.swagger.swaggerObject.consumes, operation.consumes, req);

        async.map(req.swagger.operationParameters, function (paramMetadata, oCallback) {
          var parameter = paramMetadata.schema;
          var val;

          paramName = parameter.name;
          paramPath = paramMetadata.path;
          val = req.swagger.params[paramName].value;

          // Validate requiredness
          validators.validateRequiredness(val, parameter.required);

          // Quick return if the value is not present
          if (_.isUndefined(val)) {
            return oCallback();
          }

          helpers.validateValue(req, parameter, paramPath, val, oCallback);
        }, function (err) {
          if (err) {
            throw err;
          } else {
            return next();
          }
        });
      } catch (err) {
        if (err.failedValidation === true) {
          if (!err.path) {
            err.path = paramPath;
          }

          err.paramName = paramName;
        }

        return send400(req, res, next, err);
      }
    } else {
      return next();
    }
  };
};
