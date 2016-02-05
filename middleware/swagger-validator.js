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

var _ = require('lodash-compat');
var async = require('async');
var cHelpers = require('../lib/helpers');
var debug = require('debug')('swagger-tools:middleware:validator');
var mHelpers = require('./helpers');
var validators = require('../lib/validators');

var sendData = function (swaggerVersion, res, data, encoding, skipped) {
  // 'res.end' requires a Buffer or String so if it's not one, create a String
  if (!(data instanceof Buffer) && !_.isString(data)) {
    data = JSON.stringify(data);
  }

  if (skipped) {
    if (_.isUndefined(res.getHeader('content-type'))) {
      // This scenario only happens for a 204/304 response and there is no Content-Type
      debug('    Validation: skipped (Cached response for \'%d\')', res.statusCode);
    } else if (swaggerVersion === '1.2') {
      debug('    Validation: skipped (No responseMessage definition)', res.statusCode);
    } else {
      debug('    Validation: skipped (No response definition)', res.statusCode);
    }
  } else {
    debug('    Validation: succeeded');
  }

  res.end(data, encoding);
};

var send400 = function (req, res, next, err) {
  var currentMessage;
  var validationMessage;

  res.statusCode = 400;

  // Format the errors to include the parameter information
  if (err.failedValidation === true) {
    currentMessage = err.message;
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

    // Replace the message
    err.message = 'Request validation failed: ' + validationMessage;

    // Replace the stack message
    err.stack = err.stack.replace(currentMessage, validationMessage);
  }

  return next(err);
};
var validateValue = function (req, schema, path, val, callback) {
  var document = req.swagger.apiDeclaration || req.swagger.swaggerObject;
  var version = req.swagger.apiDeclaration ? '1.2' : '2.0';
  var isModel = mHelpers.isModelParameter(version, schema);
  var spec = cHelpers.getSpec(version);

  val = mHelpers.convertValue(val, schema, mHelpers.getParameterType(schema));

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
          if (results && cHelpers.getErrorCount(results) > 0) {
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
var wrapEnd = function (req, res, next) {
  var operation = req.swagger.operation;
  var originalEnd = res.end;
  var vPath = _.cloneDeep(req.swagger.operationPath);
  var swaggerVersion = req.swagger.swaggerVersion;

  res.end = function (data, encoding) {
    var schema = operation;
    var val = data;
    var responseCode;

    // Replace 'res.end' with the original
    res.end = originalEnd;

    debug('  Response validation:');

    // If the data is a buffer, convert it to a string so we can parse it prior to validation
    if (val instanceof Buffer) {
      val = data.toString(encoding);
    }

    // Express removes the Content-Type header from 204/304 responses which makes response validation impossible
    if (_.isUndefined(res.getHeader('content-type')) && [204, 304].indexOf(res.statusCode) > -1) {
      sendData(swaggerVersion, res, data, encoding, true);
      return; // do NOT call next() here, doing so would execute remaining middleware chain twice
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
        } else if (swaggerVersion === '1.2') {
          schema = _.find(operation.responseMessages, function (responseMessage, index) {
            if (responseMessage.code === res.statusCode) {
              vPath.push('responseMessages', index.toString());

              responseCode = responseMessage.code;

              return true;
            }
          });

          if (!_.isUndefined(schema)) {
            schema = schema.responseModel;
          }
        } else {
          schema = _.find(operation.responses, function (response, code) {
            if (code === (res.statusCode || 200).toString()) {
              vPath.push('responses', code);

              responseCode = code;

              return true;
            }
          });

          if (_.isUndefined(schema) && operation.responses.default) {
            responseCode = 'default';
            schema = operation.responses.default;

            vPath.push('responses', 'default');
          }
        }
      }

      debug('    Response ' + (swaggerVersion === '1.2' ? 'message' : 'code') + ': ' + responseCode);

      if (_.isUndefined(schema)) {
        sendData(swaggerVersion, res, data, encoding, true);
      } else {
        validateValue(req, schema, vPath, val, function (err) {
          if (err) {
            throw err;
          }
          
          sendData(swaggerVersion, res, data, encoding, false);
        });
      }
    } catch (err) {
      if (err.failedValidation) {
        err.originalResponse = data;
        err.message = 'Response validation failed: ' + err.message.charAt(0).toLowerCase() + err.message.substring(1);
        
        debug('    Validation: failed');

        mHelpers.debugError(err, debug);
      }

      return next(err);
    }
  };
};

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
exports = module.exports = function (options) {
  debug('Initializing swagger-validator middleware');

  if (_.isUndefined(options)) {
    options = {};
  }

  debug('  Response validation: %s', options.validateResponse === true ? 'enabled' : 'disabled');

  return function swaggerValidator (req, res, next) {
    var operation = req.swagger ? req.swagger.operation : undefined;
    var paramIndex = 0;
    var swaggerVersion = req.swagger ? req.swagger.swaggerVersion : undefined;
    var paramName; // Here since we use it in the catch block
    var paramPath; // Here since we use it in the catch block

    debug('%s %s', req.method, req.url);
    debug('  Will process: %s', _.isUndefined(operation) ? 'no' : 'yes');

    if (!_.isUndefined(operation)) {
      // If necessary, override 'res.end'
      if (options.validateResponse === true) {
        wrapEnd(req, res, next);
      }

      debug('  Request validation:');

      // Validate the request
      try {
        // Validate the content type
        validators.validateContentType(req.swagger.swaggerVersion === '1.2' ?
                                         req.swagger.api.consumes :
                                         req.swagger.swaggerObject.consumes,
                                       operation.consumes, req);

        async.map(swaggerVersion === '1.2' ?
                  operation.parameters :
                  req.swagger.operationParameters, function (parameter, oCallback) {
                    var schema = swaggerVersion === '1.2' ? parameter : parameter.schema;
                    var val;

                    paramName = schema.name;
                    paramPath = swaggerVersion === '1.2' ?
                      req.swagger.operationPath.concat(['params', paramIndex.toString()]) :
                      parameter.path;
                    val = req.swagger.params[paramName].value;

                    // Validate requiredness
                    validators.validateRequiredness(val, schema.required);

                    // Quick return if the value is not present
                    if (_.isUndefined(val)) {
                      return oCallback();
                    }

                    validateValue(req, schema, paramPath, val, oCallback);

                    paramIndex++;
                  }, function (err) {
                    if (err) {
                      throw err;
                    } else {
                      debug('    Validation: succeeded');

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

        debug('    Validation: failed');

        mHelpers.debugError(err, debug);

        return send400(req, res, next, err);
      }
    } else {
      return next();
    }
  };
};
