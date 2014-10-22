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
var isModelParameter = helpers.isModelParameter;
var toJsonPointer = require('../../lib/helpers').toJsonPointer;
var send400 = helpers.send400;
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
      // Validate the request
      try {
        // Validate the content type
        validators.validateContentType(req.swagger.swaggerObject.consumes, operation.consumes, req);

        _.each(_.union(req.swagger.path.parameters, operation.parameters), function (param) {
          var paramName = param.name;
          var paramPath = req.swagger.params[paramName].path;
          var val = req.swagger.params[paramName].value;

          // Validate requiredness
          validators.validateRequiredness(paramName, val, param.required);

          // Quick return if the value is not present
          if (_.isUndefined(val)) {
            return;
          }

          if (isModelParameter('2.0', param)) {
            if (param.schema) {
              paramPath.push('schema');
            }

            // Validate the model
            validators.validateModel(paramName, val, '2.0', req.swagger.swaggerObject,
                                     _.isUndefined(param.schema.$ref) ?
                                      toJsonPointer(paramPath) :
                                      param.schema.$ref);
          } else {
            // Constraints can appear in the parameter itself (type/format) and in the parameter's schema (if available)
            if (param.schema) {
              param = param.schema;
            }

            // Validate the value type/format
            validators.validateTypeAndFormat(paramName, val,
                                             param.type === 'array' ? param.items.type : param.type,
                                             param.type === 'array' && param.items.format ?
                                               param.items.format :
                                               param.format);

            // Validate enum
            validators.validateEnum(paramName, val, param.enum);

            // Validate maximum
            validators.validateMaximum(paramName, val, param.maximum, param.type, param.exclusiveMaximum);

            // Validate maximum items
            validators.validateMaxItems(paramName, val, param.maxItems);

            // Validate maximum length
            validators.validateMaxLength(paramName, val, param.maxLength);

            // Validate minimum
            validators.validateMinimum(paramName, val, param.minimum, param.type, param.exclusiveMinimum);

            // Validate minimum items
            validators.validateMinItems(paramName, val, param.minItems);

            // Validate minimum length
            validators.validateMinLength(paramName, val, param.minLength);

            // Validate pattern
            validators.validatePattern(paramName, val, param.pattern);

            // Validate uniqueItems
            validators.validateUniqueItems(paramName, val, param.uniqueItems);
          }
        });
      } catch (err) {
        return send400(req, res, next, err);
      }
    }

    return next();
  };
};
