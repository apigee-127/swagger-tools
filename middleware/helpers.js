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
var bp = require('body-parser');
var fs = require('fs');
var helpers = require('../lib/helpers');
var parseurl = require('parseurl');
var path = require('path');
var qs = require('qs');
var validators = require('../lib/validators');

// Upstream middlewares
var jsonBodyParser = bp.json();
var queryParser = function (req, res, next) {
  if (!req.query) {
    req.query = req.url.indexOf('?') > -1 ? qs.parse(parseurl(req).query, {}) : {};
  }

  return next();
};
var urlEncodedBodyParser = bp.urlencoded({extended: false});
var bodyParser = function (req, res, callback) {
  urlEncodedBodyParser(req, res, function (err) {
    if (err) {
      callback(err);
    } else {
      jsonBodyParser(req, res, callback);
    }
  });
};

var isModelType = function isModelType (spec, type) {
  return spec.primitives.indexOf(type) === -1;
};

var isModelParameter = module.exports.isModelParameter = function isModelParameter (version, param) {
  var spec = helpers.getSpec(version);
  var isModel = false;

  switch (version) {
  case '1.2':
    if (!_.isUndefined(param.type) && isModelType(spec, param.type)) {
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
  var type = schema.type;
  var value;

  if (!type) {
    type = 'object';
  }

  switch (type) {
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
      spec.composeModel(apiDOrSO, responseType, function (err, result) {
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

var getParameterValue = module.exports.getParameterValue = function getParameterValue (version, parameter, pathKeys,
                                                                                       match, req) {
  var defaultVal = version === '1.2' ? parameter.defaultValue : parameter.default;
  var paramType = version === '1.2' ? parameter.paramType : parameter.in;
  var val;

  // Get the value to validate based on the operation parameter type
  switch (paramType) {
  case 'body':
  case 'form':
  case 'formData':
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
    val = req.query[parameter.name];

    break;
  }

  // Use the default value when necessary
  if (_.isUndefined(val) && !_.isUndefined(defaultVal)) {
    val = defaultVal;
  }

  return val;
};

module.exports.processOperationParameters = function processOperationParameters (version, pathKeys, pathMatch, req, res,
                                                                                 next) {
  var swaggerMetadata = req.swagger;
  var parameters = !_.isUndefined(swaggerMetadata) ?
                     (version === '1.2' ? swaggerMetadata.operation.parameters : swaggerMetadata.operationParameters) :
                     undefined;

  if (!parameters) {
    return next();
  }

  async.map(_.reduce(parameters, function (requestParsers, parameter) {
    var paramType = version === '1.2' ? parameter.paramType : parameter.schema.in;
    var parser;

    switch (paramType) {
    case 'body':
    case 'form':
    case 'formData':
      parser = bodyParser;

      break;

    case 'query':
      parser = queryParser;

      break;
    }

    if (parser && requestParsers.indexOf(parser) === -1) {
      requestParsers.push(parser);
    }

    return requestParsers;
  }, []), function (parser, callback) {
    parser(req, res, callback);
  }, function (err) {
    if (err) {
      return next(err);
    }

    _.each(parameters, function (parameterOrMetadata, index) {
      var parameter = version === '1.2' ? parameterOrMetadata : parameterOrMetadata.schema;

      swaggerMetadata.params[parameter.name] = {
        path: version === '1.2' ?
                swaggerMetadata.operationPath.concat(['parameters', index.toString()]) :
                parameterOrMetadata.path,
        schema: parameter,
        value: getParameterValue(version, parameter, pathKeys, pathMatch, req)
      };
    });

    return next();
  });
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
      if (helpers.swaggerOperationMethods.indexOf(method.toUpperCase()) !== -1) {
        allowedMethods.push(method.toUpperCase());
      }
    });
  }

  err.allowedMethods = allowedMethods;

  res.setHeader('Allow', allowedMethods.sort().join(', '));
  res.statusCode = 405;

  return next(err);
};

var validateValue = module.exports.validateValue =
  function validateValue (req, schema, path, val, callback) {
    var document = req.swagger.apiDeclaration || req.swagger.swaggerObject;
    var version = req.swagger.apiDeclaration ? '1.2' : '2.0';
    var isModel = isModelParameter(version, schema);
    var spec = helpers.getSpec(version);

    try {
      validators.validateSchemaConstraints(version, schema, path, val);
    } catch (err) {
      return callback(err);
    }

    if (isModel) {
      if (_.isString(val)) {
        try {
          val = JSON.parse(val);
        } catch (err) {
          err.failedValidation = true;
          err.message = 'Value expected to be an array/object but is not';

          throw err;
        }
      }

      async.map(schema.type === 'array' ? val : [val], function (aVal, oCallback) {

        if (version === '1.2') {
          spec.validateModel(document, '#/models/' + (schema.items ?
                                                        schema.items.type || schema.items.$ref :
                                                        schema.type), aVal, oCallback);
        } else {
          try {
            validators.validateAgainstSchema(schema.schema ? schema.schema : schema, val);

            oCallback();
          } catch (err) {
            oCallback(err);
          }
        }
      }, function (err, allResults) {
        if (!err) {
          _.each(allResults, function (results) {
            if (results && helpers.getErrorCount(results) > 0) {
              err = new Error('Failed schema validation');

              err.code = 'SCHEMA_VALIDATION_FAILED';
              err.errors = results.errors;
              err.warnings = results.warnings;
              err.failedValidation = true;

              return false;
            }
          });
        }

        callback(err);
      });
    } else {
      callback();
    }
  };

module.exports.wrapEnd = function wrapEnd (version, req, res, next) {
  var operation = req.swagger.operation;
  var originalEnd = res.end;
  var vPath = _.cloneDeep(req.swagger.operationPath);

  res.end = function end (data, encoding) {
    var schema = operation;
    var val = data;

    // Replace 'res.end' with the original
    res.end = originalEnd;

    // If the data is a buffer, convert it to a string so we can parse it prior to validation
    if (val instanceof Buffer) {
      val = data.toString(encoding);
    }

    try {
      // Validate the content type
      try {
        validators.validateContentType(req.swagger.apiDeclaration ?
                                         req.swagger.apiDeclaration.produces :
                                         req.swagger.swaggerObject.produces,
                                       operation.produces, res);
      } catch (err) {
        err.failedValidation = true;

        throw err;
      }

      if (_.isUndefined(schema.type)) {
        if (schema.schema) {
          schema = schema.schema;
        } else if (version === '1.2') {
          schema = _.find(operation.responseMessages, function (responseMessage, index) {
            if (responseMessage.code === res.statusCode) {
              vPath.push(['responseMessages', index.toString()]);

              return true;
            }
          });

          if (!_.isUndefined(schema)) {
            schema = schema.responseModel;
          }
        } else {
          schema = _.find(operation.responses, function (response, code) {
            if (code === res.statusCode.toString()) {
              vPath.push(['responses', code]);

              return true;
            }
          });

          if (_.isUndefined(schema) && operation.responses.default) {
            schema = operation.responses.default;

            vPath.push(['responses', 'default']);
          }
        }
      }

      validateValue(req, schema, vPath, val,
                    function (err) {
                      if (err) {
                        throw err;
                      }

                      // 'res.end' requires a Buffer or String so if it's not one, create a String
                      if (!(data instanceof Buffer) && !_.isString(data)) {
                        data = JSON.stringify(data);
                      }

                      res.end(data, encoding);
                    });
    } catch (err) {
      if (err.failedValidation) {
        err.originalResponse = data;
        err.message = 'Response validation failed: ' + err.message.charAt(0).toLowerCase() + err.message.substring(1);
      }

      return next(err);
    }
  };
};
