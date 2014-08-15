/*
 * Copyright 2014 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var _ = require('lodash');
var validators = require('../validators');

/**
 * Middleware for using Swagger information to validate API requests prior to sending the request to the route handler.
 *
 * This middleware also requires that you use the swagger-metadata middleware before this middleware.  This middleware
 * also makes no attempt to work around invalid Swagger documents.
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerValidatorMiddleware () {

  // TODO: Add support for validating models (https://github.com/apigee-127/swagger-tools/issues/18)

  return function swaggerValidator (req, res, next) {
    var operation = req.swagger ? req.swagger.operation : undefined;

    if (!_.isUndefined(operation)) {
      // Validate the request
      try {
        // Validate the content type
        validators.validateContentType(req.swagger.swaggerObject.consumes, operation.consumes, req);

        _.each(_.union(req.swagger.path.parameters, operation.parameters), function (param) {
          var paramName = param.name;
          var val = req.swagger.params[paramName].value;

          // Validate requiredness
          validators.validateRequiredness(paramName, val, param.required);

          // Quick return if the value is not present
          if (_.isUndefined(val)) {
            return;
          }

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
        });
      } catch (err) {
        return next(err.message);
      }
    }

    return next();
  };
};
