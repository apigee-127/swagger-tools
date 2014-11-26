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
var spec = require('../../lib/helpers').getSpec('1.2');
var validators = require('../../lib/validators');

/**
 * Middleware for using Swagger information to validate API requests prior to sending the request to the route handler.
 *
 * This middleware also requires that you use the swagger-metadata middleware before this middleware.  This middleware
 * also makes no attempt to work around invalid Swagger documents.
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerValidatorMiddleware () {
  return function swaggerValidator (req, res, next) {
    var operation = req.swagger ? req.swagger.operation : undefined;

    if (!_.isUndefined(operation)) {
      var paramIndex = 0;
      var paramName; // Here since we use it in the catch block
      var paramPath; // Here since we use it in the catch block

      // Validate the request
      try {
        // Validate the content type
        validators.validateContentType(req.swagger.api.consumes, operation.consumes, req);

        async.map(operation.parameters, function (parameter, oCallback) {
          var isModel = helpers.isModelParameter('1.2', parameter);
          var val;

          paramName = parameter.name;
          paramPath = req.swagger.operationPath.concat(['params', paramIndex.toString()]);
          val = req.swagger.params[paramName].value;

          // Validate requiredness
          validators.validateRequiredness(val, parameter.required);

          // Quick return if the value is not present
          if (_.isUndefined(val)) {
            return oCallback();
          }

          validators.validateSchemaConstraints('1.2', parameter, paramPath, val);

          if (isModel) {
            async.map(parameter.type === 'array' ? val : [val], function (aVal, callback) {
              spec.validateModel(req.swagger.apiDeclaration,
                                 '#/models/' + (parameter.items ?
                                                  parameter.items.type || parameter.items.$ref :
                                                  parameter.type),
                                 aVal, callback);
            }, function (err, allResults) {
              if (!err) {
                _.each(allResults, function (results) {
                  if (results) {
                    err = new Error('Failed schema validation');

                    err.code = 'SCHEMA_VALIDATION_FAILED';
                    err.errors = results.errors;
                    err.failedValidation = true;

                    return false;
                  }
                });
              }

              oCallback(err);
            });
          } else {
            oCallback();
          }

          paramIndex++;
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
