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
        validators.validateContentType(req.swagger.api.consumes, operation.consumes, req);

        _.each(operation.parameters || [], function (param) {
          var paramName = param.name;
          var val = req.swagger.params[paramName].value;

          // Validate requiredness
          validators.validateRequiredness(paramName, val, param.required);

          // Quick return if the value is not present
          if (_.isUndefined(val)) {
            return;
          }

          if (isModelParameter('1.2', param)) {
            // Validate the model
            validators.validateModel(paramName, val, '1.2', req.swagger.apiDeclaration,
                                     param.type === 'array' && !_.isUndefined(param.items.$ref) ?
                                       param.items.$ref :
                                       param.type);
          } else {
            // Validate the value type/format
            validators.validateTypeAndFormat(paramName, val,
                                             param.type === 'array' ? param.items.type : param.type,
                                             param.type === 'array' && param.items.format ?
                                               param.items.format :
                                               param.format);

            // Validate enum
            validators.validateEnum(paramName, val, param.enum);

            // Validate maximum
            validators.validateMaximum(paramName, val, param.maximum, param.type);

            // Validate minimum
            validators.validateMinimum(paramName, val, param.minimum, param.type);

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
