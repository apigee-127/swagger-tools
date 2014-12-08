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
var fs = require('fs');
var parseurl = require('parseurl');
var path = require('path');

var helpers = require('../lib/helpers');
var operationVerbs = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT'
];

var isModelType = function isModelType (spec, type) {
  return spec.primitives.indexOf(type) === -1;
};

/**
 * Returns an Express style path for the Swagger path.
 *
 * @param {string} [basePath] - The Swagger API base path
 * @param {string} apiPath - The Swagger API path
 *
 * @returns the Express equivalent path
 */
module.exports.expressStylePath = function expressStylePath (basePath, apiPath) {
  basePath = parseurl({url: basePath || '/'}).pathname || '/';

  // Make sure the base path starts with '/'
  if (basePath.charAt(0) !== '/') {
    basePath = '/' + basePath;
  }

  // Make sure the base path ends with '/'
  if (basePath.charAt(basePath.length - 1) !== '/') {
    basePath = basePath + '/';
  }

  // Make sure the api path does not start with '/' since the base path will end with '/'
  if (apiPath.charAt(0) === '/') {
    apiPath = apiPath.substring(1);
  }

  // Replace Swagger syntax for path parameters with Express' version (All Swagger path parameters are required)
  return (basePath + apiPath).replace(/{/g, ':').replace(/}/g, '');
};

module.exports.getHandlerName = function getHandlerName (version, req) {
  var handlerName;

  switch (version) {
  case '1.2':
    handlerName = req.swagger.operation.nickname;
    break;

  case '2.0':
    handlerName = (req.swagger.operation['x-swagger-router-controller'] ?
      req.swagger.operation['x-swagger-router-controller'] :
      req.swagger.path['x-swagger-router-controller']) + '_' +
      (req.swagger.operation.operationId ? req.swagger.operation.operationId : req.method.toLowerCase());

    break;
  }

  return handlerName;
};

var getMockValue = function getMockValue (version, schema) {
  var value;

  if (!schema.type) {
    schema.type = 'object';
  }

  switch (schema.type) {
  case 'array':
    value = [getMockValue(version, _.isArray(schema.items) ? schema.items[0] : schema.items)];

    break;

  case 'boolean':
    if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
      value = schema.defaultValue;
    } else if (version === '2.0' && !_.isUndefined(schema.default)) {
      value = schema.default;
    } else if (_.isArray(schema.enum)) {
      value = schema.enum[0];
    } else {
      value = 'true';
    }

    // Convert value if necessary
    value = value === 'true' || value === true ? true : false;

    break;

  case 'file':
  case 'File':
    value = 'Pretend this is some file content';

    break;

  case 'integer':
    if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
      value = schema.defaultValue;
    } else if (version === '2.0' && !_.isUndefined(schema.default)) {
      value = schema.default;
    } else if (_.isArray(schema.enum)) {
      value = schema.enum[0];
    } else {
      value = 1;
    }

    // Convert value if necessary
    if (!_.isNumber(value)) {
      value = parseInt(value, 10);
    }

    // TODO: Handle constraints and formats

    break;

  case 'object':
    value = {};

    _.each(schema.allOf, function (parentSchema) {
      _.each(parentSchema.properties, function (property, propName) {
        value[propName] = getMockValue(version, property);
      });
    });

    _.each(schema.properties, function (property, propName) {
      value[propName] = getMockValue(version, property);
    });

    break;

  case 'number':
    if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
      value = schema.defaultValue;
    } else if (version === '2.0' && !_.isUndefined(schema.default)) {
      value = schema.default;
    } else if (_.isArray(schema.enum)) {
      value = schema.enum[0];
    } else {
      value = 1.0;
    }

    // Convert value if necessary
    if (!_.isNumber(value)) {
      value = parseFloat(value);
    }

    // TODO: Handle constraints and formats

    break;

  case 'string':
    if (version === '1.2' && !_.isUndefined(schema.defaultValue)) {
      value = schema.defaultValue;
    } else if (version === '2.0' && !_.isUndefined(schema.default)) {
      value = schema.default;
    } else if (_.isArray(schema.enum)) {
      value = schema.enum[0];
    } else {
      value = 'Sample text';
    }

    // TODO: Handle constraints and formats

    break;
  }

  return value;
};

var mockResponse = function mockResponse (version, req, res, next, handlerName) {
  var method = req.method.toLowerCase();
  var operation = req.swagger.operation;
  var sendResponse = function sendResponse (err, response) {
    if (err) {
      return next(err);
    } else {
      return res.end(response);
    }
  };
  var spec = helpers.getSpec(version);
  var stubResponse = 'Stubbed response for ' + handlerName;
  var apiDOrSO;
  var responseType;

  switch (version) {
  case '1.2':
    apiDOrSO = req.swagger.apiDeclaration;
    responseType = operation.type;

    break;

  case '2.0':
    apiDOrSO = req.swagger.swaggerObject;

    if (method === 'post' && operation.responses['201']) {
      responseType = operation.responses['201'].schema;
    } else if (operation.responses['200']) {
      responseType = operation.responses['200'];
    } else if (operation.responses['default']) {
      responseType = operation.responses['default'];
    } else if (operation.schema) {
      responseType = operation.schema.type || 'object';
    } else {
      responseType = operation.type;
    }

    break;
  }

  if (_.isPlainObject(responseType) || isModelType(spec, responseType)) {
    if (version === '1.2') {
      spec.composeSchema(apiDOrSO, responseType, function (err, result) {
        if (err) {
          return sendResponse(undefined, err);
        } else {
          // Should we handle this differently as undefined typically means the model doesn't exist
          return sendResponse(undefined, _.isUndefined(result) ?
                                           stubResponse :
                                           JSON.stringify(getMockValue(version, result)));
        }
      });
    } else {
      return sendResponse(undefined, JSON.stringify(getMockValue(version, responseType.schema)));
    }
  } else {
    return sendResponse(undefined, getMockValue(version, responseType));
  }
};

module.exports.handlerCacheFromDir = function handlerCacheFromDir (dirOrDirs) {
  var handlerCache = {};
  var jsFileRegex = /\.js|\.coffee$/;
  var dirs = [];

  if (_.isArray(dirOrDirs)) {
    dirs = dirOrDirs;
  } else {
    dirs.push(dirOrDirs);
  }

  _.each(dirs, function (dir) {
    _.each(fs.readdirSync(dir), function (file) {
      var controllerName = file.replace(jsFileRegex, '');
      var controller;

      if (file.match(jsFileRegex)) {
        controller = require(path.resolve(path.join(dir, controllerName)));

        if (_.isPlainObject(controller)) {
          _.each(controller, function (value, name) {
            var handlerId = controllerName + '_' + name;

            // TODO: Log this situation

            if (_.isFunction(value) && !handlerCache[handlerId]) {
              handlerCache[handlerId] = value;
            }
          });
        }
      }
    });
  });

  return handlerCache;
};

module.exports.createStubHandler = function createStubHandler (version, req, res, next, handlerName) {
  // TODO: Handle headers for 2.0
  // TODO: Handle examples (per mime-type) for 2.0
  // TODO: Handle non-JSON response types

  return function stubHandler () {
    mockResponse(version, req, res, next, handlerName);
  };
};

var isModelParameter = module.exports.isModelParameter = function isModelParameter (version, param) {
  var spec = helpers.getSpec(version);
  var isModel = false;

  switch (version) {
  case '1.2':
    if (!_.isUndefined(spec, param.type) && isModelType(spec, param.type)) {
      isModel = true;
    } else if (param.type === 'array' && isModelType(spec, param.items ?
                                                             param.items.type || param.items.$ref :
                                                             undefined)) {
      isModel = true;
    }

    break;

  case '2.0':
    if (param.type === 'object' || !param.type) {
      isModel = true;
    } else if (!_.isUndefined(param.schema) && (param.schema.type === 'object' || !_.isUndefined(param.schema.$ref))) {
      isModel = true;
    }

    // 2.0 does not allow arrays of models in the same way Swagger 1.2 does

    break;
  }

  return isModel;
};

module.exports.getParameterValue = function getParameterValue (version, parameter, pathKeys, match, req) {
  var defaultVal = version === '1.2' ? parameter.defaultValue : parameter.default;
  var paramType = version === '1.2' ? parameter.paramType : parameter.in;
  var val;

  // Get the value to validate based on the operation parameter type
  switch (paramType) {
  case 'body':
  case 'form':
    if (!req.body) {
      throw new Error('Server configuration error: req.body is not defined but is required');
    }

    if (isModelParameter(version, parameter)) {
      val = req.body;
    } else {
      val = req.body[parameter.name];
    }

    break;
  case 'header':
    val = req.headers[parameter.name.toLowerCase()];

    break;
  case 'path':
    _.each(pathKeys, function (key, index) {
      if (key.name === parameter.name) {
        val = match[index + 1];
      }
    });

    break;
  case 'query':
    if (!req.query) {
      throw new Error('Server configuration error: req.query is not defined but is required');
    }

    val = req.query[parameter.name];

    break;
  }

  // Use the default value when necessary
  if (_.isUndefined(val) && !_.isUndefined(defaultVal)) {
    val = defaultVal;
  }

  return val;
};

module.exports.send400 = function send400 (req, res, next, err) {
  var validationMessage;

  res.statusCode = 400;

  // Format the errors to include the parameter information
  if (err.failedValidation === true) {
    validationMessage = 'Parameter (' + err.paramName + ') ';

    switch (err.code) {
    case 'ENUM_MISMATCH':
    case 'MAXIMUM':
    case 'MAXIMUM_EXCLUSIVE':
    case 'MINIMUM':
    case 'MINIMUM_EXCLUSIVE':
    case 'MULTIPLE_OF':
    case 'INVALID_TYPE':
      if (err.code === 'INVALID_TYPE' && err.message.split(' ')[0] === 'Value') {
        validationMessage += err.message.split(' ').slice(1).join(' ');
      } else {
        validationMessage += 'is ' + err.message.charAt(0).toLowerCase() + err.message.substring(1);
      }

      break;

    case 'ARRAY_LENGTH_LONG':
    case 'ARRAY_LENGTH_SHORT':
    case 'MAX_LENGTH':
    case 'MIN_LENGTH':
      validationMessage += err.message.split(' ').slice(1).join(' ');

      break;

    case 'MAX_PROPERTIES':
    case 'MIN_PROPERTIES':
      validationMessage += 'properties are ' + err.message.split(' ').slice(4).join(' ');

      break;

    default:
      validationMessage += err.message.charAt(0).toLowerCase() + err.message.substring(1);
    }

    err.message = validationMessage;
  }

  return next(err);
};

module.exports.send405 = function send405 (version, req, res, next) {
  var allowedMethods = [];
  var err = new Error('Route defined in Swagger specification (' +
                        (_.isUndefined(req.swagger.api) ? req.swagger.apiPath : req.swagger.api.path) +
                        ') but there is no defined ' +
                        (version === '1.2' ? req.method.toUpperCase() : req.method.toLowerCase()) + ' operation.');

  if (!_.isUndefined(req.swagger.api)) {
    _.each(req.swagger.api.operations, function (operation) {
      allowedMethods.push(operation.method.toUpperCase());
    });
  } else {
    _.each(req.swagger.path, function (operation, method) {
      if (operationVerbs.indexOf(method.toUpperCase()) !== -1) {
        allowedMethods.push(method.toUpperCase());
      }
    });
  }

  err.allowedMethods = allowedMethods;

  res.setHeader('Allow', allowedMethods.sort().join(', '));
  res.statusCode = 405;

  return next(err);
};
