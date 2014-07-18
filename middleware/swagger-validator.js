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
// http://tools.ietf.org/html/rfc3339#section-5.6
var dateRegExp = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
// http://tools.ietf.org/html/rfc3339#section-5.6
var dateTimeRegExp = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}:[0-9]{2}))$/;
var parseurl = require('parseurl');
var pathToRegexp = require('path-to-regexp');
var spec = require('../').v1_2; // jshint ignore:line
var validTypes = ['body', 'form', 'header', 'path', 'query'];

var expressStylePath = function (api) {
  // Since all path parameters must be required, no need to do any fancy parsing
  return (api.path || '').replace(/{/g, ':').replace(/}/g, '');
};
var isValid = function (val, type, format) {
  var isValidDate = function (date) {
    var day;
    var matches;
    var month;

    if (!_.isString(date)) {
      date = date.toString();
    }

    matches = dateRegExp.exec(date);

    if (matches === null) {
        return false;
    }

    day = matches[3];
    month = matches[2];

    if (month < '01' || month > '12' || day < '01' || day > '31') {
      return false;
    }

    return true;
  };
  var isValidDateTime = function (dateTime) {
    var hour;
    var date;
    var time;
    var matches;
    var minute;
    var parts;
    var second;

    if (!_.isString(dateTime)) {
      dateTime = dateTime.toString();
    }

    parts = dateTime.toLowerCase().split('t');
    date = parts[0];
    time = parts.length > 1 ? parts[1] : undefined;

    if (!isValidDate(date)) {
        return false;
    }

    matches = dateTimeRegExp.exec(time);

    if (matches === null) {
        return false;
    }

    hour = matches[1];
    minute = matches[2];
    second = matches[3];

    if (hour > '23' || minute > '59' || second > '59') {
      return false;
    }

    return true;
  };
  var isValid = true;

  switch (type) {
  case 'boolean':
    isValid = !_.isBoolean(val) || ['false', 'true'].indexOf(val) !== -1;

  case 'integer':
    isValid = !_.isNaN(parseInt(val, 10));

  case 'number':
    isValid = !_.isNaN(parseFloat(val))

  case 'string':
    if (!_.isUndefined(format)) {
      switch (format) {
      case 'date':
        return isValidDate(val);

      case 'date-time':
        return isValidDateTime(val);

      }
    }
  }

  return isValid;
};

/**
 * Middleware for using Swagger information to validate API requests prior to sending the request to the route handler.
 *
 * This middleware requires that you use the appropriate middleware to populate req.body and req.query before this
 * middleware.  This middleware also makes no assumptions about the validity of your resources and should handle even
 * malformed resources.
 *
 * @param {object[]} resources - The array of resources
 *
 * @returns the middleware function
 */
exports = module.exports = function (resources) {
  if (_.isUndefined(resources)) {
    throw new Error('resources is required');
  } else if (!_.isArray(resources)) {
    throw new TypeError('resources must be an array');
  }

  var apis = {};

  // Gather the apis and resources
  _.each(resources, function (resource) {
    if (_.isArray(resource.apis)) {
      _.each(resource.apis, function (api) {
        var keys = [];
        var re = pathToRegexp(expressStylePath(api), keys);
        var reStr = re.toString();

        if (Object.keys(apis).indexOf(reStr) !== -1) {
          throw new Error('Duplicate API path/pattern: ' + api.path);
        }

        apis[reStr] = {
          keys: keys,
          re: re,
          operations: {}
        }

        if (_.isArray(api.operations)) {
          _.each(api.operations, function (operation) {
            var method = operation.method;

            if (!_.isUndefined(apis[reStr][method])) {
              throw new Error('Duplicate API operation (' + api.path + ') method: ' + method);
            }

            apis[reStr].operations[method] = operation;
          });
        }
      });
    }
  });

  return function swaggerValidatorMiddleware (req, res, next) {
    // http://www.w3.org/Protocols/rfc2616/rfc2616-sec7.html#sec7.2.1
    var contentType = req.headers['content-type'] || 'application/octet-stream';
    var method = req.method;
    var path = parseurl(req).pathname;
    var match;
    var api = _.find(apis, function (api) {
      match = api.re.exec(path);
      return _.isArray(match);
    });
    var operation = api.operations[method];
    var returnError = function (message, status) {
      res.status = _.isUndefined(status) ? 500 : status;

      return next(message);
    };
    var params;
    var consumes;

    if (!_.isUndefined(operation)) {
      params = operation.parameters || [];
      consumes = operation.consumes;

      // Validate content type (Only for POST/PUT per HTTP spec)
      if (!_.isUndefined(consumes) && _.isArray(consumes) && ['POST', 'PUT'].indexOf(method) !== -1) {
        if (consumes.indexOf(contentType) === -1) {
          return returnError('Invalid content type (' + contentType + ').  These are valid: ' + consumes.join(', '));
        }
      }

      // Validate the parameters
      _.each(params, function (param) {
        var enumValues = param.enum;
        var format = param.format;
        var itemsType = _.isObject(param.items) ? param.items.type : undefined; // Not sure how to handle models yet
        var minimum = param.minimum;
        var maximum = param.maximum;
        var name = param.name;
        var type = param.type;
        var invalidParamPrefix = 'Parameter (' + name + ') ';
        var invalidTypePrefix = invalidParamPrefix + 'is not a valid ';
        var required;
        var testVal;
        var val;

        // Get the value to validate based on the operation parameter type
        switch (param.paramType) {
        case 'body':
        case 'form':
          if (!req.body) {
            return returnError('Server configuration error: req.body is not defined but is required')
          }

          val = req.body[name];

          break;
        case 'header':
          val = req.headers[name];

          break;
        case 'path':
          _.each(api.keys, function (key, index) {
            if (key.name === name && _.isUndefined(val)) {
              val = match[index + 1];
            }
          });

          break;
        case 'query':
          if (!req.query) {
            return returnError('Server configuration error: req.query is not defined but is required')
          }

          val = req.query[name];

          break;
        default:
          return returnError('Invalid Swagger parameter type (' + param.paramType + ').  These are valid: ' +
                             validTypes.join(', '));
        }

        // Use the default value when necessary
        if (_.isUndefined(val) && param.defaultValue) {
          val = param.defaultValue;
        }

        // Validate requiredness
        if (!_.isUndefined(param.required)) {
          if (_.isBoolean(param.required)) {
            required = param.required;
          } else {
            return returnError('Invalid Swagger document (Operation required must be a boolean): ' + param.required);
          }

          if (required && _.isUndefined(val)) {
            return returnError(invalidParamPrefix + 'is required', 400);
          }
        }

        // Validate the value type/format
        switch (type) {
        case 'array':
          if (_.isUndefined(param.items)) {
            return returnError('Invalid Swagger document (Operation items is required for array type)');
          } else if (!_.isObject(param.items)) {
            return returnError('Invalid Swagger document (Operation items is must be an object)');
          }

          break;

        default:
          if (!isValid(val, type, format)) {
            return returnError(invalidTypePrefix + (_.isUndefined(format) ? '' : format + ' ') + type + ': ' + val,
                               400);
          }

          if (type === 'integer') {
            testVal = parseInt(val, 10);
          } else if (type === 'number') {
            testVal = parseFloat(val);
          }
        }

        // Validate enum
        if (_.isArray(enumValues)) {
          if (type !== 'string') {
            return returnError('Invalid Swagger document (Operation enum is only valid for string type): ' + type);
          }

          if (enumValues.indexOf(val) === -1) {
            return returnError(invalidParamPrefix + 'is not an allowable value (' + enumValues.join(', ') + '): ' + val,
                               400);
          }
        }

        // Validate minimum
        if (!_.isUndefined(minimum)) {
          if (['integer', 'number'].indexOf(type) === -1) {
            return returnError('Invalid Swagger document (Operation minimum is only valid for integer and number ' +
                               'types): ' + type);
          }

          minimum = parseFloat(minimum);

          if (_.isNaN(minimum)) {
            return returnError('Invalid Swagger document (Operation minimum is not a number): ' + param.minimum);
          } else if (testVal < minimum) {
            return returnError(invalidParamPrefix + 'is less than the configured minimum (' + param.minimum +
                               '): ' + val, 400);
          }
        }

        // Validate maximum
        if (!_.isUndefined(maximum)) {
          if (['integer', 'number'].indexOf(type) === -1) {
            return returnError('Invalid Swagger document (Operation maximum is only valid for integer and number ' +
                               'types): ' + type);
          }

          maximum = parseFloat(maximum);

          if (_.isNaN(maximum)) {
            return returnError('Invalid Swagger document (Operation maximum is not a number): ' + param.maximum);
          } else if (testVal > maximum) {
            return returnError(invalidParamPrefix + 'is greater than the configured maximum (' + param.maximum +
                        '): ' + val, 400);
          }
        }

        // Validate array
        if (type === 'array' && !_.isUndefined(itemsType)) {
          try {
            (_.isArray(val) ? val : [val]).forEach(function (aVal, index) {
              if (!isValid(aVal, itemsType, param.forEach)) {
                throw Error(invalidParamPrefix + 'at index ' + index + ' is not a valid ' + itemsType + ': ' + aVal);
              }
            });
          } catch (err) {
            return returnError(err.message);
          }
        }

        // Validate uniqueItems
        if (_.isBoolean(param.uniqueItems)) {
          if (type !== 'array') {
            return returnError('Invalid Swagger document (Operation uniqueItems is only valid for array type): ' +
                               type);
          }

          if (_.isArray(val) && _.uniq(val).length !== val.length) {
            return returnError(invalidParamPrefix + 'does not allow duplicate values: ' + val.join(', '), 400);
          }
        }
      });
    }

    return next();
  };
};
