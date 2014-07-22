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

var expressStylePath = function expressStylePath (api) {
  // Since all path parameters must be required, no need to do any fancy parsing
  return (api.path || '').replace(/{/g, ':').replace(/}/g, '');
};
var isValid = function isValid (val, type, format) {
  var isValidDate = function isValidDate (date) {
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
  var isValidDateTime = function isValidDateTime (dateTime) {
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
  var result = true;

  switch (type) {
  case 'boolean':
    result = _.isBoolean(val) || ['false', 'true'].indexOf(val) !== -1;
    break;
  case 'integer':
    result = !_.isNaN(parseInt(val, 10));
    break;
  case 'number':
    result = !_.isNaN(parseFloat(val));
    break;
  case 'string':
    if (!_.isUndefined(format)) {
      switch (format) {
      case 'date':
        result = isValidDate(val);
        break;
      case 'date-time':
        result = isValidDateTime(val);
        break;
      }
    }
    break;
  }

  return result;
};

/**
 * Middleware for using Swagger information to validate API requests prior to sending the request to the route handler.
 *
 * This middleware requires that you use the appropriate middleware to populate req.body and req.query before this
 * middleware.  This middleware also makes no attempt to work around invalid Swagger documents.
 *
 * @param {object[]} resources - The array of resources
 *
 * @returns the middleware function
 */
exports = module.exports = function swaggerValidatorMiddleware (resources) {
  if (_.isUndefined(resources)) {
    throw new Error('resources is required');
  } else if (!_.isArray(resources)) {
    throw new TypeError('resources must be an array');
  }

  var apis = {};

  // Gather the apis and resources
  _.each(resources, function (resource) {
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
      };

      _.each(api.operations, function (operation) {
        var method = operation.method;

        if (!_.isUndefined(apis[reStr][method])) {
          throw new Error('Duplicate API operation (' + api.path + ') method: ' + method);
        }

        apis[reStr].operations[method] = operation;
      });
    });
  });

  return function swaggerValidator (req, res, next) {
    // http://www.w3.org/Protocols/rfc2616/rfc2616-sec7.html#sec7.2.1
    var contentType = req.headers['content-type'] || 'application/octet-stream';
    var path = parseurl(req).pathname;
    var match;
    var api = _.find(apis, function (api) {
      match = api.re.exec(path);
      return _.isArray(match);
    });
    var operation = api.operations[req.method];
    var returnError = function returnError (message, status) {
      res.status = _.isUndefined(status) ? 500 : status;

      return next(message);
    };

    if (!_.isUndefined(operation)) {
      // Validate content type (Only for POST/PUT per HTTP spec)
      if (!_.isUndefined(operation.consumes) && ['POST', 'PUT'].indexOf(req.method) !== -1) {
        if (operation.consumes.indexOf(contentType) === -1) {
          return returnError('Invalid content type (' + contentType + ').  These are valid: ' +
                             operation.consumes.join(', '));
        }
      }

      // Validate the parameters
      _.each(operation.parameters || [], function (param) {
        var minimum = param.minimum;
        var maximum = param.maximum;
        var invalidParamPrefix = 'Parameter (' + param.name + ') ';
        var invalidTypePrefix = invalidParamPrefix + 'is not a valid ';
        var testVal;
        var val;

        // Get the value to validate based on the operation parameter type
        switch (param.paramType) {
        case 'body':
        case 'form':
          if (!req.body) {
            return returnError('Server configuration error: req.body is not defined but is required');
          }

          val = req.body[param.name];

          break;
        case 'header':
          val = req.headers[param.name];

          break;
        case 'path':
          _.each(api.keys, function (key, index) {
            if (key.name === param.name && _.isUndefined(val)) {
              val = match[index + 1];
            }
          });

          break;
        case 'query':
          if (!req.query) {
            return returnError('Server configuration error: req.query is not defined but is required');
          }

          val = req.query[param.name];

          break;
        }

        // Use the default value when necessary
        if (_.isUndefined(val) && !_.isUndefined(param.defaultValue)) {
          val = param.defaultValue;
        }

        // Validate requiredness
        if (!_.isUndefined(param.required)) {
          if (param.required === true && _.isUndefined(val)) {
            return returnError(invalidParamPrefix + 'is required', 400);
          }
        }

        // Validate the value type/format
        if (!isValid(val, param.type, param.format)) {
          return returnError(invalidTypePrefix + (_.isUndefined(param.format) ? '' : param.format + ' ') + param.type +
                             ': ' + val, 400);
        }

        if (param.type === 'integer') {
          testVal = parseInt(val, 10);
        } else if (param.type === 'number') {
          testVal = parseFloat(val);
        }

        // Validate enum
        if (!_.isUndefined(param.enum) && param.enum.indexOf(val) === -1) {
          return returnError(invalidParamPrefix + 'is not an allowable value (' + param.enum.join(', ') + '): ' + val,
                             400);
        }

        // Validate maximum
        if (!_.isUndefined(maximum)) {
          if (!_.isNumber(maximum)) {
            maximum = parseFloat(maximum);
          }

          if (testVal > maximum) {
            return returnError(invalidParamPrefix + 'is greater than the configured maximum (' + param.maximum + '): ' +
                               val, 400);
          }
        }

        // Validate minimum
        if (!_.isUndefined(minimum)) {
          if (!_.isNumber(minimum)) {
            minimum = parseFloat(minimum);
          }

          if (testVal < minimum) {
            return returnError(invalidParamPrefix + 'is less than the configured minimum (' + param.minimum + '): ' +
                               val, 400);
          }
        }

        // Validate array
        if (param.type === 'array') {
          try {
            val.forEach(function (aVal, index) {
              if (!isValid(aVal, param.items.type, param.format)) {
                throw Error(invalidParamPrefix + 'at index ' + index + ' is not a valid ' + param.items.type + ': ' +
                            aVal);
              }
            });
          } catch (err) {
            return returnError(err.message);
          }
        }

        // Validate uniqueItems
        if (!_.isUndefined(param.uniqueItems)) {
          if (_.uniq(val).length !== val.length) {
            return returnError(invalidParamPrefix + 'does not allow duplicate values: ' + val.join(', '), 400);
          }
        }
      });
    }

    return next();
  };
};
